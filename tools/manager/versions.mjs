import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import { config } from './config.mjs';
import { readJson } from './core.mjs';
import {
  pythonMetadata,
  pythonVersionPlan,
  validatePythonDependencies,
} from './languages/python.mjs';
import {
  rustMetadata,
  rustVersionPlan,
  validateRustDependencies,
} from './languages/rust.mjs';
import { goCurrentVersion, goVersionPlan } from './languages/go.mjs';

export function currentVersion(pkg, root) {
  if (pkg.template?.language === 'python') return pythonMetadata(pkg).version;
  if (pkg.template?.language === 'rust') return rustMetadata(pkg).version;
  if (pkg.template?.language === 'go') return goCurrentVersion(root, pkg);
  return pkg.version;
}

export function proposedVersion(current, requested) {
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
    throw new Error(`Choose a valid version greater than ${current}`);
  return version;
}

export function releasePlan(root, pkg, requested) {
  let native;
  if (pkg.template?.language === 'python')
    native = pythonVersionPlan(pkg, requested);
  else if (pkg.template?.language === 'rust')
    native = rustVersionPlan(root, pkg, requested);
  else if (pkg.template?.language === 'go')
    native = goVersionPlan(root, pkg, requested);
  else if (pkg.template?.language === 'node') {
    const current = pkg.version;
    if (!semver.valid(current))
      throw new Error(`Invalid current version for ${pkg.name}: ${current}`);
    const version = proposedVersion(current, requested);
    const updated = readJson(pkg.manifest);
    updated.version = version;
    native = {
      current,
      version,
      files: [
        {
          file: pkg.manifest,
          contents: `${JSON.stringify(updated, null, 2)}\n`,
        },
      ],
    };
  } else
    throw new Error(`Unsupported release language: ${pkg.template?.language}`);
  const { current, version, files } = native;
  const local = config(root);
  const configured =
    local.packages?.[pkg.name]?.tagTemplate ?? local.release?.tagTemplate;
  const pattern =
    configured ?? (native.tag ? '{path}/v{version}' : '{name}/v{version}');
  const configuredTag = pattern
    .replaceAll('{name}', pkg.name.replace(/^@/, ''))
    .replaceAll('{version}', version)
    .replaceAll(
      '{path}',
      path.relative(root, pkg.directory).replaceAll('\\', '/'),
    );
  if (native.tag && configured && configuredTag !== native.tag)
    throw new Error(`Go tag must match module directory rules: ${native.tag}`);
  const tag = native.tag ?? configuredTag;
  return { pkg, current, version, tag, files };
}

export function validateDependencies(root, plans, all) {
  validatePythonDependencies(plans, all);
  validateRustDependencies(plans, all);
  const byName = new Map(plans.map((plan) => [plan.pkg.name, plan]));
  for (const pkg of all) {
    for (const key of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      for (const [name, declared] of Object.entries(pkg[key] ?? {})) {
        const target = byName.get(name);
        if (!target) continue;
        const range = declared.replace(/^workspace:/, '');
        if (
          range === '*' ||
          (declared.startsWith('workspace:') && ['^', '~'].includes(range))
        )
          continue;
        if (
          !semver.validRange(range) ||
          !semver.satisfies(target.version, range)
        ) {
          throw new Error(
            `Incompatible dependency: ${pkg.name} requires ${name}@${declared}, proposed ${target.version}. Update dependencies manually.`,
          );
        }
      }
    }
  }
}

export function versionFiles(root, plans) {
  const edits = new Map();
  for (const change of plans.flatMap((plan) => plan.files)) {
    const previous =
      edits.get(change.file) ?? fs.readFileSync(change.file, 'utf8');
    if (edits.has(change.file) && !change.edit && previous !== change.contents)
      throw new Error(`Conflicting version updates: ${change.file}`);
    edits.set(
      change.file,
      change.edit ? change.edit(previous) : change.contents,
    );
  }
  const files = [...edits].map(([file, contents]) => ({ file, contents }));
  const lockFile = path.join(root, 'package-lock.json');
  if (fs.existsSync(lockFile)) {
    const lock = readJson(lockFile);
    let changed = false;
    for (const plan of plans) {
      const key = path.relative(root, plan.pkg.directory).replaceAll('\\', '/');
      if (lock.packages?.[key]?.version !== undefined) {
        lock.packages[key].version = plan.version;
        changed = true;
      }
    }
    if (changed)
      files.push({
        file: lockFile,
        contents: `${JSON.stringify(lock, null, 2)}\n`,
      });
  }
  return files;
}
