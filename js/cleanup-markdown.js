// js/cleanup-markdown.js — Shared pure-string post-processing for Turndown output.
// Loaded via <script> in UI pages and importScripts() in the Service Worker.
(function () {
  "use strict";

  function cleanupMarkdown(markdown) {
    var out = markdown || '';

    // Compact links that Turndown may render on multiple lines:
    // [
    //   ...label...
    // ](url)
    out = out.replace(
      /\[\s*\n+([\s\S]*?)\n+\s*\]\(([^)\n]+)\)/g,
      function (_m, label, href) { return '[' + label.trim() + '](' + href.trim() + ')'; }
    );

    // Recover headings rendered as:
    // ##
    //
    // Heading text...
    var lines = out.split('\n');
    var i, j, match, nextLine, isPlainHeadingText;
    for (i = 0; i < lines.length; i++) {
      match = lines[i].match(/^[ \t]{0,3}(#{1,6})[ \t]*$/);
      if (!match) continue;

      j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;

      if (j < lines.length) {
        nextLine = lines[j].trim();
        isPlainHeadingText =
          nextLine.length > 0 &&
          !/^(?:#{1,6}\s|>\s|```|`|[-+*]\s|\d+\.\s|\[|!\[)/.test(nextLine);

        if (isPlainHeadingText) {
          lines[i] = match[1] + ' ' + nextLine;
          lines.splice(i + 1, j - i);
          continue;
        }
      }

      // Drop truly empty headings.
      lines[i] = '';
    }

    // X/Twitter cleanup: remove synthetic page title and promote post title under hero image.
    var firstContentIndex = -1;
    for (i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== '') { firstContentIndex = i; break; }
    }
    if (firstContentIndex !== -1 && lines[firstContentIndex].trim() === '# X') {
      lines[firstContentIndex] = '';
    }
    for (i = 0; i < Math.min(lines.length, 20); i++) {
      var current = lines[i].trim();
      if (!/^\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)$/.test(current)) continue;

      j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length) break;

      var candidate = lines[j].trim();
      var canPromote =
        candidate.length >= 16 &&
        !/^(?:#{1,6}\s|>\s|```|`|[-+*]\s|\d+\.\s|\[|!\[)/.test(candidate);

      if (canPromote) {
        lines[j] = '## ' + candidate;
      }
      break;
    }

    // Remove social/UI noise: orphan metadata blocks.
    // Detects sequences of 4+ consecutive very short non-markdown lines
    // (profile names, handles, dates, engagement counts, dots).
    var isOrphanNoise = function (line) {
      var trimmed = line.trim();
      if (trimmed.length === 0) return false;
      if (trimmed.length >= 30) return false;
      if (/^(?:#{1,6}\s|>\s|```|[-+*]\s|\d+\.\s|\[|!\[|---|\*{3}|_{3})/.test(trimmed)) return false;
      return true;
    };
    var k = 0;
    var end, noiseCount, m;
    while (k < lines.length) {
      if (!isOrphanNoise(lines[k])) {
        k++;
        continue;
      }
      end = k;
      noiseCount = 0;
      while (end < lines.length) {
        if (isOrphanNoise(lines[end])) {
          noiseCount++;
          end++;
        } else if (lines[end].trim() === '') {
          end++;
        } else {
          break;
        }
      }
      if (noiseCount >= 4) {
        for (m = k; m < end; m++) lines[m] = '';
      }
      k = end;
    }

    out = lines.join('\n');

    // Normalize extra spacing after cleanup.
    out = out.replace(/\n{3,}/g, '\n\n').trim();
    return out;
  }

  // Expose for UI pages (popup, offscreen, etc.)
  if (typeof window !== 'undefined') {
    window.W2M = window.W2M || {};
    window.W2M.cleanupMarkdown = cleanupMarkdown;
  }

  // Expose for Service Worker (importScripts context)
  if (typeof self !== 'undefined') {
    self.cleanupMarkdown = cleanupMarkdown;
  }
})();
