import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { git, requireClean } from './git.mjs';
import { config, writeJson } from './config.mjs';
import { prompts } from './prompts.mjs';
import { run } from './core.mjs';

export function safeDirectory(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative))
    throw new Error('External source path must be relative to the project.');
  const absolute = path.resolve(root, relative);
  const inside = (directory) =>
    directory !== root && directory.startsWith(`${root}${path.sep}`);
  if (!inside(absolute))
    throw new Error(`External source escapes project: ${relative}`);
  let existing = absolute;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const real = fs.realpathSync(existing);
  if (real !== fs.realpathSync(root) && !inside(real))
    throw new Error(`External source symlink escapes project: ${relative}`);
  return absolute;
}

function subtrees(root) {
  const targets = (config(root).externalSources ?? []).filter(
    (item) => item.kind === 'subtree',
  );
  const paths = new Set();
  for (const target of targets) {
    target.directory = safeDirectory(root, target.path);
    if (!target.source || typeof target.source !== 'string')
      throw new Error(`Specify subtree source: ${target.path}`);
    if (paths.has(target.path))
      throw new Error(`Duplicate subtree path: ${target.path}`);
    paths.add(target.path);
  }
  return targets;
}

function recordRevision(root, target, commit, source) {
  const settings = config(root);
  const entry = settings.externalSources.find(
    (item) => item.kind === 'subtree' && item.path === target.path,
  );
  if (entry.revision === commit && entry.source === source) return;
  entry.revision = commit;
  entry.source = source;
  writeJson(path.join(root, 'project.config.json'), settings);
  git(root, 'add', '--', 'project.config.json');
  git(root, 'commit', '-m', `chore: pin subtree ${target.path} to ${commit}`);
}

function restoreSubtreeSnapshot(root, target, commit) {
  const currentTree = git(root, 'rev-parse', `HEAD:${target.path}`);
  const sourceTree = git(root, 'rev-parse', `${commit}^{tree}`);
  if (currentTree === sourceTree) return;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'template-subtree-'));
  try {
    const patch = path.join(temporary, 'snapshot.patch');
    fs.writeFileSync(
      patch,
      run(
        'git',
        [
          'diff',
          '--binary',
          '--no-color',
          '--src-prefix=a/',
          '--dst-prefix=b/',
          '--full-index',
          '--no-ext-diff',
          '--no-textconv',
          currentTree,
          sourceTree,
        ],
        { cwd: root, capture: true },
      ),
    );
    git(root, 'apply', '--index', `--directory=${target.path}`, '--', patch);
    git(
      root,
      'commit',
      '-m',
      `chore: sync subtree ${target.path} snapshot to ${commit}`,
    );
  } finally {
    if (
      path.dirname(temporary) !== os.tmpdir() ||
      !path.basename(temporary).startsWith('template-subtree-')
    )
      throw new Error('Unexpected subtree temporary path.');
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function subtreeOperation(root, target, action, options) {
  if (action === 'status') {
    console.log(
      `${target.path}: ${fs.existsSync(target.directory) ? 'present' : 'not initialized'}; pinned=${target.revision ?? '(unset)'}; source=${target.source}; pull=${target.pullRevision ?? '(unset)'}; push=${target.pushRemote ?? '(unset)'}:${target.pushBranch ?? '(unset)'}; squash=${Boolean(target.squash)}`,
    );
    console.log(git(root, 'status', '--short', '--', target.path));
    return;
  }
  requireClean(root, `subtree ${action}`);
  if (action === 'push') {
    const branch = pushBranch({ ...target, directory: root }, options);
    const remote = options.remote ?? target.pushRemote;
    if (!remote)
      throw new Error(`Specify --remote or pushRemote for ${target.path}.`);
    const split = git(
      root,
      'subtree',
      'split',
      `--prefix=${target.path}`,
      'HEAD',
    )
      .split('\n')
      .at(-1);
    git(root, 'push', '--', remote, `${split}:refs/heads/${branch}`);
    console.log(
      `[ok] ${target.path}: subtree ${split} pushed to ${remote}:${branch}`,
    );
    return;
  }
  if (!['init', 'sync', 'update'].includes(action))
    throw new Error(`Unknown external source operation: ${action}`);
  if (action === 'init' && fs.existsSync(target.directory))
    throw new Error(`Subtree directory already exists: ${target.path}`);
  if (action !== 'init' && !fs.existsSync(target.directory))
    throw new Error(
      `Subtree is not initialized: ${target.path}; run subtree:init first.`,
    );
  const ref = action === 'update' ? revision(target, options) : target.revision;
  if (!ref)
    throw new Error(
      `Specify an immutable revision for subtree ${target.path} before ${action}.`,
    );
  const remote = options.remote ?? target.source;
  console.log(
    `[info] ${target.path}: ${action === 'update' ? 'upstream' : 'pinned'} ${remote} ${ref}`,
  );
  git(root, 'fetch', '--no-tags', '--', remote, ref);
  const commit = git(root, 'rev-parse', 'FETCH_HEAD^{commit}');
  if (action !== 'update' && commit !== ref)
    throw new Error(
      `Subtree revision must be a full commit id: ${target.path}`,
    );
  let unchangedRecordedSnapshot = false;
  if (action === 'update' && target.revision) {
    try {
      unchangedRecordedSnapshot =
        git(root, 'rev-parse', `HEAD:${target.path}`) ===
        git(root, 'rev-parse', `${target.revision}^{tree}`);
    } catch {
      // Without the previous source object, preserve native merge semantics.
    }
  }
  git(
    root,
    'subtree',
    action === 'init' ? 'add' : 'merge',
    `--prefix=${target.path}`,
    ...(target.squash ? ['--squash'] : []),
    commit,
  );
  if (action === 'sync' || unchangedRecordedSnapshot)
    restoreSubtreeSnapshot(root, target, commit);
  if (action === 'update') recordRevision(root, target, commit, remote);
  console.log(
    `[ok] ${target.path}: ${action === 'update' ? 'upstream' : 'pinned'} ${commit}`,
  );
}

export function submodules(root, owner = root) {
  const modules = path.join(owner, '.gitmodules');
  if (!fs.existsSync(modules)) return [];
  const entries = git(
    owner,
    'config',
    '--file',
    '.gitmodules',
    '--null',
    '--list',
  )
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const newline = entry.indexOf('\n');
      return [entry.slice(0, newline), entry.slice(newline + 1)];
    });
  const result = [];
  for (const [key, relative] of entries.filter(([key]) =>
    /^submodule\..*\.path$/.test(key),
  )) {
    const prefix = key.slice(0, -4);
    const ownedDirectory = safeDirectory(owner, relative);
    const directory = safeDirectory(root, path.relative(root, ownedDirectory));
    const target = path.relative(root, directory).replaceAll('\\', '/');
    const native = Object.fromEntries(
      entries
        .filter(([item]) => item.startsWith(prefix))
        .map(([item, value]) => [item.slice(prefix.length), value]),
    );
    const local =
      (config(root).externalSources ?? []).find(
        (item) => item.kind === 'submodule' && item.path === target,
      ) ?? {};
    result.push({
      ...local,
      kind: 'submodule',
      path: target,
      owner,
      relative,
      directory,
      source: native.url,
      pullRevision: local.pullRevision ?? native.branch,
    });
    if (fs.existsSync(path.join(directory, '.git')))
      result.push(...submodules(root, directory));
  }
  return result;
}

function initialized(target) {
  if (!fs.existsSync(path.join(target.directory, '.git')))
    throw new Error(
      `Submodule is not initialized: ${target.path}; run submodule:init first.`,
    );
}

function clean(target) {
  initialized(target);
  if (git(target.directory, 'status', '--porcelain', '--untracked-files=all'))
    throw new Error(
      `External source has local edits: ${target.path}; commit or preserve them before synchronization.`,
    );
}

function revision(target, options) {
  const value = options.revision ?? target.pullRevision;
  if (!value || value === '.')
    throw new Error(`Specify --revision or pullRevision for ${target.path}.`);
  return value;
}

function pushBranch(target, options) {
  const branch = options.branch ?? target.pushBranch;
  if (!branch)
    throw new Error(
      `Specify --branch or pushBranch for ${target.path}; detached state does not identify a push target.`,
    );
  git(target.directory, 'check-ref-format', `refs/heads/${branch}`);
  return branch;
}

function submoduleOperation(root, target, action, options) {
  if (action === 'status') {
    console.log(
      git(target.owner, 'submodule', 'status', '--', target.relative),
    );
    console.log(
      `${target.path}: source=${target.source}; pull=${target.pullRevision ?? '(specify revision)'}; push=${target.pushRemote ?? 'origin'}:${target.pushBranch ?? '(specify branch)'}`,
    );
  } else if (['init', 'sync'].includes(action)) {
    if (fs.existsSync(path.join(target.directory, '.git'))) clean(target);
    git(target.owner, 'submodule', 'sync', '--', target.relative);
    git(
      target.owner,
      'submodule',
      'update',
      '--init',
      '--checkout',
      '--',
      target.relative,
    );
    console.log(
      `[ok] ${target.path}: pinned ${git(target.directory, 'rev-parse', 'HEAD')}`,
    );
  } else if (action === 'update') {
    clean(target);
    const ref = revision(target, options);
    const remote = options.remote ?? target.remote ?? 'origin';
    console.log(`[info] ${target.path}: fetch ${remote} ${ref}`);
    git(target.directory, 'fetch', '--no-tags', '--', remote, ref);
    const commit = git(target.directory, 'rev-parse', 'FETCH_HEAD^{commit}');
    git(target.directory, 'checkout', '--detach', commit);
    console.log(
      `[ok] ${target.path}: upstream ${ref} -> ${commit}; commit the parent gitlink separately.`,
    );
  } else if (action === 'push') {
    initialized(target);
    const branch = pushBranch(target, options);
    const remote = options.remote ?? target.pushRemote ?? 'origin';
    git(target.directory, 'push', '--', remote, `HEAD:refs/heads/${branch}`);
    console.log(`[ok] ${target.path}: pushed HEAD to ${remote}:${branch}`);
  } else throw new Error(`Unknown external source operation: ${action}`);
}

export async function external(root, kind, action, options = {}) {
  const targets = kind === 'submodule' ? submodules(root) : subtrees(root);
  if (!targets.length) {
    if (options.target) throw new Error(`Unknown ${kind}: ${options.target}`);
    console.log(`[info] No ${kind} sources.`);
    return;
  }
  let selected = options.target
    ? targets.find((target) => target.path === options.target)
    : undefined;
  if (options.target && !selected)
    throw new Error(`Unknown ${kind}: ${options.target}`);
  if (!action) {
    const ui = prompts();
    try {
      targets.forEach((target, index) =>
        console.log(`${index + 1}) ${target.path} (${target.source})`),
      );
      const answer = await ui.text(`${kind} target (number or path)`, '1');
      selected = /^\d+$/.test(answer)
        ? targets[Number(answer) - 1]
        : targets.find((target) => target.path === answer);
      if (!selected) throw new Error(`Unknown ${kind}: ${answer}`);
      action = await ui.text(
        'Operation (status/init/sync/update/push)',
        'status',
      );
      if (action === 'update' && !selected.pullRevision && !options.revision)
        options.revision = await ui.text('Upstream revision');
      if (action === 'push' && !selected.pushBranch && !options.branch)
        options.branch = await ui.text('Destination branch');
      if (
        action !== 'status' &&
        !(await ui.confirm(`Run ${action} on ${selected.path}`))
      )
        return;
    } finally {
      ui.close();
    }
  }
  if (action !== 'status' && !selected)
    throw new Error(`Specify --target for ${kind}:${action}.`);
  for (const target of selected ? [selected] : targets) {
    if (kind === 'submodule') submoduleOperation(root, target, action, options);
    else subtreeOperation(root, target, action, options);
  }
}
