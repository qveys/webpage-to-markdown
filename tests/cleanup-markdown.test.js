const vm = require('vm');
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./setup/load-module');

let cleanupMarkdown;

before(() => {
  vm.runInThisContext('var window = globalThis; window.W2M = window.W2M || {};');
  loadModule('js/cleanup-markdown.js');
  const W2M_real = vm.runInThisContext('window.W2M');
  cleanupMarkdown = W2M_real.cleanupMarkdown;
});

describe('cleanupMarkdown', () => {
  test('compacts excessive blank lines', () => {
    const input = 'Hello\n\n\n\n\nWorld';
    const result = cleanupMarkdown(input);
    assert.equal(result, 'Hello\n\nWorld');
  });

  test('preserves single blank line between paragraphs', () => {
    const input = 'First paragraph.\n\nSecond paragraph.';
    const result = cleanupMarkdown(input);
    assert.equal(result, 'First paragraph.\n\nSecond paragraph.');
  });

  test('recovers headings from separated hash and text', () => {
    const input = '##\n\nHeading text here\n\nParagraph.';
    const result = cleanupMarkdown(input);
    assert.equal(result, '## Heading text here\n\nParagraph.');
  });

  test('removes X page title "# X"', () => {
    const input = '# X\n\nSome content here.';
    const result = cleanupMarkdown(input);
    assert.equal(result, 'Some content here.');
  });

  test('removes orphan noise blocks (4+ consecutive short lines)', () => {
    const input = 'This is a real paragraph with enough length to survive.\n\nJohn\n@john\n2h ago\nLike\nShare\n\nAnother real paragraph with enough length to survive.';
    const result = cleanupMarkdown(input);
    assert.equal(result, 'This is a real paragraph with enough length to survive.\n\nAnother real paragraph with enough length to survive.');
  });

  test('preserves code blocks untouched', () => {
    const input = '```\nfunction foo() {\n  return 1;\n}\n```';
    const result = cleanupMarkdown(input);
    assert.equal(result, '```\nfunction foo() {\n  return 1;\n}\n```');
  });

  test('handles empty input', () => {
    const result = cleanupMarkdown('');
    assert.equal(result, '');
  });

  test('handles null/undefined input', () => {
    assert.equal(cleanupMarkdown(null), '');
    assert.equal(cleanupMarkdown(undefined), '');
  });
});
