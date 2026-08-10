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

  test('strips Copy page and feedback chrome', () => {
    const input =
      '# Title\n\nCopy pageCopy page\n\nHello world this is real content here.\n\nWas this page helpful?\n\nYesNo\n\n⌘I';
    const result = cleanupMarkdown(input);
    assert.equal(result.includes('Copy page'), false);
    assert.equal(result.includes('Was this page helpful'), false);
    assert.equal(result.includes('YesNo'), false);
    assert.match(result, /Hello world/);
  });

  test('unwraps card-style [## Title\\n\\nDesc](url) links', () => {
    const input =
      '[## Workspace API tokens\n\nCreate a token.](/api/workspace-api-tokens)';
    const result = cleanupMarkdown(input);
    assert.equal(
      result,
      '[Workspace API tokens](/api/workspace-api-tokens) — Create a token.',
    );
  });

  test('drops empty ZWSP permalink anchors', () => {
    const input = '[​](#base-url)\n\n## Base URL';
    const result = cleanupMarkdown(input);
    assert.equal(result.includes('](#'), false);
    assert.match(result, /## Base URL/);
  });

  test('dedupes site-title then page H1', () => {
    const input =
      '# CodeRabbit Documentation - AI reviews\n\n# CodeRabbit API\n\nBody.';
    const result = cleanupMarkdown(input);
    assert.equal(result.startsWith('# CodeRabbit API'), true);
    assert.equal(result.includes('Documentation'), false);
  });

  test('dedupes site-title H1 with breadcrumb before page H1', () => {
    const input =
      '# CodeRabbit Documentation - AI code reviews on pull requests, IDE, and CLI\n\n' +
      '[CodeRabbit API](/api/index)\n\n# CodeRabbit API\n\nBody text here.';
    const result = cleanupMarkdown(input);
    assert.equal(result.startsWith('# CodeRabbit API\n'), true);
    assert.equal(result.includes('Documentation'), false);
    assert.equal(result.includes('[CodeRabbit API](/api/index)'), false);
  });

  test('strips Enterprise Plan badge glued to paragraph', () => {
    const input =
      'Enterprise Plan The CodeRabbit API provides programmatic access.';
    const result = cleanupMarkdown(input);
    assert.equal(result.includes('Enterprise Plan'), false);
    assert.match(result, /^The CodeRabbit API/);
  });

  test('strips trailing pipe residue on headings and lone pipe lines', () => {
    const input =
      '## Fix CI delivery options |\n\n|\n\nBody paragraph here.';
    const result = cleanupMarkdown(input);
    assert.equal(result.includes('|'), false);
    assert.match(result, /^## Fix CI delivery options\n/);
    assert.match(result, /Body paragraph here/);
  });
});
