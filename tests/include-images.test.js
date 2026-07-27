const {
  defaults,
  mergeSettings,
} = require('../js/markdown-output.js');

describe('includeImages — defaults', () => {
  test('includeImages defaults to true', () => {
    expect(defaults.includeImages).toBe(true);
  });

  test('mergeSettings preserves includeImages when not overridden', () => {
    expect(mergeSettings({}).includeImages).toBe(true);
  });

  test('mergeSettings respects includeImages: false', () => {
    expect(mergeSettings({ includeImages: false }).includeImages).toBe(false);
  });
});

describe('includeImages — turndown rules (mock)', () => {
  let rules;

  function buildRules(settings) {
    rules = [];
    var kept = [];
    var mockService = {
      addRule: function (name, rule) {
        rules.push({ name: name, filter: rule.filter, replacement: rule.replacement });
      },
      keep: function (tags) { kept = kept.concat(tags); },
    };

    var includeImages = settings.includeImages !== false;

    mockService.addRule('figures', {
      filter: 'figure',
      replacement: function (content, node) {
        if (!includeImages) {
          var caption = node.querySelector('figcaption');
          return caption ? caption.textContent : '';
        }
        var img = node.querySelector('img');
        var figCaption = node.querySelector('figcaption');
        if (img) {
          var alt = img.getAttribute('alt') || '';
          var src = img.getAttribute('src') || '';
          var captionText = figCaption ? figCaption.textContent : '';
          return '\n\n![' + alt + '](' + src + ')\n' + captionText + '\n\n';
        }
        return content;
      },
    });

    if (!includeImages) {
      mockService.addRule('stripImages', {
        filter: 'img',
        replacement: function () { return ''; },
      });
    }

    return { rules: rules, kept: kept };
  }

  test('does not add stripImages rule by default', () => {
    buildRules({});
    var names = rules.map(function (r) { return r.name; });
    expect(names).not.toContain('stripImages');
  });

  test('does not add stripImages rule when includeImages is true', () => {
    buildRules({ includeImages: true });
    var names = rules.map(function (r) { return r.name; });
    expect(names).not.toContain('stripImages');
  });

  test('adds stripImages rule when includeImages is false', () => {
    buildRules({ includeImages: false });
    var names = rules.map(function (r) { return r.name; });
    expect(names).toContain('stripImages');
  });

  test('stripImages replacement returns empty string', () => {
    buildRules({ includeImages: false });
    var strip = rules.find(function (r) { return r.name === 'stripImages'; });
    expect(strip.replacement()).toBe('');
  });

  test('figures rule returns caption only when images excluded', () => {
    buildRules({ includeImages: false });
    var fig = rules.find(function (r) { return r.name === 'figures'; });
    var node = {
      querySelector: function (sel) {
        if (sel === 'figcaption') return { textContent: 'My caption' };
        return null;
      },
    };
    expect(fig.replacement('', node)).toBe('My caption');
  });

  test('figures rule returns empty string when no caption and images excluded', () => {
    buildRules({ includeImages: false });
    var fig = rules.find(function (r) { return r.name === 'figures'; });
    var node = {
      querySelector: function () { return null; },
    };
    expect(fig.replacement('', node)).toBe('');
  });

  test('figures rule produces markdown image when images included', () => {
    buildRules({ includeImages: true });
    var fig = rules.find(function (r) { return r.name === 'figures'; });
    var node = {
      querySelector: function (sel) {
        if (sel === 'img') return { getAttribute: function (a) { return a === 'alt' ? 'photo' : 'img.jpg'; } };
        if (sel === 'figcaption') return { textContent: 'A photo' };
        return null;
      },
    };
    var result = fig.replacement('', node);
    expect(result).toContain('![photo](img.jpg)');
    expect(result).toContain('A photo');
  });
});
