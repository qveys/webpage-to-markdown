const {
  mergeSettings,
  prependYamlFrontmatter,
  stripPreviewLeadingHeading,
  defaults,
} = require('../js/markdown-output.js');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

describe('markdown-output', () => {
  test('mergeSettings fills defaults', () => {
    assert.deepEqual(mergeSettings({}), defaults);
    assert.equal(mergeSettings({ frontmatter: true }).frontmatter, true);
  });

  test('stripPreviewLeadingHeading removes yaml then first ATX h1', () => {
    const body = '# Tab title\n\nHello';
    assert.equal(stripPreviewLeadingHeading(body), 'Hello');
    const withFm = '---\ntitle: "x"\n---\n\n# Tab title\n\nHi';
    assert.equal(stripPreviewLeadingHeading(withFm), 'Hi');
  });

  test('stripPreviewLeadingHeading strips a BOM-prefixed leading H1', () => {
    const body = '﻿# Tab title\n\nHello';
    assert.equal(stripPreviewLeadingHeading(body), 'Hello');
  });

  test('stripPreviewLeadingHeading does not strip an in-body H1', () => {
    const body = 'Some intro paragraph\n\n# Section heading\n\nMore text';
    assert.equal(stripPreviewLeadingHeading(body),
      'Some intro paragraph\n\n# Section heading\n\nMore text'
    );
  });

  test('stripPreviewLeadingHeading keeps H1 when content begins with a non-heading line', () => {
    const body = 'Lead-in line.\n# Not the leading heading\nTrailing';
    assert.equal(stripPreviewLeadingHeading(body),
      'Lead-in line.\n# Not the leading heading\nTrailing'
    );
  });

  test('prependYamlFrontmatter escapes quotes in title and url', () => {
    const out = prependYamlFrontmatter('body', 'Say "hi"', 'https://x.com/a?b=1');
    assert.match(out, /^---\n/);
    assert.ok(out.includes('title: "Say \\"hi\\""'));
    assert.ok(out.includes('url: "https://x.com/a?b=1"'));
    assert.match(out, /\n---\n\nbody$/);
  });
});
