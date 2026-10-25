import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture } from './helpers.mjs';

test('项目配置提供自定义部署命令，并且每次都真实执行', (t) => {
  const f = fixture(t);
  f.write('project.config.json', {
    schemaVersion: 1,
    packages: {
      '@example/node': {
        commands: { deploy: [process.execPath, 'deploy.mjs'] },
      },
    },
  });
  f.write(
    'packages/node-example/deploy.mjs',
    "import fs from 'node:fs'; fs.appendFileSync('deploy.log', 'deployed\\n');\n",
  );
  for (let count = 0; count < 2; count++) {
    const result = f.manager('task', 'deploy', '--package', '@example/node');
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  assert.equal(
    f.read('packages/node-example/deploy.log'),
    'deployed\ndeployed\n',
  );
});

test('Node start 通过统一入口正常运行示例', (t) => {
  const f = fixture(t);
  const result = f.manager('task', 'start', '--package', '@example/node');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Hello from Node/);
});

test('Python、Rust 与 Go 的 start 调用各自原生运行命令', (t) => {
  const f = fixture(t);
  for (const [name, greeting] of [
    ['python', 'Python'],
    ['rust', 'Rust'],
    ['go', 'Go'],
  ]) {
    const result = f.manager('task', 'start', '--package', `@example/${name}`);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, new RegExp(`Hello from ${greeting}`));
  }
});

test('Turbo 准备依赖完成后才运行选定的开发任务', (t) => {
  const f = fixture(t);
  f.write('packages/prepare/package.json', {
    name: '@example/prepare',
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: { 'pkg:build': 'node build.mjs' },
  });
  f.write(
    'packages/prepare/build.mjs',
    "import fs from 'node:fs'; fs.mkdirSync('dist', {recursive:true}); fs.writeFileSync('dist/ready.txt', 'prepared dependency');\n",
  );
  const node = JSON.parse(f.read('packages/node-example/package.json'));
  node.dependencies = { '@example/prepare': '*' };
  f.write('packages/node-example/package.json', node);
  const turbo = JSON.parse(f.read('turbo.json'));
  turbo.tasks.dev.dependsOn = ['pkg:build'];
  f.write('turbo.json', turbo);
  f.write('project.config.json', {
    schemaVersion: 1,
    packages: {
      '@example/node': { commands: { dev: [process.execPath, 'ready.mjs'] } },
    },
  });
  f.write(
    'packages/node-example/ready.mjs',
    "import fs from 'node:fs'; console.log(fs.readFileSync('../prepare/dist/ready.txt','utf8'));\n",
  );
  const result = f.manager('task', 'dev', '--package', '@example/node');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /prepared dependency/);
});

test('未配置部署时全局跳过，显式目标和失败部署正确报错', (t) => {
  const f = fixture(t);
  const all = f.manager('task', 'deploy');
  assert.equal(all.status, 0, all.stdout + all.stderr);
  assert.match(all.stdout, /Skipping @example\/node: no deploy task/);
  const selected = f.manager('task', 'deploy', '--package', '@example/node');
  assert.notEqual(selected.status, 0);
  f.write('project.config.json', {
    schemaVersion: 1,
    packages: {
      '@example/node': {
        commands: { deploy: [process.execPath, '-e', 'process.exit(23)'] },
      },
    },
  });
  const failed = f.manager('task', 'deploy', '--package', '@example/node');
  assert.notEqual(failed.status, 0);
});

test('开发终端接收输入，停止后所属进程树退出', async (t) => {
  const f = fixture(t);
  f.write('project.config.json', {
    schemaVersion: 1,
    packages: {
      '@example/node': { commands: { dev: [process.execPath, 'server.mjs'] } },
    },
  });
  f.write(
    'packages/node-example/server.mjs',
    `import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
fs.writeFileSync('runtime-pids.json', JSON.stringify([process.pid, child.pid]));
console.log('Runtime ready');
createInterface({input:process.stdin}).on('line', line => console.log('echo:' + line));
`,
  );
  const result = await f.managerTerminal(
    'dev',
    [
      { when: /Runtime\s*ready/, send: 'i' },
      { when: /Ctrl-z/, send: 'ping\r' },
      { when: /echo:ping/, send: '\u0003' },
    ],
    ['--package', '@example/node'],
    async () => {
      const pids = JSON.parse(
        f.read('packages/node-example/runtime-pids.json'),
      );
      const alive = () =>
        pids.filter((pid) => {
          try {
            process.kill(pid, 0);
            return true;
          } catch {
            return false;
          }
        });
      for (let attempt = 0; attempt < 30 && alive().length; attempt++)
        await delay(50);
      return alive();
    },
  );
  assert.match(result.stdout, /echo:ping/);
  assert.deepEqual(
    result.observed,
    [],
    'Turbo 退出前应停止任务及其子进程，而非依赖测试终端清理',
  );
});

test('Node 默认 dev 监听源码并可从 Turbo 终端停止', async (t) => {
  const f = fixture(t);
  const result = await f.turboTerminal(
    'dev',
    [{ when: /Waiting\s*for\s*file\s*changes/, send: '\u0003' }],
    ['--filter=@example/node'],
  );
  assert.match(result.stdout, /Hello\s*from\s*Node/);
  assert.match(result.stdout, /Waiting\s*for\s*file\s*changes/);
});

test('非 Node 的 dev 使用原生开发运行命令', (t) => {
  const f = fixture(t);
  for (const [name, greeting] of [
    ['python', 'Python'],
    ['rust', 'Rust'],
    ['go', 'Go'],
  ]) {
    const result = f.manager('task', 'dev', '--package', `@example/${name}`);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, new RegExp(`Hello from ${greeting}`));
  }
});

test('直接 Turbo 运行目标选择时跳过其他语言并校验不存在目标', (t) => {
  const f = fixture(t);
  const started = f.turbo('start', '--package', '@example/node');
  assert.equal(started.status, 0, started.stdout + started.stderr);
  assert.match(started.stdout, /Hello from Node/);
  assert.doesNotMatch(started.stdout, /Hello from (?:Go|Python|Rust)/);
  const missing = f.turbo('deploy', '--package', '@example/missing');
  assert.notEqual(missing.status, 0);
  assert.match(missing.stdout + missing.stderr, /Unknown package/);
});
