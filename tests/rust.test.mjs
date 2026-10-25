import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fixture } from './helpers.mjs';

test('只选择 Node 时也检查 Turbo 依赖构建所需的 Rust，缓存不能掩盖缺工具', (t) => {
  const f = fixture(t);
  const node = JSON.parse(f.read('packages/node-example/package.json'));
  node.dependencies = { '@example/rust': '*' };
  f.write('packages/node-example/package.json', node);
  const first = f.manager('task', 'build', '--package', '@example/node');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const paths = process.env.PATH.split(path.delimiter).filter(
    (entry) =>
      !fs.existsSync(
        path.join(entry, process.platform === 'win32' ? 'rustc.exe' : 'rustc'),
      ),
  );
  const second = f.managerInput(
    ['task', 'build', '--package', '@example/node'],
    '',
    { PATH: paths.join(path.delimiter) },
  );
  assert.notEqual(second.status, 0);
  assert.match(second.stdout + second.stderr, /Missing or unusable tool rustc/);
});

test('Rust 示例通过官方格式、lint、编译、测试和构建', (t) => {
  const f = fixture(t);
  for (const name of ['format:check', 'lint', 'typecheck', 'test', 'build']) {
    const result =
      name === 'build'
        ? f.turbo('build', '--package', '@example/rust')
        : f.manager('task', name, '--package', '@example/rust');
    assert.equal(result.status, 0, `${name}: ${result.stdout}${result.stderr}`);
  }
  const executable = path.join(
    f.root,
    'packages/rust-example/target/debug',
    process.platform === 'win32' ? 'rust-example.exe' : 'rust-example',
  );
  assert.equal(fs.existsSync(executable), true);
});

test('Rust 继承版本冲突会提示人工处理，不改共享版本', (t) => {
  const f = fixture(t);
  const inherited =
    '[package]\nname = "rust-example"\nversion.workspace = true\nedition = "2024"\n\n[workspace.package]\nversion = "0.1.0"\n';
  f.write('packages/rust-example/Cargo.toml', inherited);
  f.commitFixture();
  const result = f.managerInput(['release'], '@example/rust\n0.2.0\ny\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /static.*inherited/i);
  assert.equal(f.read('packages/rust-example/Cargo.toml'), inherited);
  assert.equal(f.git('tag', '--list'), '');
});

test('Rust 原生 caret 依赖不兼容时拒绝发布', (t) => {
  const f = fixture(t);
  f.write('packages/rust-consumer/package.json', {
    name: '@example/rust-consumer',
    private: true,
    template: { language: 'rust' },
  });
  f.write(
    'packages/rust-consumer/Cargo.toml',
    '[package]\nname = "rust-consumer"\nversion = "1.0.0"\nedition = "2024"\n\n[dependencies]\nrust-example = { path = "../rust-example", version = "0.1.0" }\n',
  );
  f.write(
    'packages/rust-consumer/src/lib.rs',
    'pub fn answer() -> u32 {\n    42\n}\n',
  );
  f.commitFixture();
  const result = f.managerInput(['release'], '@example/rust\n0.2.0\ny\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Incompatible Rust dependency/);
  assert.match(f.read('packages/rust-example/Cargo.toml'), /version = "0.1.0"/);
  assert.equal(f.git('tag', '--list'), '');
});

test('Rust 显式自动修复使用官方命令，缺编译器仍报告失败', (t) => {
  const f = fixture(t);
  const fixed = f.manager('task', 'lint:fix', '--package', '@example/rust');
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  const missing = f.managerInput(
    ['task', 'lint', '--package', '@example/rust'],
    '',
    { PATH: '' },
  );
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Missing or unusable tool rustc/);
});

test('Rust 独立发布更新原生版本和所属锁记录', (t) => {
  const f = fixture(t);
  f.commitFixture();
  const node = f.read('packages/node-example/package.json');
  const result = f.managerInput(['release'], '@example/rust\n0.2.0\ny\n');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(f.read('packages/rust-example/Cargo.toml'), /version = "0.2.0"/);
  assert.match(
    f.read('packages/rust-example/Cargo.lock'),
    /name = "rust-example"\nversion = "0.2.0"/,
  );
  assert.equal(f.read('packages/node-example/package.json'), node);
  assert.equal(f.git('tag', '--list'), 'example/rust/v0.2.0');
  assert.equal(f.git('status', '--porcelain'), '');
});

test('共享 Cargo 工作区的多包发布合并更新真实共享锁记录', (t) => {
  const f = fixture(t);
  const manifest = JSON.parse(f.read('packages/rust-example/package.json'));
  manifest.name = '@example/rust-second';
  f.write('packages/rust-second/package.json', manifest);
  f.write(
    'packages/rust-second/Cargo.toml',
    '[package]\nname = "rust-second"\nversion = "0.1.0"\nedition = "2024"\n',
  );
  f.write(
    'packages/rust-second/src/lib.rs',
    'pub fn answer() -> u32 {\n    42\n}\n',
  );
  f.write(
    'Cargo.toml',
    '[workspace]\nmembers = ["packages/rust-example", "packages/rust-second"]\nresolver = "3"\n',
  );
  const prepared = spawnSync('cargo', ['generate-lockfile', '--offline'], {
    cwd: f.root,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(prepared.status, 0, prepared.stdout + prepared.stderr);
  f.commitFixture();
  const result = f.managerInput(
    ['release'],
    '@example/rust,@example/rust-second\n0.1.1\n0.1.2\ny\n',
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const lock = f.read('Cargo.lock');
  assert.match(lock, /name = "rust-example"\nversion = "0.1.1"/);
  assert.match(lock, /name = "rust-second"\nversion = "0.1.2"/);
});
