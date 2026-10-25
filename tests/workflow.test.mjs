import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import test from 'node:test';
import { fixture } from './helpers.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('公开命令构建 Node 示例并生成可运行产物', () => {
  const build = spawnSync(
    process.execPath,
    ['tools/manager/cli.mjs', 'task', 'build', '--package', '@example/node'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const start = spawnSync(
    process.execPath,
    [path.join(root, 'packages/node-example/dist/index.js')],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  assert.equal(start.status, 0, start.stderr);
  assert.equal(start.stdout.trim(), 'Hello from Node');
});

test('Turbo 入口区分全仓库跳过与显式目标缺任务', (t) => {
  const f = fixture(t);
  f.write('packages/optional/package.json', {
    name: '@example/optional',
    version: '0.1.0',
  });
  const all = f.turbo('build');
  assert.equal(all.status, 0, all.stdout + all.stderr);
  assert.match(all.stdout, /Skipping @example\/optional: no build task/);
  const selected = f.turbo('build', '--package', '@example/optional');
  assert.notEqual(selected.status, 0);
  assert.match(
    selected.stdout + selected.stderr,
    /does not provide task build/,
  );
});

test('格式检查保留源码，显式格式化后可通过完整 Node 检查', (t) => {
  const f = fixture(t);
  const ugly =
    "export function greeting(name='Node'){return 'Hello from '+name}\n";
  f.write('packages/node-example/src/greeting.js', ugly);
  const check = f.manager('task', 'format:check', '--package', '@example/node');
  assert.notEqual(check.status, 0);
  assert.equal(f.read('packages/node-example/src/greeting.js'), ugly);
  const format = f.manager('task', 'format', '--package', '@example/node');
  assert.equal(format.status, 0, format.stdout + format.stderr);
  const formatted = f.read('packages/node-example/src/greeting.js');
  assert.notEqual(formatted, ugly);
  f.write('packages/node-example/src/greeting.js', ugly);
  const again = f.manager('task', 'format', '--package', '@example/node');
  assert.equal(again.status, 0, again.stdout + again.stderr);
  assert.equal(f.read('packages/node-example/src/greeting.js'), formatted);
  for (const name of [
    'format:check',
    'lint',
    'lint:fix',
    'typecheck',
    'test',
  ]) {
    const result = f.manager('task', name, '--package', '@example/node');
    assert.equal(result.status, 0, `${name}: ${result.stdout}${result.stderr}`);
  }
});

test('缺少项目依赖时明确失败且不会隐含安装', (t) => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.root, 'node_modules'));
  const result = f.manager('task', 'build', '--package', '@example/node');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing .*dependency.*Prepare.*manually/i);
  assert.equal(fs.existsSync(path.join(f.root, 'node_modules')), false);
});

test('语言测试失败通过公开命令传播为失败退出码', (t) => {
  const f = fixture(t);
  f.write(
    'packages/node-example/test/greeting.test.mjs',
    "throw new Error('intentional native test failure');\n",
  );
  const result = f.manager('task', 'test', '--package', '@example/node');
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout + result.stderr,
    /intentional native test failure/,
  );
});
