import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import semver from 'semver';
import { config } from './config.mjs';
import { readJson, run } from './core.mjs';
import { prompts } from './prompts.mjs';
import {
  difference,
  fileHash,
  localSnapshot,
  managerDirectory,
  statePath,
  runtimeDirectories,
} from './snapshot.mjs';

function baseline(root) {
  if (fs.lstatSync(path.join(root, managerDirectory)).isSymbolicLink())
    throw new Error('Management source directory must not be a symlink.');
  const file = path.join(root, statePath);
  if (!fs.existsSync(file))
    throw new Error(
      'Verifiable management baseline is missing. Restore the shipped baseline; current source will not be trusted automatically.',
    );
  const state = readJson(file);
  if (
    state.schemaVersion !== 1 ||
    state.directory !== managerDirectory ||
    !state.files ||
    !Object.keys(state.files).length
  )
    throw new Error('Invalid management baseline; restore a known snapshot.');
  for (const [file, hash] of Object.entries(state.files)) {
    safeFile(file);
    if (!/^[a-f0-9]{64}$/.test(hash))
      throw new Error(`Invalid baseline hash: ${file}`);
  }
  const edits = difference(state.files, localSnapshot(root));
  if (edits.length)
    throw new Error(
      `Management source has local edits; update stopped:\n${edits.map((item) => `${item.kind} ${item.file}`).join('\n')}`,
    );
  return state;
}

function applySnapshot(root, upstream, snapshot) {
  const directory = path.join(root, managerDirectory);
  const parent = path.dirname(directory);
  const working = fs.mkdtempSync(path.join(parent, '.manager-update-'));
  const staged = path.join(working, 'source');
  const backup = path.join(working, 'previous');
  const state = path.join(root, statePath);
  const pending = `${state}.pending`;
  let displaced = false;
  let installed = false;
  try {
    fs.mkdirSync(staged);
    for (const [file, data] of snapshot.contents) {
      const destination = path.join(staged, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, data);
      if (process.platform !== 'win32')
        fs.chmodSync(
          destination,
          snapshot.modes[file] === '100755' ? 0o755 : 0o644,
        );
    }
    fs.writeFileSync(
      pending,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          kind: 'upstream',
          directory: managerDirectory,
          repository: upstream.repository,
          ref: upstream.ref,
          sourceDirectory: upstream.directory,
          commit: snapshot.commit,
          files: snapshot.files,
        },
        null,
        2,
      )}\n`,
    );
    // Leave any caller's cwd inside the old source before the directory swap.
    process.chdir(root);
    fs.renameSync(directory, backup);
    displaced = true;
    for (const name of runtimeDirectories) {
      if (fs.existsSync(path.join(backup, name)))
        fs.renameSync(path.join(backup, name), path.join(staged, name));
    }
    fs.renameSync(staged, directory);
    installed = true;
    fs.renameSync(pending, state);
    displaced = false;
    console.log(`[ok] Management update applied: ${snapshot.commit}`);
  } catch (error) {
    if (displaced) {
      try {
        const active = installed ? directory : staged;
        for (const name of runtimeDirectories) {
          if (
            fs.existsSync(path.join(active, name)) &&
            !fs.existsSync(path.join(backup, name))
          )
            fs.renameSync(path.join(active, name), path.join(backup, name));
        }
        if (installed) fs.renameSync(directory, staged);
        fs.renameSync(backup, directory);
        displaced = false;
      } catch (rollback) {
        throw new Error(
          `Update failed: ${error.message}. Restore preserved source from ${backup}; rollback failed: ${rollback.message}`,
        );
      }
    }
    throw error;
  } finally {
    if (fs.existsSync(pending)) fs.unlinkSync(pending);
    // Never delete a preserved source backup if restoration was unsuccessful.
    if (!displaced) {
      if (
        path.dirname(working) !== parent ||
        !path.basename(working).startsWith('.manager-update-')
      )
        throw new Error('Unexpected update cleanup path.');
      fs.rmSync(working, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  }
}

function safeFile(file) {
  if (
    !file ||
    file.includes('\\') ||
    file.startsWith('/') ||
    file
      .split('/')
      .some(
        (part) =>
          !part ||
          ['.', '..', '.git', 'node_modules', '.turbo'].includes(part) ||
          /[:\x00-\x1f]/.test(part),
      )
  )
    throw new Error(`Unsafe management snapshot path: ${file}`);
  if (
    process.platform === 'win32' &&
    file
      .split('/')
      .some(
        (part) =>
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  )
    throw new Error(`Unsupported Windows snapshot path: ${file}`);
}

function fetchSnapshot(upstream) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'template-manager-'));
  const git = (...args) =>
    run('git', ['--git-dir', temporary, ...args], { capture: true }).trim();
  try {
    run('git', ['init', '--bare', temporary], { capture: true });
    git(
      'fetch',
      '--depth=1',
      '--no-tags',
      '--',
      upstream.repository,
      upstream.ref,
    );
    const commit = git('rev-parse', 'FETCH_HEAD^{commit}');
    const entries = git(
      'ls-tree',
      '-rz',
      '--full-tree',
      commit,
      '--',
      `${upstream.directory}/`,
    );
    const contents = new Map();
    const files = {};
    const modes = {};
    const seen = new Set();
    for (const entry of entries.split('\0').filter(Boolean)) {
      const tab = entry.indexOf('\t');
      const [mode, type, object] = entry.slice(0, tab).split(' ');
      const source = entry.slice(tab + 1);
      if (!source.startsWith(`${upstream.directory}/`))
        throw new Error('Snapshot path outside configured source directory.');
      const file = source.slice(upstream.directory.length + 1);
      safeFile(file);
      const key = process.platform === 'win32' ? file.toLowerCase() : file;
      if (seen.has(key)) throw new Error(`Conflicting snapshot path: ${file}`);
      seen.add(key);
      if (type !== 'blob' || !['100644', '100755'].includes(mode))
        throw new Error(
          `Management snapshot must contain ordinary files: ${file}`,
        );
      const data = run(
        'git',
        ['--git-dir', temporary, 'cat-file', 'blob', object],
        { capture: true, encoding: null },
      );
      contents.set(file, data);
      files[file] = fileHash(data);
      modes[file] = mode;
    }
    if (!contents.size)
      throw new Error(
        `No management files at ${upstream.directory} in ${commit}`,
      );
    return { commit, files, modes, contents };
  } finally {
    if (
      path.dirname(temporary) !== os.tmpdir() ||
      !path.basename(temporary).startsWith('template-manager-')
    )
      throw new Error('Unexpected snapshot cleanup path.');
    fs.rmSync(temporary, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}

function compatibility(root, snapshot) {
  if (
    !snapshot.contents.has('package.json') ||
    !snapshot.contents.has('cli.mjs')
  )
    throw new Error('Management snapshot is missing package.json or cli.mjs.');
  const target = JSON.parse(
    snapshot.contents.get('package.json').toString('utf8'),
  );
  const current = readJson(path.join(root, managerDirectory, 'package.json'));
  const settings = config(root);
  if (
    !target.template?.manager ||
    target.name !== current.name ||
    target.template.apiVersion !== 1
  )
    throw new Error(
      'Incompatible management command API; update root integration manually before adopting this version.',
    );
  if (target.template.configVersion !== settings.schemaVersion)
    throw new Error(
      `Incompatible configuration: target needs schema ${target.template.configVersion}, project has ${settings.schemaVersion}. Migrate manually before updating.`,
    );
  if (
    !target.engines?.node ||
    !semver.satisfies(process.versions.node, target.engines.node)
  )
    throw new Error(
      `Incompatible Node runtime: target requires ${target.engines?.node}; prepare the runtime manually.`,
    );
  if (target.template.minTurbo) {
    let turbo;
    try {
      const require = createRequire(path.join(root, 'package.json'));
      turbo = readJson(require.resolve('turbo/package.json')).version;
    } catch {
      throw new Error(
        'Prepared Turbo dependency missing; prepare root dependencies manually before updating.',
      );
    }
    if (!semver.valid(turbo) || semver.lt(turbo, target.template.minTurbo))
      throw new Error(
        `Incompatible Turbo version: target requires ${target.template.minTurbo}, prepared ${turbo}; update root dependencies manually.`,
      );
  }
  if (
    JSON.stringify(current.dependencies) !== JSON.stringify(target.dependencies)
  )
    console.log(
      '[manual] Management dependencies changed. Review the workspace lockfile and explicitly prepare dependencies after applying; no install will run.',
    );
  console.log(
    `[manual] Node ${target.engines.node}; project configuration schema ${target.template.configVersion}. Review and commit management source and baseline; root configuration and lockfiles are preserved.`,
  );
}

function previewDiff(root, previous, snapshot) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'template-manager-'));
  try {
    for (const side of ['before', 'after'])
      fs.mkdirSync(path.join(temporary, side));
    for (const file of Object.keys(previous.files)) {
      const destination = path.join(temporary, 'before', file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, managerDirectory, file), destination);
    }
    for (const [file, data] of snapshot.contents) {
      const destination = path.join(temporary, 'after', file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, data);
    }
    console.log(
      run(
        'git',
        [
          'diff',
          '--no-index',
          '--no-color',
          '--no-ext-diff',
          '--no-textconv',
          '--',
          'before',
          'after',
        ],
        {
          cwd: temporary,
          capture: true,
          successCodes: [0, 1],
        },
      ),
    );
  } finally {
    if (
      path.dirname(temporary) !== os.tmpdir() ||
      !path.basename(temporary).startsWith('template-manager-')
    )
      throw new Error('Unexpected preview cleanup path.');
    fs.rmSync(temporary, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}

export async function updateManager(root, options = {}) {
  const previous = baseline(root);
  const settings = config(root);
  const upstream = {
    ...settings.upstream,
    ...(options.source ? { repository: options.source } : {}),
    ...(options.ref ? { ref: options.ref } : {}),
    ...(options.directory ? { directory: options.directory } : {}),
  };
  if (!upstream.repository || !upstream.ref || !upstream.directory)
    throw new Error(
      'Configure upstream.repository, upstream.ref and upstream.directory in project.config.json, or pass --source, --ref and --directory.',
    );
  safeFile(upstream.directory);
  const snapshot = fetchSnapshot(upstream);
  console.log(
    `Management baseline: ${previous.commit ?? 'bundled SHA-256 snapshot'}`,
  );
  console.log(
    `Upstream ${upstream.repository} ${upstream.ref}: ${snapshot.commit}; directory ${upstream.directory}`,
  );
  const changes = difference(previous.files, snapshot.files);
  for (const item of changes) console.log(`${item.kind} ${item.file}`);
  if (!changes.length) console.log('[info] Management source is up to date.');
  else previewDiff(root, previous, snapshot);
  compatibility(root, snapshot);
  if (options.check) return;
  if (
    !changes.length &&
    previous.commit === snapshot.commit &&
    previous.repository === upstream.repository &&
    previous.sourceDirectory === upstream.directory
  )
    return;
  const ui = prompts();
  try {
    if (!(await ui.confirm('Apply management update'))) {
      console.log('[info] Update cancelled.');
      return;
    }
  } finally {
    ui.close();
  }
  baseline(root);
  compatibility(root, snapshot);
  applySnapshot(root, upstream, snapshot);
}
