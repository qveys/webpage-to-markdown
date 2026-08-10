const { test } = require('node:test');
const assert = require('node:assert/strict');

test('chrome mock is available', () => {
  assert.notEqual(global.chrome, undefined);
  assert.notEqual(global.chrome.storage.local.get, undefined);
});
