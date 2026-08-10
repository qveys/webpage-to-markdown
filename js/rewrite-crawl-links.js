// js/rewrite-crawl-links.js — Remap same-host Markdown links to relative .md paths.
// Pure string helper; importScripts'd in the service worker / loadable in tests.
(function () {
  "use strict";

  function mdPathFromUrlToPath(urlToPathFn, pageUrl) {
    var parts = urlToPathFn(pageUrl);
    var dirs = parts.dirs || [];
    var filename = parts.filename || "page";
    return dirs.length > 0
      ? dirs.join("/") + "/" + filename + ".md"
      : filename + ".md";
  }

  function dirname(filePath) {
    var idx = filePath.lastIndexOf("/");
    return idx === -1 ? "" : filePath.slice(0, idx);
  }

  function relativePath(fromDir, toPath) {
    var fromParts = fromDir ? fromDir.split("/").filter(Boolean) : [];
    var toParts = toPath.split("/").filter(Boolean);
    var i = 0;
    while (
      i < fromParts.length &&
      i < toParts.length &&
      fromParts[i] === toParts[i]
    ) {
      i++;
    }
    var ups = fromParts.length - i;
    var rel = [];
    var u;
    for (u = 0; u < ups; u++) rel.push("..");
    for (; i < toParts.length; i++) rel.push(toParts[i]);
    return rel.length ? rel.join("/") : "./";
  }

  /**
   * Turn root-relative Markdown links into absolute URLs.
   * Safety net when DOM absolutization was skipped or lost.
   */
  function absolutizeMarkdownLinks(markdown, pageUrl) {
    if (!markdown || !pageUrl) return markdown || "";
    var origin;
    try {
      origin = new URL(pageUrl).origin;
    } catch (e) {
      return markdown;
    }
    return markdown.replace(/\]\((\/[^)\s]*)\)/g, function (match, path) {
      try {
        return "](" + new URL(path, origin).href + ")";
      } catch (e2) {
        return match;
      }
    });
  }

  /**
   * @param {string} markdown
   * @param {string} pageUrl - URL of the page that produced this markdown
   * @param {function(string): {dirs: string[], filename: string}} urlToPathFn
   * @returns {string}
   */
  function rewriteCrawlLinks(markdown, pageUrl, urlToPathFn) {
    if (!markdown || !pageUrl || typeof urlToPathFn !== "function") {
      return markdown || "";
    }

    // Normalize root-relative links first so the https? rewriter can see them
    markdown = absolutizeMarkdownLinks(markdown, pageUrl);

    var pageHost;
    var pageOrigin;
    try {
      var page = new URL(pageUrl);
      pageHost = page.hostname;
      pageOrigin = page.origin;
    } catch (e) {
      return markdown;
    }

    var fromMdPath = mdPathFromUrlToPath(urlToPathFn, pageUrl);
    var fromDir = dirname(fromMdPath);

    // Absolute http(s) same-site links → relative .md
    return markdown.replace(
      /\]\((https?:\/\/[^)\s]+)\)/g,
      function (match, href) {
        var target;
        try {
          target = new URL(href);
        } catch (e) {
          return match;
        }

        if (target.hostname !== pageHost) return match;

        var hash = target.hash || "";
        target.hash = "";
        var normalized = target.href;
        if (normalized.endsWith("/") && target.pathname !== "/") {
          normalized = normalized.slice(0, -1);
          try {
            target = new URL(normalized);
          } catch (e2) {
            // keep previous target
          }
        }

        var toMdPath = mdPathFromUrlToPath(urlToPathFn, target.href);
        var rel = relativePath(fromDir, toMdPath);
        return "](" + rel + hash + ")";
      },
    );
  }

  if (typeof window !== "undefined") {
    window.W2M = window.W2M || {};
    window.W2M.rewriteCrawlLinks = rewriteCrawlLinks;
    window.W2M.absolutizeMarkdownLinks = absolutizeMarkdownLinks;
  }

  if (typeof self !== "undefined") {
    self.W2M = self.W2M || {};
    self.W2M.rewriteCrawlLinks = rewriteCrawlLinks;
    self.W2M.absolutizeMarkdownLinks = absolutizeMarkdownLinks;
    self.rewriteCrawlLinks = rewriteCrawlLinks;
    self.absolutizeMarkdownLinks = absolutizeMarkdownLinks;
  }
})();
