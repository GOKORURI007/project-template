import { run } from './core.mjs';

export function git(root, ...args) {
  return run('git', args, { cwd: root, capture: true }).trim();
}

export function requireClean(root, operation = 'release') {
  git(root, 'rev-parse', '--show-toplevel');
  const state = git(root, 'status', '--porcelain=v1', '--untracked-files=all');
  if (state)
    throw new Error(
      `Working tree must be clean before ${operation}:\n${state}`,
    );
}
