# Crawl Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add crawling capability to the webpage-to-markdown Chrome extension — automatically discover and capture all internal links from the current page, converting each to Markdown.

**Architecture:** CrawlEngine orchestrates N parallel `fetch()` workers from the service worker. An offscreen document handles DOM parsing (Readability + Turndown) since MV3 service workers have no DOM. A Side Panel dashboard provides real-time monitoring. Communication uses port-based messaging (`chrome.runtime.connect`).

**Tech Stack:** Chrome Extension MV3, vanilla JS, Turndown.js, Readability.js, chrome.offscreen API, chrome.sidePanel API, chrome.alarms API

**Spec:** `docs/superpowers/specs/2026-03-13-crawl-feature-design.md`

**Security notes:**
- `innerHTML` is used in dashboard rendering where all content is internally generated (stats, URLs, log entries). No external user input flows into these renders. URLs are displayed via `textContent` where possible. Consider DOMPurify if the extension later accepts external content.
- Dashboard action buttons MUST use `addEventListener` (not inline `onclick`) to comply with CSP `script-src 'self'`.
- `fetch()` requests in CrawlEngine MUST use `credentials: "omit"` to avoid sending auth cookies to crawled pages.

**MV3 constraints addressed:**
- Service worker has no DOM → offscreen document for parsing (chrome.offscreen API)
- Only ONE offscreen document allowed per extension → use `chrome.offscreen.hasDocument()` (Chrome 116+) before creating
- SW can terminate after ~30s inactivity → keepalive via `chrome.alarms` + port-based connection from Side Panel extends SW lifetime while dashboard is open
- `chrome.sidePanel.open()` requires user gesture + `windowId` → called from popup button click context with `sender.tab.windowId`
- `importScripts("/js/crawl-engine.js")` MUST be placed at the END of background.js (after `urlToPath` and `downloadAssets` definitions) to ensure those functions are available in CrawlEngine's runtime scope

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `manifest.json` | Modify | Add permissions: sidePanel, offscreen, alarms, host_permissions |
| `offscreen.html` | Create | Minimal HTML shell loading parsing scripts |
| `js/offscreen.js` | Create | DOM parsing: DOMParser + Readability + Turndown + link extraction |
| `js/crawl-engine.js` | Create | CrawlEngine class: queue, workers, scope filter, state, anti-bot |
| `js/turndown-config.js` | Create | Shared Turndown rules (code blocks, figures, details) — reused by offscreen.js and background.js |
| `js/background.js` | Modify | Wire CrawlEngine, alarms keepalive, port messaging, offscreen lifecycle. **importScripts for crawl-engine.js at END of file** |
| `popup.html` | Modify | Add crawl checkboxes + config row + active state UI |
| `js/popup.js` | Modify | Wire crawl UI, port-based messaging for crawl status |
| `styles.css` | Modify | Crawl config styles, summary tags, stat cards in popup |
| `dashboard.html` | Create | Side Panel: stats, chart, log, blocked URL management |
| `js/dashboard.js` | Create | Dashboard logic: port connection, render, theme sync |

---

## Chunk 1: Foundation — Manifest + Offscreen Document

### Task 1: Update manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add new permissions and side_panel config**

Add `sidePanel`, `offscreen`, `alarms` to permissions. Add `host_permissions` and `side_panel` entry. Keep existing permissions intact.

```json
{
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "downloads",
    "tabs",
    "webNavigation",
    "notifications",
    "sidePanel",
    "offscreen",
    "alarms"
  ],
  "host_permissions": ["<all_urls>"],
  "side_panel": {
    "default_path": "dashboard.html"
  }
}
```

- [ ] **Step 2: Verify — reload extension in chrome://extensions**

Expected: Extension loads without errors, no permission warnings beyond the new ones.

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: add sidePanel, offscreen, alarms permissions for crawl feature"
```

---

### Task 2: Create offscreen document (HTML shell)

**Files:**
- Create: `offscreen.html`

- [ ] **Step 1: Create offscreen.html**

Minimal HTML that loads parsing libraries and the offscreen script:

```html
<!doctype html>
<html>
<head><meta charset="UTF-8"></head>
<body>
  <script src="js/Readability.js"></script>
  <script src="js/turndown.js"></script>
  <script src="js/turndown-plugin-gfm.js"></script>
  <script src="js/offscreen.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add offscreen.html
git commit -m "feat: add offscreen.html shell for DOM parsing"
```

---

### Task 3: Create offscreen.js — DOM parsing engine

**Files:**
- Create: `js/offscreen.js`

- [ ] **Step 1: Implement message listener for `parse:html`**

The offscreen document receives `{ type: "parse:html", url, html }` messages. It:
1. Parses HTML with `DOMParser`
2. Resolves relative URLs to absolute
3. Extracts all `<a href>` links
4. Runs Readability.js for clean content (fallback to full body)
5. Converts to Markdown via TurndownService
6. Returns `{ type: "parse:result", url, links, markdown }`

Full implementation in `js/offscreen.js` — functions: `parseAndConvert()`, `resolveUrls()`, `extractLinks()`, `convertToMarkdown()`. Same Turndown rules as existing `extractAndConvert()` in background.js (code blocks, figures, details).

- [ ] **Step 2: Verify — reload extension, check console for load errors**

Expected: No errors. Offscreen doc won't be created yet (that happens in Task 5).

- [ ] **Step 3: Commit**

```bash
git add js/offscreen.js
git commit -m "feat: add offscreen.js for DOM parsing in crawl pipeline"
```

---

## Chunk 2: CrawlEngine — Core Crawling Logic

### Task 4: Create CrawlEngine class

**Files:**
- Create: `js/crawl-engine.js`

- [ ] **Step 1: Implement CrawlEngine**

The CrawlEngine manages:
- Discovery queue (FIFO of `{ url, depth }`)
- Captured URLs set (dedup)
- Blocked URLs list
- N parallel fetch workers
- Scope filtering (same domain + path prefix)
- Anti-bot detection (403/429/CAPTCHA)
- State persistence to chrome.storage
- Stats tracking

Key methods:
- `setScope(startUrl)` — extract origin + path prefix
- `isInScope(url)` — check domain + path prefix match
- `enqueue(url, depth)` — add to queue with dedup + scope filter
- `start(startUrl, config)` — seed queue, create alarm, spawn workers
- `pause()` / `resume()` / `stop()`
- `runWorker()` — fetch loop: dequeue → fetch → parse in offscreen → save → enqueue links
- `processUrl(url, depth)` — `fetch(url, { credentials: "omit" })` + check Content-Type is text/html + anti-bot check + offscreen parse + save. Handle network errors, timeouts (30s via AbortSignal.timeout), non-HTML skip
- `handleBlocked(url, reason)` — add to blocked list, auto-pause after N consecutive
- `retryBlocked(url)` / `retryAllBlocked()` / `dismissBlocked(url)`
- `saveMarkdown(markdown, title, pageUrl)` — reuse session folder + `urlToPath` from background.js (available in global scope since crawl-engine.js is loaded at END of background.js)
- `addPort(port)` — register popup/dashboard port, handle messages
- `broadcastStatus()` — send status to all connected ports
- `saveState()` / `restoreState()` — persist to chrome.storage.local + session
- `onAlarm(alarm)` — keepalive: checkpoint state, re-spawn workers
- `checkStorageQuota()` — warn at 8MB, auto-pause at 9MB

- [ ] **Step 2: Verify — reload extension, confirm no importScripts errors**

Expected: No errors (CrawlEngine not wired yet).

- [ ] **Step 3: Commit**

```bash
git add js/crawl-engine.js
git commit -m "feat: add CrawlEngine class for crawl orchestration"
```

---

## Chunk 3: Background Integration — Wire CrawlEngine + Offscreen Lifecycle

### Task 5: Integrate CrawlEngine into background.js

**Files:**
- Modify: `js/background.js`

- [ ] **Step 1: Add importScripts for crawl-engine.js**

**CRITICAL:** Place `importScripts("/js/crawl-engine.js")` at the END of `background.js` (after all function definitions like `urlToPath`, `downloadAssets`, `downloadInSession`). CrawlEngine calls these functions at runtime and they must be defined in the global scope before the class is used.

```javascript
// At the VERY END of background.js (after all function definitions):
importScripts("/js/crawl-engine.js");
```

- [ ] **Step 2: Initialize CrawlEngine instance + offscreen lifecycle**

Add after the session initialization block (around line 19):

```javascript
const crawlEngine = new CrawlEngine();
crawlEngine.restoreState();
```

Offscreen document lifecycle:
- `ensureOffscreen()` — first check `await chrome.offscreen.hasDocument()` (Chrome 116+), then create if not exists, using `chrome.offscreen.createDocument({ url: "offscreen.html", reasons: [chrome.offscreen.Reason.DOM_PARSER], justification: "..." })`
- `closeOffscreen()` — close when crawl stops via `chrome.offscreen.closeDocument()`

- [ ] **Step 3: Add port-based connection handler**

```javascript
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "crawl") crawlEngine.addPort(port);
});
```

- [ ] **Step 4: Add crawl message handlers in existing onMessage**

New message types: `W2M_CRAWL_START`, `W2M_CRAWL_STOP`, `W2M_CRAWL_GET_STATUS`, `W2M_OPEN_DASHBOARD`.

- `W2M_CRAWL_START`: ensure offscreen → set session → start crawlEngine
- `W2M_CRAWL_STOP`: stop crawlEngine → close offscreen → update session
- `W2M_OPEN_DASHBOARD`: `chrome.sidePanel.open({ windowId: sender.tab?.windowId })` — requires user gesture context (called from popup button click)

- [ ] **Step 5: Add alarms listener for keepalive**

```javascript
chrome.alarms.onAlarm.addListener((alarm) => {
  crawlEngine.onAlarm(alarm);
  if (alarm.name === "crawl-keepalive") crawlEngine.checkStorageQuota();
});
```

- [ ] **Step 6: Verify — reload extension, open console, check for errors**

Expected: Extension loads, CrawlEngine initializes, no errors in console.

- [ ] **Step 7: Commit**

```bash
git add js/background.js
git commit -m "feat: integrate CrawlEngine + offscreen lifecycle into background.js"
```

---

## Chunk 4: Popup UI — Crawl Options

### Task 6: Add crawl checkboxes and config to popup.html

**Files:**
- Modify: `popup.html`

- [ ] **Step 1: Add crawl options in capture-settings section**

After the existing `capture-checks-stack` div, add:
- Crawl options row (2-col grid): checkbox "Crawler les liens" + checkbox "Dashboard"
- Crawl config row (3-col grid, hidden by default): inputs for Parallele (default 3), Pause après (default 5), Profondeur (default 0)
- Crawl summary section (hidden): tags, progress bar, stats, dashboard link button

- [ ] **Step 2: Commit**

```bash
git add popup.html
git commit -m "feat: add crawl checkboxes and config UI to popup"
```

---

### Task 7: Add crawl styles to styles.css

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Add crawl CSS at the end of styles.css**

Styles for: `.crawl-options` (2-col grid), `.crawl-config` + `.crawl-config-row` (3-col grid), `.crawl-summary`, `.crawl-tags` + `.crawl-tag` (colored pills with dark mode variants), `.crawl-progress` + `.crawl-progress-bar`, `.crawl-stats` + `.crawl-stat` (3-col grid with colored numbers), `.btn-sm`.

- [ ] **Step 2: Commit**

```bash
git add styles.css
git commit -m "style: add crawl config and summary styles"
```

---

### Task 8: Wire crawl UI in popup.js

**Files:**
- Modify: `js/popup.js`

- [ ] **Step 1: Add crawl checkbox toggle in initializeAutoCapture**

Toggling "Crawler les liens" shows/hides the crawl config row.

- [ ] **Step 2: Modify toggleCapture to handle crawl mode**

When crawl is checked: get active tab URL, send `W2M_CRAWL_START` with concurrency/depth/maxBlocks config. When stopping: send `W2M_CRAWL_STOP`.

- [ ] **Step 3: Add crawl UI update + port connection methods**

- `updateCrawlUI(active)` — show/hide summary, build tags, init stats, open dashboard if checked
- `connectCrawlPort()` — `chrome.runtime.connect({ name: "crawl" })`, listen for status updates
- `renderCrawlStats(stats)` — update stat cards and progress bar in popup

- [ ] **Step 4: Verify — reload extension, open popup, check crawl checkbox toggles config**

Expected: Checking "Crawler les liens" shows the concurrency/depth/blocks config row.

- [ ] **Step 5: Commit**

```bash
git add js/popup.js
git commit -m "feat: wire crawl UI controls and port messaging in popup"
```

---

## Chunk 5: Side Panel Dashboard

### Task 9: Create dashboard.html

**Files:**
- Create: `dashboard.html`

- [ ] **Step 1: Create dashboard HTML**

Full-height side panel layout:
- **Header** (sticky): title, session tag, Live/Paused badge (animated pulse), theme toggle
- **Body** (scrollable): 3 stat cards (captured/queued/blocked), progress bar with speed, bar chart (CSS-only, no external lib), captured pages list, blocked URLs list with actions, live log (color-coded)
- **Footer** (sticky): "Tout réessayer (N)" button, Pause/Resume toggle, Stop button

Include `<link rel="stylesheet" href="styles.css">` for shared CSS variables. Add inline `<style>` block for dashboard-specific layout only.

- [ ] **Step 2: Commit**

```bash
git add dashboard.html
git commit -m "feat: create Side Panel dashboard HTML"
```

---

### Task 10: Create dashboard.js

**Files:**
- Create: `js/dashboard.js`

- [ ] **Step 1: Implement dashboard logic**

Dashboard class with:
- `initTheme()` — sync with `chrome.storage.local` theme key
- `loadSession()` — display session folder name
- `connect()` — `chrome.runtime.connect({ name: "crawl" })` with auto-reconnect
- `onMessage(msg)` — route `crawl:status` and `crawl:log` messages
- `renderStats(stats)` — update stat cards, progress bar, speed
- `updateBadge(status)` — Live/Paused/Stopped badge
- `tickChart()` — track captures per 5-second interval, render CSS bar chart
- `renderCaptured()` — list of captured page URLs (max 50)
- `renderBlocked(blockedUrls)` — list with Open/Retry action buttons
- `addLog(entry)` — append timestamped color-coded log entry, auto-scroll, limit 200
- `initControls()` — wire footer buttons (pause/resume, stop, retry all)

URLs displayed using `textContent` for XSS safety. Action buttons MUST use `addEventListener` in JS (NOT inline `onclick` attributes) to comply with the extension's CSP (`script-src 'self'`).

- [ ] **Step 2: Verify — reload extension, right-click icon → open Side Panel**

Expected: Dashboard opens, shows empty state, theme toggle works.

- [ ] **Step 3: Commit**

```bash
git add js/dashboard.js
git commit -m "feat: add dashboard.js for Side Panel real-time monitoring"
```

---

## Chunk 6: Integration Test and Polish

### Task 11: End-to-end verification

**Files:** None (manual testing)

- [ ] **Step 1: Load extension in chrome://extensions (dev mode)**

Verify: No errors, all permissions granted.

- [ ] **Step 2: Navigate to a documentation site (e.g., a small docs site)**

- [ ] **Step 3: Open popup → check "Crawler les liens" → configure concurrency=2, depth=1**

Verify: Config row appears with 3 inputs.

- [ ] **Step 4: Click Start**

Verify:
- Badge shows green dot
- Popup shows summary tags + stats
- Console logs show `[W2M Crawl]` messages
- Markdown files download into session folder

- [ ] **Step 5: Open Side Panel → verify dashboard shows live stats**

Verify: Stats update, chart renders, log scrolls, captured list populates.

- [ ] **Step 6: Test anti-bot pause — navigate to a site that returns 403s**

Verify: After N consecutive blocks, crawl auto-pauses, dashboard shows blocked URLs.

- [ ] **Step 7: Test Pause/Resume/Stop from dashboard footer**

- [ ] **Step 8: Commit any fixes**

```bash
git add js/background.js js/crawl-engine.js js/offscreen.js js/popup.js js/dashboard.js popup.html dashboard.html styles.css manifest.json
git commit -m "fix: integration fixes from end-to-end testing"
```

---

### Task 12: Final cleanup and commit

- [ ] **Step 1: Verify all files are committed**

```bash
git status
```

- [ ] **Step 2: Verify no console errors on extension reload**

- [ ] **Step 3: Push to remote**

```bash
git push origin main
```
