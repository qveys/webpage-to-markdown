const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const themeSource = fs.readFileSync(path.join(__dirname, '../js/theme-init.js'), 'utf8');

function loadTheme(initialStorage, prefersDark) {
  const stored = Object.assign({}, initialStorage);
  const storageListeners = [];
  const documentElement = {
    attributes: {},
    style: {},
    setAttribute(name, value) { this.attributes[name] = value; },
  };

  const context = {
    console,
    document: { documentElement },
    module: { exports: {} },
    chrome: {
      storage: {
        local: {
          get(keys, callback) {
            const result = {};
            keys.forEach((key) => { result[key] = stored[key]; });
            callback(result);
          },
          set(patch) {
            const changes = {};
            Object.keys(patch).forEach((key) => {
              changes[key] = { oldValue: stored[key], newValue: patch[key] };
              stored[key] = patch[key];
            });
            storageListeners.forEach((listener) => listener(changes, 'local'));
          },
        },
        onChanged: {
          addListener(listener) { storageListeners.push(listener); },
        },
      },
    },
  };
  context.window = context;
  context.matchMedia = () => ({ matches: prefersDark });
  vm.runInNewContext(themeSource, context, { filename: 'theme-init.js' });

  return {
    theme: context.module.exports,
    stored,
    documentElement,
    emitStorage(changes) {
      storageListeners.forEach((listener) => listener(changes, 'local'));
    },
  };
}

describe('theme manager', () => {
  test('accepts exactly the supported themes', () => {
    const { theme } = loadTheme({}, false);
    assert.equal(theme.normalizeTheme('light'), 'light');
    assert.equal(theme.normalizeTheme('dark'), 'dark');
    assert.equal(theme.normalizeTheme('github-dark'), 'github-dark');
    assert.equal(theme.normalizeTheme('monokai'), 'monokai');
    assert.equal(theme.normalizeTheme('agentmesh'), 'agentmesh');
    assert.equal(theme.isDarkTheme('monokai'), true);
    assert.equal(theme.isDarkTheme('agentmesh'), true);
    assert.equal(theme.nextTheme('light', 'monokai'), 'monokai');
    assert.equal(theme.normalizeTheme('unknown'), null);
  });

  test('uses the system preference when no valid theme is stored', () => {
    const light = loadTheme({ theme: 'unknown' }, false);
    const dark = loadTheme({ theme: 'unknown' }, true);
    assert.equal(light.theme.getCurrentTheme(), 'light');
    assert.equal(dark.theme.getCurrentTheme(), 'dark');
  });

  test('restores the last selected dark variant after a light theme', () => {
    const runtime = loadTheme({ theme: 'github-dark', darkTheme: 'github-dark' }, false);
    runtime.theme.toggleTheme();
    assert.equal(runtime.theme.getCurrentTheme(), 'light');
    runtime.theme.toggleTheme();
    assert.equal(runtime.theme.getCurrentTheme(), 'github-dark');
    assert.equal(runtime.stored.darkTheme, 'github-dark');
  });

  test('updates the active theme from an external storage change', () => {
    const runtime = loadTheme({ theme: 'light', darkTheme: 'dark' }, false);
    runtime.emitStorage({ theme: { oldValue: 'light', newValue: 'github-dark' } });
    assert.equal(runtime.theme.getCurrentTheme(), 'github-dark');
    assert.equal(runtime.theme.getDarkTheme(), 'github-dark');
    assert.equal(runtime.documentElement.attributes['data-theme'], 'github-dark');
    assert.equal(runtime.documentElement.style.colorScheme, 'dark');
  });
});

test('custom theme tokens and early theme loading are wired into every UI', () => {
  const css = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');
  assert.match(css, /\[data-theme="github-dark"\]/);
  assert.match(css, /--surface-primary:\s*#0d1117/);
  assert.match(css, /--text-primary:\s*#f0f6fc/);
  assert.match(css, /--feedback-info:\s*#4493f8/);
  assert.match(css, /\[data-theme="monokai"\]/);
  assert.match(css, /--interactive-primary:\s*#f92672/);
  assert.match(css, /\[data-theme="agentmesh"\]/);
  assert.match(css, /--interactive-primary:\s*#f2a93b/);
  assert.match(css, /--interactive-secondary:\s*#b69cff/);

  ['popup.html', 'dashboard.html', 'settings.html'].forEach((filename) => {
    const html = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
    const themeInitIndex = html.indexOf('js/theme-init.js');
    const stylesIndex = html.indexOf('styles.css');
    assert.ok(themeInitIndex !== -1, `${filename} is missing js/theme-init.js`);
    assert.ok(stylesIndex !== -1, `${filename} is missing styles.css`);
    assert.ok(themeInitIndex < stylesIndex);
  });
});
