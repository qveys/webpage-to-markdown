const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_CAPTURE_SETTINGS,
  originPermissionPattern,
  requestOriginPermission,
} = require('../js/default-settings.js');

describe('capture security defaults', () => {
  test('uses bounded image defaults', () => {
    assert.equal(DEFAULT_CAPTURE_SETTINGS.maxAssetSizeMb, 10);
    assert.equal(DEFAULT_CAPTURE_SETTINGS.maxSessionAssetSizeMb, 50);
  });

  test('builds a permission pattern for the exact HTTP(S) origin', () => {
    assert.equal(originPermissionPattern('https://example.com/docs/page'), 'https://example.com/*');
    assert.equal(originPermissionPattern('http://localhost:8080/a'), 'http://localhost:8080/*');
    assert.equal(originPermissionPattern('file:///tmp/a'), null);
    assert.equal(originPermissionPattern('not a url'), null);
  });

  test('requests only the exact origin from a user action', async () => {
    const originalRequest = chrome.permissions.request;
    let requested;
    chrome.permissions.request = (permissions, callback) => {
      requested = permissions;
      callback(true);
    };
    try {
      const granted = await new Promise((resolve) => {
        requestOriginPermission('https://example.com/docs/page', resolve);
      });
      assert.equal(granted, true);
      assert.deepEqual(requested, { origins: ['https://example.com/*'] });
    } finally {
      chrome.permissions.request = originalRequest;
    }
  });
});
