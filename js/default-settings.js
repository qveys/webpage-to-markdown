/**
 * Shared default settings + helpers for popup and side panel.
 * Single source of truth for capture/crawl defaults and the session folder name.
 */
(function (global) {
  'use strict';

  var W2M = global.W2M || {};
  global.W2M = W2M;

  var DEFAULT_CAPTURE_SETTINGS = { delay: 2000, urlTree: true, saveAssets: true };
  var DEFAULT_CRAWL_SETTINGS = { concurrency: 3, maxBlocks: 5, depth: 0 };

  /**
   * Build the default download folder name for a crawl session.
   * Pattern: w2m-<host-slug>-<YYYY-MM-DD>. Host slug is truncated to 20 chars.
   * Falls back gracefully when `url` is missing or invalid.
   * @param {string} url
   * @returns {string}
   */
  function defaultSessionFolder(url) {
    var host = '';
    try {
      host = new URL(url || '').hostname.replace(/[^a-z0-9]/gi, '-');
    } catch (_e) {
      host = '';
    }
    var date = new Date().toISOString().slice(0, 10);
    return 'w2m-' + host.substring(0, 20) + '-' + date;
  }

  W2M.DEFAULT_CAPTURE_SETTINGS = DEFAULT_CAPTURE_SETTINGS;
  W2M.DEFAULT_CRAWL_SETTINGS = DEFAULT_CRAWL_SETTINGS;
  W2M.defaultSettings = {
    capture: DEFAULT_CAPTURE_SETTINGS,
    crawl: DEFAULT_CRAWL_SETTINGS,
    defaultSessionFolder: defaultSessionFolder
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      DEFAULT_CAPTURE_SETTINGS: DEFAULT_CAPTURE_SETTINGS,
      DEFAULT_CRAWL_SETTINGS: DEFAULT_CRAWL_SETTINGS,
      defaultSessionFolder: defaultSessionFolder
    };
  }
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
