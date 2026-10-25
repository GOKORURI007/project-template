import path from 'node:path';
import { bin, run } from './core.mjs';
import { pythonEnvironment } from './languages/python.mjs';

export function toolFingerprint(root, pkg, task) {
  const cwd = pkg.directory;
  const env = {
    ...process.env,
    RUSTUP_AUTO_INSTALL: '0',
    GOTOOLCHAIN: 'local',
    UV_PYTHON_DOWNLOADS: 'never',
  };
  const capture = (command, args) =>
    run(command, args, { cwd, capture: true, env }).trim();
  if (pkg.template?.language === 'node') {
    const dependency = {
      format: ['prettier', 'prettier'],
      'format:check': ['prettier', 'prettier'],
      lint: ['eslint', 'eslint'],
      'lint:fix': ['eslint', 'eslint'],
      typecheck: ['typescript', 'tsc'],
      build: ['typescript', 'tsc'],
    }[task];
    return (
      process.version +
      (dependency
        ? capture(process.execPath, [bin(root, ...dependency), '--version'])
        : '')
    );
  }
  if (pkg.template?.language === 'python') {
    const environment = pythonEnvironment(cwd);
    const folder = path.join(
      environment,
      process.platform === 'win32' ? 'Scripts' : 'bin',
    );
    const exe = (name) =>
      path.join(folder, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
    let fingerprint = capture('uv', ['--version']);
    fingerprint += capture(exe('python'), [
      '-c',
      'import sys; from importlib.metadata import distributions; print(sys.version); print(sorted((d.metadata["Name"], d.version) for d in distributions()))',
    ]);
    if (['format', 'format:check', 'lint', 'lint:fix'].includes(task))
      fingerprint += capture(exe('ruff'), ['--version']);
    if (task === 'typecheck') fingerprint += capture(exe('ty'), ['--version']);
    return fingerprint;
  }
  if (pkg.template?.language === 'rust') {
    let fingerprint =
      capture('rustc', ['--version']) + capture('cargo', ['--version']);
    if (['format', 'format:check'].includes(task))
      fingerprint += capture('rustfmt', ['--version']);
    if (['lint', 'lint:fix'].includes(task))
      fingerprint += capture('cargo', ['clippy', '--version']);
    return fingerprint;
  }
  if (pkg.template?.language === 'go') {
    if (task === 'lint:fix') return 'Go vet: informational fix task';
    let fingerprint = capture('go', ['version']);
    if (['format', 'format:check'].includes(task))
      fingerprint += capture('gofmt', []);
    return fingerprint;
  }
  throw new Error(`No tool requirements defined for ${pkg.template?.language}`);
}
