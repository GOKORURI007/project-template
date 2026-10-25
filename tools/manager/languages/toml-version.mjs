import fs from 'node:fs';
import { parse } from 'smol-toml';

export function metadata(file, table) {
  const text = fs.readFileSync(file, 'utf8');
  const data = parse(text);
  const version = data[table]?.version;
  if (typeof version !== 'string')
    throw new Error(
      `A static ${table} version is required; dynamic or inherited versions need explicit handling.`,
    );
  return { file, text, data, version };
}

export function replaceVersion(text, table, current, version) {
  const header = new RegExp(`^\\[${table}\\][^\\n]*(?:\\n|$)`, 'm').exec(text);
  if (!header)
    throw new Error(
      `Cannot locate [${table}] version without rewriting unrelated metadata.`,
    );
  const start = header.index + header[0].length;
  const rest = text.slice(start);
  const next = /^\[/m.exec(rest);
  const section = rest.slice(0, next?.index ?? rest.length);
  const match = /^(\s*version\s*=\s*)(["'])([^"'\r\n]*)\2/m.exec(section);
  if (!match || match[3] !== current)
    throw new Error(`Cannot safely update static [${table}] version.`);
  const changed =
    section.slice(0, match.index) +
    `${match[1]}${match[2]}${version}${match[2]}` +
    section.slice(match.index + match[0].length);
  return text.slice(0, start) + changed + rest.slice(section.length);
}
