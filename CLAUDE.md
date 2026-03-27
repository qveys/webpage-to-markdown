# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chrome Extension (Manifest V3) that converts webpages to Markdown. Supports single-page conversion and multi-page crawling. Published on Chrome Web Store.

## Development

No build system, bundler, or package manager. Load directly in Chrome:
1. `chrome://extensions/` → Developer mode → "Load unpacked" → select repo root
2. Reload extension after changes (or Ctrl+R on the extensions page)

Service Worker changes require extension reload. Popup/dashboard changes take effect on next open.

## Architecture

### Module System
- **Global namespace `W2M`** shares: `i18n`, `AppState`, `STATES`, `el()` (DOM helper)
- UI modules (`popup.js`, `dashboard.js`, `settings.js`) are wrapped in **IIFEs**
- Service Worker (`background.js`) loads scripts via `importScripts()`
- Vendored libs (Turndown, Readability, GFM plugin) — no npm

### Entry Points & Communication
- **Service Worker** (`js/background.js`): extraction, Turndown conversion, downloads, crawl orchestration
- **Popup** (`js/popup.js`): toolbar popup — single capture + crawl trigger
- **Dashboard** (`js/dashboard.js`): side panel — crawl monitoring, history
- **Settings** (`js/settings.js`): options page
- **Offscreen** (`js/offscreen.js`): isolated DOM parsing (DOMParser for link extraction)
- **CrawlEngine** (`js/crawl-engine.js`): ES6 class for multi-page crawl with concurrency, queue, block detection

Communication: `chrome.runtime.sendMessage` for request/response, `chrome.runtime.connect()` ports for persistent crawl status streaming between SW ↔ popup/dashboard.

### State Management
`AppState` (`js/app-state.js`) is a state machine with defined `STATES` and `TRANSITIONS`. Views render based on current state. Both popup and dashboard use it.

Persistent state in `chrome.storage.local`: `markdownSettings`, `captureSettings`, `crawlSettings`, `session`, `theme`.

## Code Conventions

- **ES5-compatible** in IIFEs: `var`, `function`, prototype methods — no arrow functions
- Exception: `CrawlEngine` uses ES6 class syntax (runs only in SW context)
- Constructor functions: `CapitalCase`. Private methods: `_prefix`
- Comments in French, identifiers in English
- Single `styles.css` with CSS custom properties; themes via `data-theme="light|dark"`

## Git Conventions

```
<emoji> <type>(<scope>): <message>
```
Emojis: ✨ feat, 🐛 fix, 📝 docs, 💄 style, 🔧 chore, ⏱️ timing fix, 📡 messaging fix, 🖼️ image fix

## Claude Code Automations

### Hooks (`.claude/settings.json`)
Two PreToolUse hooks protect the codebase:
1. **Vendored lib guard** — Blocks edits to `Readability.js`, `turndown.js`, `turndown-plugin-gfm.js`
2. **Sensitive file guard** — Blocks edits to `.env` and credential files

### Skills
- **`/release`** — Bumps version in manifest.json, generates changelog from emoji commits, suggests git tag. User-only.
- **`/security-review`** — Audits extension security: permissions, CSP, message handlers, DOM injection, content scripts.

### Agents
- **`permission-reviewer`** — Reviews manifest.json permissions, flags unused or overly broad ones
- **`extension-security`** — Deep security audit of Chrome Extension patterns
