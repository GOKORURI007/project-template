import fs from 'node:fs';
import path from 'node:path';
import { run } from '../core.mjs';
import * as pep440 from '@renovatebot/pep440';
import { parse } from 'smol-toml';
import { metadata, replaceVersion } from './toml-version.mjs';

export function pythonMetadata(pkg) {
  return metadata(path.join(pkg.directory, 'pyproject.toml'), 'project');
}

export function pythonVersionPlan(pkg, requested) {
  const source = pythonMetadata(pkg);
  const levels = [
    'patch',
    'minor',
    'major',
    'prepatch',
    'preminor',
    'premajor',
    'prerelease',
  ];
  const input = levels.includes(requested)
    ? pep440.inc(source.version, requested)
    : requested;
  const version = pep440.clean(input ?? '');
  if (!version || !pep440.gt(version, source.version))
    throw new Error(
      `Choose a valid PEP 440 version greater than ${source.version}`,
    );
  const files = [
    {
      file: source.file,
      contents: replaceVersion(source.text, 'project', source.version, version),
    },
  ];
  const lockFile = path.join(pkg.directory, 'uv.lock');
  if (fs.existsSync(lockFile)) {
    const lockText = fs.readFileSync(lockFile, 'utf8');
    const blocks = lockText.split(/(?=^\[\[package\]\])/m);
    let changed = false;
    const contents = blocks
      .map((block) => {
        if (!block.startsWith('[[package]]')) return block;
        const item = parse(block).package?.[0];
        if (
          item?.name !== source.data.project.name ||
          (item.source?.editable !== '.' && item.source?.virtual !== '.')
        )
          return block;
        if (item.version !== source.version)
          throw new Error(
            'Python project and uv lock versions differ. Refresh the lock manually before release.',
          );
        changed = true;
        return block.replace(
          /^(version\s*=\s*)(["'])[^"'\r\n]*\2/m,
          `$1"${version}"`,
        );
      })
      .join('');
    if (changed) files.push({ file: lockFile, contents });
  }
  return { current: source.version, version, files };
}

export function validatePythonDependencies(plans, all) {
  const normalize = (name) => name.toLowerCase().replace(/[-_.]+/g, '-');
  const targets = new Map(
    plans
      .filter((plan) => plan.pkg.template?.language === 'python')
      .map((plan) => [
        normalize(pythonMetadata(plan.pkg).data.project.name),
        plan,
      ]),
  );
  if (!targets.size) return;
  for (const pkg of all.filter(
    (item) => item.template?.language === 'python',
  )) {
    const data = parse(
      fs.readFileSync(path.join(pkg.directory, 'pyproject.toml'), 'utf8'),
    );
    const project = data.project ?? {};
    const declarations = [
      ...(project.dependencies ?? []),
      ...Object.values(project['optional-dependencies'] ?? {}).flat(),
      ...Object.values(data['dependency-groups'] ?? {})
        .flat()
        .filter((item) => typeof item === 'string'),
      ...(data['build-system']?.requires ?? []),
    ];
    for (const declaration of declarations) {
      const match = /^([a-zA-Z0-9_.-]+)(?:\[[^\]]+\])?\s*([^;]*)(?:;.*)?$/.exec(
        declaration,
      );
      if (!match) continue;
      const target = targets.get(normalize(match[1]));
      const constraint = match[2].trim().replace(/^\((.*)\)$/, '$1');
      if (!target || !constraint || constraint.startsWith('@')) continue;
      if (
        !pep440.validRange(constraint) ||
        !pep440.satisfies(target.version, constraint)
      )
        throw new Error(
          `Incompatible Python dependency: ${pkg.name} requires ${declaration}, proposed ${target.version}. Update dependencies manually.`,
        );
    }
  }
}

export function pythonEnvironment(cwd) {
  const environment = path.resolve(
    cwd,
    process.env.UV_PROJECT_ENVIRONMENT ?? '.venv',
  );
  if (!fs.existsSync(environment))
    throw new Error(
      'Python environment missing. Prepare it explicitly with uv sync before running tasks.',
    );
  return environment;
}

export function pythonTask(cwd, name) {
  pythonEnvironment(cwd);
  const commands = {
    start: [
      'python',
      '-m',
      parse(
        fs.readFileSync(path.join(cwd, 'pyproject.toml'), 'utf8'),
      ).project.name.replaceAll('-', '_'),
    ],
    format: ['ruff', 'format', '.'],
    'format:check': ['ruff', 'format', '--check', '.'],
    lint: ['ruff', 'check', '.'],
    'lint:fix': ['ruff', 'check', '--fix', '.'],
    typecheck: ['ty', 'check', 'src'],
    test: ['python', '-m', 'pytest'],
    build: ['python', '-m', 'build', '--no-isolation', '--outdir', 'dist'],
  };
  const command = commands[name === 'dev' ? 'start' : name];
  if (!command) throw new Error(`Unsupported Python task: ${name}`);
  return run(
    'uv',
    [
      'run',
      '--no-sync',
      '--offline',
      '--no-python-downloads',
      '--project',
      cwd,
      ...command,
    ],
    {
      cwd,
      env: { ...process.env, UV_PYTHON_DOWNLOADS: 'never', UV_NO_SYNC: '1' },
    },
  );
}
