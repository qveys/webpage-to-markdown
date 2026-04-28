/**
 * Shared Markdown output defaults and post-processing (popup, service worker, tests).
 */
(function (global) {
  'use strict';

  var W2M = global.W2M || {};
  global.W2M = W2M;

  var defaults = {
    frontmatter: false,
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced'
  };

  function mergeSettings(stored) {
    return Object.assign({}, defaults, stored || {});
  }

  function yamlEscapeDoubleQuoted(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * Prepends YAML front matter (title, url, date). Caller enables via markdownSettings.frontmatter.
   */
  function prependYamlFrontmatter(markdown, title, pageUrl) {
    var date = new Date().toISOString().split('T')[0];
    var fm =
      '---\n' +
      'title: "' + yamlEscapeDoubleQuoted(title || '') + '"\n' +
      'url: "' + yamlEscapeDoubleQuoted(pageUrl || '') + '"\n' +
      'date: ' + date + '\n' +
      '---\n\n';
    return fm + markdown;
  }

  /**
   * Side panel single-page preview: skip YAML block then first ATX H1 (duplicate tab title).
   */
  function stripPreviewLeadingHeading(markdown) {
    var s = markdown || '';
    if (/^---\s*\r?\n/.test(s)) {
      var fm = s.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/);
      if (fm) s = s.slice(fm[0].length);
    }
    s = s.replace(/^#\s[^\n\r]*(\r?\n|$)/m, '');
    s = s.replace(/^\s+/, '');
    return s;
  }

  var api = {
    defaults: defaults,
    mergeSettings: mergeSettings,
    prependYamlFrontmatter: prependYamlFrontmatter,
    stripPreviewLeadingHeading: stripPreviewLeadingHeading
  };

  W2M.markdownOutput = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof self !== 'undefined' ? self : typeof global !== 'undefined' ? global : this);
