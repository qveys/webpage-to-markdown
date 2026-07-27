global.W2M = {};
require('../js/format-shortcut.js');

const { formatShortcut } = W2M;

describe('formatShortcut', () => {
  afterEach(() => {
    delete global.navigator;
  });

  test('returns shortcut unchanged on non-Mac', () => {
    global.navigator = { platform: 'Win32' };
    expect(formatShortcut('Alt+Shift+M')).toBe('Alt+Shift+M');
  });

  test('replaces modifiers with Mac symbols', () => {
    global.navigator = { platform: 'MacIntel' };
    expect(formatShortcut('Alt+Shift+M')).toBe('⌥⇧M');
  });

  test('handles MacCtrl+ before Ctrl+ to avoid corruption', () => {
    global.navigator = { platform: 'MacIntel' };
    expect(formatShortcut('MacCtrl+Shift+M')).toBe('⌃⇧M');
  });

  test('handles Command+', () => {
    global.navigator = { platform: 'MacIntel' };
    expect(formatShortcut('Command+Shift+M')).toBe('⌘⇧M');
  });

  test('handles Ctrl+ without MacCtrl prefix', () => {
    global.navigator = { platform: 'MacIntel' };
    expect(formatShortcut('Ctrl+C')).toBe('⌃C');
  });
});
