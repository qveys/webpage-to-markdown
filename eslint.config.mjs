// eslint.config.mjs — ESLint 9 flat configuration
import globals from "globals";

// ES5 IIFE files (UI modules loaded via <script> in extension pages)
const es5Files = [
  "js/app-state.js",
  "js/cleanup-markdown.js",
  "js/dashboard.js",
  "js/default-settings.js",
  "js/i18n.js",
  "js/markdown-output.js",
  "js/popup.js",
  "js/settings.js",
  "js/settings-page.js",
  "js/single-conversion-result.js",
  "js/theme-icon.js",
  "js/theme-init.js",
];

// Modern ES2022 files (service worker, offscreen document, CrawlEngine)
const modernFiles = ["js/background.js", "js/crawl-engine.js", "js/offscreen.js"];

export default [
  // ── Ignored files ──────────────────────────────────────────────────────────
  {
    ignores: [
      "js/Readability.js",
      "js/turndown.js",
      "js/turndown-plugin-gfm.js",
      "node_modules/",
    ],
  },

  // ── ES5 IIFE UI modules ────────────────────────────────────────────────────
  {
    files: es5Files,
    languageOptions: {
      ecmaVersion: 5,
      sourceType: "script",
      globals: {
        ...globals.browser,
        // Chrome Extension API
        chrome: "readonly",
        // Shared W2M namespace
        W2M: "writable",
        // Vendored libs loaded via <script> before these modules
        TurndownService: "readonly",
        // UMD-pattern guards used in default-settings.js and markdown-output.js
        module: "readonly",
        global: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none" }],
      "no-undef": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "off", // ES5 files intentionally use var
    },
  },

  // ── Modern JS (service worker, offscreen, CrawlEngine) ────────────────────
  {
    files: modernFiles,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        // Chrome Extension API
        chrome: "readonly",
        // importScripts available in service workers
        importScripts: "readonly",
        // Vendored libs and helpers loaded via importScripts() before use
        TurndownService: "readonly",
        Readability: "readonly",
        turndownPluginGfm: "readonly",
        cleanupMarkdown: "readonly",
        CrawlEngine: "readonly",
        // Helpers defined in background.js and available to crawl-engine.js
        urlToPath: "readonly",
        downloadAssets: "readonly",
        w2mDownload: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none" }],
      "no-undef": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "warn",
      "no-var": "warn",
    },
  },

  // ── Jest test files ────────────────────────────────────────────────────────
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest,
        // Chrome Extension API (mocked in tests/setup/chrome-mock.js)
        chrome: "readonly",
        W2M: "writable",
        // Globals injected via vm.runInThisContext in test beforeAll hooks
        CrawlEngine: "readonly",
        cleanupMarkdown: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none" }],
      "no-undef": "error",
    },
  },

  // ── Node config files (jest.config.js, etc.) ──────────────────────────────
  {
    files: ["jest.config.js", "*.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "error",
    },
  },
];
