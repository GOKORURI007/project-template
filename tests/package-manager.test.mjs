import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers.mjs';

test('初始化切换 pnpm，保留锁文件和额外工作区设置', (t) => {
  const f = fixture(t);
  f.write(
    'pnpm-workspace.yaml',
    "packages:\n  - 'old/*'\nonlyBuiltDependencies:\n  - esbuild\n",
  );
  f.write('pnpm-lock.yaml', 'old pnpm lock\n');
  const npmLock = f.read('package-lock.json');
  const packageBefore = f.read('packages/node-example/package.json');
  const result = f.managerInput(['init'], '\n\n\npnpm@10.0.0\ny\n');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(
    JSON.parse(f.read('package.json')).packageManager,
    'pnpm@10.0.0',
  );
  assert.match(f.read('pnpm-workspace.yaml'), /packages\/\*/);
  assert.match(f.read('pnpm-workspace.yaml'), /esbuild/);
  assert.equal(f.read('package-lock.json'), npmLock);
  assert.equal(f.read('pnpm-lock.yaml'), 'old pnpm lock\n');
  assert.equal(f.read('packages/node-example/package.json'), packageBefore);
  assert.match(result.stdout, /lockfile/i);
});

for (const declaration of ['npm@12.2.0', 'bun@1.4.4', 'yarn@4.18.1']) {
  test(`初始化选择 ${declaration}，不转换任何锁文件`, (t) => {
    const f = fixture(t);
    const locks = {
      'package-lock.json': f.read('package-lock.json'),
      'bun.lock': 'existing bun lock\n',
      'bun.lockb': 'existing binary lock bytes',
      'pnpm-lock.yaml': 'existing pnpm lock\n',
      'yarn.lock': 'existing yarn lock\n',
    };
    for (const [file, contents] of Object.entries(locks))
      f.write(file, contents);
    const result = f.managerInput(['init'], `\n\n\n${declaration}\ny\n`);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(
      JSON.parse(f.read('package.json')).packageManager,
      declaration,
    );
    for (const [file, contents] of Object.entries(locks))
      assert.equal(f.read(file), contents);
    if (declaration.startsWith('yarn@'))
      assert.match(f.read('.yarnrc.yml'), /nodeLinker: node-modules/);
    assert.match(result.stdout, /no dependencies were installed/);
  });
}

test('离开 pnpm 时保留其实际工作区范围和本地版本偏好', (t) => {
  const f = fixture(t);
  const manifest = JSON.parse(f.read('package.json'));
  manifest.packageManager = 'pnpm@10.0.0';
  f.write('package.json', manifest);
  f.write(
    'pnpm-workspace.yaml',
    'packages:\n  - packages/*\n  - tools/*\n  - extensions/*\n',
  );
  f.write('project.config.json', {
    schemaVersion: 1,
    packageManagers: { bun: '1.2.3' },
  });
  const result = f.managerInput(['init'], '\n\n\nbun\ny\n');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const changed = JSON.parse(f.read('package.json'));
  assert.equal(changed.packageManager, 'bun@1.2.3');
  assert.deepEqual(changed.workspaces, [
    'packages/*',
    'tools/*',
    'extensions/*',
  ]);
});

test('不支持的管理器不会写入项目配置', (t) => {
  const f = fixture(t);
  const before = f.read('package.json');
  const result = f.managerInput(['init'], '\n\n\nunknown\ny\n');
  assert.notEqual(result.status, 0);
  assert.equal(f.read('package.json'), before);
});

test('pnpm 发布发现遵守原生工作区范围、排除项和重叠模式', (t) => {
  const f = fixture(t);
  const root = JSON.parse(f.read('package.json'));
  root.packageManager = 'pnpm@12.15.0';
  f.write('package.json', root);
  f.write(
    'pnpm-workspace.yaml',
    'packages:\n  - tools/*\n  - extensions/*\n  - extensions/included\n  - "!extensions/excluded"\n',
  );
  for (const name of ['included', 'excluded'])
    f.write(`extensions/${name}/package.json`, {
      name: `@workspace/${name}`,
      version: '0.1.0',
      private: true,
      template: { language: 'node' },
    });
  f.commitFixture();
  const released = f.managerInput(
    ['release'],
    '@workspace/included\npatch\ny\n',
  );
  assert.equal(released.status, 0, released.stdout + released.stderr);
  assert.equal(
    JSON.parse(f.read('extensions/included/package.json')).version,
    '0.1.1',
  );
  assert.doesNotMatch(released.stdout, /@workspace\/excluded|@example\/node/);
  assert.equal(
    (released.stdout.match(/\d+\) @workspace\/included/g) ?? []).length,
    1,
  );
  const excluded = f.manager(
    'task',
    'deploy',
    '--package',
    '@workspace/excluded',
  );
  assert.notEqual(excluded.status, 0);
  assert.match(excluded.stderr, /Unknown package/);
});

test('宽工作区模式不会把依赖目录当成业务包执行', (t) => {
  const f = fixture(t);
  const root = JSON.parse(f.read('package.json'));
  root.workspaces = ['packages/**', 'tools/*'];
  f.write('package.json', root);
  f.write('packages/node-example/node_modules/fixture-rogue/package.json', {
    name: 'fixture-rogue',
    version: '1.0.0',
    scripts: { deploy: 'node -e "process.exit(24)"' },
  });
  const result = f.manager('task', 'deploy');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-rogue/);
});
