# Jest Test Suite — Design Spec

**Date:** 2026-03-27
**Goal:** Add unit tests as safety net for critical logic + CI that blocks PRs on failure.

## Stack

- Jest (sole devDependency)
- Chrome API mock (in-memory, ~20 lines)
- No code restructuring — load modules as-is via `vm.runInThisContext(fs.readFileSync(...))`

## Structure

```
tests/
├── setup/
│   └── chrome-mock.js       # global chrome.* stub, reset between tests
├── app-state.test.js         # state transitions, navigate, updateData
├── crawl-engine.test.js      # URL validation, scope, enqueue, captcha, blocked
├── cleanup-markdown.test.js  # headings, links, tweet cleanup, orphan noise
├── i18n.test.js              # t() lookup, fallback, formatDuration, formatSize
└── url-path.test.js          # urlToPath segments, query params, special chars
```

## Chrome Mock (`tests/setup/chrome-mock.js`)

Stubs:
- `chrome.storage.local.get/set` — in-memory Map
- `chrome.storage.session.get/set` — in-memory Map
- `chrome.alarms.create/clear` — no-op
- `chrome.downloads.download/setUiOptions` — no-op
- `chrome.runtime.sendMessage` — resolve undefined

Reset all state in `beforeEach`.

## Module Loading

Modules use `importScripts` (SW) or script tags (UI) with no ESM exports. Tests load them via Node `vm` module:
1. Setting up `global.chrome`, `global.window`, `global.W2M = {}`
2. `vm.runInThisContext(fs.readFileSync('js/module.js', 'utf8'))`
3. Accessing classes/functions from `global` or `W2M` namespace

## Test Coverage (~35 tests)

### app-state.test.js (~8 tests)
- Valid transition: IDLE -> CONVERTING -> SUCCESS
- Valid transition: IDLE -> PRECRAWL -> RUNNING -> PAUSED -> RUNNING
- Invalid transition blocked: IDLE -> SUCCESS (returns early)
- navigate() updates currentState and data
- updateData() merges partial data
- Listeners notified on navigate
- Listeners notified on updateData
- registerView() + _renderView() lifecycle

### crawl-engine.test.js (~12 tests)
- isFetchableHttpUrl: http OK, https OK
- isFetchableHttpUrl: chrome://, data:, javascript: rejected
- isFetchableHttpUrl: malformed string rejected
- isInScope: same domain + path prefix OK
- isInScope: different domain rejected
- isInScope: subdomain rejected
- enqueue: adds URL to queue, increments stats.queued
- enqueue: deduplicates (seenUrls)
- enqueue: respects depth limit
- looksLikeCaptcha: detects "captcha", "cf-challenge", "recaptcha"
- looksLikeCaptcha: returns false on clean HTML
- handleBlocked: increments consecutiveBlocks, adds to blockedUrls

### cleanup-markdown.test.js (~8 tests)
- Compacts excessive blank lines
- Preserves single blank line between paragraphs
- Recovers headings from bold text patterns
- Cleans up X/Twitter embed artifacts
- Removes orphan noise (standalone brackets, empty links)
- Preserves code blocks untouched
- Handles empty input
- Handles input with only whitespace

### i18n.test.js (~4 tests)
- t() returns translated string for known key
- t() returns key itself for unknown key (fallback)
- formatDuration: formats seconds/minutes/hours
- formatSize: formats bytes/KB/MB

### url-path.test.js (~3 tests)
- Normal path segments: /docs/api/ -> docs/api/index.md
- Query params included in filename
- Special characters sanitized

## CI: `.github/workflows/test.yml`

- Trigger: `pull_request` targeting `main`
- Steps: checkout, setup Node 20, `npm ci`, `npm test`
- Status: **required** (configured in repo branch protection)

## Config Files

### package.json
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

### jest.config.js
```js
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./tests/setup/chrome-mock.js'],
};
```
