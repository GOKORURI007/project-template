import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers.mjs';

test('符号 workspace 协议始终跟随本地目标版本，显式范围仍检查兼容性', (t) => {
  const f = fixture(t);
  const root = JSON.parse(f.read('package.json'));
  root.packageManager = 'yarn@4.18.1';
  f.write('package.json', root);
  const target = JSON.parse(f.read('packages/node-example/package.json'));
  target.scripts = {};
  f.write('packages/node-example/package.json', target);
  for (const [index, range] of [
    'workspace:*',
    'workspace:^',
    'workspace:~',
  ].entries())
    f.write(`packages/consumer-${index}/package.json`, {
      name: `@example/consumer-${index}`,
      version: '1.0.0',
      template: { language: 'node' },
      dependencies: { '@example/node': range },
    });
  f.commitFixture();
  const released = f.managerInput(['release'], '@example/node\n1.0.0\ny\n');
  assert.equal(released.status, 0, released.stdout + released.stderr);
  const consumer = JSON.parse(f.read('packages/consumer-0/package.json'));
  consumer.dependencies['@example/node'] = 'workspace:^1.0.0';
  f.write('packages/consumer-0/package.json', consumer);
  f.git('add', '.');
  f.git('commit', '-m', 'Constrain consumer explicitly');
  const blocked = f.managerInput(['release'], '@example/node\n2.0.0\ny\n');
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /Incompatible dependency/);
  assert.equal(
    JSON.parse(f.read('packages/node-example/package.json')).version,
    '1.0.0',
  );
});

test('多个发布目标生成相同 tag 时，在修改任何版本之前停止', (t) => {
  const f = fixture(t);
  f.write('packages/second/package.json', {
    name: '@example/second',
    version: '0.1.0',
    template: { language: 'node' },
  });
  f.write('project.config.json', {
    schemaVersion: 1,
    release: { tagTemplate: 'v{version}' },
  });
  f.commitFixture();
  const before = f.git('rev-parse', 'HEAD');
  const result = f.managerInput(
    ['release'],
    '@example/node,@example/second\n0.2.0\n0.2.0\ny\n',
  );
  assert.notEqual(result.status, 0);
  assert.equal(f.git('rev-parse', 'HEAD'), before);
  assert.equal(f.git('tag', '--list'), '');
  assert.equal(
    JSON.parse(f.read('packages/node-example/package.json')).version,
    '0.1.0',
  );
});

test('本地发布先验证 Node 包，再更新版本并创建独立 tag', (t) => {
  const f = fixture(t);
  f.commitFixture();
  const before = f.git('rev-parse', 'HEAD');
  const result = f.managerInput(['release'], '@example/node\n0.2.0\ny\n');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    JSON.parse(f.read('packages/node-example/package.json')).version,
    '0.2.0',
  );
  assert.equal(
    JSON.parse(f.read('package-lock.json')).packages['packages/node-example']
      .version,
    '0.2.0',
  );
  assert.notEqual(f.git('rev-parse', 'HEAD'), before);
  assert.equal(f.git('tag', '--list'), 'example/node/v0.2.0');
  assert.equal(f.git('status', '--porcelain'), '');
  assert.match(result.stdout, /local release/i);
});

test('多个目标中任一检查失败，都不提前修改版本或发布记录', (t) => {
  const f = fixture(t);
  f.write('packages/second/package.json', {
    name: '@example/second',
    version: '1.0.0',
    type: 'module',
    template: { language: 'node' },
    scripts: { 'pkg:lint': 'node fail.mjs' },
  });
  f.write(
    'packages/second/fail.mjs',
    "console.error('blocked by fixture lint'); process.exit(1);\n",
  );
  f.commitFixture();
  const head = f.git('rev-parse', 'HEAD');
  const first = f.read('packages/node-example/package.json');
  const second = f.read('packages/second/package.json');
  const result = f.managerInput(
    ['release'],
    '@example/node,@example/second\n0.2.0\n1.0.1\ny\n',
  );
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /blocked by fixture lint/);
  assert.equal(f.read('packages/node-example/package.json'), first);
  assert.equal(f.read('packages/second/package.json'), second);
  assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.equal(f.git('tag', '--list'), '');
});

test('拒绝脏工作区并保留使用者尚未提交的源码', (t) => {
  const f = fixture(t);
  f.commitFixture();
  const source = "export function greeting() { return 'User work'; }\n";
  f.write('packages/node-example/src/greeting.js', source);
  const result = f.managerInput(['release'], '@example/node\n0.2.0\ny\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Working tree must be clean/);
  assert.equal(f.read('packages/node-example/src/greeting.js'), source);
  assert.equal(f.git('diff', '--cached', '--name-only'), '');
  assert.equal(f.git('tag', '--list'), '');
});

test('发布遇到不兼容依赖时报告，不连带修改其他包', (t) => {
  const f = fixture(t);
  f.write('packages/consumer/package.json', {
    name: '@example/consumer',
    version: '1.0.0',
    template: { language: 'node' },
    dependencies: { '@example/node': '^0.1.0' },
  });
  f.commitFixture();
  const head = f.git('rev-parse', 'HEAD');
  const result = f.managerInput(['release'], '@example/node\n1.0.0\ny\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Incompatible dependency/);
  assert.equal(
    JSON.parse(f.read('packages/consumer/package.json')).version,
    '1.0.0',
  );
  assert.equal(
    JSON.parse(f.read('packages/node-example/package.json')).version,
    '0.1.0',
  );
  assert.equal(f.git('rev-parse', 'HEAD'), head);
});

test('turbo release 的真实终端交互可完成本地发布并退出', async (t) => {
  const f = fixture(t);
  f.commitFixture();
  const result = await f.turboTerminal('release', [
    { when: /Packages\s*\(/, send: 'i' },
    { when: /Ctrl-z/, send: '@example/node\r0.2.0\ry\r' },
  ]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(f.git('tag', '--list'), 'example/node/v0.2.0');
});

test('多包版本独立发布，本地 tag 配置优先于全局默认', (t) => {
  const f = fixture(t);
  f.write('packages/second/package.json', {
    name: '@example/second',
    version: '2.0.0',
    template: { language: 'node' },
  });
  f.write('project.config.json', {
    schemaVersion: 1,
    release: { tagTemplate: 'ship/{name}/{version}' },
    packages: { '@example/node': { tagTemplate: 'local/{name}/{version}' } },
  });
  f.commitFixture();
  const result = f.managerInput(
    ['release'],
    '@example/node,@example/second\n0.2.0\n2.0.1\ny\n',
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    JSON.parse(f.read('packages/node-example/package.json')).version,
    '0.2.0',
  );
  assert.equal(
    JSON.parse(f.read('packages/second/package.json')).version,
    '2.0.1',
  );
  assert.equal(
    f.git('tag', '--list'),
    'local/example/node/0.2.0\nship/example/second/2.0.1',
  );
  assert.equal(f.git('status', '--porcelain'), '');
});
