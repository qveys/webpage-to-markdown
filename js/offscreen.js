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

    const title = doc.title || "Untitled Page";

    let content = null;

    // Try Readability first
    if (typeof Readability !== "undefined") {
      try {
        const docClone = doc.cloneNode(true);
        const article = new Readability(docClone).parse();
        if (article && article.content && article.content.length > 200) {
          content = article.content;
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

    // Remove hidden/decorative elements
    _clean
      .querySelectorAll('[aria-hidden="true"]')
      .forEach((el) => el.remove());

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

    const markdown = convertToMarkdown(title, content);

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
    if (
      href &&
      !href.startsWith("http") &&
      !href.startsWith("mailto:") &&
      !href.startsWith("#") &&
      !href.startsWith("javascript:")
    ) {
      try {
        a.setAttribute("href", new URL(href, pageUrl).href);
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
    if (
      href.startsWith("mailto:") ||
      href.startsWith("javascript:") ||
      href.startsWith("#")
    ) {
      return;
    }

    try {
      const resolved = new URL(href, pageUrl);
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

function convertToMarkdown(title, html) {
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
        (code.className.match(/(?:language-|lang-)(\S+)/) || [])[1] ||
        code.getAttribute("data-lang") ||
        node.getAttribute("data-lang") ||
        code.getAttribute("data-language") ||
        node.getAttribute("data-language") ||
        "";

      return `\n\n\`\`\`${lang}\n${rawCode.replace(/\n$/, "")}\n\`\`\`\n\n`;
    },
  });

  // Rule: figure elements with optional figcaption
  service.addRule("figures", {
    filter: "figure",
    replacement: (content, node) => {
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
      return `<img src="${src}" alt="${alt}" style="max-width:${maxW}px; height:auto;">`;
    },
  });

  let markdown = service.turndown(`<div><h1>${title}</h1>${html}</div>`);
  markdown = cleanupMarkdown(markdown);

  return markdown;
}

function cleanupMarkdown(markdown) {
  let out = markdown || "";

  // Compact links that Turndown may render on multiple lines:
  // [
  //   ...label...
  // ](url)
  out = out.replace(
    /\[\s*\n+([\s\S]*?)\n+\s*\]\(([^)\n]+)\)/g,
    (_m, label, href) => `[${label.trim()}](${href.trim()})`,
  );

  // Recover headings rendered as:
  // ##
  //
  // Heading text...
  const lines = out.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^[ \t]{0,3}(#{1,6})[ \t]*$/);
    if (!match) continue;

    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;

    if (j < lines.length) {
      const nextLine = lines[j].trim();
      const isPlainHeadingText =
        nextLine.length > 0 &&
        !/^(?:#{1,6}\s|>\s|```|`|[-+*]\s|\d+\.\s|\[|!\[)/.test(nextLine);

      if (isPlainHeadingText) {
        lines[i] = `${match[1]} ${nextLine}`;
        lines.splice(i + 1, j - i);
        continue;
      }
    }

    // Drop truly empty headings.
    lines[i] = "";
  }

  // X/Twitter cleanup: remove synthetic page title and promote post title under hero image.
  const firstContentIndex = lines.findIndex((line) => line.trim() !== "");
  if (firstContentIndex !== -1 && lines[firstContentIndex].trim() === "# X") {
    lines[firstContentIndex] = "";
  }
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const current = lines[i].trim();
    if (!/^\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)$/.test(current)) continue;

    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;
    if (j >= lines.length) break;

    const candidate = lines[j].trim();
    const canPromote =
      candidate.length >= 16 &&
      !/^(?:#{1,6}\s|>\s|```|`|[-+*]\s|\d+\.\s|\[|!\[)/.test(candidate);

    if (canPromote) {
      lines[j] = `## ${candidate}`;
    }
    break;
  }

  // Remove social/UI noise: orphan metadata blocks.
  // Detects sequences of 4+ consecutive very short non-markdown lines
  // (profile names, handles, dates, engagement counts, dots).
  const isOrphanNoise = (line) => {
    const t = line.trim();
    if (t.length === 0) return false;
    if (t.length >= 30) return false;
    if (/^(?:#{1,6}\s|>\s|```|[-+*]\s|\d+\.\s|\[|!\[|---|\*{3}|_{3})/.test(t))
      return false;
    return true;
  };
  for (let k = 0; k < lines.length; ) {
    if (!isOrphanNoise(lines[k])) {
      k++;
      continue;
    }
    let end = k;
    let noiseCount = 0;
    while (end < lines.length) {
      if (isOrphanNoise(lines[end])) {
        noiseCount++;
        end++;
      } else if (lines[end].trim() === "") {
        end++;
      } else {
        break;
      }
    }
    if (noiseCount >= 4) {
      for (let m = k; m < end; m++) lines[m] = "";
    }
    k = end;
  }

  out = lines.join("\n");

  // Normalize extra spacing after cleanup.
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}
