import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fixture } from './helpers.mjs';
import { seed } from './git-fixtures.mjs';

for (const squash of [true, false])
  test(`subtree 通过外置配置接入、固定同步、更新与目录专属推送 (squash=${squash})`, (t) => {
    const f = fixture(t);
    f.commitFixture();
    const source = seed(f, 'tree-source');
    const first = source.commit('first');
    const destination = path.join(f.root, '.git/tree-destination.git');
    f.git('init', '--bare', destination);
    f.write('project.config.json', {
      schemaVersion: 1,
      externalSources: [
        {
          kind: 'subtree',
          path: 'packages/node-example/vendor tree',
          source: source.directory,
          revision: first,
          pullRevision: 'main',
          pushRemote: destination,
          pushBranch: 'contribution',
          squash,
        },
      ],
    });
    f.git('add', '.');
    f.git('commit', '-m', 'Configure subtree');
    const init = f.turbo(
      'subtree:init',
      '--target',
      'packages/node-example/vendor tree',
    );
    assert.equal(init.status, 0, init.stdout + init.stderr);
    assert.equal(
      f.read('packages/node-example/vendor tree/source.txt'),
      'first',
    );
    const second = source.commit('second');
    const sync = f.manager(
      'subtree:sync',
      '--target',
      'packages/node-example/vendor tree',
    );
    assert.equal(sync.status, 0, sync.stdout + sync.stderr);
    assert.equal(
      f.read('packages/node-example/vendor tree/source.txt'),
      'first',
    );
    const update = f.manager(
      'subtree:update',
      '--target',
      'packages/node-example/vendor tree',
    );
    assert.equal(update.status, 0, update.stdout + update.stderr);
    assert.equal(
      f.read('packages/node-example/vendor tree/source.txt'),
      'second',
    );
    assert.equal(
      JSON.parse(f.read('project.config.json')).externalSources[0].revision,
      second,
    );
    assert.equal(f.git('status', '--porcelain'), '');
    const push = f.manager(
      'subtree:push',
      '--target',
      'packages/node-example/vendor tree',
    );
    assert.equal(push.status, 0, push.stdout + push.stderr);
    assert.equal(
      f.git('--git-dir', destination, 'ls-tree', '--name-only', 'contribution'),
      'source.txt',
    );
    assert.equal(
      f.git('--git-dir', destination, 'show', 'contribution:source.txt'),
      'second',
    );
    const state = f.manager('subtree:status');
    assert.equal(state.status, 0, state.stdout + state.stderr);
    assert.match(state.stdout, new RegExp(second));
    const settings = JSON.parse(f.read('project.config.json'));
    f.git('config', 'diff.noprefix', 'true');
    f.git('config', 'color.ui', 'always');
    settings.externalSources[0].revision = first;
    f.write('project.config.json', settings);
    f.git('add', 'project.config.json');
    f.git('commit', '-m', 'Select previous pinned source');
    const restored = f.manager(
      'subtree:sync',
      '--target',
      'packages/node-example/vendor tree',
    );
    assert.equal(restored.status, 0, restored.stdout + restored.stderr);
    assert.equal(
      f.read('packages/node-example/vendor tree/source.txt'),
      'first',
    );
    const advanced = f.manager(
      'subtree:update',
      '--target',
      'packages/node-example/vendor tree',
    );
    assert.equal(advanced.status, 0, advanced.stdout + advanced.stderr);
    assert.equal(
      f.read('packages/node-example/vendor tree/source.txt'),
      'second',
    );
    f.write(
      'packages/node-example/vendor tree/local.txt',
      'committed local extension',
    );
    f.git('add', '.');
    f.git('commit', '-m', 'Keep local subtree extension');
    source.commit('third');
    const withLocal = f.manager(
      'subtree:update',
      '--target',
      'packages/node-example/vendor tree',
    );
    assert.equal(withLocal.status, 0, withLocal.stdout + withLocal.stderr);
    assert.equal(
      f.read('packages/node-example/vendor tree/source.txt'),
      'third',
    );
    assert.equal(
      f.read('packages/node-example/vendor tree/local.txt'),
      'committed local extension',
    );
    f.write('packages/node-example/vendor tree/source.txt', 'local work');
    const dirty = f.manager(
      'subtree:update',
      '--target',
      'packages/node-example/vendor tree',
    );
    assert.notEqual(dirty.status, 0);
    assert.equal(
      f.read('packages/node-example/vendor tree/source.txt'),
      'local work',
    );
  });
