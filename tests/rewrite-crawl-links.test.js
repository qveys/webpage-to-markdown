const vm = require('vm');
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./setup/load-module');

let rewriteCrawlLinks;
let urlToPath;

before(() => {
  vm.runInThisContext('var self = globalThis; var window = globalThis; window.W2M = window.W2M || {};');
  loadModule('js/rewrite-crawl-links.js');
  rewriteCrawlLinks = globalThis.W2M.rewriteCrawlLinks;

  const fs = require('fs');
  const path = require('path');
  const bgCode = fs.readFileSync(
    path.resolve(__dirname, '../js/background.js'),
    'utf8',
  );
  const match = bgCode.match(/function urlToPath\(pageUrl\)\s*\{[\s\S]*?\n\}/);
  if (!match) throw new Error('Could not extract urlToPath from background.js');
  vm.runInThisContext('var urlToPath = ' + match[0]);
  urlToPath = vm.runInThisContext('urlToPath');
});

describe('rewriteCrawlLinks', () => {
  test('rewrites same-host links to relative .md paths', () => {
    const md =
      'See [Metrics](https://docs.example.test/api-reference/metrics-data-api) please.';
    // urlToPath(/api) → docs.example.test/api.md (fromDir = docs.example.test)
    const pageUrl = 'https://docs.example.test/api';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    assert.match(out, /\]\(api-reference\/metrics-data-api\.md\)/);
    assert.doesNotMatch(out, /https:\/\/docs\.example\.test/);
  });

  test('preserves URL hash fragments', () => {
    const md =
      'Jump [here](https://docs.example.test/cli/reference#commands).';
    const pageUrl = 'https://docs.example.test/cli';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    assert.match(out, /\]\(cli\/reference\.md#commands\)/);
  });

  test('leaves cross-host links unchanged', () => {
    const md = 'Go [elsewhere](https://other.example/docs/page).';
    const pageUrl = 'https://docs.example.test/api';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    assert.equal(out, md);
  });

  test('nested page remaps sibling correctly', () => {
    // page: docs.example.test/api/tokens.md
    const md =
      'Open [ref](https://docs.example.test/api-reference/metrics-data-api).';
    const pageUrl = 'https://docs.example.test/api/tokens';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    // from docs.example.test/api/tokens.md
    // to   docs.example.test/api-reference/metrics-data-api.md
    assert.match(out, /\]\(\.\.\/api-reference\/metrics-data-api\.md\)/);
  });

  test('same-directory link uses ./ or bare filename', () => {
    const md =
      'See [tokens](https://docs.example.test/api/tokens).';
    const pageUrl = 'https://docs.example.test/api/other-page';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    assert.match(out, /\]\(tokens\.md\)/);
  });

  test('does not rewrite image sources to .md paths', () => {
    const md =
      'Diagram: ![Flow](https://docs.example.test/assets/flow.png) and [docs](https://docs.example.test/guide).';
    const pageUrl = 'https://docs.example.test/api';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    assert.match(out, /!\[Flow\]\(https:\/\/docs\.example\.test\/assets\/flow\.png\)/);
    assert.match(out, /\[docs\]\(guide\.md\)/);
  });

  test('handles empty / invalid input', () => {
    assert.equal(rewriteCrawlLinks('', 'https://a.com/x', urlToPath), '');
    assert.equal(rewriteCrawlLinks('hi', 'not-a-url', urlToPath), 'hi');
  });

  test('rewrites root-relative same-host links', () => {
    const md =
      'See [Metrics](/api-reference/metrics-data-api) and [ext](https://other.example/x).';
    const pageUrl = 'https://docs.example.test/api';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    assert.match(out, /\]\(api-reference\/metrics-data-api\.md\)/);
    assert.match(out, /\]\(https:\/\/other\.example\/x\)/);
  });

  test('absolutizeMarkdownLinks expands root-relative hrefs', () => {
    const md = 'See [Tokens](/api/tokens) please.';
    const out = globalThis.W2M.absolutizeMarkdownLinks(
      md,
      'https://docs.example.test/api',
    );
    assert.equal(
      out,
      'See [Tokens](https://docs.example.test/api/tokens) please.',
    );
  });
});
