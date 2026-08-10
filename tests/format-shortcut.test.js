const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

global.W2M = {};
require('../js/format-shortcut.js');

const { formatShortcut } = W2M;

describe('formatShortcut', () => {
  afterEach(() => {
    delete global.navigator;
  });

  test('returns shortcut unchanged on non-Mac', () => {
    global.navigator = { platform: 'Win32' };
    assert.equal(formatShortcut('Alt+Shift+M'), 'Alt+Shift+M');
  });

  test('replaces modifiers with Mac symbols', () => {
    global.navigator = { platform: 'MacIntel' };
    assert.equal(formatShortcut('Alt+Shift+M'), '⌥⇧M');
  });

  test('handles MacCtrl+ before Ctrl+ to avoid corruption', () => {
    global.navigator = { platform: 'MacIntel' };
    assert.equal(formatShortcut('MacCtrl+Shift+M'), '⌃⇧M');
  });

  test('handles Command+', () => {
    global.navigator = { platform: 'MacIntel' };
    assert.equal(formatShortcut('Command+Shift+M'), '⌘⇧M');
  });

  test('handles Ctrl+ without MacCtrl prefix', () => {
    global.navigator = { platform: 'MacIntel' };
    assert.equal(formatShortcut('Ctrl+C'), '⌃C');
  });
});
