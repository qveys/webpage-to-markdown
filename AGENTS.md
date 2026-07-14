# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project

Chrome Extension (Manifest V3) that converts webpages to Markdown. Supports single-page conversion and multi-page crawling. Published on Chrome Web Store.

## Development

No bundler or build step for the shipped extension (load unpacked source). `package.json` exists for **tests / dev tooling only** (`npm test`, using Node's built-in test runner). Load directly in Chrome:
1. `chrome://extensions/` → Developer mode → "Load unpacked" → select repo root
2. Reload extension after changes (or Ctrl+R on the extensions page)

Service Worker changes require extension reload. Popup/dashboard changes take effect on next open.

## Architecture

### Module System
- **Global namespace `W2M`** shares: `i18n`, `AppState`, `STATES`, `el()` (DOM helper)
- UI modules (`popup.js`, `dashboard.js`, `settings.js`) are wrapped in **IIFEs**
- Service Worker (`background.js`) loads scripts via `importScripts()`
- Vendored libs (Turndown, Readability, GFM plugin) checked into the repo — runtime has no npm bundle step

### Entry Points & Communication
- **Service Worker** (`js/background.js`): extraction, Turndown conversion, downloads, crawl orchestration
- **Popup** (`js/popup.js`): toolbar popup — single capture + crawl trigger
- **Dashboard** (`js/dashboard.js`): side panel — crawl monitoring, history
- **Settings** (`js/settings.js`): options page
- **Offscreen** (`js/offscreen.js`): isolated DOM parsing (DOMParser for link extraction)
- **CrawlEngine** (`js/crawl-engine.js`): ES6 class for multi-page crawl with concurrency, queue, block detection
- **Settings page** (`js/settings-page.js`): settings page bootstrap (title + theme toggle)
- **Theme icon** (`js/theme-icon.js`): shared SVG sun/moon builder (`W2M.buildThemeIcon`)
- **Theme init** (`js/theme-init.js`): synchronous theme apply in `<head>` to prevent flash

### HTML Pages
- `popup.html` — toolbar popup (loads `popup.js`)
- `dashboard.html` — side panel (`side_panel.default_path` in manifest)
- `settings.html` — options page (loads `settings.js` + `settings-page.js`)
- `offscreen.html` — headless DOM parsing (loaded programmatically by SW)

Communication: `chrome.runtime.sendMessage` for request/response, `chrome.runtime.connect()` ports for persistent crawl status streaming between SW ↔ popup/dashboard.

### State Management
`AppState` (`js/app-state.js`) is a state machine with defined `STATES` and `TRANSITIONS`. Views render based on current state. Both popup and dashboard use it.

Persistent state in `chrome.storage.local`: `markdownSettings`, `captureSettings`, `crawlSettings`, `session`, `theme`, `singlePageSettings`, `dashboardMode`.

## Permissions

`activeTab` `scripting` `storage` `downloads` `downloads.ui` `webNavigation` `sidePanel` `offscreen` `alarms`, plus optional HTTP(S) host permissions requested per crawl origin.

Notable: `sidePanel` for dashboard, `offscreen` for DOM parsing, `alarms` for crawl scheduling, `webNavigation` for crawl URL tracking.

## Code Conventions

- **UI IIFEs** (`popup.js`, `dashboard.js`, `settings.js`): ES5-style — `var`, `function`, prototype methods; no arrow functions (matches existing global `W2M` pattern).
- **Service worker, offscreen, CrawlEngine** (`background.js`, `offscreen.js`, `crawl-engine.js`): modern JS is fine — `const`/`let`, arrow functions, classes, optional chaining, etc.
- Constructor functions: `CapitalCase`. Private methods: `_prefix`
- Comments and identifiers in English
- Single `styles.css` with CSS custom properties; themes via `data-theme="light|dark"`

## Git Conventions

```text
<emoji> <type>(<scope>): <message>
```
Emojis: ✨ feat, 🐛 fix, 📝 docs, 💄 style, 🔧 chore, ⏱️ timing fix, 📡 messaging fix, 🖼️ image fix

## Codex Automations

### Hooks (`.Codex/settings.json`)
Two PreToolUse hooks protect the codebase:
1. **Vendored lib guard** — Blocks edits to `Readability.js`, `turndown.js`, `turndown-plugin-gfm.js`
2. **Sensitive file guard** — Blocks edits to `.env` and credential files

### Skills
- **`/release`** — Bumps version in manifest.json, generates changelog from emoji commits, suggests git tag. User-only.
- **`/security-review`** — Audits extension security: permissions, CSP, message handlers, DOM injection, content scripts.

### Agents
- **`permission-reviewer`** — Reviews manifest.json permissions, flags unused or overly broad ones
- **`extension-security`** — Deep security audit of Chrome Extension patterns

## Learned Workspace Facts

- Single-page auto-convert uses `webNavigation.onCompleted` for full loads; SPAs and in-page navigations also need `onHistoryStateUpdated` and `onReferenceFragmentUpdated`. Prefer `tabs.get` plus `windows.getLastFocused` over `tabs.query({ active: true, lastFocusedWindow: true })` when deciding if the navigated tab is the foreground active tab.
- Single-page auto-download runs only when the side panel dashboard is connected (crawl `runtime.connect` port active) and `dashboardMode === 'single'` in `chrome.storage.local`.
- The popup can open the side panel on the Single Page tab by setting `dashboardMode` to `single`, opening the panel, and sending `W2M_APPLY_DASHBOARD_MODE` (see `openDashboardSinglePage`); `W2M_OPEN_DASHBOARD` may carry `mode: 'single' | 'crawl'`.
- Run tests with `npm test` (Node's built-in `node:test` runner; no npm test dependency).
- Machine-local Cursor hook state lives under `.cursor/hooks/state/` and is listed in `.gitignore`.
