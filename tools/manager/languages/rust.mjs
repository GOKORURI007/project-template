import { run } from '../core.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'smol-toml';
import semver from 'semver';
import { metadata, replaceVersion } from './toml-version.mjs';

export function rustMetadata(pkg) {
  return metadata(path.join(pkg.directory, 'Cargo.toml'), 'package');
}

function lockFile(root, directory) {
  const details = JSON.parse(
    run(
      'cargo',
      [
        'metadata',
        '--no-deps',
        '--offline',
        '--locked',
        '--format-version',
        '1',
        '--manifest-path',
        path.join(directory, 'Cargo.toml'),
      ],
      {
        cwd: directory,
        capture: true,
        env: { ...process.env, RUSTUP_AUTO_INSTALL: '0' },
      },
    ),
  );
  const workspace = path.resolve(details.workspace_root);
  const relative = path.relative(root, workspace);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(
      'Cargo workspace must be inside the template project to release it.',
    );
  const candidate = path.join(workspace, 'Cargo.lock');
  if (!fs.existsSync(candidate))
    throw new Error(
      'Cargo lock missing. Generate the lock explicitly before release.',
    );
  return candidate;
}

export function rustVersionPlan(root, pkg, requested) {
  const source = rustMetadata(pkg);
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
    ? semver.inc(source.version, requested)
    : semver.valid(requested);
  if (!version || !semver.gt(version, source.version))
    throw new Error(
      `Choose a valid Rust version greater than ${source.version}`,
    );
  const editLock = (text) => {
    let found = false;
    const updated = text
      .split(/(?=^\[\[package\]\])/m)
      .map((block) => {
        if (!block.startsWith('[[package]]')) return block;
        const item = parse(block).package?.[0];
        if (item?.name !== source.data.package.name || item.source)
          return block;
        if (item.version !== source.version)
          throw new Error(
            'Rust project and Cargo lock versions differ. Refresh the lock manually.',
          );
        found = true;
        return block.replace(
          /^(version\s*=\s*)(["'])[^"'\r\n]*\2/m,
          `$1"${version}"`,
        );
      })
      .join('');
    if (!found)
      throw new Error(
        'Owned Rust package missing from lock. Refresh the lock manually.',
      );
    return updated;
  };
  return {
    current: source.version,
    version,
    files: [
      {
        file: source.file,
        contents: replaceVersion(
          source.text,
          'package',
          source.version,
          version,
        ),
      },
      { file: lockFile(root, pkg.directory), edit: editLock },
    ],
  };
}

export function validateRustDependencies(plans, all) {
  const targets = new Map(
    plans
      .filter((plan) => plan.pkg.template?.language === 'rust')
      .map((plan) => [rustMetadata(plan.pkg).data.package.name, plan]),
  );
  if (!targets.size) return;
  for (const pkg of all.filter((item) => item.template?.language === 'rust')) {
    const data = parse(
      fs.readFileSync(path.join(pkg.directory, 'Cargo.toml'), 'utf8'),
    );
    for (const owner of [data, ...Object.values(data.target ?? {})]) {
      for (const category of [
        'dependencies',
        'dev-dependencies',
        'build-dependencies',
      ]) {
        for (const [name, dependency] of Object.entries(
          owner[category] ?? {},
        )) {
          const target = targets.get(dependency.package ?? name);
          if (!target) continue;
          if (dependency.workspace)
            throw new Error(
              `Inherited Rust dependency ${name} requires manual validation.`,
            );
          const declared =
            typeof dependency === 'string' ? dependency : dependency.version;
          if (!declared) continue;
          let range = declared.replaceAll(',', ' ');
          if (/^\d+(?:\.\d+){0,2}(?:-[A-Za-z0-9.-]+)?$/.test(range))
            range = `^${range}`;
          if (
            !semver.validRange(range) ||
            !semver.satisfies(target.version, range)
          )
            throw new Error(
              `Incompatible Rust dependency: ${pkg.name} requires ${name}@${declared}, proposed ${target.version}. Update dependencies manually.`,
            );
        }
      }
    }
  }
}

export function rustTask(cwd, name) {
  const commands = {
    dev: ['run', '--offline', '--locked'],
    start: ['run', '--offline', '--locked'],
    format: ['fmt', '--all'],
    'format:check': ['fmt', '--all', '--', '--check'],
    lint: [
      'clippy',
      '--offline',
      '--locked',
      '--all-targets',
      '--',
      '-D',
      'warnings',
    ],
    'lint:fix': [
      'clippy',
      '--fix',
      '--allow-dirty',
      '--allow-staged',
      '--allow-no-vcs',
      '--offline',
      '--locked',
      '--all-targets',
    ],
    typecheck: ['check', '--offline', '--locked', '--all-targets'],
    test: ['test', '--offline', '--locked'],
    build: ['build', '--offline', '--locked'],
  };
  if (!commands[name]) throw new Error(`Unsupported Rust task: ${name}`);
  return run('cargo', commands[name], {
    cwd,
    env: { ...process.env, RUSTUP_AUTO_INSTALL: '0' },
  });
}
