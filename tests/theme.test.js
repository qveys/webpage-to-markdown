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
    const supportedThemes = [
      'light', 'dark', 'midnight-blue', 'synthwave', 'solarized-dark',
      'catppuccin', 'dracula', 'nord', 'vercel', 'retro-terminal', 'paper',
    ];
    supportedThemes.forEach((name) => assert.equal(theme.normalizeTheme(name), name));
    supportedThemes.slice(1, -1).forEach((name) => assert.equal(theme.isDarkTheme(name), true));
    assert.equal(theme.isDarkTheme('paper'), false);
    assert.equal(theme.nextTheme('light', 'synthwave'), 'synthwave');
    assert.deepEqual(Array.from(theme.THEMES), supportedThemes);
    assert.equal(theme.normalizeTheme('unknown'), null);
  });

  test('migrates identifiers from the previous custom themes', () => {
    const { theme } = loadTheme({}, false);
    assert.equal(theme.normalizeTheme('github-dark'), 'midnight-blue');
    assert.equal(theme.normalizeTheme('monokai'), 'synthwave');
    assert.equal(theme.normalizeTheme('agentmesh'), 'solarized-dark');
  });

  test('uses the system preference when no valid theme is stored', () => {
    const light = loadTheme({ theme: 'unknown' }, false);
    const dark = loadTheme({ theme: 'unknown' }, true);
    assert.equal(light.theme.getCurrentTheme(), 'light');
    assert.equal(dark.theme.getCurrentTheme(), 'dark');
  });

  test('restores the last selected dark variant after a light theme', () => {
    const runtime = loadTheme({ theme: 'catppuccin', darkTheme: 'catppuccin' }, false);
    runtime.theme.toggleTheme();
    assert.equal(runtime.theme.getCurrentTheme(), 'light');
    runtime.theme.toggleTheme();
    assert.equal(runtime.theme.getCurrentTheme(), 'catppuccin');
    assert.equal(runtime.stored.darkTheme, 'catppuccin');
  });

  test('updates the active theme from an external storage change', () => {
    const runtime = loadTheme({ theme: 'light', darkTheme: 'dark' }, false);
    runtime.emitStorage({ theme: { oldValue: 'light', newValue: 'midnight-blue' } });
    assert.equal(runtime.theme.getCurrentTheme(), 'midnight-blue');
    assert.equal(runtime.theme.getDarkTheme(), 'midnight-blue');
    assert.equal(runtime.documentElement.attributes['data-theme'], 'midnight-blue');
    assert.equal(runtime.documentElement.style.colorScheme, 'dark');
  });
});

test('custom theme tokens and early theme loading are wired into every UI', () => {
  const css = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');
  const themeNames = [
    'dark', 'midnight-blue', 'synthwave', 'solarized-dark', 'catppuccin',
    'dracula', 'nord', 'vercel', 'retro-terminal', 'paper',
  ];
  themeNames.forEach((name) => {
    assert.match(css, new RegExp(`\\[data-theme="${name}"\\]`));
  });
  assert.match(css, /--background:\s*0 0% 100%/);
  assert.match(css, /--primary:\s*240 5\.9% 10%/);
  assert.match(css, /--surface-primary:\s*hsl\(var\(--background\)\)/);
  assert.match(css, /\[data-theme="synthwave"\][\s\S]*?--primary:\s*330 80% 72%/);
  assert.match(css, /\[data-theme="paper"\][\s\S]*?--background:\s*40 40% 95%/);

  // Every theme must declare the full token set, otherwise a palette silently
  // falls back to :root values for whatever it forgot to override.
  const declaredTokens = new Map();
  for (const [, name, body] of css.matchAll(/\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g)) {
    const tokens = declaredTokens.get(name) || new Set();
    for (const [, token] of body.matchAll(/(--[a-z0-9-]+)\s*:/g)) tokens.add(token);
    declaredTokens.set(name, tokens);
  }
  const requiredTokens = declaredTokens.get('dark');
  assert.equal(requiredTokens.size, 34);
  assert.ok(requiredTokens.has('--void-crimson'));
  themeNames.forEach((name) => {
    const tokens = declaredTokens.get(name);
    assert.ok(tokens, `${name} has no [data-theme="${name}"] block`);
    const missing = [...requiredTokens].filter((token) => !tokens.has(token));
    assert.deepEqual(missing, [], `${name} is missing tokens: ${missing.join(', ')}`);
  });

  ['popup.html', 'dashboard.html', 'settings.html'].forEach((filename) => {
    const html = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
    const themeInitIndex = html.indexOf('js/theme-init.js');
    const stylesIndex = html.indexOf('styles.css');
    assert.ok(themeInitIndex !== -1, `${filename} is missing js/theme-init.js`);
    assert.ok(stylesIndex !== -1, `${filename} is missing styles.css`);
    assert.ok(themeInitIndex < stylesIndex);
  });
});
