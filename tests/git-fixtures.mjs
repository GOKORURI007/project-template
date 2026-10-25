import fs from 'node:fs';
import path from 'node:path';

export function seed(f, name) {
  const directory = path.join(f.root, '.git', name);
  fs.mkdirSync(directory, { recursive: true });
  f.git('init', '--initial-branch=main', directory);
  f.git('-C', directory, 'config', 'user.name', 'Source Tests');
  f.git('-C', directory, 'config', 'user.email', 'source@example.invalid');
  const commit = (text) => {
    fs.writeFileSync(path.join(directory, 'source.txt'), text);
    f.git('-C', directory, 'add', '.');
    f.git('-C', directory, 'commit', '-m', text);
    return f.git('-C', directory, 'rev-parse', 'HEAD');
  };
  return { directory, commit };
}
