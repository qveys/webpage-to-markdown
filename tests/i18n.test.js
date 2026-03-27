const vm = require('vm');
const { loadModule } = require('./setup/load-module');

let t, formatDuration, formatSize;

beforeAll(() => {
  vm.runInThisContext('var window = globalThis; window.W2M = window.W2M || {};');
  // i18n.js dispatches a CustomEvent on setLocale — stub it out
  vm.runInThisContext('window.dispatchEvent = function() {};');
  loadModule('js/i18n.js');
  const i18n = vm.runInThisContext('window.W2M.i18n');
  t = i18n.t;
  formatDuration = i18n.formatDuration;
  formatSize = i18n.formatSize;
});

describe('t() translation lookup', () => {
  test('returns known translation for app.title', () => {
    expect(t('app.title')).toBe('Webpage to Markdown');
  });

  test('returns the key itself for a nonexistent key', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  test('interpolates parameters', () => {
    expect(t('result.meta', { size: '1 Ko', words: 42 })).toBe('Taille : 1 Ko · 42 mots');
  });
});

describe('formatDuration()', () => {
  test('seconds only', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  test('minutes and seconds', () => {
    expect(formatDuration(65000)).toBe('1 min 5 s');
  });

  test('hours and minutes', () => {
    expect(formatDuration(3660000)).toBe('1h 1min');
  });

  test('exact minutes (no leftover seconds)', () => {
    expect(formatDuration(120000)).toBe('2 min');
  });

  test('zero ms', () => {
    expect(formatDuration(0)).toBe('0s');
  });
});

describe('formatSize()', () => {
  test('bytes (below 1024)', () => {
    expect(formatSize(500)).toMatch(/500/);
    // Default locale is 'fr', so suffix is ' o'
    expect(formatSize(500)).toBe('500 o');
  });

  test('kilobytes', () => {
    expect(formatSize(2048)).toBe('2.0 Ko');
  });

  test('megabytes', () => {
    expect(formatSize(1572864)).toBe('1.5 Mo');
  });
});
