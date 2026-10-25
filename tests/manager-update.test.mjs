import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './helpers.mjs';
import { seed } from './git-fixtures.mjs';

function upstream(f) {
  f.commitFixture();
  const source = seed(f, 'template-upstream');
  fs.cpSync(
    path.join(f.root, 'tools/manager'),
    path.join(source.directory, 'tools/manager'),
    { recursive: true },
  );
  fs.writeFileSync(path.join(source.directory, 'business.txt'), 'Never copied');
  source.commit('original template snapshot');
  const original = f.read('tools/manager/cli.mjs');
  fs.writeFileSync(
    path.join(source.directory, 'tools/manager/cli.mjs'),
    original.replace(
      '#!/usr/bin/env node',
      "#!/usr/bin/env node\nconsole.log('Updated manager marker');",
    ),
  );
  fs.writeFileSync(
    path.join(source.directory, 'tools/manager/new-file.mjs'),
    '// new capability\n',
  );
  fs.rmSync(path.join(source.directory, 'tools/manager/README.md'));
  const commit = source.commit('manager improvement');
  f.write('project.config.json', {
    schemaVersion: 1,
    custom: 'preserved',
    upstream: {
      repository: source.directory,
      ref: 'main',
      directory: 'tools/manager',
    },
    packages: {
      '@example/node': {
        commands: {
          deploy: [
            process.execPath,
            '-e',
            "console.log('Local deployment retained')",
          ],
        },
      },
    },
  });
  f.write('extensions/local.mjs', '// user extension\n');
  f.git('add', '.');
  f.git('commit', '-m', 'Local project configuration');
  return { ...source, revision: commit, original };
}

test('管理更新按已准备的 Turbo 版本检查兼容性，接受合法依赖范围', (t) => {
  const f = fixture(t);
  const source = upstream(f);
  const root = JSON.parse(f.read('package.json'));
  root.devDependencies.turbo = '^2.11.10';
  f.write('package.json', root);
  const allowed = f.manager('manager:update', '--check');
  assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
  const manifestFile = path.join(
    source.directory,
    'tools/manager/package.json',
  );
  const next = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  next.template.minTurbo = '2.12.0';
  fs.writeFileSync(manifestFile, JSON.stringify(next));
  source.commit('requires newer prepared Turbo');
  const blocked = f.manager('manager:update', '--check');
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /Incompatible Turbo version/);
});

test('无共同历史的模板复制项目只预览指定管理目录，不改本地配置及源码', (t) => {
  const f = fixture(t);
  const source = upstream(f);
  const settings = f.read('project.config.json');
  const state = fs.existsSync(path.join(f.root, '.template/manager.json'))
    ? f.read('.template/manager.json')
    : null;
  const result = f.manager('manager:update', '--check');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, new RegExp(source.revision));
  assert.match(result.stdout, /modified cli.mjs/);
  assert.match(result.stdout, /\+console.log\('Updated manager marker'\)/);
  assert.match(result.stdout, /added new-file.mjs/);
  assert.match(result.stdout, /deleted README.md/);
  assert.doesNotMatch(result.stdout, /business.txt/);
  assert.equal(f.read('tools/manager/cli.mjs'), source.original);
  assert.equal(f.read('.template/manager.json'), state);
  assert.equal(f.read('project.config.json'), settings);
  assert.equal(f.git('status', '--porcelain'), '');
});

test('缺失基线、本地源码修改及不兼容配置均停止更新并保留文件', (t) => {
  const f = fixture(t);
  const source = upstream(f);
  const baseline = f.read('.template/manager.json');
  fs.unlinkSync(path.join(f.root, '.template/manager.json'));
  const missing = f.manager('manager:update', '--check');
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /baseline is missing/);
  f.write('.template/manager.json', baseline);
  f.write('tools/manager/local.mjs', '// local source customization\n');
  const local = f.managerInput(['manager:update'], 'y\n');
  assert.notEqual(local.status, 0);
  assert.match(local.stderr, /added local.mjs/);
  assert.equal(
    f.read('tools/manager/local.mjs'),
    '// local source customization\n',
  );
  fs.unlinkSync(path.join(f.root, 'tools/manager/local.mjs'));
  const manifestFile = path.join(
    source.directory,
    'tools/manager/package.json',
  );
  const target = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  target.template.configVersion = 2;
  fs.writeFileSync(manifestFile, JSON.stringify(target));
  source.commit('incompatible configuration');
  const incompatible = f.managerInput(['manager:update'], 'y\n');
  assert.notEqual(incompatible.status, 0);
  assert.match(incompatible.stderr, /Incompatible configuration/);
  assert.equal(f.read('tools/manager/cli.mjs'), source.original);
  assert.equal(f.read('.template/manager.json'), baseline);
});

test('确认更新只替换管理源码，保留业务、配置、扩展和依赖，并记录来源基线', async (t) => {
  const f = fixture(t);
  const source = upstream(f);
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(source.directory, 'tools/manager/package.json'),
      'utf8',
    ),
  );
  manifest.dependencies['template-install-trap'] = '999.0.0';
  manifest.scripts.postinstall = 'node install-must-not-run.mjs';
  fs.writeFileSync(
    path.join(source.directory, 'tools/manager/package.json'),
    JSON.stringify(manifest),
  );
  fs.writeFileSync(
    path.join(source.directory, 'tools/manager/install-must-not-run.mjs'),
    "import fs from 'node:fs'; fs.writeFileSync('../../installation-ran', 'bad');\n",
  );
  const commit = source.commit('manual dependency preparation required');
  const settings = f.read('project.config.json');
  const rootManifest = f.read('package.json');
  const lock = f.read('package-lock.json');
  const business = f.read('packages/node-example/src/index.js');
  fs.symlinkSync(
    path.join(f.root, 'node_modules'),
    path.join(f.root, 'tools/manager/node_modules'),
    'junction',
  );
  f.write('tools/manager/.turbo/local-runtime.txt', 'preserved runtime state');
  const result = await f.turboTerminal('manager:update', [
    { when: /Management\s*baseline/, send: 'i' },
    { when: /Ctrl-z/, send: 'y\r' },
  ]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /dependencies\s*changed/i);
  assert.match(f.read('tools/manager/cli.mjs'), /Updated manager marker/);
  assert.equal(f.read('tools/manager/new-file.mjs'), '// new capability\n');
  assert.equal(
    fs.existsSync(path.join(f.root, 'tools/manager/README.md')),
    false,
  );
  assert.equal(fs.existsSync(path.join(f.root, 'business.txt')), false);
  assert.equal(fs.existsSync(path.join(f.root, 'installation-ran')), false);
  assert.equal(f.read('project.config.json'), settings);
  assert.equal(f.read('package.json'), rootManifest);
  assert.equal(f.read('package-lock.json'), lock);
  assert.equal(f.read('packages/node-example/src/index.js'), business);
  assert.equal(f.read('extensions/local.mjs'), '// user extension\n');
  assert.equal(
    fs
      .lstatSync(path.join(f.root, 'tools/manager/node_modules'))
      .isSymbolicLink(),
    true,
  );
  assert.equal(
    f.read('tools/manager/.turbo/local-runtime.txt'),
    'preserved runtime state',
  );
  assert.equal(JSON.parse(f.read('.template/manager.json')).commit, commit);
  const deployed = f.manager('task', 'deploy', '--package', '@example/node');
  assert.equal(deployed.status, 0, deployed.stdout + deployed.stderr);
  assert.match(deployed.stdout, /Local deployment retained/);
  const state = f.read('.template/manager.json');
  const repeated = f.managerInput(['manager:update'], 'y\n');
  assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
  assert.equal(f.read('.template/manager.json'), state);
});
