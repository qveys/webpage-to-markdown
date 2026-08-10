const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8'));

describe('manifest.json', () => {
  test('declares a convert-page command', () => {
    assert.ok(manifest.commands);
    assert.ok(manifest.commands['convert-page']);
  });

  test('convert-page has suggested_key with default and mac', () => {
    const cmd = manifest.commands['convert-page'];
    assert.ok(cmd.suggested_key);
    assert.ok(cmd.suggested_key.default);
    assert.ok(cmd.suggested_key.mac);
  });

  test('convert-page has a description', () => {
    assert.ok(manifest.commands['convert-page'].description);
  });
});
