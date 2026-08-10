// js/offscreen.js — DOM parsing engine for the crawl pipeline
// Runs inside an offscreen document (has full DOM: DOMParser, document, etc.)
// Receives HTML from the service worker, parses it, extracts links,
// converts to Markdown, and returns results via sendResponse.

// ─── Message listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "parse:html") return false;

  const { url, html } = message;

  parseAndConvert(url, html)
    .then((result) => {
      sendResponse({ type: "parse:result", ...result });
    })
    .catch((err) => {
      sendResponse({
        type: "parse:result",
        url,
        links: [],
        markdown: "",
        error: err.message,
      });
    });

  // Must return true to signal async sendResponse
  return true;
});

// ─── Main parse + convert function ───────────────────────────────────────────

async function parseAndConvert(pageUrl, html) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");

    resolveUrls(doc, pageUrl);
    const links = extractLinks(doc, pageUrl);

    const fallbackTitle = doc.title || "Untitled Page";
    let articleTitle = "";

    // Flatten docs widgets (code blocks, cards) before extraction
    if (typeof W2M !== "undefined" && W2M.preprocessDocument) {
      W2M.preprocessDocument(doc, pageUrl);
    }

    let content = null;

    // Prefer #content (docs) — Readability often drops trailing "What's next" cards
    if (typeof W2M !== "undefined" && W2M.pickMainContent) {
      const picked = W2M.pickMainContent(doc);
      if (picked && picked.html) {
        content = picked.html;
        articleTitle = picked.pageTitle || "";
      }
    }

    // Try Readability if no docs main content
    if (!content && typeof Readability !== "undefined") {
      try {
        const docClone = doc.cloneNode(true);
        const article = new Readability(docClone).parse();
        if (article && article.content && article.content.length > 200) {
          content = article.content;
          articleTitle = article.title || "";
        }
      } catch (e) {
        console.warn("[offscreen] Readability failed, falling back:", e);
      }
    }

    // Fallback: manual DOM cleaning + heuristic selector
    if (!content) {
      const bodyClone = doc.body.cloneNode(true);

      bodyClone
        .querySelectorAll(
          "script, style, svg, nav, footer, aside, .ads, .comments, .cookie-banner, .popup, .overlay, .modal"
        )
        .forEach((el) => el.remove());

      const mainSelectors = [
        "main",
        "article",
        ".content",
        ".post",
        '[role="main"]',
        "#content",
      ];

      let mainContent = null;
      for (const selector of mainSelectors) {
        const found = bodyClone.querySelector(selector);
        if (found && found.innerHTML.trim().length > 100) {
          mainContent = found;
          break;
        }
      }

      content = mainContent ? mainContent.innerHTML : bodyClone.innerHTML;
    }

    // Clean HTML of non-content elements before Turndown.
    // Uses a detached element — never inserted into the live DOM.
    // Content originates from Readability / DOMParser (same-origin HTML).
    const _clean = doc.createElement("div");
    _clean.innerHTML = content;

    // Remove interactive controls
    _clean
      .querySelectorAll(
        'button, [role="button"], [role="toolbar"], [role="group"], ' +
        '[role="menubar"], [role="menu"], [role="menuitem"], ' +
        "input, select, textarea, form",
      )
      .forEach((el) => el.remove());

    // Remove decorative aria-hidden (keep real links / code hosts)
    if (typeof W2M !== "undefined" && W2M.removeDecorativeAriaHidden) {
      W2M.removeDecorativeAriaHidden(_clean);
    } else {
      _clean.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
        if (el.nodeName === "A" && el.getAttribute("href")) return;
        if (el.querySelector && el.querySelector("pre, code")) return;
        el.remove();
      });
    }

    if (typeof W2M !== "undefined") {
      if (W2M.stripDocsChrome) W2M.stripDocsChrome(_clean);
      if (W2M.stripHeadingPermalinks) W2M.stripHeadingPermalinks(_clean);
      if (W2M.flattenCards) W2M.flattenCards(_clean);
      if (W2M.restoreCodeLanguageClasses) W2M.restoreCodeLanguageClasses(_clean);
      if (W2M.absolutizeAnchors) W2M.absolutizeAnchors(_clean, pageUrl);
    }

    // Convert embedded tweets to clean blockquotes
    _clean
      .querySelectorAll(
        'blockquote.twitter-tweet, blockquote[class*="twitter"], ' +
        "[data-tweet-id], .twitter-tweet-rendered",
      )
      .forEach((el) => {
        const ps = el.querySelectorAll("p");
        const text = ps.length
          ? Array.from(ps)
              .map((p) => p.textContent.trim())
              .filter(Boolean)
              .join("\n")
          : el.textContent.trim();
        const tweetLinks = el.querySelectorAll(
          'a[href*="twitter.com/"], a[href*="x.com/"]',
        );
        const src = tweetLinks.length
          ? tweetLinks[tweetLinks.length - 1].href
          : "";
        el.innerHTML = `<p>${text}</p>${src ? `<p><a href="${src}">Source</a></p>` : ""}`;
      });

    // Remove social share/follow widgets
    _clean
      .querySelectorAll(
        '[class*="share-button"], [class*="social-share"], [class*="share-buttons"], ' +
        '[class*="follow-btn"], [class*="follow-button"], [class*="social-widget"], ' +
        '[class*="social-links"], [class*="social-icons"]',
      )
      .forEach((el) => el.remove());

    // Stamp inline style dimensions as data-w2m-width for Turndown rule.
    // In offscreen context we don't have computed styles, so use
    // HTML attributes and inline styles as best approximation.
    _clean.querySelectorAll("img").forEach((img) => {
      const w = parseInt(img.getAttribute("width") || "0", 10);
      const style = (img.getAttribute("style") || "");
      const m = style.match(/width\s*:\s*(\d+)\s*px/);
      const styleW = m ? parseInt(m[1], 10) : 0;
      const effectiveW = w || styleW;
      if (effectiveW > 0 && effectiveW < 200) {
        img.setAttribute("data-w2m-width", effectiveW);
      }
    });

    content = _clean.innerHTML;

    const title =
      typeof W2M !== "undefined" && W2M.resolveMarkdownTitle
        ? W2M.resolveMarkdownTitle(articleTitle, content, fallbackTitle)
        : articleTitle || fallbackTitle;

    const { markdownSettings } = await chrome.storage.local.get("markdownSettings");
    const includeImages = !markdownSettings || markdownSettings.includeImages !== false;
    const markdown = convertToMarkdown(title, content, pageUrl, { includeImages });


    return { url: pageUrl, links, markdown, title };
  } catch (err) {
    return { url: pageUrl, links: [], markdown: "", error: err.message };
  }
}

// ─── Resolve relative URLs in the document ───────────────────────────────────

function resolveUrls(doc, pageUrl) {
  // Resolve img[src] and img[data-src] to absolute URLs
  doc.querySelectorAll("img[src], img[data-src]").forEach((img) => {
    const src = img.getAttribute("src");
    const dataSrc = img.getAttribute("data-src");

    // Prefer data-src if src is a data: URI or empty
    const effectiveSrc =
      dataSrc && (!src || src.startsWith("data:") || src === "")
        ? dataSrc
        : src;

    if (
      effectiveSrc &&
      !effectiveSrc.startsWith("data:") &&
      !effectiveSrc.startsWith("blob:")
    ) {
      try {
        img.setAttribute("src", new URL(effectiveSrc, pageUrl).href);
      } catch (e) {
        // Ignore malformed URLs
      }
    }
  });

  // Resolve relative hrefs on anchors
  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    // URI schemes are case-insensitive; trim + lowercase before allow/deny checks.
    const normalizedHref = href ? href.trim().toLowerCase() : "";
    if (
      href &&
      !normalizedHref.startsWith("http") &&
      !normalizedHref.startsWith("mailto:") &&
      !normalizedHref.startsWith("#") &&
      !normalizedHref.startsWith("javascript:") &&
      !normalizedHref.startsWith("data:") &&
      !normalizedHref.startsWith("vbscript:")
    ) {
      try {
        a.setAttribute("href", new URL(href.trim(), pageUrl).href);
      } catch (e) {
        // Ignore malformed URLs
      }
    }
  });
}

// ─── Extract and normalize links ─────────────────────────────────────────────

function extractLinks(doc, pageUrl) {
  const seen = new Set();

  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;
    // URI schemes are case-insensitive; trim + lowercase before allow/deny checks.
    const normalizedHref = href.trim().toLowerCase();
    if (
      normalizedHref.startsWith("mailto:") ||
      normalizedHref.startsWith("javascript:") ||
      normalizedHref.startsWith("data:") ||
      normalizedHref.startsWith("vbscript:") ||
      normalizedHref.startsWith("#")
    ) {
      return;
    }

    try {
      const resolved = new URL(href.trim(), pageUrl);
      // Remove fragment
      resolved.hash = "";
      // Remove trailing slash (only if there's a non-empty pathname beyond root)
      let normalized = resolved.href;
      if (normalized.endsWith("/") && resolved.pathname !== "/") {
        normalized = normalized.slice(0, -1);
      }
      seen.add(normalized);
    } catch (e) {
      // Ignore malformed URLs
    }
  });

  return Array.from(seen);
}

// ─── Convert HTML to Markdown via TurndownService ────────────────────────────

function convertToMarkdown(title, html, pageUrl, options) {
  const opts = options || {};
  const includeImages = opts.includeImages !== false;

  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
  });

  // Apply GFM plugin if available (tables, strikethrough, etc.)
  if (typeof turndownPluginGfm !== "undefined") {
    service.use(turndownPluginGfm.gfm);
  }

  // Preserve iframes as-is
  service.keep(["iframe"]);

  // Rule: fenced code blocks with language detection
  service.addRule("codeBlocks", {
    filter: (node) => node.nodeName === "PRE" && node.querySelector("code"),
    replacement: (content, node) => {
      const code = node.querySelector("code");
      const rawCode = code.textContent || "";
      const lang =
        typeof W2M !== "undefined" && W2M.detectCodeLanguage
          ? W2M.detectCodeLanguage(code, node)
          : (code.className.match(/(?:language-|lang-)(\S+)/) || [])[1] ||
            code.getAttribute("data-lang") ||
            node.getAttribute("data-lang") ||
            code.getAttribute("data-language") ||
            node.getAttribute("data-language") ||
            code.getAttribute("language") ||
            node.getAttribute("language") ||
            code.getAttribute("lang") ||
            "";

      return `\n\n\`\`\`${lang}\n${rawCode.replace(/\n$/, "")}\n\`\`\`\n\n`;
    },
  });

  // Rule: figure elements with optional figcaption
  service.addRule("figures", {
    filter: "figure",
    replacement: (content, node) => {
      if (!includeImages) {
        const cap = node.querySelector("figcaption");
        return cap ? cap.textContent : "";
      }
      const img = node.querySelector("img");
      if (img) {
        const alt = img.getAttribute("alt") || "";
        const src = img.getAttribute("src") || "";
        const cap = node.querySelector("figcaption");
        return `\n\n![${alt}](${src})\n${cap ? cap.textContent : ""}\n\n`;
      }
      return content;
    },
  });

  if (!includeImages) {
    service.addRule("stripImages", {
      filter: "img",
      replacement: () => "",
    });
  }

  // Skip tiny images (icons < 16px) — pure noise
  service.addRule("skipTinyImages", {
    filter: (node) => {
      if (node.nodeName !== "IMG") return false;
      const rw = parseInt(node.getAttribute("data-w2m-width") || "0", 10);
      const w = parseInt(node.getAttribute("width") || "0", 10);
      const h = parseInt(node.getAttribute("height") || "0", 10);
      return (rw > 0 && rw < 16) || (w > 0 && w < 16) || (h > 0 && h < 16);
    },
    replacement: () => "",
  });

  // Constrain small images to their rendered size via HTML <img> tag
  service.addRule("constrainSmallImages", {
    filter: (node) => {
      if (node.nodeName !== "IMG") return false;
      const rw = parseInt(node.getAttribute("data-w2m-width") || "0", 10);
      return rw > 0 && rw < 200;
    },
    replacement: (content, node) => {
      const alt = node.getAttribute("alt") || "";
      const src = node.getAttribute("src") || "";
      if (!src) return "";
      const rw = parseInt(node.getAttribute("data-w2m-width") || "0", 10);
      const maxW = rw > 0 ? rw : 64;
      const escAttr = (s) => String(s).replace(/"/g, '&quot;');
      return `<img src="${escAttr(src)}" alt="${escAttr(alt)}" style="max-width:${maxW}px; height:auto;">`;
    },
  });

  let markdown = service.turndown(
    typeof W2M !== "undefined" && W2M.wrapHtmlForTurndown
      ? W2M.wrapHtmlForTurndown(title, html)
      : `<div><h1>${title}</h1>${html}</div>`,
  );
  markdown = cleanupMarkdown(markdown);
  if (pageUrl && typeof W2M !== "undefined" && W2M.absolutizeMarkdownLinks) {
    markdown = W2M.absolutizeMarkdownLinks(markdown, pageUrl);
  }
  return markdown;
}

// cleanupMarkdown is provided by /js/cleanup-markdown.js (loaded via <script> in offscreen.html)
var cleanupMarkdown = (window.W2M && window.W2M.cleanupMarkdown) || self.cleanupMarkdown;
