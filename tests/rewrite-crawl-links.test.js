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
      'See [Metrics](https://docs.coderabbit.ai/api-reference/metrics-data-api) please.';
    // urlToPath(/api) → docs.coderabbit.ai/api.md (fromDir = docs.coderabbit.ai)
    const pageUrl = 'https://docs.coderabbit.ai/api';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    assert.match(out, /\]\(api-reference\/metrics-data-api\.md\)/);
    assert.doesNotMatch(out, /https:\/\/docs\.coderabbit\.ai/);
  });

  test('preserves URL hash fragments', () => {
    const md =
      'Jump [here](https://docs.coderabbit.ai/cli/reference#commands).';
    const pageUrl = 'https://docs.coderabbit.ai/cli';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    assert.match(out, /\]\(cli\/reference\.md#commands\)/);
  });

  test('leaves cross-host links unchanged', () => {
    const md = 'Go [elsewhere](https://example.com/docs/page).';
    const pageUrl = 'https://docs.coderabbit.ai/api';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    assert.equal(out, md);
  });

  test('nested page remaps sibling correctly', () => {
    // page: docs.coderabbit.ai/api/index.md (url ends with /api or /api/)
    const md =
      'Open [ref](https://docs.coderabbit.ai/api-reference/metrics-data-api).';
    const pageUrl = 'https://docs.coderabbit.ai/api/workspace-api-tokens';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    // from docs.coderabbit.ai/api/workspace-api-tokens.md
    // to   docs.coderabbit.ai/api-reference/metrics-data-api.md
    assert.match(out, /\]\(\.\.\/api-reference\/metrics-data-api\.md\)/);
  });

  test('same-directory link uses ./ or bare filename', () => {
    const md =
      'See [tokens](https://docs.coderabbit.ai/api/workspace-api-tokens).';
    const pageUrl = 'https://docs.coderabbit.ai/api/other-page';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    assert.match(out, /\]\(workspace-api-tokens\.md\)/);
  });

  test('handles empty / invalid input', () => {
    assert.equal(rewriteCrawlLinks('', 'https://a.com/x', urlToPath), '');
    assert.equal(rewriteCrawlLinks('hi', 'not-a-url', urlToPath), 'hi');
  });

  test('rewrites root-relative same-host links', () => {
    const md =
      'See [Metrics](/api-reference/metrics-data-api) and [ext](https://example.com/x).';
    const pageUrl = 'https://docs.coderabbit.ai/api';
    const out = rewriteCrawlLinks(md, pageUrl, urlToPath);
    assert.match(out, /\]\(api-reference\/metrics-data-api\.md\)/);
    assert.match(out, /\]\(https:\/\/example\.com\/x\)/);
  });

  test('absolutizeMarkdownLinks expands root-relative hrefs', () => {
    const md = 'See [Tokens](/api/workspace-api-tokens) please.';
    const out = globalThis.W2M.absolutizeMarkdownLinks(
      md,
      'https://docs.coderabbit.ai/api',
    );
    assert.equal(
      out,
      'See [Tokens](https://docs.coderabbit.ai/api/workspace-api-tokens) please.',
    );
  });
});
