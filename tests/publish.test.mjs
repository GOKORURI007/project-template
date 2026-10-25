import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fixture } from './helpers.mjs';
import { seed } from './git-fixtures.mjs';

test('业务发布和空重试不会隐含推送 submodule 或 subtree 来源', (t) => {
  const f = fixture(t);
  f.commitFixture();
  const source = seed(f, 'external-source');
  const original = source.commit('original external source');
  f.git(
    '-c',
    'protocol.file.allow=always',
    'submodule',
    'add',
    source.directory,
    'vendor',
  );
  f.git('-C', 'vendor', 'config', 'user.name', 'Source Tests');
  f.git('-C', 'vendor', 'config', 'user.email', 'source@example.invalid');
  f.write('vendor/change.txt', 'committed local source work');
  f.git('-C', 'vendor', 'add', '.');
  f.git('-C', 'vendor', 'commit', '-m', 'Local external source change');
  f.write('project.config.json', {
    schemaVersion: 1,
    externalSources: [
      {
        kind: 'submodule',
        path: 'vendor',
        pushRemote: 'origin',
        pushBranch: 'main',
      },
      {
        kind: 'subtree',
        path: 'not-initialized',
        source: 'missing-source',
        pushRemote: 'missing-destination',
        pushBranch: 'main',
      },
    ],
  });
  f.git('add', '.');
  f.git('commit', '-m', 'Record external sources');
  const released = f.managerInput(['release'], '@example/node\n0.2.0\ny\n');
  assert.equal(released.status, 0, released.stdout + released.stderr);
  const retried = f.manager('release:retry');
  assert.equal(retried.status, 0, retried.stdout + retried.stderr);
  assert.equal(f.git('-C', source.directory, 'rev-parse', 'main'), original);
});

test('部分 remote 失败后仅重试未完成目标，始终推送原发布提交和 tag', (t) => {
  const f = fixture(t);
  f.commitFixture();
  const good = path.join(f.root, '.git/good.git');
  const bad = path.join(f.root, '.git/bad.git');
  f.git('init', '--bare', good);
  f.git('remote', 'add', 'good', good);
  f.git('remote', 'add', 'bad', bad);
  const published = f.managerInput(
    ['release'],
    '@example/node\n0.2.0\ngood,bad\ny\n',
  );
  assert.notEqual(published.status, 0);
  assert.match(published.stdout, /\[ok\] good/);
  assert.match(published.stdout + published.stderr, /\[failed\] bad/);
  const commit = f.git('rev-parse', 'HEAD');
  const tag = f.git('rev-parse', 'refs/tags/example/node/v0.2.0');
  assert.equal(f.git('--git-dir', good, 'rev-parse', 'main'), commit);
  f.git('init', '--bare', bad);
  f.git('remote', 'set-url', 'good', path.join(f.root, '.git/unreachable.git'));
  f.write('later.txt', 'Unrelated later commit\n');
  f.git('add', 'later.txt');
  f.git('commit', '-m', 'Later work');
  const later = f.git('rev-parse', 'HEAD');
  const retried = f.turbo('release:retry');
  assert.equal(retried.status, 0, retried.stdout + retried.stderr);
  assert.match(retried.stdout, /\[ok\] bad/);
  assert.doesNotMatch(retried.stdout, /\[ok\] good/);
  assert.equal(f.git('--git-dir', bad, 'rev-parse', 'main'), commit);
  assert.equal(
    f.git('--git-dir', bad, 'rev-parse', 'refs/tags/example/node/v0.2.0'),
    tag,
  );
  assert.equal(f.git('rev-parse', 'HEAD'), later);
  assert.equal(f.git('rev-parse', 'refs/tags/example/node/v0.2.0'), tag);
  assert.equal(
    JSON.parse(f.read('packages/node-example/package.json')).version,
    '0.2.0',
  );
  assert.equal(f.git('status', '--porcelain'), '');
});

test('发布渠道由本地扩展显式启用，包配置覆盖全局渠道', (t) => {
  const f = fixture(t);
  f.write('project.config.json', {
    schemaVersion: 1,
    release: { publish: [process.execPath, '-e', 'process.exit(45)'] },
    packages: {
      '@example/node': {
        commands: {
          publish: [process.execPath, '../../extensions/publish.mjs'],
        },
      },
    },
  });
  f.write(
    'extensions/publish.mjs',
    "import fs from 'node:fs'; fs.writeFileSync('published.json', JSON.stringify({version:process.env.TEMPLATE_RELEASE_VERSION, tag:process.env.TEMPLATE_RELEASE_TAG, commit:process.env.TEMPLATE_RELEASE_COMMIT}));\n",
  );
  f.commitFixture();
  const result = f.managerInput(['release'], '@example/node\n0.2.0\ny\ny\n');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = JSON.parse(f.read('packages/node-example/published.json'));
  assert.equal(output.version, '0.2.0');
  assert.equal(output.tag, 'example/node/v0.2.0');
  assert.equal(output.commit, f.git('rev-parse', 'HEAD'));
});
