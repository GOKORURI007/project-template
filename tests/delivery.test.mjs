import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fixture, source } from './helpers.mjs';

test('最终模板不再携带两份完整参考仓库', () => {
  for (const name of ['python-project-template', 'zotero-addon-template'])
    assert.equal(fs.existsSync(path.join(source, name)), false, name);
});

test('含空格路径的复制项目删除其他语言示例后仍能初始化、构建和独立发布', (t) => {
  const f = fixture(t, 'with spaces ');
  for (const name of ['python-example', 'rust-example', 'go-example']) {
    const directory = path.resolve(f.root, 'packages', name);
    assert.equal(path.dirname(directory), path.join(f.root, 'packages'));
    fs.rmSync(directory, { recursive: true });
  }
  const initialized = f.managerInput(['init'], 'copied-project\n\n\n\ny\n');
  assert.equal(initialized.status, 0, initialized.stdout + initialized.stderr);
  assert.equal(JSON.parse(f.read('package.json')).name, 'copied-project');
  const built = f.turbo('build');
  assert.equal(built.status, 0, built.stdout + built.stderr);
  assert.equal(
    fs.existsSync(path.join(f.root, 'packages/node-example/dist/index.js')),
    true,
  );
  f.commitFixture();
  const release = f.managerInput(['release'], '@example/node\n0.1.1\ny\n');
  assert.equal(release.status, 0, release.stdout + release.stderr);
  assert.equal(f.git('tag', '--list'), 'example/node/v0.1.1');
  assert.equal(f.git('status', '--porcelain'), '');
  const state = f.turbo('submodule:status');
  assert.equal(state.status, 0, state.stdout + state.stderr);
  assert.match(state.stdout, /No submodule sources/);
});
