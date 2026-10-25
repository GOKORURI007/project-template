import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './helpers.mjs';

test('初始化通过终端确认同步根元信息和 APM，并保留语言包身份', (t) => {
  const f = fixture(t);
  const packageBefore = f.read('packages/node-example/package.json');
  const result = f.managerInput(
    ['init'],
    'my-workspace\nUseful workspace\nAda\n\ny\n',
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const manifest = JSON.parse(f.read('package.json'));
  assert.equal(manifest.name, 'my-workspace');
  assert.equal(manifest.description, 'Useful workspace');
  assert.equal(manifest.author, 'Ada');
  assert.match(f.read('apm.yml'), /name: my-workspace/);
  assert.match(f.read('apm.yml'), /author: Ada/);
  assert.equal(f.read('packages/node-example/package.json'), packageBefore);
  assert.match(result.stdout, /Python/);
  assert.match(result.stdout, /Rust/);
  assert.match(result.stdout, /Go/);
});

test('turbo init 在真实终端处理输入并在一次初始化后退出', async (t) => {
  const f = fixture(t);
  const result = await f.turboTerminal('init', [
    { when: /Project\s*name/, send: 'i' },
    { when: /Ctrl-z/, send: 'through-turbo\rTurbo project\rAda\r\ry\r' },
  ]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(f.read('package.json')).name, 'through-turbo');
});

test('重复初始化保留当前值、本地扩展和 APM 依赖注释', (t) => {
  const f = fixture(t);
  f.write('project.config.json', {
    schemaVersion: 1,
    packages: { '@example/node': { custom: 'keep' } },
    extension: 'local',
  });
  const local = f.read('project.config.json');
  const first = f.managerInput(['init'], 'repeatable\nUseful\nAda\n\ny\n');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const manifest = f.read('package.json');
  const apm = f.read('apm.yml');
  const second = f.managerInput(['init'], '\n\n\n\ny\n');
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.equal(f.read('package.json'), manifest);
  assert.equal(f.read('apm.yml'), apm);
  assert.equal(f.read('project.config.json'), local);
  assert.match(apm, /# Which agent platforms/);
  assert.match(apm, /GOKORURI007\/skills\/packages\/engineering#master/);
});

test('取消或未确认初始化时不产生半完成的配置修改', (t) => {
  const f = fixture(t);
  const manifest = f.read('package.json');
  const apm = f.read('apm.yml');
  const cancelled = f.managerInput(['init'], 'q\n');
  assert.equal(cancelled.status, 130);
  const declined = f.managerInput(
    ['init'],
    'not-applied\nChanged\nSomeone\n\nn\n',
  );
  assert.equal(declined.status, 0, declined.stdout + declined.stderr);
  assert.equal(f.read('package.json'), manifest);
  assert.equal(f.read('apm.yml'), apm);
});

test('工具缺失只报告不可用和缺失项，不安装或改写配置', (t) => {
  const f = fixture(t);
  const lock = f.read('package-lock.json');
  const result = f.managerInput(['init'], '\n\n\n\nn\n', { PATH: '' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\[×\] Python: missing uv/);
  assert.match(result.stdout, /\[×\] Rust: missing rustc, rustup, cargo/);
  assert.match(result.stdout, /\[×\] Go: missing go/);
  assert.equal(f.read('package-lock.json'), lock);
});

test('已准备的 Go 使用原生命令诊断为可用', (t) => {
  const f = fixture(t);
  const result = f.managerInput(['init'], '\n\n\n\nn\n');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\[✓\] Go: base tools available/);
});

test(
  '初始化后端配置写入失败时恢复根元信息和 APM',
  {
    skip:
      process.getuid?.() === 0
        ? 'Root bypasses read-only file permissions'
        : false,
  },
  (t) => {
    const f = fixture(t);
    f.write('.yarnrc.yml', 'enableTelemetry: false\n');
    const file = path.join(f.root, '.yarnrc.yml');
    const manifest = f.read('package.json');
    const apm = f.read('apm.yml');
    fs.chmodSync(file, 0o444);
    let result;
    try {
      result = f.managerInput(['init'], 'failed-init\n\n\nyarn\ny\n');
    } finally {
      fs.chmodSync(file, 0o666);
    }
    assert.notEqual(result.status, 0);
    assert.equal(f.read('package.json'), manifest);
    assert.equal(f.read('apm.yml'), apm);
    assert.equal(f.read('.yarnrc.yml'), 'enableTelemetry: false\n');
  },
);
