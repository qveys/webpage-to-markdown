const {
  mergeSettings,
  prependYamlFrontmatter,
  stripPreviewLeadingHeading,
  defaults,
} = require('../js/markdown-output.js');

describe('markdown-output', () => {
  test('mergeSettings fills defaults', () => {
    expect(mergeSettings({})).toEqual(defaults);
    expect(mergeSettings({ frontmatter: true }).frontmatter).toBe(true);
  });

  test('stripPreviewLeadingHeading removes yaml then first ATX h1', () => {
    const body = '# Tab title\n\nHello';
    expect(stripPreviewLeadingHeading(body)).toBe('Hello');
    const withFm = '---\ntitle: "x"\n---\n\n# Tab title\n\nHi';
    expect(stripPreviewLeadingHeading(withFm)).toBe('Hi');
  });

  test('stripPreviewLeadingHeading strips a BOM-prefixed leading H1', () => {
    const body = '﻿# Tab title\n\nHello';
    expect(stripPreviewLeadingHeading(body)).toBe('Hello');
  });

  test('stripPreviewLeadingHeading does not strip an in-body H1', () => {
    const body = 'Some intro paragraph\n\n# Section heading\n\nMore text';
    expect(stripPreviewLeadingHeading(body)).toBe(
      'Some intro paragraph\n\n# Section heading\n\nMore text'
    );
  });

  test('stripPreviewLeadingHeading keeps H1 when content begins with a non-heading line', () => {
    const body = 'Lead-in line.\n# Not the leading heading\nTrailing';
    expect(stripPreviewLeadingHeading(body)).toBe(
      'Lead-in line.\n# Not the leading heading\nTrailing'
    );
  });

  test('prependYamlFrontmatter escapes quotes in title and url', () => {
    const out = prependYamlFrontmatter('body', 'Say "hi"', 'https://x.com/a?b=1');
    expect(out).toMatch(/^---\n/);
    expect(out).toContain('title: "Say \\"hi\\""');
    expect(out).toContain('url: "https://x.com/a?b=1"');
    expect(out).toMatch(/\n---\n\nbody$/);
  });
});
