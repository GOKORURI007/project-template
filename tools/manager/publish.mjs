import fs from 'node:fs';
import path from 'node:path';
import { git } from './git.mjs';
import { config, writeJson } from './config.mjs';
import { run } from './core.mjs';

function journalFile(root) {
  return path.resolve(
    root,
    git(root, 'rev-parse', '--git-path', 'template/releases.json'),
  );
}

function readJournal(root) {
  const file = journalFile(root);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

function save(root, records) {
  const file = journalFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeJson(temporary, records);
  fs.renameSync(temporary, file);
}

export async function publishingChoice(root, ui) {
  const available = git(root, 'remote').split('\n').filter(Boolean);
  if (!available.length) return [];
  console.log(`Git push targets: ${available.join(', ')}`);
  const answer = await ui.text(
    'Push remotes (comma separated; none for local only)',
    'none',
  );
  if (answer === 'none') return [];
  const names = [...new Set(answer.split(',').map((name) => name.trim()))];
  for (const name of names)
    if (!available.includes(name)) throw new Error(`Unknown remote: ${name}`);
  // A release branch must be explicit; never infer a branch for detached HEAD.
  git(root, 'symbolic-ref', '--quiet', '--short', 'HEAD');
  return names;
}

export async function channelChoice(root, plans, ui) {
  const local = config(root);
  const channels = plans.flatMap((plan) => {
    const command =
      local.packages?.[plan.pkg.name]?.commands?.publish ??
      local.release?.publish;
    if (!command) return [];
    if (
      !Array.isArray(command) ||
      !command.length ||
      command.some((part) => typeof part !== 'string')
    )
      throw new Error(
        `Invalid publish command for ${plan.pkg.name}; use an executable and argument array.`,
      );
    return [
      {
        type: 'channel',
        name: plan.pkg.name,
        directory: path.relative(root, plan.pkg.directory),
        command,
        version: plan.version,
        tag: plan.tag,
        status: 'pending',
      },
    ];
  });
  if (!channels.length) return [];
  console.log(
    `Configured publish channels: ${channels.map((item) => item.name).join(', ')}`,
  );
  return (await ui.confirm(
    'Run configured publish channels after local release',
  ))
    ? channels
    : [];
}

export function publishRelease(root, plans, remotes, channels = []) {
  if (!remotes.length && !channels.length) return;
  const records = readJournal(root);
  const record = {
    commit: git(root, 'rev-parse', 'HEAD'),
    branch: remotes.length
      ? git(root, 'symbolic-ref', '--quiet', '--short', 'HEAD')
      : null,
    tags: plans.map(({ tag }) => ({
      name: tag,
      object: git(root, 'rev-parse', `refs/tags/${tag}`),
    })),
    targets: [
      ...remotes.map((name) => ({ type: 'git', name, status: 'pending' })),
      ...channels,
    ],
  };
  records.push(record);
  save(root, records);
  pushPending(root, records, [record]);
}

function pushPending(root, records, selected) {
  let failed = false;
  for (const record of selected) {
    // Refuse a changed tag instead of publishing a different release on retry.
    for (const tag of record.tags) {
      if (git(root, 'rev-parse', `refs/tags/${tag.name}`) !== tag.object)
        throw new Error(
          `Release tag changed: ${tag.name}; restore it before retrying.`,
        );
    }
    for (const target of record.targets.filter(
      (item) => item.status !== 'complete',
    )) {
      try {
        if (target.type === 'channel') {
          run(target.command[0], target.command.slice(1), {
            cwd: path.join(root, target.directory),
            env: {
              ...process.env,
              TEMPLATE_RELEASE_PACKAGE: target.name,
              TEMPLATE_RELEASE_VERSION: target.version,
              TEMPLATE_RELEASE_TAG: target.tag,
              TEMPLATE_RELEASE_COMMIT: record.commit,
            },
          });
        } else {
          run(
            'git',
            [
              'push',
              '--atomic',
              '--',
              target.name,
              `${record.commit}:refs/heads/${record.branch}`,
              ...record.tags.map(
                (tag) => `${tag.object}:refs/tags/${tag.name}`,
              ),
            ],
            { cwd: root },
          );
        }
        target.status = 'complete';
        delete target.error;
        console.log(`[ok] ${target.name}: ${record.commit}`);
      } catch (error) {
        target.status = 'failed';
        target.error = error.message;
        failed = true;
        console.error(`[failed] ${target.name}: ${error.message}`);
      }
      save(root, records);
    }
  }
  if (failed)
    throw new Error(
      'Release retained locally. Retry incomplete targets with turbo release:retry.',
    );
}

export function retryRelease(root) {
  const records = readJournal(root);
  const pending = records.filter((record) =>
    record.targets.some((target) => target.status !== 'complete'),
  );
  if (!pending.length) {
    console.log('[info] No incomplete release targets.');
    return;
  }
  pushPending(root, records, pending);
}
