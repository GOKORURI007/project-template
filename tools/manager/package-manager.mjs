import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { workspacePatterns, yamlDocument } from './workspaces.mjs';

const versions = {
  npm: '12.2.0',
  bun: '1.4.4',
  pnpm: '12.15.0',
  yarn: '4.18.1',
};

export function packageManagerPlan(root, manifest, input) {
  const match =
    /^(npm|bun|pnpm|yarn)(?:@(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?))?$/.exec(
      input,
    );
  if (!match)
    throw new Error(
      'Choose npm, bun, pnpm, or yarn, optionally followed by @version.',
    );
  const name = match[1];
  const selectedVersion =
    match[2] ?? config(root).packageManagers?.[name] ?? versions[name];
  if (
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(
      selectedVersion,
    )
  )
    throw new Error(`Invalid ${name} version: ${selectedVersion}`);
  const patterns = workspacePatterns(root, manifest);
  const pnpmFile = path.join(root, 'pnpm-workspace.yaml');
  const files = [];
  if (name === 'pnpm') {
    const document = yamlDocument(pnpmFile);
    document.set('packages', patterns);
    files.push({ file: pnpmFile, contents: document.toString() });
  }
  if (name === 'yarn') {
    const file = path.join(root, '.yarnrc.yml');
    const document = yamlDocument(file);
    if (!document.has('nodeLinker')) document.set('nodeLinker', 'node-modules');
    files.push({ file, contents: document.toString() });
  }
  return {
    name,
    declaration: `${name}@${selectedVersion}`,
    patterns,
    files,
    lockfiles: [
      'package-lock.json',
      'bun.lock',
      'bun.lockb',
      'pnpm-lock.yaml',
      'yarn.lock',
    ].filter((file) => fs.existsSync(path.join(root, file))),
  };
}
