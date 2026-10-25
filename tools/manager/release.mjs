import fs from 'node:fs';
import path from 'node:path';
import { packages } from './core.mjs';
import { config } from './config.mjs';
import { prompts } from './prompts.mjs';
import { git, requireClean } from './git.mjs';
import { task } from './tasks.mjs';
import { channelChoice, publishingChoice, publishRelease } from './publish.mjs';
import {
  currentVersion,
  releasePlan,
  validateDependencies,
  versionFiles,
} from './versions.mjs';

export async function release(root) {
  config(root);
  requireClean(root);
  const all = packages(root);
  const available = all.filter((pkg) =>
    ['node', 'python', 'rust', 'go'].includes(pkg.template?.language),
  );
  if (!available.length) throw new Error('No supported release targets.');
  console.log('Independent package release (local)');
  available.forEach((pkg, index) => {
    let version;
    try {
      version = currentVersion(pkg, root);
    } catch (error) {
      version = `unavailable: ${error.message}`;
    }
    console.log(`${index + 1}) ${pkg.name} — ${version}`);
  });
  const ui = prompts();
  let plans;
  let remotes;
  let channels;
  try {
    const answer = await ui.text(
      'Packages (numbers or names, comma separated)',
      '1',
    );
    const selected = [
      ...new Set(answer.split(',').map((name) => name.trim())),
    ].map((choice) => {
      const pkg = /^\d+$/.test(choice)
        ? available[Number(choice) - 1]
        : available.find((item) => item.name === choice);
      if (!pkg) throw new Error(`Unknown release target: ${choice}`);
      return pkg;
    });
    if (new Set(selected.map((pkg) => pkg.name)).size !== selected.length)
      throw new Error('Each release target may only be selected once.');
    plans = [];
    for (const pkg of selected) {
      const requested = await ui.text(
        `Version for ${pkg.name} (patch/minor/major/prerelease or version)`,
        'patch',
      );
      const plan = releasePlan(root, pkg, requested);
      git(root, 'check-ref-format', `refs/tags/${plan.tag}`);
      if (git(root, 'tag', '--list', plan.tag))
        throw new Error(`Tag already exists: ${plan.tag}`);
      if (plans.some((item) => item.tag === plan.tag))
        throw new Error(
          `Duplicate planned release tag: ${plan.tag}; use independent tag templates.`,
        );
      plans.push(plan);
    }
    validateDependencies(root, plans, all);
    for (const plan of plans)
      console.log(
        `${plan.pkg.name}: ${plan.current} -> ${plan.version}; tag ${plan.tag}`,
      );
    remotes = await publishingChoice(root, ui);
    channels = await channelChoice(root, plans, ui);
    if (!(await ui.confirm('Check and create local release'))) {
      console.log('[info] Release cancelled.');
      return;
    }
  } finally {
    ui.close();
  }

  for (const check of ['format:check', 'lint', 'typecheck', 'test', 'build']) {
    const names = plans
      .filter((plan) => plan.pkg.scripts?.[`pkg:${check}`])
      .map((plan) => plan.pkg.name);
    if (names.length) task(root, check, names);
  }
  requireClean(root);
  const files = versionFiles(root, plans);
  const before = new Map(
    files.map(({ file }) => [file, fs.readFileSync(file)]),
  );
  const head = git(root, 'rev-parse', 'HEAD');
  const names = files.map(({ file }) =>
    path.relative(root, file).replaceAll('\\', '/'),
  );
  try {
    for (const { file, contents } of files) fs.writeFileSync(file, contents);
    if (names.length) git(root, 'add', '--', ...names);
    git(
      root,
      'commit',
      '--allow-empty',
      '-m',
      `chore(release): ${plans.map((plan) => `${plan.pkg.name}@${plan.version}`).join(', ')}`,
    );
    for (const plan of plans)
      git(
        root,
        'tag',
        '-a',
        plan.tag,
        '-m',
        `Release ${plan.pkg.name} ${plan.version}`,
      );
  } catch (error) {
    if (git(root, 'rev-parse', 'HEAD') === head) {
      for (const [file, contents] of before) fs.writeFileSync(file, contents);
      if (names.length) git(root, 'reset', '--', ...names);
    }
    throw error;
  }
  console.log(
    `[ok] Local release created: ${plans.map((plan) => plan.tag).join(', ')}`,
  );
  publishRelease(root, plans, remotes, channels);
}
