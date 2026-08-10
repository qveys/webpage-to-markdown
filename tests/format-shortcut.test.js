const { describe, test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

global.W2M = {};
require('../js/format-shortcut.js');

const { formatShortcut } = W2M;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setPlatform(platform) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { platform: platform },
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

function restoreNavigator() {
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  } else {
    delete globalThis.navigator;
  }
}

describe('formatShortcut', () => {
  afterEach(() => {
    restoreNavigator();
  });

  test('returns shortcut unchanged on non-Mac', () => {
    setPlatform('Win32');
    assert.equal(formatShortcut('Alt+Shift+M'), 'Alt+Shift+M');
  });

  test('replaces modifiers with Mac symbols', () => {
    setPlatform('MacIntel');
    assert.equal(formatShortcut('Alt+Shift+M'), '⌥⇧M');
  });

  test('handles MacCtrl+ before Ctrl+ to avoid corruption', () => {
    setPlatform('MacIntel');
    assert.equal(formatShortcut('MacCtrl+Shift+M'), '⌃⇧M');
  });

  test('handles Command+', () => {
    setPlatform('MacIntel');
    assert.equal(formatShortcut('Command+Shift+M'), '⌘⇧M');
  });

  test('handles Ctrl+ without MacCtrl prefix', () => {
    setPlatform('MacIntel');
    assert.equal(formatShortcut('Ctrl+C'), '⌃C');
  });
});
