const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');

let navigationUrlIsRestricted;

before(() => {
  const bgCode = fs.readFileSync(
    path.resolve(__dirname, '../js/background.js'),
    'utf8',
  );
  const helperMatch = bgCode.match(/function isChromeWebStoreUrl\(url\)\s*\{[\s\S]*?\n\}/);
  const restrictionMatch = bgCode.match(/function navigationUrlIsRestricted\(url\)\s*\{[\s\S]*?\n\}/);

  if (!helperMatch || !restrictionMatch) {
    throw new Error('Could not extract URL restriction helpers from background.js');
  }

  vm.runInThisContext(helperMatch[0]);
  vm.runInThisContext('var navigationUrlIsRestricted = ' + restrictionMatch[0]);
  navigationUrlIsRestricted = vm.runInThisContext('navigationUrlIsRestricted');
});

describe('navigationUrlIsRestricted', () => {
  test('restricts Chrome Web Store URLs by parsed hostname and path', () => {
    assert.equal(
      navigationUrlIsRestricted('https://chrome.google.com/webstore/detail/test'),
      true,
    );
    assert.equal(
      navigationUrlIsRestricted('https://chromewebstore.google.com/detail/test'),
      true,
    );
  });

  test('does not restrict attacker-controlled URLs that only contain store substrings', () => {
    assert.equal(
      navigationUrlIsRestricted('https://evil.example/path/chrome.google.com/webstore/detail/test'),
      false,
    );
    assert.equal(
      navigationUrlIsRestricted('https://evil.example/?next=https://chromewebstore.google.com/detail/test'),
      false,
    );
  });

  test('still restricts browser-internal pages', () => {
    assert.equal(navigationUrlIsRestricted('chrome://extensions'), true);
    assert.equal(navigationUrlIsRestricted('chrome-extension://abc123/page.html'), true);
    assert.equal(navigationUrlIsRestricted('edge://settings'), true);
    assert.equal(navigationUrlIsRestricted('about:blank'), true);
  });

  test('restricts view-source URLs (not scriptable; cannot bypass store checks)', () => {
    assert.equal(
      navigationUrlIsRestricted('view-source:https://chromewebstore.google.com/detail/test'),
      true,
    );
    assert.equal(
      navigationUrlIsRestricted('view-source:https://chrome.google.com/webstore/detail/test'),
      true,
    );
    assert.equal(navigationUrlIsRestricted('view-source:chrome://extensions'), true);
    assert.equal(navigationUrlIsRestricted('view-source:https://example.com/'), true);
  });
});
