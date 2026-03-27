const fs = require('fs');
const vm = require('vm');
const path = require('path');

let urlToPath;

beforeAll(() => {
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
    expect(result.dirs).toEqual(['example.com', 'docs', 'api']);
    expect(result.filename).toBe('intro');
  });

  test('includes query params in filename', () => {
    const result = urlToPath('https://example.com/page?tab=ios&ref=1');
    expect(result.filename).toContain('page');
    expect(result.filename).toContain('--');
    expect(result.filename).toContain('tab');
    expect(result.filename).toContain('ios');
  });

  test('returns fallback for invalid URL', () => {
    const result = urlToPath('not a url');
    expect(result.dirs).toEqual([]);
    expect(result.filename).toBe('page');
  });

  test('root path returns index as filename', () => {
    const result = urlToPath('https://example.com/');
    expect(result.dirs).toEqual(['example.com']);
    expect(result.filename).toBe('index');
  });

  test('hostname with special chars is cleaned', () => {
    const result = urlToPath('https://my-site.example.com/about');
    expect(result.dirs[0]).toBe('my-site.example.com');
    expect(result.filename).toBe('about');
  });
});
