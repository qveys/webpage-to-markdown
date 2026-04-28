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

  test('prependYamlFrontmatter escapes quotes in title and url', () => {
    const out = prependYamlFrontmatter('body', 'Say "hi"', 'https://x.com/a?b=1');
    expect(out).toMatch(/^---\n/);
    expect(out).toContain('title: "Say \\"hi\\""');
    expect(out).toContain('url: "https://x.com/a?b=1"');
    expect(out).toMatch(/\n---\n\nbody$/);
  });
});
