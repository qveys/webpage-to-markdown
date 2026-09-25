const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { describe, test, before, beforeEach, afterEach } = require('node:test');
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

  test('looksLikeAppShell flags anchor-less client-rendered shells', () => {
    const shell =
      '<html><head><script src="/app.js"></script></head>' +
      '<body><div id="root"></div><a href="/">Home</a></body></html>';
    assert.equal(CrawlEngine.looksLikeAppShell(shell), true);

    const serverRendered =
      '<html><body><nav><a href="/a">A</a><a href="/b">B</a></nav>' +
      '<main><p>Content</p><a href="/c">C</a></main></body></html>';
    assert.equal(CrawlEngine.looksLikeAppShell(serverRendered), false);
  });

  test('looksLikeAppShell does not open a tab for a thin static article', () => {
    const staticArticle =
      '<html><body><main><h1>Title</h1><p>Body text</p>' +
      '<a href="/other">One link</a></main></body></html>';
    assert.equal(CrawlEngine.looksLikeAppShell(staticArticle), false);

    const linklessStatic =
      '<html><body><main><h1>Title</h1><p>Paragraph one</p>' +
      '<p>Paragraph two</p><p>Paragraph three</p></main></body></html>';
    assert.equal(CrawlEngine.looksLikeAppShell(linklessStatic), false);
  });

  test('looksLikeAppShell detects framework hydration markers', () => {
    const nextApp =
      '<html><body><script id="__NEXT_DATA__" type="application/json">{}</script>' +
      '<div id="__next"></div></body></html>';
    assert.equal(CrawlEngine.looksLikeAppShell(nextApp), true);
  });
});

describe('CrawlEngine.sameOrigin', () => {
  test('accepts same-origin URLs with different paths', () => {
    assert.equal(
      CrawlEngine.sameOrigin('https://example.com/a', 'https://example.com/b/c'),
      true,
    );
  });

  test('rejects another origin, port, or scheme', () => {
    assert.equal(
      CrawlEngine.sameOrigin('https://evil.example/a', 'https://example.com/a'),
      false,
    );
    assert.equal(
      CrawlEngine.sameOrigin('https://example.com:8443/a', 'https://example.com/a'),
      false,
    );
    assert.equal(
      CrawlEngine.sameOrigin('http://example.com/a', 'https://example.com/a'),
      false,
    );
  });

  test('rejects unparseable input', () => {
    assert.equal(CrawlEngine.sameOrigin('not a url', 'https://example.com'), false);
  });
});

describe('CrawlEngine redirect and render containment', () => {
  let engine;
  let saved;
  let chromeBackup;

  /** Minimal chrome surface used by processUrl and the render path. */
  function installChrome(tabsOverrides = {}) {
    chromeBackup = global.chrome;
    global.chrome = {
      tabs: {
        create: async () => ({ id: 7, url: 'https://example.com/docs/a' }),
        get: async () => ({ id: 7, url: 'https://example.com/docs/a', status: 'complete' }),
        onUpdated: { addListener() {}, removeListener() {} },
        remove: async () => {},
        ...tabsOverrides,
      },
      scripting: { executeScript: async () => [{ result: '<html></html>' }] },
      storage: { local: { get: async () => ({}) } },
      runtime: { sendMessage: async () => null },
    };
  }

  beforeEach(() => {
    engine = new CrawlEngine();
    engine.setScope('https://example.com/docs/');
    engine.status = 'running';
    engine._abortController = new AbortController();
    engine.broadcastStatus = () => {};
    engine.log = () => {};
    saved = [];
    engine.saveMarkdown = async (markdown) => {
      saved.push(markdown);
    };
    installChrome();
  });

  afterEach(() => {
    global.chrome = chromeBackup;
    delete global.fetch;
  });

  function stubFetch({ url, html = '<html><body><p>x</p></body></html>' }) {
    global.fetch = async () => ({
      status: 200,
      url,
      headers: { get: () => 'text/html' },
      text: async () => html,
    });
  }

  test('refuses to read a response that redirected off-origin', async () => {
    stubFetch({ url: 'https://evil.example/docs/a' });
    engine.parseInOffscreen = async () => ({ markdown: '# leaked', title: 'x' });

    await engine.processUrl('https://example.com/docs/a', 0);

    assert.deepEqual(saved, []);
  });

  test('does not save a rendered page when the crawl is paused mid-render', async () => {
    const shell =
      '<html><head><script src="/app.js"></script></head>' +
      '<body><div id="root"></div></body></html>';
    stubFetch({ url: 'https://example.com/docs/a', html: shell });
    engine.parseInOffscreen = async () => ({ markdown: '# source', title: 'x' });
    engine._renderInTab = async () => {
      engine.status = 'paused';
      return '<html><body><main><p>hydrated</p></main></body></html>';
    };

    await engine.processUrl('https://example.com/docs/a', 0);

    assert.deepEqual(saved, []);
    assert.deepEqual(engine.discoveryQueue, [
      { url: 'https://example.com/docs/a', depth: 0 },
    ]);
  });

  test('keeps the source parse when the rendered parse rejects', async () => {
    const shell =
      '<html><head><script src="/app.js"></script></head>' +
      '<body><div id="root"></div></body></html>';
    stubFetch({ url: 'https://example.com/docs/a', html: shell });
    engine._renderInTab = async () => '<html><body><main><p>hydrated</p></main></body></html>';
    let call = 0;
    engine.parseInOffscreen = async () => {
      call += 1;
      if (call === 2) throw new Error('offscreen died');
      return { markdown: '# source', title: 'Source', links: [] };
    };

    await engine.processUrl('https://example.com/docs/a', 0);

    assert.deepEqual(saved, ['# source']);
  });

  test('_renderOnce refuses to serialize a tab that navigated off-origin', async () => {
    installChrome({
      get: async () => ({
        id: 7,
        url: 'https://evil.example/steal',
        status: 'complete',
      }),
    });
    let injected = false;
    global.chrome.scripting.executeScript = async () => {
      injected = true;
      return [{ result: '<html></html>' }];
    };

    await assert.rejects(
      engine._renderOnce('https://example.com/docs/a', null),
      /off-origin/,
    );
    assert.equal(injected, false);
  });

  test('_renderOnce re-checks the origin inside the injected function', async () => {
    installChrome();
    let injected = null;
    global.chrome.scripting.executeScript = async (options) => {
      injected = options;
      return [{ result: options.func(...options.args) }];
    };
    global.window = { location: { origin: 'https://example.com' } };
    global.document = { documentElement: { outerHTML: '<html>ok</html>' } };

    try {
      const html = await engine._renderOnce('https://example.com/docs/a', null);

      assert.equal(html, '<html>ok</html>');
      assert.deepEqual(injected.args, ['https://example.com']);

      // Simulate a navigation during the hydration delay: the injected function
      // runs in the page context and must refuse to hand back the DOM.
      global.window.location.origin = 'https://evil.example';
      const [res] = await global.chrome.scripting.executeScript(injected);
      assert.equal(res.result, null);
    } finally {
      delete global.window;
      delete global.document;
    }
  });

  test('_renderOnce reports an off-origin failure instead of returning DOM', async () => {
    installChrome();
    global.chrome.scripting.executeScript = async () => [{ result: null }];

    await assert.rejects(
      engine._renderOnce('https://example.com/docs/a', null),
      /origin check failed/,
    );
  });

  test('_renderOnce aborts a pending render when the crawl stops', async () => {
    installChrome({
      // Never reports complete: only the abort signal can end the wait.
      get: async () => ({ id: 7, url: 'https://example.com/docs/a', status: 'loading' }),
    });

    const controller = new AbortController();
    const pending = engine._renderOnce('https://example.com/docs/a', controller.signal);
    controller.abort();

    await assert.rejects(pending, (err) => err.name === 'AbortError');
  });

  test('_stillRunning re-queues on pause but not on stop', async () => {
    engine.status = 'paused';
    assert.equal(await engine._stillRunning('https://example.com/docs/a', 1), false);
    assert.deepEqual(engine.discoveryQueue, [
      { url: 'https://example.com/docs/a', depth: 1 },
    ]);

    engine.discoveryQueue = [];
    engine.status = 'stopped';
    assert.equal(await engine._stillRunning('https://example.com/docs/b', 1), false);
    assert.deepEqual(engine.discoveryQueue, []);
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
