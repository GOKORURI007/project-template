import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const source = fileURLToPath(new URL('../', import.meta.url));

function commandEnv() {
  const env = { ...process.env, TURBO_TELEMETRY_DISABLED: '1' };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

export function fixture(t, label = '') {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), `project-template-${label}`),
  );
  for (const entry of [
    'package.json',
    'package-lock.json',
    'turbo.json',
    'project.config.json',
    '.prettierrc.json',
    'eslint.config.mjs',
    'apm.yml',
    '.template',
    'tools',
    'packages',
  ]) {
    fs.cpSync(path.join(source, entry), path.join(root, entry), {
      recursive: true,
      filter: (file) =>
        ![
          'dist',
          '.turbo',
          'node_modules',
          '.venv',
          '__pycache__',
          '.ruff_cache',
          '.pytest_cache',
          'target',
        ].includes(path.basename(file)),
    });
  }
  fs.symlinkSync(
    path.join(source, 'node_modules'),
    path.join(root, 'node_modules'),
    'junction',
  );
  fs.writeFileSync(
    path.join(root, '.gitignore'),
    fs.readFileSync(path.join(source, '.gitignore')),
  );
  for (const pkg of fs.readdirSync(path.join(source, 'packages'))) {
    const environment = path.join(source, 'packages', pkg, '.venv');
    if (fs.existsSync(environment))
      fs.symlinkSync(
        environment,
        path.join(root, 'packages', pkg, '.venv'),
        'junction',
      );
  }
  t.after(() => {
    if (
      path.dirname(root) !== os.tmpdir() ||
      !path.basename(root).startsWith('project-template-')
    )
      throw new Error('Unexpected fixture cleanup path');
    fs.rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });
  return {
    root,
    write(file, content) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(
        path.join(root, file),
        typeof content === 'string'
          ? content
          : `${JSON.stringify(content, null, 2)}\n`,
      );
    },
    read(file) {
      return fs.readFileSync(path.join(root, file), 'utf8');
    },
    git(...args) {
      const result = spawnSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
      });
      if (result.status !== 0)
        throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
      return result.stdout.trim();
    },
    commitFixture() {
      this.git('init', '--initial-branch=main');
      this.git('config', 'user.name', 'Template Tests');
      this.git('config', 'user.email', 'template-tests@example.invalid');
      this.git('config', 'core.autocrlf', 'false');
      this.git('add', '.');
      this.git('commit', '-m', 'Initial fixture');
    },
    manager(...args) {
      return spawnSync(process.execPath, ['tools/manager/cli.mjs', ...args], {
        cwd: root,
        encoding: 'utf8',
        env: commandEnv(),
      });
    },
    managerInput(args, input, env = {}) {
      return spawnSync(process.execPath, ['tools/manager/cli.mjs', ...args], {
        cwd: root,
        encoding: 'utf8',
        input,
        env: { ...commandEnv(), ...env },
      });
    },
    turbo(task, ...args) {
      return spawnSync(
        process.execPath,
        [
          path.join(source, 'node_modules/turbo/bin/turbo'),
          task,
          '--ui=stream',
          '--',
          ...args,
        ],
        {
          cwd: root,
          encoding: 'utf8',
          env: commandEnv(),
        },
      );
    },
    turboTerminal(task, steps, args = [], inspect, managerEntry = false) {
      return new Promise((resolve, reject) => {
        const env = {
          ...commandEnv(),
          TERM: 'xterm-256color',
          FORCE_COLOR: '1',
        };
        delete env.NO_COLOR;
        delete env.CI;
        const argv = managerEntry
          ? [path.join(root, 'tools/manager/cli.mjs'), 'task', task, ...args]
          : [
              path.join(source, 'node_modules/turbo/bin/turbo'),
              task,
              '--ui=tui',
              ...args,
            ];
        const host = fork(path.join(source, 'tests/terminal-driver.mjs'), [], {
          cwd: root,
          env,
          execArgv: [],
          windowsHide: true,
          stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        });
        let result;
        let failure;
        let errors = '';
        host.stderr.on('data', (data) => {
          errors += data;
        });
        const timeout = setTimeout(() => {
          failure = new Error(`Terminal timed out: ${task}; ${errors}`);
          host.send({ type: 'abort' });
        }, 30000);
        host.on('message', async (message) => {
          if (message.type !== 'result') return;
          clearTimeout(timeout);
          try {
            const observed = inspect ? await inspect() : undefined;
            if (message.steps !== steps.length)
              throw new Error(
                `Terminal exited before interaction step ${message.steps}: ${message.stdout}`,
              );
            result = { ...message, observed };
          } catch (error) {
            failure = error;
          }
          host.send({ type: 'release' });
        });
        host.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        host.on('exit', (code) => {
          clearTimeout(timeout);
          if (failure) reject(failure);
          else if (!result || code !== 0)
            reject(new Error(`Terminal host exited ${code}: ${errors}`));
          else resolve(result);
        });
        host.send({
          type: 'start',
          argv,
          cwd: root,
          env,
          steps: steps.map((step) => ({
            source: step.when.source,
            flags: step.when.flags,
            send: step.send,
          })),
        });
      });
    },
    managerTerminal(task, steps, args = [], inspect) {
      return this.turboTerminal(task, steps, args, inspect, true);
    },
  };
}
