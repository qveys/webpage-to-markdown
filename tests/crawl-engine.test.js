const fs = require('fs');
const vm = require('vm');
const path = require('path');

beforeAll(() => {
  const code = fs.readFileSync(
    path.resolve(__dirname, '../js/crawl-engine.js'),
    'utf8',
  );
  // Wrap in an IIFE that returns the class, then assign to global.
  // Bare `class` declarations via vm.runInThisContext are block-scoped
  // and don't land on `global`, so we hoist explicitly.
  global.CrawlEngine = vm.runInThisContext(
    '(function(){ ' + code + '\n return CrawlEngine; })()',
    { filename: 'crawl-engine.js' },
  );
});

describe('CrawlEngine.isFetchableHttpUrl', () => {
  test('accepts http URL', () => {
    expect(CrawlEngine.isFetchableHttpUrl('http://example.com')).toBe(true);
  });

  test('accepts https URL', () => {
    expect(CrawlEngine.isFetchableHttpUrl('https://example.com/page')).toBe(true);
  });

  test('rejects chrome:// URL', () => {
    expect(CrawlEngine.isFetchableHttpUrl('chrome://extensions')).toBe(false);
  });

  test('rejects data: URL', () => {
    expect(CrawlEngine.isFetchableHttpUrl('data:text/html,<h1>Hi</h1>')).toBe(false);
  });

  test('rejects javascript: URL', () => {
    expect(CrawlEngine.isFetchableHttpUrl('javascript:void(0)')).toBe(false);
  });

  test('rejects malformed string', () => {
    expect(CrawlEngine.isFetchableHttpUrl('not a url')).toBe(false);
  });
});

describe('CrawlEngine scope and queue', () => {
  let engine;
  beforeEach(() => {
    engine = new CrawlEngine();
    engine.setScope('https://example.com/docs/');
  });

  test('isInScope: same origin + path prefix', () => {
    expect(engine.isInScope('https://example.com/docs/api/')).toBe(true);
  });

  test('isInScope: exact path match', () => {
    expect(engine.isInScope('https://example.com/docs/')).toBe(true);
  });

  test('isInScope: different domain rejected', () => {
    expect(engine.isInScope('https://other.com/docs/')).toBe(false);
  });

  test('isInScope: different path rejected', () => {
    expect(engine.isInScope('https://example.com/blog/')).toBe(false);
  });

  test('enqueue adds URL and increments stats', () => {
    engine.enqueue('https://example.com/docs/page1', 0);
    expect(engine.discoveryQueue).toHaveLength(1);
    expect(engine.stats.queued).toBe(1);
  });

  test('enqueue deduplicates via seenUrls', () => {
    engine.enqueue('https://example.com/docs/page1', 0);
    engine.enqueue('https://example.com/docs/page1', 0);
    expect(engine.discoveryQueue).toHaveLength(1);
  });

  test('enqueue respects depth limit', () => {
    engine.config.depth = 2;
    engine.enqueue('https://example.com/docs/page1', 3);
    expect(engine.discoveryQueue).toHaveLength(0);
  });
});

describe('CrawlEngine anti-bot', () => {
  let engine;
  beforeEach(() => { engine = new CrawlEngine(); });

  test('looksLikeCaptcha detects captcha keywords', () => {
    expect(engine.looksLikeCaptcha('<div class="cf-challenge">challenge</div>')).toBe(true);
    expect(engine.looksLikeCaptcha('<script src="hcaptcha.js"></script>')).toBe(true);
  });

  test('looksLikeCaptcha returns false on clean HTML', () => {
    expect(engine.looksLikeCaptcha('<html><body><h1>Hello</h1></body></html>')).toBe(false);
  });

  test('handleBlocked increments counter and adds to list', () => {
    engine.handleBlocked('https://example.com/blocked', '403');
    expect(engine.consecutiveBlocks).toBe(1);
    expect(engine.blockedUrls).toHaveLength(1);
    expect(engine.stats.blocked).toBe(1);
  });
});
