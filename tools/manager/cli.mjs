#!/usr/bin/env node
import { parseArgs } from 'node:util';

try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      cwd: { type: 'string' },
      package: { type: 'string', multiple: true },
      target: { type: 'string' },
      revision: { type: 'string' },
      branch: { type: 'string' },
      remote: { type: 'string' },
      check: { type: 'boolean' },
      'accept-current': { type: 'boolean' },
      source: { type: 'string' },
      ref: { type: 'string' },
      directory: { type: 'string' },
    },
  });
  const { findRoot } = await import('./core.mjs');
  const cwd = values.cwd ?? process.cwd();
  const root = findRoot(cwd);
  if (positionals[0] === 'task')
    (await import('./tasks.mjs')).task(root, positionals[1], values.package);
  else if (positionals[0] === 'exec')
    (await import('./tasks.mjs')).nativeTask(
      root,
      cwd,
      positionals[1],
      values.package,
    );
  else if (positionals[0] === 'validate')
    (await import('./selection.mjs')).selectTaskPackages(
      root,
      positionals[1],
      values.package,
    );
  else if (positionals[0] === 'init')
    await (await import('./init.mjs')).initialize(root);
  else if (positionals[0] === 'release')
    await (await import('./release.mjs')).release(root);
  else if (positionals[0] === 'release:retry')
    (await import('./publish.mjs')).retryRelease(root);
  else if (positionals[0] === 'manager:update')
    await (await import('./update.mjs')).updateManager(root, values);
  else if (positionals[0] === 'manager:baseline')
    (await import('./snapshot.mjs')).recordBaseline(
      root,
      values['accept-current'],
    );
  else if (/^(?:submodule|subtree)(?::[a-z]+)?$/.test(positionals[0] ?? '')) {
    const [kind, action] = positionals[0].split(':');
    await (await import('./external.mjs')).external(root, kind, action, values);
  } else
    throw new Error(
      'Usage: manager init | release | release:retry | task <task> [--package name] | submodule[:operation] | subtree[:operation] | manager:update [--check]. See README.md for public Turbo tasks and options.',
    );
} catch (error) {
  const missing = ['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(
    error.code,
  );
  console.error(
    `[error] ${missing ? 'Missing project dependency. Prepare dependencies manually. ' : ''}${error.message}`,
  );
  process.exitCode = error.exitCode ?? 1;
}
