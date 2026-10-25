import { packages } from './core.mjs';
import { config } from './config.mjs';

export const runtimeTasks = new Set(['dev', 'start', 'deploy']);
export const scriptKey = (name) =>
  runtimeTasks.has(name) ? name : `pkg:${name}`;

export function commandOverride(root, pkg, name) {
  const value = config(root).packages?.[pkg.name]?.commands?.[name];
  if (value === undefined || value === null) return null;
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((part) => typeof part !== 'string') ||
    !value[0]
  )
    throw new Error(
      `Command override ${pkg.name}:${name} must be a non-empty string array.`,
    );
  return value;
}

export function managedTask(pkg, name) {
  return (
    typeof pkg.scripts?.[scriptKey(name)] === 'string' &&
    pkg.scripts[scriptKey(name)].includes(`cli.mjs exec ${name}`)
  );
}

export function selectTaskPackages(root, name, targets = [], log = true) {
  const all = packages(root);
  const names = targets.flatMap((target) => target.split(','));
  for (const target of names)
    if (!all.some((pkg) => pkg.name === target))
      throw new Error(`Unknown package: ${target}`);
  const selected = names.length
    ? all.filter((pkg) => names.includes(pkg.name))
    : all;
  const result = [];
  for (const pkg of selected) {
    const available =
      typeof pkg.scripts?.[scriptKey(name)] === 'string' &&
      !(
        name === 'deploy' &&
        managedTask(pkg, name) &&
        !commandOverride(root, pkg, name)
      );
    if (!available) {
      if (names.length)
        throw new Error(`${pkg.name} does not provide task ${name}`);
      if (log) console.log(`[info] Skipping ${pkg.name}: no ${name} task`);
    } else result.push(pkg);
  }
  return result;
}
