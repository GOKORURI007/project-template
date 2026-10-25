import path from 'node:path';
import { createHash } from 'node:crypto';
import { bin, nodeBin, packages, readJson, run } from './core.mjs';
import { pythonTask } from './languages/python.mjs';
import { toolFingerprint } from './requirements.mjs';
import { rustTask } from './languages/rust.mjs';
import { goTask } from './languages/go.mjs';
import {
  commandOverride,
  managedTask,
  runtimeTasks,
  scriptKey,
  selectTaskPackages,
} from './selection.mjs';

export function task(root, name, targets = []) {
  if (!name) throw new Error('Choose a task.');
  const runnable = selectTaskPackages(root, name, targets);
  if (!runnable.length) {
    console.log(`[info] No packages provide ${name}`);
    return;
  }
  const args = [
    'run',
    scriptKey(name),
    '--env-mode=loose',
    ...runnable.map((pkg) => `--filter=${pkg.name}`),
  ];
  const graph = JSON.parse(
    run(process.execPath, [bin(root, 'turbo'), ...args, '--dry=json'], {
      cwd: root,
      capture: true,
      env: {
        ...process.env,
        TEMPLATE_PLATFORM: `${process.platform}-${process.arch}`,
      },
    }),
  );
  const byName = new Map(packages(root).map((pkg) => [pkg.name, pkg]));
  let custom = false;
  const fingerprints = graph.tasks
    .sort((a, b) => a.taskId.localeCompare(b.taskId))
    .flatMap((entry) => {
      if (!entry.command || entry.command === '<NONEXISTENT>') return [];
      const pkg = byName.get(entry.package);
      const nativeName = entry.task.replace(/^pkg:/, '');
      if (
        !pkg ||
        !managedTask(pkg, nativeName) ||
        commandOverride(root, pkg, nativeName)
      ) {
        custom = true;
        return [`${entry.taskId}: custom command`];
      }
      return [`${entry.taskId}: ${toolFingerprint(root, pkg, nativeName)}`];
    });
  const env = {
    ...process.env,
    TEMPLATE_PLATFORM: `${process.platform}-${process.arch}`,
    TEMPLATE_TOOLCHAIN_ID: createHash('sha256')
      .update(fingerprints.join('\n'))
      .digest('hex'),
  };
  nodeBin(
    root,
    'turbo',
    [
      ...args,
      `--ui=${runtimeTasks.has(name) && process.stdin.isTTY ? 'tui' : 'stream'}`,
      ...(custom ? ['--force'] : []),
    ],
    root,
    'turbo',
    env,
  );
}

export function nativeTask(root, cwd, name, targets = []) {
  const pkg = readJson(path.join(cwd, 'package.json'));
  if (runtimeTasks.has(name)) {
    const selected = selectTaskPackages(root, name, targets, false);
    if (!selected.some((item) => item.name === pkg.name)) {
      console.log(
        `[info] Skipping ${pkg.name}: ${name} not selected or not configured`,
      );
      return;
    }
  }
  const override = commandOverride(root, pkg, name);
  if (override) return run(override[0], override.slice(1), { cwd });
  if (pkg.template?.language === 'python') return pythonTask(cwd, name);
  if (pkg.template?.language === 'rust') return rustTask(cwd, name);
  if (pkg.template?.language === 'go') return goTask(cwd, name);
  if (pkg.template?.language !== 'node')
    throw new Error(`Unsupported language: ${pkg.template?.language}`);
  if (name === 'dev')
    return run(process.execPath, ['--watch', 'src/index.js'], { cwd });
  if (name === 'start') return run(process.execPath, ['src/index.js'], { cwd });
  const commands = {
    format: ['prettier', ['--write', 'src', 'test']],
    'format:check': ['prettier', ['--check', 'src', 'test']],
    lint: ['eslint', ['src', 'test']],
    'lint:fix': ['eslint', ['src', 'test', '--fix']],
    typecheck: ['typescript', ['--noEmit'], 'tsc'],
    build: ['typescript', [], 'tsc'],
  };
  if (name === 'test')
    return run(process.execPath, ['--test', 'test/*.test.mjs'], { cwd });
  const command = commands[name];
  if (!command) throw new Error(`Unsupported task: ${name}`);
  return nodeBin(root, command[0], command[1], cwd, command[2]);
}
