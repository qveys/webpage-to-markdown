const vm = require('vm');
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadModule } = require('./setup/load-module');

/**
 * Minimal DOM sufficient for html-preprocess.js (no jsdom dependency).
 */
function createMiniDom(html) {
  function parseAttrs(str) {
    const attrs = {};
    const re = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let m;
    while ((m = re.exec(str || ''))) {
      attrs[m[1]] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    }
    return attrs;
  }

  class Node {
    constructor() {
      this.parentNode = null;
      this.childNodes = [];
      this.nodeType = 1;
    }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    removeChild(child) {
      const i = this.childNodes.indexOf(child);
      if (i >= 0) {
        this.childNodes.splice(i, 1);
        child.parentNode = null;
      }
      return child;
    }
    replaceChild(next, old) {
      const i = this.childNodes.indexOf(old);
      if (i < 0) throw new Error('old not found');
      old.parentNode = null;
      next.parentNode = this;
      this.childNodes[i] = next;
      return old;
    }
    insertBefore(next, ref) {
      if (next.parentNode) next.parentNode.removeChild(next);
      if (!ref) return this.appendChild(next);
      const i = this.childNodes.indexOf(ref);
      if (i < 0) return this.appendChild(next);
      next.parentNode = this;
      this.childNodes.splice(i, 0, next);
      return next;
    }
    get nextSibling() {
      if (!this.parentNode) return null;
      const i = this.parentNode.childNodes.indexOf(this);
      return i >= 0 ? this.parentNode.childNodes[i + 1] || null : null;
    }
    insertBefore(next, ref) {
      if (next.parentNode) next.parentNode.removeChild(next);
      if (!ref) return this.appendChild(next);
      const i = this.childNodes.indexOf(ref);
      if (i < 0) return this.appendChild(next);
      next.parentNode = this;
      this.childNodes.splice(i, 0, next);
      return next;
    }
    get children() {
      return this.childNodes.filter((c) => c.nodeType === 1);
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    get textContent() {
      if (this.nodeType === 3) return this.data || '';
      return this.childNodes.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      this.childNodes = [];
      if (v) {
        const t = new TextNode(String(v));
        this.appendChild(t);
      }
    }
  }

  class TextNode extends Node {
    constructor(data) {
      super();
      this.nodeType = 3;
      this.data = data;
    }
  }

  class CommentNode extends Node {
    constructor(data) {
      super();
      this.nodeType = 8;
      this.nodeValue = data;
      this.data = data;
    }
    get textContent() {
      return '';
    }
  }

  class Element extends Node {
    constructor(tagName, attrs) {
      super();
      this.tagName = String(tagName).toUpperCase();
      this.nodeName = this.tagName;
      this.attrs = attrs || {};
      this.className = this.attrs.class || '';
    }
    getAttribute(name) {
      if (name === 'class') return this.className;
      return this.attrs[name] != null ? this.attrs[name] : null;
    }
    setAttribute(name, value) {
      this.attrs[name] = String(value);
      if (name === 'class') this.className = String(value);
    }
    removeAttribute(name) {
      delete this.attrs[name];
      if (name === 'class') this.className = '';
      if (name === 'aria-hidden') delete this.attrs['aria-hidden'];
    }
    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1
        ? this.parentNode
        : null;
    }
    get isConnected() {
      let n = this;
      while (n.parentNode) n = n.parentNode;
      return n.nodeType === 9;
    }
    matches(selector) {
      if (!selector) return false;
      // comma lists handled by caller
      if (selector.includes(',')) {
        return selector.split(',').map((s) => s.trim()).some((p) => this.matches(p));
      }
      if (selector.startsWith('#') && !selector.includes(' ')) {
        return this.getAttribute('id') === selector.slice(1);
      }
      if (selector === 'pre') return this.tagName === 'PRE';
      if (selector === 'code') return this.tagName === 'CODE';
      if (selector === 'h1') return this.tagName === 'H1';
      if (selector === 'h2') return this.tagName === 'H2';
      if (selector === 'h3') return this.tagName === 'H3';
      if (selector === 'h4') return this.tagName === 'H4';
      if (selector === 'a') return this.tagName === 'A';
      if (selector === 'main') return this.tagName === 'MAIN';
      if (selector === 'a[href]') {
        return this.tagName === 'A' && !!this.getAttribute('href');
      }
      if (selector === 'a[href][aria-hidden="true"]') {
        return (
          this.tagName === 'A' &&
          !!this.getAttribute('href') &&
          this.getAttribute('aria-hidden') === 'true'
        );
      }
      if (selector === '[aria-hidden="true"]') {
        return this.getAttribute('aria-hidden') === 'true';
      }
      if (selector === '[data-page-title]') {
        return this.getAttribute('data-page-title') != null;
      }
      if (selector === "[role='main']" || selector === '[role="main"]') {
        return this.getAttribute('role') === 'main';
      }
      if (selector === 'pre, code') {
        return this.tagName === 'PRE' || this.tagName === 'CODE';
      }
      if (selector === '.card') {
        return /\bcard\b/.test(this.className || '');
      }
      if (selector === 'span[data-as="p"]') {
        return this.tagName === 'SPAN' && this.getAttribute('data-as') === 'p';
      }
      if (selector === '[data-as="p"]') {
        return this.getAttribute('data-as') === 'p';
      }
      if (selector === 'p') {
        return this.tagName === 'P';
      }
      if (selector === 'button') {
        return this.tagName === 'BUTTON';
      }
      if (selector === '[data-badge]' || selector === '[data-badge="true"]') {
        return this.getAttribute('data-badge') != null;
      }
      if (selector === 'h1, h2, h3, h4') {
        return /^(H1|H2|H3|H4)$/.test(this.tagName);
      }
      if (selector.startsWith('[data-component-part=')) {
        const m = selector.match(/^\[data-component-part=["']?([^"'\]]+)["']?\]$/);
        if (!m) return false;
        return this.getAttribute('data-component-part') === m[1];
      }
      // Compound: [data-component-part="card-title"], h2, h3, h4
      if (selector.includes('[data-component-part="card-title"]')) {
        return this.matches('[data-component-part="card-title"]') || this.matches('h2') || this.matches('h3') || this.matches('h4');
      }
      if (selector.includes('[data-component-part="card-content"]')) {
        return this.getAttribute('data-component-part') === 'card-content';
      }
      if (selector.startsWith('h1 a') || selector.startsWith('h2 a')) return false;
      return false;
    }
    querySelector(selector) {
      const all = this.querySelectorAll(selector);
      return all[0] || null;
    }
    querySelectorAll(selector) {
      const out = [];
      const walk = (node) => {
        if (node.nodeType === 1) {
          if (node.matches(selector)) out.push(node);
          // also support compound like "pre, code" already in matches
          if (selector.includes(',')) {
            const parts = selector.split(',').map((s) => s.trim());
            if (parts.some((p) => node.matches(p)) && !out.includes(node)) {
              out.push(node);
            }
          }
          node.childNodes.forEach(walk);
        }
      };
      this.childNodes.forEach(walk);
      // Dedup
      return [...new Set(out)];
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    get innerHTML() {
      return this.childNodes
        .map((c) => {
          if (c.nodeType === 3) return c.data;
          const attrs = Object.keys(c.attrs || {})
            .map((k) => ` ${k}="${c.attrs[k]}"`)
            .join('');
          return `<${c.tagName.toLowerCase()}${attrs}>${c.innerHTML}</${c.tagName.toLowerCase()}>`;
        })
        .join('');
    }
    set innerHTML(html) {
      const frag = parseFragment(String(html || ''), this.ownerDocument || document);
      this.childNodes = [];
      frag.childNodes.slice().forEach((c) => this.appendChild(c));
    }
  }

  class Document extends Node {
    constructor() {
      super();
      this.nodeType = 9;
      this.ownerDocument = this;
    }
    createElement(tag) {
      const el = new Element(tag, {});
      el.ownerDocument = this;
      return el;
    }
    createTextNode(data) {
      const t = new TextNode(String(data));
      t.ownerDocument = this;
      return t;
    }
    createComment(data) {
      const c = new CommentNode(String(data));
      c.ownerDocument = this;
      return c;
    }
    querySelectorAll(selector) {
      const out = [];
      const walk = (node) => {
        if (node.nodeType === 1) {
          if (selector.includes(',')) {
            const parts = selector.split(',').map((s) => s.trim());
            if (parts.some((p) => node.matches(p))) out.push(node);
          } else if (node.matches(selector)) {
            out.push(node);
          }
          node.childNodes.forEach(walk);
        }
      };
      this.childNodes.forEach(walk);
      return out;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
  }

  function parseFragment(htmlStr, doc) {
    // Extremely small HTML parser for our fixtures (no nested ambiguity beyond div/pre/code/a/span)
    const root = doc.createElement('div');
    root.ownerDocument = doc;
    const stack = [root];
    const tokenRe = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g;
    let tok;
    while ((tok = tokenRe.exec(htmlStr))) {
      const t = tok[0];
      if (t.startsWith('<!--')) continue;
      if (t.startsWith('</')) {
        const name = t.slice(2, -1).trim().toUpperCase();
        if (stack.length > 1 && stack[stack.length - 1].tagName === name) {
          stack.pop();
        }
        continue;
      }
      if (t.startsWith('<')) {
        const selfClosing = /\/>$/.test(t);
        const m = t.match(/^<([a-zA-Z][\w:-]*)([^>]*)\/?>$/);
        if (!m) continue;
        const tag = m[1];
        const attrs = parseAttrs(m[2]);
        const el = new Element(tag, attrs);
        el.ownerDocument = doc;
        el.className = attrs.class || '';
        stack[stack.length - 1].appendChild(el);
        const voidTags = {
          BR: 1, IMG: 1, HR: 1, INPUT: 1, META: 1, LINK: 1,
        };
        if (!selfClosing && !voidTags[el.tagName]) stack.push(el);
        continue;
      }
      stack[stack.length - 1].appendChild(new TextNode(t));
    }
    return root;
  }

  const doc = new Document();
  const body = parseFragment(html, doc);
  body.ownerDocument = doc;
  doc.appendChild(body);
  // Expose query on document over body children for preprocessDocument(doc)
  doc.body = body;
  // Make document.querySelectorAll search body
  const origQsa = doc.querySelectorAll.bind(doc);
  doc.querySelectorAll = (sel) => {
    const fromDoc = origQsa(sel);
    if (fromDoc.length) return fromDoc;
    return body.querySelectorAll(sel);
  };
  doc.querySelector = (sel) => doc.querySelectorAll(sel)[0] || null;

  // Patch Element.querySelectorAll for "pre, code" used in removeDecorative
  const protoQsa = Element.prototype.querySelectorAll;
  Element.prototype.querySelectorAll = function (selector) {
    if (selector === 'pre, code') {
      const out = [];
      const walk = (node) => {
        if (node.nodeType === 1) {
          if (node.tagName === 'PRE' || node.tagName === 'CODE') out.push(node);
          node.childNodes.forEach(walk);
        }
      };
      this.childNodes.forEach(walk);
      return out;
    }
    return protoQsa.call(this, selector);
  };

  return { document: doc, body, Element, TextNode };
}

let W2M;

before(() => {
  // Provide a document global for resolveMarkdownTitle's createElement path
  const { document } = createMiniDom('<div></div>');
  vm.runInThisContext(
    'var self = globalThis; var window = globalThis; window.W2M = window.W2M || {};',
  );
  globalThis.document = document;
  loadModule('js/html-preprocess.js');
  W2M = globalThis.W2M;
});

describe('detectCodeLanguage', () => {
  test('reads bare language attribute (Mintlify/Shiki)', () => {
    const code = {
      className: '',
      getAttribute(name) {
        if (name === 'language') return 'shellscript';
        return '';
      },
    };
    const pre = {
      className: 'shiki',
      getAttribute(name) {
        if (name === 'language') return 'shellscript';
        return '';
      },
    };
    assert.equal(W2M.detectCodeLanguage(code, pre), 'shellscript');
  });

  test('prefers language- class over attributes', () => {
    const code = {
      className: 'language-js',
      getAttribute() {
        return 'shellscript';
      },
    };
    assert.equal(W2M.detectCodeLanguage(code, null), 'js');
  });
});

describe('preprocessDocument', () => {
  test('promotes aria-hidden card links with useful text', () => {
    const { document, body } = createMiniDom(`
      <div class="card" role="link">
        <a href="https://docs.coderabbit.ai/api/workspace-api-tokens" aria-hidden="true">
          Workspace API tokens
          <span>Create a workspace-scoped token.</span>
        </a>
      </div>
    `);
    globalThis.document = document;
    W2M.preprocessDocument(document);
    const a = body.querySelector('a[href][aria-hidden="true"]');
    assert.equal(a, null);
    const link = body.querySelectorAll('a')[0] || body.querySelector('a');
    // querySelector for plain 'a' — extend mini matcher
    const anchors = [];
    const walk = (n) => {
      if (n.nodeType === 1) {
        if (n.tagName === 'A') anchors.push(n);
        n.childNodes.forEach(walk);
      }
    };
    body.childNodes.forEach(walk);
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0].getAttribute('aria-hidden'), null);
    assert.match(anchors[0].getAttribute('href'), /workspace-api-tokens/);
  });

  test('flattens shiki scroll-area code block to plain pre>code', () => {
    const curl =
      'curl "https://api.coderabbit.ai/v1/users" \\\n  -H "x-coderabbitai-api-key: $CODERABBIT_API_KEY"';
    const { document, body } = createMiniDom(`
      <div class="code-block mt-5 not-prose" language="shellscript">
        <button aria-label="Copy">Copy</button>
        <div role="presentation" data-component-part="code-block-root"
             class="overflow-y-hidden scroll-area">
          <pre class="shiki" language="shellscript"><code language="shellscript"><span>curl "https://api.coderabbit.ai/v1/users" \\</span>
<span>  -H "x-coderabbitai-api-key: $CODERABBIT_API_KEY"</span>
</code></pre>
        </div>
      </div>
    `);
    globalThis.document = document;
    W2M.preprocessDocument(document);

    const pres = [];
    const walk = (n) => {
      if (n.nodeType === 1) {
        if (n.tagName === 'PRE') pres.push(n);
        n.childNodes.forEach(walk);
      }
    };
    body.childNodes.forEach(walk);
    assert.equal(pres.length, 1);
    const code = pres[0].childNodes.find((c) => c.tagName === 'CODE');
    assert.ok(code);
    assert.equal(code.className, 'language-shellscript');
    assert.match(code.textContent, /curl/);
    assert.match(code.textContent, /CODERABBIT_API_KEY/);
    // Lang marker comment for Readability survival
    const comment = code.childNodes.find(
      (c) => c.nodeType === 8 && String(c.nodeValue || '').startsWith('w2m:'),
    );
    assert.ok(comment);
    assert.equal(W2M.detectCodeLanguage(code, pres[0]), 'shellscript');
    // Outer widget gone
    const widgets = [];
    const walk2 = (n) => {
      if (n.nodeType === 1) {
        const cls = n.className || '';
        if (/\bcode-block\b/.test(cls)) widgets.push(n);
        n.childNodes.forEach(walk2);
      }
    };
    body.childNodes.forEach(walk2);
    assert.equal(widgets.length, 0);
  });

  test('promotes data-as=p spans to real paragraphs', () => {
    const { document, body } = createMiniDom(`
      <div class="prose">
        <span data-as="p">…branch <strong>options</strong>.</span>
        <span data-as="p">Use <code>fix-ci</code> to open a stacked PR.</span>
        <span data-as="p">See the <a href="/docs/fix-ci">docs</a> for details.</span>
      </div>
    `);
    globalThis.document = document;
    W2M.preprocessDocument(document);

    const paragraphs = [];
    const leftoverSpans = [];
    const walk = (n) => {
      if (n.nodeType === 1) {
        if (n.tagName === 'P') paragraphs.push(n);
        if (n.tagName === 'SPAN' && n.getAttribute('data-as') === 'p') {
          leftoverSpans.push(n);
        }
        n.childNodes.forEach(walk);
      }
    };
    body.childNodes.forEach(walk);

    assert.equal(leftoverSpans.length, 0);
    assert.equal(paragraphs.length, 3);
    assert.match(paragraphs[0].textContent, /options/);
    assert.match(paragraphs[1].textContent, /Use/);
    assert.match(paragraphs[2].textContent, /See the/);
    assert.ok(paragraphs[1].querySelector('code'));
    assert.ok(paragraphs[2].querySelector('a[href]'));
  });

  test('strips decorative badges and pipe separators from headings', () => {
    const { document, body } = createMiniDom(`
      <h2>
        <span>Fix CI delivery options</span>
        <button type="button"><span data-badge="true">GitHub</span></button>
        |
        <button type="button"><span data-badge="true">Pro+ Plan</span></button>
      </h2>
    `);
    globalThis.document = document;
    W2M.preprocessDocument(document);
    const html = body.innerHTML;
    assert.match(html, /Fix CI delivery options/);
    assert.doesNotMatch(html, /data-badge/);
    assert.doesNotMatch(html, /GitHub/);
    assert.doesNotMatch(html, /Pro\+ Plan/);
    assert.doesNotMatch(html, /\|/);
  });

  test('separates adjacent short label chips', () => {
    const { document, body } = createMiniDom(`
      <div class="tags">
        <span>PR Reviews</span><span>Change Stack</span>
      </div>
    `);
    globalThis.document = document;
    W2M.preprocessDocument(document);
    assert.match(body.textContent, /PR Reviews, Change Stack/);
  });
});

describe('removeDecorativeAriaHidden', () => {
  test('keeps a[href] but removes other aria-hidden', () => {
    const { document, body } = createMiniDom(`
      <div>
        <a href="https://example.com/x" aria-hidden="true">Keep me</a>
        <span aria-hidden="true">icon</span>
      </div>
    `);
    W2M.removeDecorativeAriaHidden(body);
    const spans = [];
    const anchors = [];
    const walk = (n) => {
      if (n.nodeType === 1) {
        if (n.tagName === 'SPAN') spans.push(n);
        if (n.tagName === 'A') anchors.push(n);
        n.childNodes.forEach(walk);
      }
    };
    body.childNodes.forEach(walk);
    assert.equal(anchors.length, 1);
    assert.equal(spans.length, 0);
  });
});

describe('resolveMarkdownTitle', () => {
  test('prefers h1 over article title', () => {
    const { document } = createMiniDom('<div></div>');
    globalThis.document = document;
    assert.equal(
      W2M.resolveMarkdownTitle(
        'CodeRabbit Documentation - marketing',
        '<h1>CodeRabbit API</h1>',
        'Doc Title',
      ),
      'CodeRabbit API',
    );
  });

  test('falls back to article then document title', () => {
    const { document } = createMiniDom('<div></div>');
    globalThis.document = document;
    assert.equal(
      W2M.resolveMarkdownTitle('Article Title', '<p>no heading</p>', 'Doc Title'),
      'Article Title',
    );
    assert.equal(
      W2M.resolveMarkdownTitle('', '<p>no heading</p>', 'Doc Title'),
      'Doc Title',
    );
  });
});

describe('flattenCards', () => {
  test('converts Mintlify card to plain paragraph link', () => {
    const { document, body } = createMiniDom(`
      <div class="card" role="link">
        <a href="/api/workspace-api-tokens" aria-hidden="true">
          <h2 data-component-part="card-title">Workspace API tokens</h2>
          <div data-component-part="card-content">Create a workspace-scoped token.</div>
        </a>
      </div>
    `);
    globalThis.document = document;
    W2M.preprocessDocument(document);
    const html = body.innerHTML;
    assert.match(html, /<a href="\/api\/workspace-api-tokens">Workspace API tokens<\/a>/);
    assert.match(html, /Create a workspace-scoped token/);
    assert.doesNotMatch(html, /\bcard\b/);
  });
});

describe('pickMainContent', () => {
  test('prefers #content and reads data-page-title', () => {
    // Length must meet pickMainContent's minimum (~200 chars of innerHTML).
    const pad =
      'The CodeRabbit API provides programmatic access to review data and administrative operations. ';
    const { document } = createMiniDom(`
      <h1 id="page-title">Outside</h1>
      <div id="content" data-page-title="CodeRabbit API">
        <p>${pad}${pad}</p>
        <h2>Explore the API</h2>
        <div class="card"><a href="/a">A</a></div>
        <h2>What's next</h2>
        <div class="card"><a href="/b">B</a></div>
      </div>
    `);
    const picked = W2M.pickMainContent(document);
    assert.ok(picked);
    assert.equal(picked.pageTitle, 'CodeRabbit API');
    assert.match(picked.html, /What's next/);
    assert.match(picked.html, /Explore the API/);
  });
});
