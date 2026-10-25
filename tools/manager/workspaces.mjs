import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';

export function yamlDocument(file) {
  const document = parseDocument(
    fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}\n',
  );
  const value = document.toJSON();
  if (
    document.errors.length ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  )
    throw new Error(`Invalid workspace configuration: ${path.basename(file)}`);
  return document;
}

export function workspacePatterns(root, manifest) {
  let patterns = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : manifest.workspaces?.packages;
  if (manifest.packageManager?.startsWith('pnpm@')) {
    const file = path.join(root, 'pnpm-workspace.yaml');
    if (!fs.existsSync(file))
      throw new Error(
        'Missing pnpm-workspace.yaml; prepare the pnpm workspace configuration manually.',
      );
    patterns = yamlDocument(file).get('packages')?.toJSON() ?? [];
  }
  if (
    !Array.isArray(patterns) ||
    patterns.some((item) => typeof item !== 'string' || !item.trim())
  )
    throw new Error(
      'Workspace packages must be an array of non-empty patterns.',
    );
  return patterns;
}
