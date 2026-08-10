const fs = require('fs');
const vm = require('vm');
const path = require('path');

let navigationUrlIsRestricted;

beforeAll(() => {
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
    expect(navigationUrlIsRestricted('https://chrome.google.com/webstore/detail/test')).toBe(true);
    expect(navigationUrlIsRestricted('https://chromewebstore.google.com/detail/test')).toBe(true);
  });

  test('does not restrict attacker-controlled URLs that only contain store substrings', () => {
    expect(
      navigationUrlIsRestricted('https://evil.example/path/chrome.google.com/webstore/detail/test'),
    ).toBe(false);
    expect(
      navigationUrlIsRestricted('https://evil.example/?next=https://chromewebstore.google.com/detail/test'),
    ).toBe(false);
  });

  test('still restricts browser-internal pages', () => {
    expect(navigationUrlIsRestricted('chrome://extensions')).toBe(true);
    expect(navigationUrlIsRestricted('chrome-extension://abc123/page.html')).toBe(true);
    expect(navigationUrlIsRestricted('edge://settings')).toBe(true);
    expect(navigationUrlIsRestricted('about:blank')).toBe(true);
  });

  test('restricts view-source URLs (not scriptable; cannot bypass store checks)', () => {
    expect(
      navigationUrlIsRestricted('view-source:https://chromewebstore.google.com/detail/test'),
    ).toBe(true);
    expect(
      navigationUrlIsRestricted('view-source:https://chrome.google.com/webstore/detail/test'),
    ).toBe(true);
    expect(navigationUrlIsRestricted('view-source:chrome://extensions')).toBe(true);
    expect(navigationUrlIsRestricted('view-source:https://example.com/')).toBe(true);
  });
});
