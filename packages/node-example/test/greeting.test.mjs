import assert from 'node:assert/strict';
import test from 'node:test';
import { greeting } from '../src/greeting.js';

test('a project can customize its greeting', () => {
  assert.equal(greeting('workspace'), 'Hello from workspace');
});
