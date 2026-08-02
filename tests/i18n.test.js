const vm = require('vm');
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./setup/load-module');

let t, formatDuration, formatSize;

before(() => {
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
    assert.equal(t('app.title'), 'Webpage to Markdown');
  });

  test('returns the key itself for a nonexistent key', () => {
    assert.equal(t('nonexistent.key'), 'nonexistent.key');
  });

  test('interpolates parameters', () => {
    assert.equal(t('result.meta', { size: '1 Ko', words: 42 }), 'Taille : 1 Ko · 42 mots');
  });
});

describe('formatDuration()', () => {
  test('seconds only', () => {
    assert.equal(formatDuration(5000), '5s');
  });

  test('minutes and seconds', () => {
    assert.equal(formatDuration(65000), '1 min 5 s');
  });

  test('hours and minutes', () => {
    assert.equal(formatDuration(3660000), '1h 1min');
  });

  test('exact minutes (no leftover seconds)', () => {
    assert.equal(formatDuration(120000), '2 min');
  });

  test('zero ms', () => {
    assert.equal(formatDuration(0), '0s');
  });
});

describe('formatSize()', () => {
  test('bytes (below 1024)', () => {
    assert.match(formatSize(500), /500/);
    // Default locale is 'fr', so suffix is ' o'
    assert.equal(formatSize(500), '500 o');
  });

  test('kilobytes', () => {
    assert.equal(formatSize(2048), '2.0 Ko');
  });

  test('megabytes', () => {
    assert.equal(formatSize(1572864), '1.5 Mo');
  });
});
