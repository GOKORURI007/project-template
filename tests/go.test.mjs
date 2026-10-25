import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fixture } from './helpers.mjs';

test('Go 发布只从当前模块主版本系列中确定已有版本', (t) => {
  for (const [module, expected] of [
    ['example.com/project/packages/go-example', '1.0.0'],
    ['example.com/project/packages/go-example/v2', '2.10.0'],
    ['gopkg.in/example.v1', '1.5.0'],
  ]) {
    const f = fixture(t);
    f.write('packages/go-example/go.mod', `module ${module}\n\ngo 1.24.0\n`);
    const pkg = JSON.parse(f.read('packages/go-example/package.json'));
    pkg.scripts = {};
    f.write('packages/go-example/package.json', pkg);
    f.commitFixture();
    for (const version of ['0.8.0', '2.9.0', '3.0.0'])
      f.git('tag', `packages/go-example/v${version}`);
    if (module.startsWith('gopkg')) f.git('tag', 'packages/go-example/v1.4.0');
    const released = f.managerInput(
      ['release'],
      `@example/go\n${expected}\ny\n`,
    );
    assert.equal(released.status, 0, released.stdout + released.stderr);
    assert.match(
      f.git('tag', '--list'),
      new RegExp(`packages/go-example/v${expected.replaceAll('.', '\\.')}`),
    );
  }
});

test('Go 示例通过官方格式、vet、编译、测试和构建', (t) => {
  const f = fixture(t);
  for (const name of ['format:check', 'lint', 'typecheck', 'test', 'build']) {
    const result = f.manager('task', name, '--package', '@example/go');
    assert.equal(result.status, 0, `${name}: ${result.stdout}${result.stderr}`);
  }
  assert.equal(
    fs.existsSync(
      path.join(
        f.root,
        'packages/go-example/dist',
        process.platform === 'win32' ? 'go-example.exe' : 'go-example',
      ),
    ),
    true,
  );
});

test('Go 发布使用子目录原生 tag，不伪造模块版本字段', (t) => {
  const f = fixture(t);
  f.commitFixture();
  const module = f.read('packages/go-example/go.mod');
  const manifest = f.read('packages/go-example/package.json');
  const result = f.managerInput(['release'], '@example/go\n0.1.0\ny\n');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(f.git('tag', '--list'), 'packages/go-example/v0.1.0');
  assert.equal(f.read('packages/go-example/go.mod'), module);
  assert.equal(f.read('packages/go-example/package.json'), manifest);
  assert.equal(f.git('status', '--porcelain'), '');
});

test('Go 格式检查不修改源码，显式格式化后检查通过', (t) => {
  const f = fixture(t);
  const file = 'packages/go-example/main.go';
  const formatted = f.read(file);
  const ugly = formatted.replaceAll('\t', '    ');
  f.write(file, ugly);
  const check = f.manager('task', 'format:check', '--package', '@example/go');
  assert.notEqual(check.status, 0);
  assert.match(check.stdout + check.stderr, /Go format check failed/);
  assert.equal(f.read(file), ugly);
  const fixed = f.manager('task', 'format', '--package', '@example/go');
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  assert.equal(f.read(file), formatted);
});

test('Go 不支持自动修复时仅输出 info；实际缺工具任务失败', (t) => {
  const f = fixture(t);
  const source = f.read('packages/go-example/main.go');
  const result = f.manager('task', 'lint:fix', '--package', '@example/go');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\[info\].*no automatic fix/);
  assert.equal(f.read('packages/go-example/main.go'), source);
  const missing = f.managerInput(
    ['task', 'lint', '--package', '@example/go'],
    '',
    { PATH: '' },
  );
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Missing or unusable tool go/);
});

test('Go 主版本升级需要模块路径迁移，失败时保留全部源码', (t) => {
  const f = fixture(t);
  f.commitFixture();
  const module = f.read('packages/go-example/go.mod');
  const source = f.read('packages/go-example/main.go');
  const result = f.managerInput(['release'], '@example/go\n2.0.0\ny\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Migrate the module path and imports manually/);
  assert.equal(f.read('packages/go-example/go.mod'), module);
  assert.equal(f.read('packages/go-example/main.go'), source);
  assert.equal(f.git('tag', '--list'), '');
});

test('Go 已迁移到 v2 模块路径后使用正确子目录 tag 发布', (t) => {
  const f = fixture(t);
  f.write(
    'packages/go-example/go.mod',
    'module example.com/project/packages/go-example/v2\n\ngo 1.24.0\n',
  );
  f.commitFixture();
  const result = f.managerInput(['release'], '@example/go\n2.0.0\ny\n');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(f.git('tag', '--list'), 'packages/go-example/v2.0.0');
  assert.equal(f.git('status', '--porcelain'), '');
});

test('Go 原生 gopkg.in 的 v1 后缀按其特殊规则发布', (t) => {
  const f = fixture(t);
  f.write(
    'packages/go-example/go.mod',
    'module gopkg.in/example.v1\n\ngo 1.24.0\n',
  );
  f.commitFixture();
  const result = f.managerInput(['release'], '@example/go\n1.0.0\ny\n');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(f.git('tag', '--list'), 'packages/go-example/v1.0.0');
});
