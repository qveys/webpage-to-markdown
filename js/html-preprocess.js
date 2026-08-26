// js/html-preprocess.js — Normalize docs-site widgets before Readability/Turndown.
// Loaded via <script> (offscreen) or chrome.scripting.executeScript files (tab).
(function () {
  "use strict";

  /**
   * Detect fenced-code language from code/pre attributes, classes, or <!--w2m:lang-->.
   * Docs highlighters often use a bare `language="shellscript"` attribute.
   */
  function detectCodeLanguage(codeEl, preEl) {
    var code = codeEl || null;
    var pre = preEl || null;
    var className = (code && code.className) || (pre && pre.className) || "";
    var fromClass = className.match(/(?:language-|lang-)(\S+)/);
    if (fromClass && fromClass[1]) return fromClass[1];

    function attr(el, name) {
      if (!el || !el.getAttribute) return "";
      return el.getAttribute(name) || "";
    }

    var fromAttr =
      attr(code, "data-w2m-lang") ||
      attr(pre, "data-w2m-lang") ||
      attr(code, "data-lang") ||
      attr(pre, "data-lang") ||
      attr(code, "data-language") ||
      attr(pre, "data-language") ||
      attr(code, "language") ||
      attr(pre, "language") ||
      attr(code, "lang") ||
      attr(pre, "lang") ||
      "";
    if (fromAttr) return fromAttr;

    // <!--w2m:shellscript--> embedded during flatten (survives Readability)
    var host = code || pre;
    if (host && host.childNodes) {
      var i;
      for (i = 0; i < host.childNodes.length; i++) {
        var child = host.childNodes[i];
        if (
          child.nodeType === 8 &&
          child.nodeValue &&
          child.nodeValue.indexOf("w2m:") === 0
        ) {
          return child.nodeValue.slice(4).trim();
        }
      }
    }

    return "";
  }

  function ownerDoc(node) {
    return node.ownerDocument || (node.nodeType === 9 ? node : document);
  }

  function queryRootOf(root) {
    if (!root) return null;
    if (root.querySelectorAll) return root;
    return ownerDoc(root);
  }

  function findCodeBlockContainer(pre) {
    var el = pre;
    var best = pre;
    var depth = 0;
    while (el && el.nodeType === 1 && depth < 12) {
      var cls = typeof el.className === "string" ? el.className : "";
      var part = el.getAttribute && el.getAttribute("data-component-part");
      if (
        (cls && /\bcode-block\b/.test(cls)) ||
        part === "code-block-root"
      ) {
        best = el;
        if (cls && /\bcode-block\b/.test(cls)) return el;
      }
      el = el.parentElement;
      depth++;
    }
    return best;
  }

  function flattenCodeBlocks(root) {
    var doc = ownerDoc(root);
    var queryRoot = queryRootOf(root);
    if (!queryRoot) return;
    var pres = Array.prototype.slice.call(queryRoot.querySelectorAll("pre"));
    var i;
    for (i = 0; i < pres.length; i++) {
      var pre = pres[i];
      if (!pre.parentNode) continue;

      var code = pre.querySelector("code") || pre;
      var lang = detectCodeLanguage(code.nodeName === "CODE" ? code : null, pre);
      var raw = (code.textContent || "").replace(/\n$/, "");

      var container = findCodeBlockContainer(pre);
      // A widget can host several <pre> (tabbed code). Replacing the shared
      // container would drop the sibling code blocks.
      if (
        container !== pre &&
        container.querySelectorAll &&
        container.querySelectorAll("pre").length > 1
      ) {
        container = pre;
      }
      var parent = container.parentNode;
      if (!parent) continue;

      var newPre = doc.createElement("pre");
      var newCode = doc.createElement("code");
      if (lang) {
        newCode.className = "language-" + lang;
        newCode.setAttribute("data-language", lang);
        newCode.setAttribute("data-w2m-lang", lang);
        newPre.setAttribute("data-language", lang);
        newPre.setAttribute("data-w2m-lang", lang);
        // HTML comment survives Readability class-stripping + innerHTML round-trips
        newCode.appendChild(doc.createComment("w2m:" + lang));
      }
      newCode.appendChild(doc.createTextNode(raw));
      newPre.appendChild(newCode);
      parent.replaceChild(newPre, container);
    }
  }

  /**
   * Readability(keepClasses:false) strips language-* classes; restore from data-*.
   */
  function restoreCodeLanguageClasses(root) {
    var queryRoot = queryRootOf(root);
    if (!queryRoot) return;
    var pres = Array.prototype.slice.call(queryRoot.querySelectorAll("pre"));
    var i;
    for (i = 0; i < pres.length; i++) {
      var pre = pres[i];
      var code = pre.querySelector("code");
      if (!code) continue;
      var lang = detectCodeLanguage(code, pre);
      if (!lang) continue;
      if (!/(?:^|\s)(?:language-|lang-)/.test(code.className || "")) {
        code.className = (code.className ? code.className + " " : "") + "language-" + lang;
      }
      if (!code.getAttribute("data-language")) {
        code.setAttribute("data-language", lang);
      }
      // Persist as HTML attribute Readability does not strip as a "class"
      code.setAttribute("language", lang);
      pre.setAttribute("data-language", lang);
      pre.setAttribute("language", lang);
    }
  }

  function promoteAriaHiddenLinks(root) {
    var queryRoot = queryRootOf(root);
    if (!queryRoot) return;
    var anchors = Array.prototype.slice.call(
      queryRoot.querySelectorAll('a[href][aria-hidden="true"]'),
    );
    var i;
    for (i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute("href") || "";
      if (!href || href === "#") continue;
      var text = (a.textContent || "").replace(/\u200b/g, "").trim();
      if (!text) continue;
      a.removeAttribute("aria-hidden");
    }
  }

  function stripHeadingPermalinks(root) {
    var queryRoot = queryRootOf(root);
    if (!queryRoot) return;
    var anchors = Array.prototype.slice.call(
      queryRoot.querySelectorAll(
        'h1 a[href], h2 a[href], h3 a[href], h4 a[href], a[aria-label="Navigate to header"]',
      ),
    );
    var i;
    for (i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute("href") || "";
      var label = a.getAttribute("aria-label") || "";
      var text = (a.textContent || "").replace(/\u200b/g, "").trim();
      if (label === "Navigate to header" || (href.charAt(0) === "#" && !text)) {
        a.remove();
      }
    }
  }

  function stripDocsChrome(root) {
    var queryRoot = queryRootOf(root);
    if (!queryRoot) return;
    var selectors = [
      "#page-context-menu",
      "#page-context-menu-button",
      '[aria-label="Copy page"]',
      '[aria-label="Copy the contents from the code block"]',
      '[aria-label="More actions"]',
      '[class*="page-feedback"]',
      '[class*="was-this-helpful"]',
      '[data-testid="feedback"]',
      ".feedback-widget",
      ".breadcrumb-list",
      ".breadcrumb-item",
      '[class*="breadcrumb"]',
    ];
    var i, j, nodes;
    for (i = 0; i < selectors.length; i++) {
      try {
        nodes = Array.prototype.slice.call(queryRoot.querySelectorAll(selectors[i]));
      } catch (e) {
        nodes = [];
      }
      for (j = 0; j < nodes.length; j++) {
        if (nodes[j] && nodes[j].parentNode) nodes[j].remove();
      }
    }
    stripDecorativeBadges(root);
  }

  /**
   * Remove decorative badge chips often injected next to headings
   * (plan/platform labels, etc.). Pattern: elements with data-badge,
   * or buttons that only wrap such chips, plus leftover "|" separators.
   */
  function removePipeOnlyTextNodes(el) {
    if (!el || !el.childNodes) return;
    var children = Array.prototype.slice.call(el.childNodes);
    var i, child, text;
    for (i = 0; i < children.length; i++) {
      child = children[i];
      if (child.nodeType === 3) {
        text = String(child.nodeValue != null ? child.nodeValue : child.data || "")
          .replace(/\u200b/g, "");
        if (text.indexOf("|") !== -1 && /^[\s|]*$/.test(text)) {
          if (child.parentNode) child.parentNode.removeChild(child);
        }
      } else if (child.nodeType === 1) {
        removePipeOnlyTextNodes(child);
      }
    }
  }

  function stripDecorativeBadges(root) {
    var queryRoot = queryRootOf(root);
    if (!queryRoot || !queryRoot.querySelectorAll) return;
    var i;
    var buttons = Array.prototype.slice.call(queryRoot.querySelectorAll("button"));
    for (i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (!btn || !btn.parentNode) continue;
      if (btn.querySelector && btn.querySelector("[data-badge]")) {
        btn.remove();
      }
    }
    var badges = Array.prototype.slice.call(
      queryRoot.querySelectorAll("[data-badge], button[data-badge]"),
    );
    for (i = 0; i < badges.length; i++) {
      if (badges[i] && badges[i].parentNode) badges[i].remove();
    }
    var headings = Array.prototype.slice.call(
      queryRoot.querySelectorAll("h1, h2, h3, h4"),
    );
    for (i = 0; i < headings.length; i++) {
      removePipeOnlyTextNodes(headings[i]);
    }
  }

  function isInlineLabelChip(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.nodeName;
    if (tag !== "SPAN" && tag !== "A") return false;
    var ancestor = el.parentElement || el.parentNode;
    while (ancestor && ancestor.nodeType === 1) {
      if (ancestor.nodeName === "PRE" || ancestor.nodeName === "CODE") return false;
      ancestor = ancestor.parentElement || ancestor.parentNode;
    }
    if (el.querySelector && el.querySelector("p, div, ul, ol, pre, table, h1, h2, h3, h4")) {
      return false;
    }
    var text = (el.textContent || "").replace(/\u200b/g, "").trim();
    if (!text || text.length > 40) return false;
    if (text.split(/\s+/).length > 5) return false;
    if (/^[\W_]+$/.test(text)) return false;
    return true;
  }

  function onlyEmptyTextBetween(a, b) {
    var n = a.nextSibling;
    while (n && n !== b) {
      if (n.nodeType === 1) return false;
      if (n.nodeType === 3) {
        var t = String(n.nodeValue != null ? n.nodeValue : n.data || "").replace(
          /\u200b/g,
          "",
        );
        // Any remaining text, including whitespace, already separates the labels.
        if (t !== "") return false;
      }
      n = n.nextSibling;
    }
    return n === b;
  }

  /**
   * Adjacent short label chips with no separator become glued text in Markdown
   * ("PR ReviewsChange Stack"). Insert ", " between sibling chips.
   */
  function separateAdjacentInlineLabels(root) {
    var doc = ownerDoc(root);
    var queryRoot = queryRootOf(root);
    if (!queryRoot) return;

    function walk(parent) {
      if (!parent || !parent.childNodes || !parent.insertBefore) return;
      var kids = Array.prototype.slice.call(parent.childNodes);
      var i, child, prevChip = null;
      for (i = 0; i < kids.length; i++) {
        child = kids[i];
        if (child.nodeType === 1) {
          if (isInlineLabelChip(child)) {
            if (
              prevChip &&
              onlyEmptyTextBetween(prevChip, child)
            ) {
              parent.insertBefore(doc.createTextNode(", "), child);
            }
            prevChip = child;
          } else {
            prevChip = null;
            walk(child);
          }
        } else if (child.nodeType === 3) {
          var text = String(
            child.nodeValue != null ? child.nodeValue : child.data || "",
          ).replace(/\u200b/g, "");
          if (text.trim() !== "") prevChip = null;
        }
      }
    }

    walk(queryRoot);
  }

  /**
   * Resolve root-relative and page-relative href/src against baseUrl in-place.
   */
  function absolutizeAnchors(root, baseUrl) {
    if (!root || !baseUrl) return;
    var queryRoot = queryRootOf(root);
    if (!queryRoot || !queryRoot.querySelectorAll) return;
    var anchors = Array.prototype.slice.call(queryRoot.querySelectorAll("a[href]"));
    var i;
    for (i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute("href");
      // Resolve relative references only; leave every explicit scheme as-is.
      if (!href || href.charAt(0) === "#" || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) {
        continue;
      }
      try {
        a.setAttribute("href", new URL(href, baseUrl).href);
      } catch (e) {
        // ignore
      }
    }
  }

  /**
   * Some UI kits mark block paragraphs as <span data-as="p"> (or similar).
   * Turndown treats SPAN as inline, so adjacent "paragraphs" glue together.
   * Promote to real <p> before conversion.
   */
  function promoteDataAsParagraphs(root) {
    var doc = ownerDoc(root);
    var queryRoot = queryRootOf(root);
    if (!queryRoot || !queryRoot.querySelectorAll) return;
    var nodes = Array.prototype.slice.call(
      queryRoot.querySelectorAll('span[data-as="p"], [data-as="p"]'),
    );
    var i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || !el.parentNode) continue;
      if (el.nodeName === "P") continue;
      if ((el.getAttribute && el.getAttribute("data-as")) !== "p") continue;

      var p = doc.createElement("p");
      while (el.firstChild) {
        p.appendChild(el.firstChild);
      }
      el.parentNode.replaceChild(p, el);
    }
  }

  /**
   * Docs card widgets: .card wrapping title+desc → <p><a>title</a> — desc</p>.
   * Avoids Turndown emitting [## Title\\n\\nDesc](url).
   */
  function flattenCards(root) {
    var doc = ownerDoc(root);
    var queryRoot = queryRootOf(root);
    if (!queryRoot) return;
    var cards = Array.prototype.slice.call(
      queryRoot.querySelectorAll(".card"),
    );
    var seen = [];
    var i;
    for (i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (!card || !card.parentNode) continue;
      if (seen.indexOf(card) !== -1) continue;
      seen.push(card);

      var a = card.querySelector("a[href]");
      if (!a) continue;
      var href = a.getAttribute("href") || "";
      if (!href) continue;

      var titleEl = card.querySelector(
        '[data-component-part="card-title"], h2, h3, h4',
      );
      var descEl = card.querySelector('[data-component-part="card-content"]');
      var title = titleEl
        ? (titleEl.textContent || "").replace(/\u200b/g, "").trim()
        : "";
      var desc = descEl
        ? (descEl.textContent || "").replace(/\u200b/g, "").trim()
        : "";
      if (!title) {
        title = (a.textContent || "").replace(/\u200b/g, "").trim().split("\n")[0];
      }
      if (!title) continue;

      var p = doc.createElement("p");
      var link = doc.createElement("a");
      link.setAttribute("href", href);
      link.textContent = title;
      p.appendChild(link);
      if (desc && desc !== title) {
        p.appendChild(doc.createTextNode(" — " + desc));
      }
      card.parentNode.replaceChild(p, card);
    }
  }

  /**
   * Mutates the document/subtree in place so Readability keeps code + card links.
   * @param {Document|Element} root
   */
  /**
   * Confine extraction to the page's dominant content landmark.
   * When a document declares a single <main>/[role=main], app chrome outside
   * it (hidden nav drawers, course sidebars, menus) can hold far more text
   * than the content itself and win Readability's scoring. Per the HTML spec,
   * main IS the dominant content — drop everything outside it before
   * extraction. Readability still prunes within the landmark.
   */
  function isolateMainLandmark(root) {
    var queryRoot = queryRootOf(root);
    if (!queryRoot || !queryRoot.querySelectorAll) return;
    var landmarks;
    try {
      landmarks = queryRoot.querySelectorAll('main, [role="main"]');
    } catch (e) {
      return;
    }
    if (!landmarks || landmarks.length !== 1) return;
    var landmark = landmarks[0];
    var text = (landmark.textContent || "").trim();
    // Near-empty landmark: SPA shell rendering elsewhere — keep the full page.
    if (text.length < 60) return;

    var node = landmark;
    while (node.parentNode) {
      var parent = node.parentNode;
      // Never climb past <body>/<html>: <head> must survive for Readability.
      if (parent.nodeType !== 1 || parent.tagName === "HTML") break;
      var siblings = Array.prototype.slice.call(parent.children || []);
      for (var i = 0; i < siblings.length; i++) {
        if (siblings[i] !== node) parent.removeChild(siblings[i]);
      }
      if (parent === queryRoot || parent.tagName === "BODY") break;
      node = parent;
    }
  }

  function preprocessDocument(root, baseUrl) {
    if (!root) return;
    isolateMainLandmark(root);
    stripDocsChrome(root);
    stripHeadingPermalinks(root);
    promoteAriaHiddenLinks(root);
    separateAdjacentInlineLabels(root);
    promoteDataAsParagraphs(root);
    flattenCards(root);
    flattenCodeBlocks(root);
    if (baseUrl) absolutizeAnchors(root, baseUrl);
  }

  /**
   * Prefer docs-site main content over Readability when a strong signal exists.
   * Only #content / [data-page-title] outrank Readability — generic main /
   * [role=main] often include nav/sidebars on non-docs pages.
   * @returns {{ html: string, pageTitle: string }|null}
   */
  function pickMainContent(root) {
    var queryRoot = queryRootOf(root);
    if (!queryRoot || !queryRoot.querySelector) return null;

    // Strong docs-site signals only; keep Readability as the default elsewhere.
    var selectors = ["#content", "[data-page-title]"];
    var i;
    var el = null;
    for (i = 0; i < selectors.length; i++) {
      try {
        el = queryRoot.querySelector(selectors[i]);
      } catch (e) {
        el = null;
      }
      if (el && el.innerHTML && el.innerHTML.trim().length >= 200) break;
      el = null;
    }

    // Thin single-landmark pages: below Readability's own charThreshold (500)
    // its scoring can only mangle the landmark (typically dropping the H1 and
    // title); use the landmark as-is. Substantial landmarks keep Readability.
    if (!el) {
      var landmarks;
      try {
        landmarks = queryRoot.querySelectorAll('main, [role="main"]');
      } catch (e) {
        landmarks = null;
      }
      if (landmarks && landmarks.length === 1) {
        var landmarkText = (landmarks[0].textContent || "").trim();
        if (landmarkText.length >= 60 && landmarkText.length < 500) {
          el = landmarks[0];
        }
      }
    }
    if (!el) return null;

    var pageTitle = (el.getAttribute("data-page-title") || "").trim();
    if (!pageTitle) {
      var titleEl =
        queryRoot.querySelector("#page-title") ||
        queryRoot.querySelector("h1");
      if (titleEl) {
        pageTitle = (titleEl.textContent || "").replace(/\u200b/g, "").trim();
      }
    }

    return { html: el.innerHTML, pageTitle: pageTitle };
  }

  /**
   * Prefer first H1 / data-page-title hint, then Readability title, then fallback.
   */
  function resolveMarkdownTitle(articleTitle, html, fallbackTitle) {
    if (html && typeof document !== "undefined") {
      try {
        var div = document.createElement("div");
        div.innerHTML = html;
        var h1 = div.querySelector("h1");
        if (h1) {
          var h1Text = (h1.textContent || "").replace(/\u200b/g, "").trim();
          if (h1Text) return h1Text;
        }
        var marked = div.querySelector("[data-page-title]");
        if (marked) {
          var dt = (marked.getAttribute("data-page-title") || "").trim();
          if (dt) return dt;
        }
      } catch (e) {
        // ignore
      }
    }

    var t = (articleTitle || "").trim();
    if (t) return t;

    t = (fallbackTitle || "").trim();
    return t || "Untitled Page";
  }

  /**
   * Remove decorative aria-hidden nodes, but keep real links and code hosts.
   */
  function removeDecorativeAriaHidden(root) {
    if (!root || !root.querySelectorAll) return;
    var nodes = Array.prototype.slice.call(
      root.querySelectorAll('[aria-hidden="true"]'),
    );
    var i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || !el.parentNode) continue;
      if (el.nodeName === "A" && el.getAttribute("href")) continue;
      if (el.querySelector && el.querySelector("pre, code")) continue;
      el.remove();
    }
  }

  /**
   * Avoid duplicate H1 when page content already has one.
   */
  function wrapHtmlForTurndown(title, html, escapeHtmlFn) {
    var body = html || "";
    if (/<h1[\s>]/i.test(body)) {
      return "<div>" + body + "</div>";
    }
    var esc = escapeHtmlFn || function (s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    };
    return "<div><h1>" + esc(title || "Untitled Page") + "</h1>" + body + "</div>";
  }

  var api = {
    detectCodeLanguage: detectCodeLanguage,
    isolateMainLandmark: isolateMainLandmark,
    preprocessDocument: preprocessDocument,
    pickMainContent: pickMainContent,
    resolveMarkdownTitle: resolveMarkdownTitle,
    removeDecorativeAriaHidden: removeDecorativeAriaHidden,
    restoreCodeLanguageClasses: restoreCodeLanguageClasses,
    wrapHtmlForTurndown: wrapHtmlForTurndown,
    stripDocsChrome: stripDocsChrome,
    stripHeadingPermalinks: stripHeadingPermalinks,
    stripDecorativeBadges: stripDecorativeBadges,
    separateAdjacentInlineLabels: separateAdjacentInlineLabels,
    promoteDataAsParagraphs: promoteDataAsParagraphs,
    flattenCards: flattenCards,
    absolutizeAnchors: absolutizeAnchors,
  };

  if (typeof window !== "undefined") {
    window.W2M = window.W2M || {};
    Object.keys(api).forEach(function (k) {
      window.W2M[k] = api[k];
    });
  }

  if (typeof self !== "undefined") {
    self.W2M = self.W2M || {};
    Object.keys(api).forEach(function (k) {
      self.W2M[k] = api[k];
    });
    self.detectCodeLanguage = api.detectCodeLanguage;
    self.preprocessDocument = api.preprocessDocument;
    self.pickMainContent = api.pickMainContent;
    self.resolveMarkdownTitle = api.resolveMarkdownTitle;
    self.removeDecorativeAriaHidden = api.removeDecorativeAriaHidden;
    self.restoreCodeLanguageClasses = api.restoreCodeLanguageClasses;
    self.wrapHtmlForTurndown = api.wrapHtmlForTurndown;
    self.absolutizeAnchors = api.absolutizeAnchors;
  }
})();
