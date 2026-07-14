const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  fetchValidatedAsset,
  reserveAssetBytes,
  validateAssetBytes,
  validatePassiveSvg,
} = require('../js/safe-assets.js');

function headers(values) {
  const normalized = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  return { get: (name) => normalized[String(name).toLowerCase()] || null };
}

function response(bytes, contentType, extraHeaders = {}) {
  const data = Uint8Array.from(bytes);
  return {
    ok: true,
    status: 200,
    headers: headers({ 'content-type': contentType, ...extraHeaders }),
    arrayBuffer: async () => data.buffer,
  };
}

describe('safe asset validation', () => {
  test('accepts a PNG by MIME and signature', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.deepEqual(validateAssetBytes(png, 'image/png'), {
      mime: 'image/png',
      extension: '.png',
    });
  });

  test('rejects an executable body advertised as an image', () => {
    assert.throws(
      () => validateAssetBytes(Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]), 'image/png'),
      /signature does not match/,
    );
  });

  test('accepts passive SVG including safe inline styles and rejects active SVG', () => {
    const passive = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
    assert.deepEqual(validateAssetBytes(passive, 'image/svg+xml; charset=utf-8'), {
      mime: 'image/svg+xml',
      extension: '.svg',
    });

    const styledGradient = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g">' +
      '<stop style="stop-color:#06b6d4;stop-opacity:1"/></linearGradient></defs>' +
      '<rect fill="url(#g)" width="10" height="10"/></svg>',
    );
    assert.deepEqual(validateAssetBytes(styledGradient, 'image/svg+xml'), {
      mime: 'image/svg+xml',
      extension: '.svg',
    });

    const internalStylesheet = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><filter id="glow">' +
      '<feGaussianBlur stdDeviation="6"/></filter><style>' +
      '.box{fill:#38bdf8}.glow{filter:url(#glow)}' +
      '</style></defs><rect class="box glow" width="10" height="10"/></svg>',
    );
    assert.deepEqual(validateAssetBytes(internalStylesheet, 'image/svg+xml'), {
      mime: 'image/svg+xml',
      extension: '.svg',
    });

    const scripted = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.throws(() => validatePassiveSvg(scripted), /active or external content/);

    const remote = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.test/a.svg#x"/></svg>');
    assert.throws(() => validatePassiveSvg(remote), /active or external content/);

    const styled = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://evil.test/a)"/></svg>');
    assert.throws(() => validatePassiveSvg(styled), /active or external content/);

    const importedStyle = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://evil.test/a.css";</style></svg>');
    assert.throws(() => validatePassiveSvg(importedStyle), /active or external content/);

    const encodedImport = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><style>&#64;import "https://evil.test/a.css";</style></svg>');
    assert.throws(() => validatePassiveSvg(encodedImport), /active or external content/);

    const svgDataUrlCss = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(data:image/svg+xml,%3Csvg onload=alert(1)%3E)"/></svg>');
    assert.throws(() => validatePassiveSvg(svgDataUrlCss), /active or external content/);
  });

  test('reserves the session budget atomically', () => {
    const budget = { used: 40 };
    reserveAssetBytes(budget, 10, 50);
    assert.equal(budget.used, 50);
    assert.throws(() => reserveAssetBytes(budget, 1, 50), /budget exceeded/);
    assert.equal(budget.used, 50);
  });
});

describe('safe asset fetch', () => {
  test('omits credentials, rejects redirects and derives extension from MIME', async () => {
    const calls = [];
    const result = await fetchValidatedAsset('https://example.com/payload.exe', {
      permissionCheck: async () => true,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return response([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png');
      },
    });
    assert.equal(calls[0].options.credentials, 'omit');
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(result.extension, '.png');
    assert.match(result.dataUrl, /^data:image\/png;base64,/);
  });

  test('refuses an unauthorized origin before fetching', async () => {
    let fetched = false;
    await assert.rejects(
      fetchValidatedAsset('https://cdn.example.com/image.png', {
        permissionCheck: async () => false,
        fetchImpl: async () => { fetched = true; },
      }),
      /Origin is not authorized/,
    );
    assert.equal(fetched, false);
  });

  test('enforces declared and actual size limits', async () => {
    await assert.rejects(
      fetchValidatedAsset('https://example.com/image.png', {
        maxBytes: 8,
        permissionCheck: async () => true,
        fetchImpl: async () => response(
          [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
          'image/png',
          { 'content-length': '9' },
        ),
      }),
      /size limit/,
    );
  });

  test('stops a streamed response as soon as the limit is exceeded', async () => {
    let cancelled = false;
    const chunks = [Uint8Array.from([1, 2, 3, 4]), Uint8Array.from([5, 6, 7, 8, 9])];
    await assert.rejects(
      fetchValidatedAsset('https://example.com/image.png', {
        maxBytes: 8,
        permissionCheck: async () => true,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: headers({ 'content-type': 'image/png' }),
          body: {
            getReader: () => ({
              read: async () => chunks.length ? { done: false, value: chunks.shift() } : { done: true },
              cancel: async () => { cancelled = true; },
            }),
          },
        }),
      }),
      /size limit/,
    );
    assert.equal(cancelled, true);
  });
});
