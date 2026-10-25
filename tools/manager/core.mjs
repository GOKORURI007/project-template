import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import spawn from 'cross-spawn';
import { workspacePatterns } from './workspaces.mjs';

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function findRoot(start) {
  let cursor = path.resolve(start);
  while (true) {
    const manifest = path.join(cursor, 'package.json');
    if (fs.existsSync(manifest) && readJson(manifest).template?.root)
      return cursor;
    const parent = path.dirname(cursor);
    if (cursor === parent)
      throw new Error(
        'Project root not found; run inside a template workspace.',
      );
    cursor = parent;
  }
}

export function packages(root) {
  const manifest = readJson(path.join(root, 'package.json'));
  const patterns = workspacePatterns(root, manifest);
  const asManifest = (pattern) => `${pattern.replace(/\/+$/, '')}/package.json`;
  const include = patterns
    .filter((pattern) => !pattern.startsWith('!'))
    .map(asManifest);
  const exclude = patterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => asManifest(pattern.slice(1)));
  exclude.push('**/node_modules/**', '**/.git/**');
  const result = [];
  if (include.length) {
    for (const file of new Set(fs.globSync(include, { cwd: root, exclude }))) {
      const absolute = path.join(root, file);
      const pkg = readJson(absolute);
      result.push({
        ...pkg,
        directory: path.dirname(absolute),
        manifest: absolute,
      });
    }
  }
  return result
    .filter((pkg) => !pkg.template?.manager && !pkg.template?.root)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function run(
  command,
  args,
  {
    cwd,
    capture = false,
    env = process.env,
    encoding = 'utf8',
    successCodes = [0],
  } = {},
) {
  const result = spawn.sync(command, args, {
    cwd,
    env,
    stdio: capture ? 'pipe' : 'inherit',
    encoding,
    windowsHide: true,
  });
  if (result.error)
    throw new Error(
      `Missing or unusable tool ${command}: ${result.error.message}`,
    );
  if (result.signal) throw new Error(`${command} stopped by ${result.signal}`);
  if (!successCodes.includes(result.status)) {
    const error = new Error(
      `${command} failed (${result.status})${capture ? `: ${result.stderr || result.stdout}` : ''}`,
    );
    error.exitCode = result.status || 1;
    throw error;
  }
  return result.stdout ?? '';
}

export function bin(root, dependency, name = dependency) {
  const require = createRequire(path.join(root, 'package.json'));
  let manifest;
  try {
    manifest = require.resolve(`${dependency}/package.json`);
  } catch {
    throw new Error(
      `Missing dependency ${dependency}. Prepare project dependencies manually.`,
    );
  }
  const pkg = readJson(manifest);
  const entry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[name];
  if (!entry) throw new Error(`Missing executable ${name} in ${dependency}`);
  const executable = path.resolve(path.dirname(manifest), entry);
  if (!fs.existsSync(executable))
    throw new Error(
      `Missing executable ${name}. Prepare project dependencies manually.`,
    );
  return executable;
}

export function nodeBin(
  root,
  dependency,
  args,
  cwd,
  name = dependency,
  env = process.env,
) {
  return run(process.execPath, [bin(root, dependency, name), ...args], {
    cwd,
    env,
  });
}
