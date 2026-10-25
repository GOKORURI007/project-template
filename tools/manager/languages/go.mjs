import fs from 'node:fs';
import path from 'node:path';
import { run } from '../core.mjs';
import semver from 'semver';
import { git } from '../git.mjs';

export function goMetadata(root, pkg) {
  const details = JSON.parse(
    run('go', ['mod', 'edit', '-json'], {
      cwd: pkg.directory,
      capture: true,
      env: { ...process.env, GOTOOLCHAIN: 'local' },
    }),
  );
  const module = details.Module?.Path;
  if (!module) throw new Error(`Go module declaration missing for ${pkg.name}`);
  const special = /^gopkg\.in\//.test(module);
  const suffix = special ? /\.v(\d+)$/.exec(module) : /\/v(\d+)$/.exec(module);
  const major = suffix ? Number(suffix[1]) : null;
  let prefix = path.relative(root, pkg.directory).replaceAll('\\', '/');
  if (major >= 2 && prefix.endsWith(`/v${major}`))
    prefix = prefix.slice(0, -`/v${major}`.length);
  return { module, major, special, prefix: prefix ? `${prefix}/` : '' };
}

export function goCurrentVersion(root, pkg) {
  const metadata = goMetadata(root, pkg);
  const { prefix } = metadata;
  const versions = git(root, 'tag', '--list')
    .split('\n')
    .filter((tag) => tag.startsWith(`${prefix}v`))
    .map((tag) => tag.slice(prefix.length + 1))
    .filter(
      (version) =>
        semver.valid(version) &&
        compatibleMajor(metadata, semver.major(version)),
    );
  return versions.sort(semver.rcompare)[0] ?? '0.0.0';
}

function compatibleMajor(metadata, major) {
  return metadata.special
    ? metadata.major === major
    : major >= 2
      ? metadata.major === major
      : metadata.major === null;
}

export function goVersionPlan(root, pkg, requested) {
  const current = goCurrentVersion(root, pkg);
  const levels = [
    'patch',
    'minor',
    'major',
    'prepatch',
    'preminor',
    'premajor',
    'prerelease',
  ];
  const version = levels.includes(requested)
    ? semver.inc(current, requested)
    : semver.valid(requested);
  if (!version || !semver.gt(version, current))
    throw new Error(`Choose a valid Go version greater than ${current}`);
  if (semver.parse(version).build.length)
    throw new Error(
      'Go releases require canonical versions without build metadata.',
    );
  const metadata = goMetadata(root, pkg);
  const major = semver.major(version);
  if (!compatibleMajor(metadata, major))
    throw new Error(
      `Go major version ${major} requires a compatible module path. Migrate the module path and imports manually before release.`,
    );
  return { current, version, tag: `${metadata.prefix}v${version}`, files: [] };
}

export function goTask(cwd, name) {
  if (name === 'lint:fix') {
    console.log('[info] Go vet has no automatic fix; no files changed.');
    return;
  }
  const options = { cwd, env: { ...process.env, GOTOOLCHAIN: 'local' } };
  if (['format', 'format:check'].includes(name)) {
    const files = [
      ...fs.globSync('**/*.go', {
        cwd,
        exclude: ['vendor/**', 'dist/**', '.git/**'],
      }),
    ];
    if (!files.length) {
      console.log('[info] No Go source files to format.');
      return;
    }
    if (name === 'format') return run('gofmt', ['-w', ...files], options);
    const output = run('gofmt', ['-l', ...files], {
      ...options,
      capture: true,
    });
    if (output.trim()) throw new Error(`Go format check failed:\n${output}`);
    return;
  }
  if (name === 'typecheck' || name === 'build') {
    const directory = path.join(
      cwd,
      'dist',
      name === 'typecheck' ? '.typecheck' : '',
    );
    fs.mkdirSync(directory, { recursive: true });
    return run('go', ['build', '-trimpath', '-o', directory, './...'], options);
  }
  const commands = {
    dev: ['run', '.'],
    start: ['run', '.'],
    lint: ['vet', './...'],
    test: ['test', './...'],
  };
  if (!commands[name]) throw new Error(`Unsupported Go task: ${name}`);
  return run('go', commands[name], options);
}
