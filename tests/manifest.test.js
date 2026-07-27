const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8'));

describe('manifest.json', () => {
  test('declares a convert-page command', () => {
    expect(manifest.commands).toBeDefined();
    expect(manifest.commands['convert-page']).toBeDefined();
  });

  test('convert-page has suggested_key with default and mac', () => {
    const cmd = manifest.commands['convert-page'];
    expect(cmd.suggested_key).toBeDefined();
    expect(cmd.suggested_key.default).toBeTruthy();
    expect(cmd.suggested_key.mac).toBeTruthy();
  });

  test('convert-page has a description', () => {
    expect(manifest.commands['convert-page'].description).toBeTruthy();
  });
});
