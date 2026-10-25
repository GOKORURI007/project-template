import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './core.mjs';

export function config(root) {
  const file = path.join(root, 'project.config.json');
  const value = fs.existsSync(file) ? readJson(file) : { schemaVersion: 1 };
  if (value.schemaVersion !== 1)
    throw new Error(
      `Unsupported project configuration version: ${value.schemaVersion}`,
    );
  return value;
}

export function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
