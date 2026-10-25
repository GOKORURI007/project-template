import fs from 'node:fs';
import path from 'node:path';
import spawn from 'cross-spawn';
import { parseDocument } from 'yaml';
import { readJson } from './core.mjs';
import { config } from './config.mjs';
import { prompts } from './prompts.mjs';
import { packageManagerPlan } from './package-manager.mjs';

function available(command, args = ['--version']) {
  const result = spawn.sync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 3000,
    env: {
      ...process.env,
      UV_PYTHON_DOWNLOADS: 'never',
      UV_OFFLINE: '1',
      RUSTUP_AUTO_INSTALL: '0',
      GOTOOLCHAIN: 'local',
      COREPACK_ENABLE_NETWORK: '0',
      COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    },
  });
  return !result.error && result.status === 0;
}

function applyConfiguration(changes) {
  const originals = new Map(
    changes.map(({ file }) => [
      file,
      fs.existsSync(file) ? fs.readFileSync(file) : null,
    ]),
  );
  const attempted = [];
  try {
    for (const { file, contents } of changes) {
      attempted.push(file);
      fs.writeFileSync(file, contents);
    }
  } catch (error) {
    const failures = [];
    for (const file of attempted.reverse()) {
      try {
        const before = originals.get(file);
        if (before === null) {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        } else if (
          !fs.existsSync(file) ||
          !fs.readFileSync(file).equals(before)
        )
          fs.writeFileSync(file, before);
      } catch (restore) {
        failures.push(`${file}: ${restore.message}`);
      }
    }
    if (failures.length)
      throw new Error(
        `${error.message}; configuration restoration incomplete: ${failures.join('; ')}`,
      );
    throw error;
  }
}

export function diagnose() {
  console.log('\nEnvironment (checks only; no installation):');
  const requirements = {
    Node: ['node'],
    Python: ['uv'],
    Rust: ['rustc', 'rustup', 'cargo'],
    Go: ['go'],
  };
  for (const [language, commands] of Object.entries(requirements)) {
    const missing = commands.filter(
      (command) =>
        !available(command, command === 'go' ? ['version'] : ['--version']),
    );
    if (
      language === 'Python' &&
      !missing.length &&
      !available('uv', ['python', 'find', '--no-python-downloads'])
    )
      missing.push('Python interpreter');
    console.log(
      missing.length
        ? `[×] ${language}: missing ${missing.join(', ')}`
        : `[✓] ${language}: base tools available`,
    );
  }
  console.log(
    '[info] Language project dependencies must be prepared manually.\n',
  );
}

export async function initialize(root) {
  config(root);
  const manifestFile = path.join(root, 'package.json');
  const apmFile = path.join(root, 'apm.yml');
  const manifest = readJson(manifestFile);
  const apm = parseDocument(fs.readFileSync(apmFile, 'utf8'));
  if (apm.errors.length)
    throw new Error(`Invalid APM configuration: ${apm.errors[0].message}`);
  diagnose();
  console.log(
    'Template initialization — enter keeps current value; q cancels.',
  );
  const ui = prompts();
  try {
    const name = await ui.text('Project name', manifest.name);
    const description = await ui.text(
      'Description',
      manifest.description ?? '',
    );
    const author = await ui.text('Author', manifest.author ?? '');
    const manager = packageManagerPlan(
      root,
      manifest,
      await ui.text(
        'Package manager (npm, bun, pnpm, yarn; optional @version)',
        manifest.packageManager,
      ),
    );
    console.log(
      available(manager.name)
        ? `[✓] Package manager ${manager.name}: available`
        : `[×] Package manager ${manager.name}: missing; prepare it manually`,
    );
    if (manager.lockfiles.length)
      console.log(
        `[info] Existing lockfiles preserved: ${manager.lockfiles.join(', ')}. Check compatibility before using ${manager.name}.`,
      );
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(name))
      throw new Error('Project name must be a valid lowercase package name.');
    if (!(await ui.confirm('Apply project configuration'))) {
      console.log('[info] No changes applied.');
      return;
    }
    for (const [key, value] of Object.entries({ name, description, author })) {
      manifest[key] = value;
      apm.set(key, value);
    }
    manifest.packageManager = manager.declaration;
    manifest.workspaces = Array.isArray(manifest.workspaces)
      ? manager.patterns
      : { ...manifest.workspaces, packages: manager.patterns };
    applyConfiguration([
      {
        file: manifestFile,
        contents: `${JSON.stringify(manifest, null, 2)}\n`,
      },
      { file: apmFile, contents: apm.toString() },
      ...manager.files,
    ]);
    console.log(
      '[ok] Project metadata updated. Language package names and versions preserved.',
    );
    console.log(
      `[info] Declared ${manager.declaration}. Run ${manager.name} install yourself when ready; no dependencies were installed.`,
    );
  } finally {
    ui.close();
  }
}
