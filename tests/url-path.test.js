const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');

let urlToPath;

before(() => {
  const bgCode = fs.readFileSync(
    path.resolve(__dirname, '../js/background.js'),
    'utf8',
  );
  const match = bgCode.match(/function urlToPath\(pageUrl\)\s*\{[\s\S]*?\n\}/);
  if (!match) throw new Error('Could not extract urlToPath from background.js');
  // Declare the function in the vm global scope
  vm.runInThisContext('var urlToPath = ' + match[0]);
  urlToPath = vm.runInThisContext('urlToPath');
});

describe('urlToPath', () => {
  test('splits a multi-segment URL into dirs and filename', () => {
    const result = urlToPath('https://example.com/docs/api/intro');
    assert.deepEqual(result.dirs, ['example.com', 'docs', 'api']);
    assert.equal(result.filename, 'intro');
  });

  test('includes query params in filename', () => {
    const result = urlToPath('https://example.com/page?tab=ios&ref=1');
    assert.ok(result.filename.includes('page'));
    assert.ok(result.filename.includes('--'));
    assert.ok(result.filename.includes('tab'));
    assert.ok(result.filename.includes('ios'));
  });

  test('returns fallback for invalid URL', () => {
    const result = urlToPath('not a url');
    assert.deepEqual(result.dirs, []);
    assert.equal(result.filename, 'page');
  });

  test('root path returns index as filename', () => {
    const result = urlToPath('https://example.com/');
    assert.deepEqual(result.dirs, ['example.com']);
    assert.equal(result.filename, 'index');
  });

  test('hostname with special chars is cleaned', () => {
    const result = urlToPath('https://my-site.example.com/about');
    assert.equal(result.dirs[0], 'my-site.example.com');
    assert.equal(result.filename, 'about');
  });
});
