import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const managerDirectory = 'tools/manager';
export const statePath = '.template/manager.json';
export const runtimeDirectories = new Set(['node_modules', '.turbo']);

export function fileHash(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

export function localSnapshot(root) {
  const directory = path.join(root, managerDirectory);
  const files = {};
  function visit(current, prefix = '') {
    for (const entry of fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (!prefix && runtimeDirectories.has(entry.name)) continue;
      const file = `${prefix}${entry.name}`;
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Management source symlink is unsupported: ${file}`);
      if (entry.isDirectory()) visit(absolute, `${file}/`);
      else files[file] = fileHash(fs.readFileSync(absolute));
    }
  }
  visit(directory);
  return files;
}

export function difference(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .flatMap((file) => {
      if (!(file in before)) return [{ file, kind: 'added' }];
      if (!(file in after)) return [{ file, kind: 'deleted' }];
      return before[file] === after[file] ? [] : [{ file, kind: 'modified' }];
    });
}

export function recordBaseline(root, acceptCurrent) {
  if (!acceptCurrent)
    throw new Error(
      'Author command requires --accept-current. This explicitly trusts current source; it does not verify upstream provenance.',
    );
  const file = path.join(root, statePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify({ schemaVersion: 1, kind: 'bundled', directory: managerDirectory, files: localSnapshot(root) }, null, 2)}\n`,
  );
  console.log(
    '[ok] Explicit author snapshot recorded. Review and ship this baseline with the template.',
  );
}
