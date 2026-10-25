import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers.mjs';
import { seed } from './git-fixtures.mjs';

test('submodule 原生发现、初始化和固定同步与显式更新分开，推送只触及所选来源', (t) => {
  const f = fixture(t);
  f.commitFixture();
  const source = seed(f, 'module-source');
  const first = source.commit('first');
  const target = 'packages/node-example/vendor source';
  f.git(
    '-c',
    'protocol.file.allow=always',
    'submodule',
    'add',
    '-b',
    'main',
    source.directory,
    target,
  );
  f.git('add', '.');
  f.git('commit', '-m', 'Pin source');
  const second = source.commit('second');
  const state = f.turbo('submodule:status');
  assert.equal(state.status, 0, state.stdout + state.stderr);
  assert.match(state.stdout, /vendor source/);
  assert.match(state.stdout, new RegExp(first));
  const init = f.manager('submodule:init', '--target', target);
  assert.equal(init.status, 0, init.stdout + init.stderr);
  assert.equal(f.git('-C', target, 'rev-parse', 'HEAD'), first);
  const update = f.manager('submodule:update', '--target', target);
  assert.equal(update.status, 0, update.stdout + update.stderr);
  assert.equal(f.git('-C', target, 'rev-parse', 'HEAD'), second);
  const synced = f.manager('submodule:sync', '--target', target);
  assert.equal(synced.status, 0, synced.stdout + synced.stderr);
  assert.equal(f.git('-C', target, 'rev-parse', 'HEAD'), first);
  f.git('-C', target, 'config', 'user.name', 'Source Tests');
  f.git('-C', target, 'config', 'user.email', 'source@example.invalid');
  f.write(`${target}/local.txt`, 'upstream extension');
  f.git('-C', target, 'add', '.');
  f.git('-C', target, 'commit', '-m', 'Local source change');
  const local = f.git('-C', target, 'rev-parse', 'HEAD');
  const pushed = f.manager(
    'submodule:push',
    '--target',
    target,
    '--branch',
    'contribution',
  );
  assert.equal(pushed.status, 0, pushed.stdout + pushed.stderr);
  assert.equal(
    f.git('-C', source.directory, 'rev-parse', 'contribution'),
    local,
  );
  assert.equal(f.git('-C', source.directory, 'rev-parse', 'main'), second);
  const bad = f.manager('submodule:sync', '--target', 'missing');
  assert.notEqual(bad.status, 0);
  f.write(`${target}/source.txt`, 'user edits');
  const dirty = f.manager('submodule:sync', '--target', target);
  assert.notEqual(dirty.status, 0);
  assert.equal(f.read(`${target}/source.txt`), 'user edits');
});

test('submodule TUI 可初始化已取消初始化的目标，推送缺少分支时明确失败', async (t) => {
  const f = fixture(t);
  f.commitFixture();
  const source = seed(f, 'module-source');
  const first = source.commit('first');
  f.git(
    '-c',
    'protocol.file.allow=always',
    'submodule',
    'add',
    source.directory,
    'vendor',
  );
  f.git('add', '.');
  f.git('commit', '-m', 'Pin source');
  f.git('submodule', 'deinit', '-f', '--', 'vendor');
  const init = f.managerInput(['submodule:init', '--target', 'vendor'], '', {
    GIT_ALLOW_PROTOCOL: 'file',
  });
  assert.equal(init.status, 0, init.stdout + init.stderr);
  assert.equal(f.git('-C', 'vendor', 'rev-parse', 'HEAD'), first);
  const missing = f.manager('submodule:push', '--target', 'vendor');
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Specify --branch/);
  const state = await f.turboTerminal('submodule', [
    { when: /submodule\s*target/, send: 'i' },
    { when: /Ctrl-z/, send: '1\rstatus\r' },
  ]);
  assert.equal(state.status, 0, state.stdout + state.stderr);
  assert.match(state.stdout, /vendor/);
});
