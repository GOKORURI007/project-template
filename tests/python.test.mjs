import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fixture } from './helpers.mjs';

test('Python 测试确实检查复制项目中被修改的应用源码', (t) => {
  const f = fixture(t);
  f.write(
    'packages/python-example/src/python_example/__init__.py',
    'def greeting(name: str = "Python") -> str:\n    return "Regression in copied project"\n',
  );
  const tested = f.manager('task', 'test', '--package', '@example/python');
  assert.notEqual(tested.status, 0);
  assert.match(tested.stdout + tested.stderr, /Regression in copied project/);
});

test('Python 发布检查开发分组、分组引用及构建依赖的本地版本约束', (t) => {
  for (const declaration of [
    '[dependency-groups]\nbase = ["python-example<0.2"]\ndev = [{include-group = "base"}]\n',
    '[build-system]\nrequires = ["python-example<0.2"]\nbuild-backend = "example.backend"\n',
  ]) {
    const f = fixture(t);
    f.write('packages/consumer/package.json', {
      name: '@example/consumer',
      private: true,
      template: { language: 'python' },
    });
    f.write(
      'packages/consumer/pyproject.toml',
      `[project]\nname = "consumer"\nversion = "0.1.0"\n\n${declaration}`,
    );
    f.commitFixture();
    const head = f.git('rev-parse', 'HEAD');
    const result = f.managerInput(['release'], '@example/python\n0.2.0\ny\n');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Incompatible Python dependency/);
    assert.equal(f.git('rev-parse', 'HEAD'), head);
    assert.equal(f.git('tag', '--list'), '');
  }
});

test('Python 通过统一命令完成 Ruff、ty、测试和原生构建', (t) => {
  const f = fixture(t);
  for (const name of ['format:check', 'lint', 'typecheck', 'test', 'build']) {
    const result = f.manager('task', name, '--package', '@example/python');
    assert.equal(result.status, 0, `${name}: ${result.stdout}${result.stderr}`);
  }
  const files = fs.readdirSync(
    path.join(f.root, 'packages/python-example/dist'),
  );
  assert.ok(files.includes('python_example-0.1.0-py3-none-any.whl'));
});

test('Python 发布使用 PEP 440 原生预发布版本，保留 Node 包版本', (t) => {
  const f = fixture(t);
  f.commitFixture();
  const node = f.read('packages/node-example/package.json');
  const result = f.managerInput(
    ['release'],
    '@example/python\n0.2.0-alpha.1\ny\n',
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(
    f.read('packages/python-example/pyproject.toml'),
    /version = "0.2.0a1"/,
  );
  assert.match(
    f.read('packages/python-example/uv.lock'),
    /name = "python-example"\nversion = "0.2.0a1"/,
  );
  assert.equal(f.read('packages/node-example/package.json'), node);
  assert.equal(f.git('tag', '--list'), 'example/python/v0.2.0a1');
  assert.equal(f.git('status', '--porcelain'), '');
});

test('缺少 Python 项目环境时明确失败，不隐含创建或安装', (t) => {
  const f = fixture(t);
  const environment = path.join(f.root, 'packages/python-example/.venv');
  fs.unlinkSync(environment);
  const result = f.manager('task', 'lint', '--package', '@example/python');
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Python environment missing/);
  assert.equal(fs.existsSync(environment), false);
  const node = f.manager('task', 'build', '--package', '@example/node');
  assert.equal(node.status, 0, node.stdout + node.stderr);
});

test('Python 原生依赖约束不兼容时阻止发布且不改消费者', (t) => {
  const f = fixture(t);
  f.write('packages/python-consumer/package.json', {
    name: '@example/python-consumer',
    private: true,
    template: { language: 'python' },
  });
  f.write(
    'packages/python-consumer/pyproject.toml',
    '[project]\nname = "python-consumer"\nversion = "0.1.0"\ndependencies = ["python-example<0.2"]\n',
  );
  f.commitFixture();
  const consumer = f.read('packages/python-consumer/pyproject.toml');
  const result = f.managerInput(['release'], '@example/python\n0.2.0\ny\n');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Incompatible Python dependency/);
  assert.equal(f.read('packages/python-consumer/pyproject.toml'), consumer);
  assert.match(
    f.read('packages/python-example/pyproject.toml'),
    /version = "0.1.0"/,
  );
  assert.equal(f.git('tag', '--list'), '');
});

test('Node 与 Python 混合发布中 Python 检查失败时，所有版本保持不变', (t) => {
  const f = fixture(t);
  const manifest = JSON.parse(f.read('packages/python-example/package.json'));
  manifest.scripts['pkg:lint'] = 'node fail.mjs';
  f.write('packages/python-example/package.json', manifest);
  f.write(
    'packages/python-example/fail.mjs',
    "console.error('Python preflight failed'); process.exit(1);\n",
  );
  f.commitFixture();
  const node = f.read('packages/node-example/package.json');
  const python = f.read('packages/python-example/pyproject.toml');
  const result = f.managerInput(
    ['release'],
    '@example/node,@example/python\n0.2.0\n0.2.0\ny\n',
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Python preflight failed/);
  assert.equal(f.read('packages/node-example/package.json'), node);
  assert.equal(f.read('packages/python-example/pyproject.toml'), python);
  assert.equal(f.git('tag', '--list'), '');
});

test('已有成功缓存也不能掩盖后来缺失的 Python 环境', (t) => {
  const f = fixture(t);
  const first = f.manager('task', 'lint', '--package', '@example/python');
  assert.equal(first.status, 0, first.stdout + first.stderr);
  fs.unlinkSync(path.join(f.root, 'packages/python-example/.venv'));
  const second = f.manager('task', 'lint', '--package', '@example/python');
  assert.notEqual(second.status, 0, second.stdout + second.stderr);
  assert.match(second.stdout + second.stderr, /Python environment missing/);
});
