// eslint.config.mjs — ESLint 9 flat config (Chrome extension + node:test)
import globals from 'globals';

const browserExtGlobals = {
  ...globals.browser,
  chrome: 'readonly',
  W2M: 'writable',
  TurndownService: 'readonly',
  Readability: 'readonly',
  turndownPluginGfm: 'readonly',
  cleanupMarkdown: 'readonly',
  CrawlEngine: 'readonly',
  importScripts: 'readonly',
  // importScripts side-effects / SW helpers
  urlToPath: 'readonly',
  downloadAssets: 'readonly',
  w2mDownload: 'readonly',
  detectCodeLanguage: 'readonly',
  preprocessDocument: 'readonly',
  pickMainContent: 'readonly',
  resolveMarkdownTitle: 'readonly',
  removeDecorativeAriaHidden: 'readonly',
  restoreCodeLanguageClasses: 'readonly',
  wrapHtmlForTurndown: 'readonly',
  absolutizeAnchors: 'readonly',
  absolutizeMarkdownLinks: 'readonly',
  rewriteCrawlLinks: 'readonly',
  module: 'readonly',
  global: 'readonly',
  self: 'readonly',
  Buffer: 'readonly'
};

export default [
  {
    ignores: [
      'js/Readability.js',
      'js/turndown.js',
      'js/turndown-plugin-gfm.js',
      'node_modules/',
      'beta/',
      'privacy/',
      'support/'
    ]
  },

  // Extension sources (IIFE + SW). ecmaVersion 2022 accepts trailing commas used in helpers.
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: browserExtGlobals
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          args: 'none',
          varsIgnorePattern: '^(CrawlEngine|_.*)$',
          caughtErrors: 'none'
        }
      ],
      'no-undef': 'error',
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      'no-var': 'off',
      'prefer-const': 'off'
    }
  },

  // node:test suites
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        chrome: 'readonly',
        W2M: 'writable',
        CrawlEngine: 'readonly',
        cleanupMarkdown: 'readonly',
        document: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error'
    }
  },

  // Tooling configs
  {
    files: ['eslint.config.mjs', '*.config.js', '*.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: { 'no-undef': 'error' }
  }
];
