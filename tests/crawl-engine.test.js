const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { describe, test, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

before(() => {
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
    assert.equal(CrawlEngine.isFetchableHttpUrl('http://example.com'), true);
  });

  test('accepts https URL', () => {
    assert.equal(CrawlEngine.isFetchableHttpUrl('https://example.com/page'), true);
  });

  test('rejects chrome:// URL', () => {
    assert.equal(CrawlEngine.isFetchableHttpUrl('chrome://extensions'), false);
  });

  test('rejects data: URL', () => {
    assert.equal(CrawlEngine.isFetchableHttpUrl('data:text/html,<h1>Hi</h1>'), false);
  });

  test('rejects javascript: URL', () => {
    assert.equal(CrawlEngine.isFetchableHttpUrl('javascript:void(0)'), false);
  });

  test('rejects malformed string', () => {
    assert.equal(CrawlEngine.isFetchableHttpUrl('not a url'), false);
  });
});

describe('CrawlEngine scope and queue', () => {
  let engine;
  beforeEach(() => {
    engine = new CrawlEngine();
    engine.setScope('https://example.com/docs/');
  });

  test('isInScope: same origin + path prefix', () => {
    assert.equal(engine.isInScope('https://example.com/docs/api/'), true);
  });

  test('isInScope: exact path match', () => {
    assert.equal(engine.isInScope('https://example.com/docs/'), true);
  });

  test('isInScope: different domain rejected', () => {
    assert.equal(engine.isInScope('https://other.com/docs/'), false);
  });

  test('isInScope: different path rejected', () => {
    assert.equal(engine.isInScope('https://example.com/blog/'), false);
  });

  test('enqueue adds URL and increments stats', () => {
    engine.enqueue('https://example.com/docs/page1', 0);
    assert.equal(engine.discoveryQueue.length, 1);
    assert.equal(engine.stats.queued, 1);
  });

  test('enqueue deduplicates via seenUrls', () => {
    engine.enqueue('https://example.com/docs/page1', 0);
    engine.enqueue('https://example.com/docs/page1', 0);
    assert.equal(engine.discoveryQueue.length, 1);
  });

  test('enqueue respects depth limit', () => {
    engine.config.depth = 2;
    engine.enqueue('https://example.com/docs/page1', 3);
    assert.equal(engine.discoveryQueue.length, 0);
  });

  test('enqueue skips asset URLs (images, fonts, etc.)', () => {
    engine.enqueue('https://example.com/img/logo.png', 0);
    engine.enqueue('https://example.com/style.css', 0);
    engine.enqueue('https://example.com/font.woff2', 0);
    engine.enqueue('https://example.com/photo.jpeg?w=200', 0);
    engine.enqueue('https://example.com/file.pdf', 0);
    assert.equal(engine.discoveryQueue.length, 0);
  });

  test('looksLikeAsset accepts HTML-like URLs', () => {
    assert.equal(CrawlEngine.looksLikeAsset('https://example.com/docs/page'), false);
    assert.equal(CrawlEngine.looksLikeAsset('https://example.com/docs/page.html'), false);
    assert.equal(CrawlEngine.looksLikeAsset('https://example.com/'), false);
  });
});

describe('CrawlEngine anti-bot', () => {
  let engine;
  beforeEach(() => { engine = new CrawlEngine(); });

  test('looksLikeCaptcha detects captcha on short challenge pages', () => {
    assert.equal(engine.looksLikeCaptcha('<div class="cf-challenge">challenge</div>'), true);
    assert.equal(engine.looksLikeCaptcha('<script src="hcaptcha.js"></script>'), true);
  });

  test('looksLikeCaptcha returns false on clean HTML', () => {
    assert.equal(engine.looksLikeCaptcha('<html><body><h1>Hello</h1></body></html>'), false);
  });

  test('looksLikeCaptcha returns false when page has substantial content despite captcha keyword', () => {
    var real = '<html><head><script src="recaptcha.js"></script></head><body>'
      + '<main><h1>Welcome</h1><p>Content here</p></main></body></html>';
    assert.equal(engine.looksLikeCaptcha(real), false);
  });

  test('looksLikeCaptcha returns false with 3+ paragraphs despite captcha keyword', () => {
    var html = '<html><head><script src="cf-challenge.js"></script></head><body>'
      + '<p>One</p><p>Two</p><p>Three</p></body></html>';
    assert.equal(engine.looksLikeCaptcha(html), false);
  });

  test('looksLikeCaptcha returns false with list/table content despite captcha keyword', () => {
    var changelog = '<html><head><script src="cf-challenge.js"></script></head><body>'
      + '<h2>Changelog</h2><ul><li>Fix A</li><li>Fix B</li><li>Fix C</li></ul></body></html>';
    assert.equal(engine.looksLikeCaptcha(changelog), false);

    var table = '<html><head><script src="recaptcha.js"></script></head><body>'
      + '<nav>Menu</nav><table><tr><td>Data</td></tr></table></body></html>';
    assert.equal(engine.looksLikeCaptcha(table), false);
  });

  test('looksLikeCaptcha returns false when HTML is large despite captcha keyword', () => {
    var large = '<html><head><script src="cf-challenge.js"></script></head><body>'
      + '<div>' + 'x'.repeat(9000) + '</div></body></html>';
    assert.equal(engine.looksLikeCaptcha(large), false);
  });

  test('looksLikeCaptcha returns true when captcha keyword and no real content', () => {
    var challenge = '<html><body><div class="cf-challenge"><p>Verify you are human</p></div></body></html>';
    assert.equal(engine.looksLikeCaptcha(challenge), true);
  });

  test('handleBlocked increments counter and adds to list', () => {
    engine.handleBlocked('https://example.com/blocked', '403');
    assert.equal(engine.consecutiveBlocks, 1);
    assert.equal(engine.blockedUrls.length, 1);
    assert.equal(engine.stats.blocked, 1);
  });
});

describe('CrawlEngine download UI lifecycle', () => {
  beforeEach(() => {
    chrome.downloads.setUiOptions.mockClear();
  });

  test('hides the download UI when a crawl starts', async () => {
    const engine = new CrawlEngine();
    engine.spawnWorkers = function () {};
    await engine.start('https://example.com/docs/');
    assert.deepEqual(
      chrome.downloads.setUiOptions.mock.calls[0],
      [{ enabled: false }],
    );
    await engine.stop();
  });

  test('restores the download UI after an explicit stop', async () => {
    const engine = new CrawlEngine();
    engine.status = 'running';
    await engine.stop();
    const lastCall = chrome.downloads.setUiOptions.mock.calls.at(-1);
    assert.deepEqual(lastCall, [{ enabled: true }]);
  });

  test('restores the download UI after natural completion', async () => {
    const engine = new CrawlEngine();
    engine.status = 'running';
    engine.activeWorkers = 1;
    engine.discoveryQueue = [];
    await engine.runWorker();
    const lastCall = chrome.downloads.setUiOptions.mock.calls.at(-1);
    assert.deepEqual(lastCall, [{ enabled: true }]);
  });
});

describe('CrawlEngine log persistence', () => {
  test('restores prior logs before recording the state restoration', async () => {
    const previousLogs = [
      { type: 'capture', message: 'Page one', timestamp: 1 },
      { type: 'asset', message: 'logo.svg', timestamp: 2 },
    ];
    await chrome.storage.local.set({
      crawlState: {
        status: 'stopped',
        stats: { captured: 1, queued: 0, blocked: 0, startTime: 1 },
        capturedUrls: ['https://example.com/'],
        blockedUrls: [],
        config: {},
        scope: null,
        logs: previousLogs,
      },
    });
    await chrome.storage.session.set({ crawlQueue: [] });

    const engine = new CrawlEngine();
    assert.equal(await engine.restoreState(), true);
    assert.deepEqual(engine.logBuffer.slice(0, 2), previousLogs);
    assert.equal(engine.logBuffer.at(-1).message, 'State restored');
  });

  test('saves at most the latest 500 log entries', async () => {
    const engine = new CrawlEngine();
    engine.logBuffer = Array.from({ length: 510 }, function (_, index) {
      return { type: 'info', message: 'Log ' + index, timestamp: index };
    });

    await engine.saveState();
    const stored = await chrome.storage.local.get('crawlState');
    assert.equal(stored.crawlState.logs.length, 500);
    assert.equal(stored.crawlState.logs[0].message, 'Log 10');
  });

  test('publishes the restored snapshot after storage has loaded', async () => {
    await chrome.storage.local.set({
      crawlState: {
        status: 'stopped',
        stats: { captured: 7, queued: 0, blocked: 0, startTime: 1 },
        capturedUrls: ['https://example.com/'],
        blockedUrls: [],
        config: {},
        scope: null,
        logs: [],
      },
    });
    await chrome.storage.session.set({ crawlQueue: [] });

    const engine = new CrawlEngine();
    let published = null;
    engine.broadcastStatus = function (immediate) {
      published = { immediate: immediate, captured: this.stats.captured };
    };
    await engine.restoreState();
    assert.deepEqual(published, { immediate: true, captured: 7 });
  });

  test('a new crawl clears old results and persists its fresh state immediately', async () => {
    const engine = new CrawlEngine();
    engine.logBuffer = [{ type: 'capture', message: 'Old crawl', timestamp: 1 }];
    engine.capturedUrls.add('https://old.example/');
    engine.assetBudget.used = 42;
    engine.spawnWorkers = function () {};

    await engine.start('https://example.com/docs/');
    const stored = await chrome.storage.local.get('crawlState');
    assert.equal(engine.capturedUrls.size, 0);
    assert.equal(engine.assetBudget.used, 0);
    assert.deepEqual(stored.crawlState.logs.map(function (entry) { return entry.message; }), [
      'Crawl started: https://example.com/docs/',
    ]);
    await engine.stop();
  });
});
