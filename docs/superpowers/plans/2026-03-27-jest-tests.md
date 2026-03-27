# Jest Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~35 unit tests for AppState, CrawlEngine, cleanupMarkdown, i18n, and urlToPath + a GitHub Actions CI that blocks PRs on failure.

**Architecture:** Jest with a minimal Chrome API mock. Modules are loaded via `vm.runInThisContext()` into a prepared global scope (`chrome`, `window`, `W2M`, `document`). No code restructuring needed.

**Tech Stack:** Jest 29, Node 20, GitHub Actions

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `package.json` | Jest devDependency + test script |
| Create | `jest.config.js` | testEnvironment, setupFiles |
| Create | `tests/setup/chrome-mock.js` | Global chrome/window/document stubs |
| Create | `tests/setup/load-module.js` | Helper to load IIFE/ES6 modules into global scope |
| Create | `tests/app-state.test.js` | AppState transitions, listeners, updateData |
| Create | `tests/crawl-engine.test.js` | URL validation, scope, enqueue, captcha, blocked |
| Create | `tests/cleanup-markdown.test.js` | Link compaction, headings, noise removal |
| Create | `tests/i18n.test.js` | t() lookup, formatDuration, formatSize |
| Create | `tests/url-path.test.js` | urlToPath segments, query params, fallback |
| Create | `.github/workflows/test.yml` | CI: npm test on PR to main |
| Modify | `.gitignore` | Add node_modules/ |

---

### Task 1: Project setup (package.json, jest.config, gitignore)

**Files:**
- Create: `package.json`
- Create: `jest.config.js`
- Modify: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "private": true,
  "scripts": {
    "test": "jest"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

- [ ] **Step 2: Create jest.config.js**

```js
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./tests/setup/chrome-mock.js'],
  testMatch: ['**/tests/**/*.test.js'],
};
```

- [ ] **Step 3: Add node_modules/ to .gitignore**

Append `node_modules/` to `.gitignore`.

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 5: Commit**

```bash
git add package.json jest.config.js package-lock.json .gitignore
git commit -m "🔧 chore: add Jest test infrastructure"
```

---

### Task 2: Chrome mock + module loader

**Files:**
- Create: `tests/setup/chrome-mock.js`
- Create: `tests/setup/load-module.js`

- [ ] **Step 1: Create chrome-mock.js**

```js
const store = { local: {}, session: {} };

function makeStorage(ns) {
  return {
    get: jest.fn((keys) => {
      if (typeof keys === 'string') return Promise.resolve({ [keys]: store[ns][keys] });
      const result = {};
      (Array.isArray(keys) ? keys : Object.keys(keys)).forEach((k) => { result[k] = store[ns][k]; });
      return Promise.resolve(result);
    }),
    set: jest.fn((obj) => { Object.assign(store[ns], obj); return Promise.resolve(); }),
    remove: jest.fn((keys) => {
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => { delete store[ns][k]; });
      return Promise.resolve();
    }),
  };
}

global.chrome = {
  storage: { local: makeStorage('local'), session: makeStorage('session') },
  alarms: { create: jest.fn(), clear: jest.fn() },
  downloads: { download: jest.fn(), setUiOptions: jest.fn(() => Promise.resolve()) },
  runtime: { sendMessage: jest.fn(() => Promise.resolve()), lastError: null },
  action: { setBadgeText: jest.fn(), setBadgeBackgroundColor: jest.fn() },
};

global.window = global.window || global;
global.W2M = {};
global.self = global;
global.document = {
  createElement: jest.fn(() => ({
    className: '', textContent: '', style: { cssText: '' },
    dataset: {}, setAttribute: jest.fn(), appendChild: jest.fn(),
    addEventListener: jest.fn(), classList: { add: jest.fn(), remove: jest.fn() },
    firstChild: null, removeChild: jest.fn(),
  })),
  createTextNode: jest.fn((t) => ({ textContent: t })),
  documentElement: { setAttribute: jest.fn() },
};
global.Node = function () {};
global.requestAnimationFrame = (cb) => cb();
global.navigator = { language: 'en-US' };
global.CustomEvent = class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } };

beforeEach(() => {
  store.local = {};
  store.session = {};
  jest.clearAllMocks();
});
```

- [ ] **Step 2: Create load-module.js**

```js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function loadModule(relativePath) {
  const absPath = path.resolve(__dirname, '../../', relativePath);
  const code = fs.readFileSync(absPath, 'utf8');
  vm.runInThisContext(code, { filename: absPath });
}

module.exports = { loadModule };
```

- [ ] **Step 3: Verify setup by creating a smoke test**

Create `tests/smoke.test.js`:
```js
test('chrome mock is available', () => {
  expect(global.chrome).toBeDefined();
  expect(global.chrome.storage.local.get).toBeDefined();
});
```

- [ ] **Step 4: Run smoke test**

Run: `npx jest tests/smoke.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/setup/ tests/smoke.test.js
git commit -m "✅ test: add Chrome mock and module loader"
```

---

### Task 3: AppState tests (~8 tests)

**Files:**
- Create: `tests/app-state.test.js`
- Test: `js/app-state.js`

- [ ] **Step 1: Write tests**

```js
const { loadModule } = require('./setup/load-module');

beforeAll(() => {
  loadModule('js/app-state.js');
});

const { STATES, TRANSITIONS, AppState } = W2M;

describe('AppState', () => {
  let state;
  beforeEach(() => { state = new AppState(); });

  test('starts in IDLE state', () => {
    expect(state.getState()).toBe(STATES.IDLE);
  });

  test('valid transition IDLE -> CONVERTING succeeds', () => {
    state.navigate(STATES.CONVERTING, { url: 'http://test.com' });
    expect(state.getState()).toBe(STATES.CONVERTING);
  });

  test('valid multi-step transition through crawl lifecycle', () => {
    state.navigate(STATES.PRECRAWL);
    expect(state.getState()).toBe(STATES.PRECRAWL);
    state.navigate(STATES.RUNNING);
    expect(state.getState()).toBe(STATES.RUNNING);
    state.navigate(STATES.PAUSED);
    expect(state.getState()).toBe(STATES.PAUSED);
    state.navigate(STATES.RUNNING);
    expect(state.getState()).toBe(STATES.RUNNING);
    state.navigate(STATES.CRAWL_SUCCESS);
    expect(state.getState()).toBe(STATES.CRAWL_SUCCESS);
  });

  test('invalid transition IDLE -> SUCCESS is blocked', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    state.navigate(STATES.SUCCESS);
    expect(state.getState()).toBe(STATES.IDLE);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Invalid transition'));
    spy.mockRestore();
  });

  test('navigate() stores data', () => {
    state.navigate(STATES.CONVERTING, { url: 'http://x.com' });
    expect(state.getData()).toEqual({ url: 'http://x.com' });
  });

  test('updateData() merges partial data', () => {
    state.navigate(STATES.CONVERTING, { url: 'http://x.com', progress: 0 });
    state.updateData({ progress: 50 });
    expect(state.getData().progress).toBe(50);
    expect(state.getData().url).toBe('http://x.com');
  });

  test('listeners are notified on navigate', () => {
    const listener = jest.fn();
    state.onStateChange(listener);
    state.navigate(STATES.CONVERTING);
    expect(listener).toHaveBeenCalledWith(STATES.CONVERTING, STATES.IDLE, expect.any(Object));
  });

  test('same-state navigate is allowed (no transition check)', () => {
    state.navigate(STATES.CONVERTING);
    state.navigate(STATES.CONVERTING, { retry: true });
    expect(state.getState()).toBe(STATES.CONVERTING);
    expect(state.getData()).toEqual({ retry: true });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx jest tests/app-state.test.js`
Expected: 8 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/app-state.test.js
git commit -m "✅ test(state): add AppState transition and listener tests"
```

---

### Task 4: CrawlEngine tests (~12 tests)

**Files:**
- Create: `tests/crawl-engine.test.js`
- Test: `js/crawl-engine.js`

- [ ] **Step 1: Write tests**

```js
const { loadModule } = require('./setup/load-module');

beforeAll(() => {
  loadModule('js/crawl-engine.js');
});

describe('CrawlEngine.isFetchableHttpUrl', () => {
  test('accepts http URL', () => {
    expect(CrawlEngine.isFetchableHttpUrl('http://example.com')).toBe(true);
  });

  test('accepts https URL', () => {
    expect(CrawlEngine.isFetchableHttpUrl('https://example.com/page')).toBe(true);
  });

  test('rejects chrome:// URL', () => {
    expect(CrawlEngine.isFetchableHttpUrl('chrome://extensions')).toBe(false);
  });

  test('rejects data: URL', () => {
    expect(CrawlEngine.isFetchableHttpUrl('data:text/html,<h1>Hi</h1>')).toBe(false);
  });

  test('rejects javascript: URL', () => {
    expect(CrawlEngine.isFetchableHttpUrl('javascript:void(0)')).toBe(false);
  });

  test('rejects malformed string', () => {
    expect(CrawlEngine.isFetchableHttpUrl('not a url')).toBe(false);
  });
});

describe('CrawlEngine scope and queue', () => {
  let engine;
  beforeEach(() => {
    engine = new CrawlEngine();
    engine.setScope('https://example.com/docs/');
  });

  test('isInScope: same origin + path prefix', () => {
    expect(engine.isInScope('https://example.com/docs/api/')).toBe(true);
  });

  test('isInScope: exact path match', () => {
    expect(engine.isInScope('https://example.com/docs/')).toBe(true);
  });

  test('isInScope: different domain rejected', () => {
    expect(engine.isInScope('https://other.com/docs/')).toBe(false);
  });

  test('isInScope: different path rejected', () => {
    expect(engine.isInScope('https://example.com/blog/')).toBe(false);
  });

  test('enqueue adds URL and increments stats', () => {
    engine.enqueue('https://example.com/docs/page1', 0);
    expect(engine.discoveryQueue).toHaveLength(1);
    expect(engine.stats.queued).toBe(1);
  });

  test('enqueue deduplicates via seenUrls', () => {
    engine.enqueue('https://example.com/docs/page1', 0);
    engine.enqueue('https://example.com/docs/page1', 0);
    expect(engine.discoveryQueue).toHaveLength(1);
  });

  test('enqueue respects depth limit', () => {
    engine.config.depth = 2;
    engine.enqueue('https://example.com/docs/page1', 3);
    expect(engine.discoveryQueue).toHaveLength(0);
  });
});

describe('CrawlEngine anti-bot', () => {
  let engine;
  beforeEach(() => { engine = new CrawlEngine(); });

  test('looksLikeCaptcha detects captcha keywords', () => {
    expect(engine.looksLikeCaptcha('<div class="cf-challenge">challenge</div>')).toBe(true);
    expect(engine.looksLikeCaptcha('<script src="hcaptcha.js"></script>')).toBe(true);
  });

  test('looksLikeCaptcha returns false on clean HTML', () => {
    expect(engine.looksLikeCaptcha('<html><body><h1>Hello</h1></body></html>')).toBe(false);
  });

  test('handleBlocked increments counter and adds to list', () => {
    engine.handleBlocked('https://example.com/blocked', '403');
    expect(engine.consecutiveBlocks).toBe(1);
    expect(engine.blockedUrls).toHaveLength(1);
    expect(engine.stats.blocked).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx jest tests/crawl-engine.test.js`
Expected: 12 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/crawl-engine.test.js
git commit -m "✅ test(crawl): add CrawlEngine URL, scope, queue, and anti-bot tests"
```

---

### Task 5: cleanupMarkdown tests (~8 tests)

**Files:**
- Create: `tests/cleanup-markdown.test.js`
- Test: `js/cleanup-markdown.js`

- [ ] **Step 1: Write tests**

```js
const { loadModule } = require('./setup/load-module');

beforeAll(() => {
  loadModule('js/cleanup-markdown.js');
});

const cleanupMarkdown = W2M.cleanupMarkdown;

describe('cleanupMarkdown', () => {
  test('compacts excessive blank lines', () => {
    const input = 'Hello\n\n\n\n\nWorld';
    expect(cleanupMarkdown(input)).toBe('Hello\n\nWorld');
  });

  test('preserves single blank line between paragraphs', () => {
    const input = 'Para 1\n\nPara 2';
    expect(cleanupMarkdown(input)).toBe('Para 1\n\nPara 2');
  });

  test('recovers headings from separated hash and text', () => {
    const input = '##\n\nHeading text here\n\nParagraph.';
    expect(cleanupMarkdown(input)).toBe('## Heading text here\n\nParagraph.');
  });

  test('removes X page title "# X"', () => {
    const input = '# X\n\nSome tweet content';
    expect(cleanupMarkdown(input)).toBe('Some tweet content');
  });

  test('removes orphan noise blocks (4+ short lines)', () => {
    const input = 'Content\n\nJohn\n@john\n2h\n42\n12\n\nMore content';
    expect(cleanupMarkdown(input)).toBe('Content\n\nMore content');
  });

  test('preserves code blocks untouched', () => {
    const input = '```js\nconst x = 1;\n```';
    expect(cleanupMarkdown(input)).toBe('```js\nconst x = 1;\n```');
  });

  test('handles empty input', () => {
    expect(cleanupMarkdown('')).toBe('');
  });

  test('handles null/undefined input', () => {
    expect(cleanupMarkdown(null)).toBe('');
    expect(cleanupMarkdown(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx jest tests/cleanup-markdown.test.js`
Expected: 8 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/cleanup-markdown.test.js
git commit -m "✅ test(markdown): add cleanupMarkdown post-processing tests"
```

---

### Task 6: i18n tests (~4 tests)

**Files:**
- Create: `tests/i18n.test.js`
- Test: `js/i18n.js`

- [ ] **Step 1: Write tests**

```js
const { loadModule } = require('./setup/load-module');

beforeAll(() => {
  loadModule('js/i18n.js');
});

const { t, formatDuration, formatSize } = W2M.i18n;

describe('i18n.t()', () => {
  test('returns translated string for known key', () => {
    const result = t('popup.title');
    expect(result).toBe('Webpage to Markdown');
  });

  test('returns key itself for unknown key', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });
});

describe('i18n.formatDuration()', () => {
  test('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  test('formats minutes and seconds', () => {
    expect(formatDuration(65000)).toBe('1 min 5 s');
  });

  test('formats hours', () => {
    expect(formatDuration(3660000)).toBe('1h 1min');
  });
});

describe('i18n.formatSize()', () => {
  test('formats bytes', () => {
    expect(formatSize(500)).toMatch(/500/);
  });

  test('formats kilobytes', () => {
    expect(formatSize(2048)).toBe('2.0 Ko');
  });

  test('formats megabytes', () => {
    expect(formatSize(1572864)).toBe('1.5 Mo');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx jest tests/i18n.test.js`
Expected: 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/i18n.test.js
git commit -m "✅ test(i18n): add translation lookup and format tests"
```

---

### Task 7: urlToPath tests (~3 tests)

**Files:**
- Create: `tests/url-path.test.js`
- Test: `js/background.js` (urlToPath function)

- [ ] **Step 1: Write tests**

`urlToPath` is defined inside `background.js` which has heavy Chrome API usage at parse time. We extract just the function for testing.

```js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Extract urlToPath from background.js by matching the function
const bgCode = fs.readFileSync(path.resolve(__dirname, '../js/background.js'), 'utf8');
const match = bgCode.match(/function urlToPath\(pageUrl\)\s*\{[\s\S]*?\n\}/);
if (!match) throw new Error('Could not extract urlToPath from background.js');
vm.runInThisContext('var urlToPath = ' + match[0]);

describe('urlToPath', () => {
  test('normal path segments', () => {
    const result = urlToPath('https://example.com/docs/api/intro');
    expect(result.dirs).toEqual(['example-com', 'docs', 'api']);
    expect(result.filename).toBe('intro');
  });

  test('includes query params in filename', () => {
    const result = urlToPath('https://example.com/page?tab=ios&v=2');
    expect(result.filename).toMatch(/page--tab-ios/);
  });

  test('returns fallback on invalid URL', () => {
    const result = urlToPath('not a url');
    expect(result).toEqual({ dirs: [], filename: 'page' });
  });

  test('root path gives index filename', () => {
    const result = urlToPath('https://example.com/');
    expect(result.dirs).toEqual(['example-com']);
    expect(result.filename).toBe('index');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx jest tests/url-path.test.js`
Expected: 4 tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/url-path.test.js
git commit -m "✅ test(path): add urlToPath segment and query param tests"
```

---

### Task 8: GitHub Actions CI

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Create workflow**

```yaml
name: Tests

on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "🔧 ci: add GitHub Actions workflow to run Jest on PR"
```

---

### Task 9: Run full suite + cleanup

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All ~35 tests PASS

- [ ] **Step 2: Remove smoke test**

Delete `tests/smoke.test.js` (was only for setup verification).

- [ ] **Step 3: Final commit**

```bash
git rm tests/smoke.test.js
git commit -m "🔧 chore: remove smoke test"
```
