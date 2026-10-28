# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- Vendored libs (Turndown, Readability, GFM plugin) — no npm bundle step

### Entry Points & Communication
- **Service Worker** (`js/background.js`): extraction, Turndown conversion, downloads, crawl orchestration
- **Popup** (`js/popup.js`): toolbar popup — single capture + crawl trigger
- **Dashboard** (`js/dashboard.js`): side panel — two modes: single-page conversion and crawl monitoring, history
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

Persistent state in `chrome.storage.local`: `markdownSettings`, `captureSettings`, `crawlSettings`, `session`, `theme`, `dashboardMode`, `singlePageSettings`.

## Permissions

`activeTab` `scripting` `storage` `downloads` `downloads.ui` `webNavigation` `sidePanel` `offscreen` `alarms`, plus optional HTTP(S) host permissions requested per crawl origin.

Notable: `sidePanel` for dashboard, `offscreen` for DOM parsing, `alarms` for crawl scheduling, `webNavigation` for crawl URL tracking.

## Code Conventions

- **UI IIFEs** (`popup.js`, `dashboard.js`, `settings.js`): ES5-style — `var`, `function`, prototype methods; no arrow functions (matches existing global `W2M` pattern).
- **Service worker, offscreen, CrawlEngine** (`background.js`, `offscreen.js`, `crawl-engine.js`): modern JS is fine — `const`/`let`, arrow functions, classes, optional chaining, etc.
- Constructor functions: `CapitalCase`. Private methods: `_prefix`
- Comments and identifiers in English
- Single `styles.css` with CSS custom properties; themes via `data-theme="light|dark"`

## HTML → Markdown: generic adaptations (required)

The converter must work on **arbitrary** pages and crawl corpora—not one documentation vendor.

When improving extraction quality from a real page:

1. **Generalize the pattern** (semantic attributes, structural roles, recurring DOM shapes). Do **not** ship hostname checks, product names, or framework-only selectors as the fix.
2. Prefer shared pipeline hooks:
   - `js/html-preprocess.js` — DOM normalize before Readability/Turndown
   - `js/cleanup-markdown.js` — pure-string Markdown cleanup
   - `js/rewrite-crawl-links.js` — same-host links → relative `.md` paths (crawl)
3. Comments and identifiers describe the *pattern*; a site may appear only as an optional example.
4. Tests use **generic HTML fixtures**, not production URL dumps or vendor-locked markup.

Reject / rewrite proposals that only work for one site (e.g. hardcoded `data-component-part="update-tag-list"`) unless a generic equivalent is also implemented.

## Git Conventions

```
<emoji> <type>(<scope>): <message>
```
Emojis: ✨ feat, 🐛 fix, 📝 docs, 💄 style, 🔧 chore, ⏱️ timing fix, 📡 messaging fix, 🖼️ image fix
