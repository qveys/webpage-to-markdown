/**
 * Shared DOM for a successful single-page Markdown conversion (toolbar popup + side panel).
 * Keeps structure, copy, and i18n keys in one place — panel-specific chrome (tabs, toggles) stays in dashboard.js.
 */
(function (global) {
  'use strict';

  var W2M = global.W2M || {};
  global.W2M = W2M;

  /**
   * @param {HTMLElement} parent
   * @param {Object} opts
   * @param {string} opts.bemPrefix - 'view-result' | 'single-panel'
   * @param {string} opts.markdown - full markdown (used for copy + meta; preview may truncate)
   * @param {string} [opts.previewMarkdown] - if set, used for the preview <pre> only (still copy full markdown)
   * @param {string} [opts.url]
   * @param {number} [opts.maxPreviewChars] - omit or non-positive = full preview
   * @param {boolean} [opts.showMeta=true] - size · word count row
   * @param {Function} opts.onCopy
   * @param {Function} opts.onDownload
   * @param {Function} opts.onReconvert
   * @param {string} [opts.reconvertButtonClass]
   */
  W2M.appendSingleConversionSuccess = function (parent, opts) {
    if (!parent || !opts) return;
    var el = W2M.el;
    var t = W2M.i18n.t;
    var formatSize = W2M.i18n.formatSize;

    var bem = opts.bemPrefix || 'view-result';
    var md = opts.markdown || '';
    var previewSource = opts.previewMarkdown != null ? opts.previewMarkdown : md;
    var preview = previewSource;
    var maxC = opts.maxPreviewChars;
    if (typeof maxC === 'number' && maxC > 0 && preview.length > maxC) {
      preview = preview.slice(0, maxC) + '\n…';
    }

    parent.appendChild(el('div', { className: bem + '__status' },
      el('span', { className: 'text-success', textContent: '\u2713' }),
      el('span', { className: 'heading-sm', textContent: t('result.success') })
    ));

    if (opts.url) {
      parent.appendChild(el('div', { className: bem + '__url', textContent: opts.url }));
    }

    parent.appendChild(el('pre', { className: bem + '__preview text-mono', textContent: preview }));

    var actions = el('div', { className: bem + '__actions' });
    actions.appendChild(el('button', {
      className: 'btn btn-secondary',
      textContent: t('result.copy'),
      onClick: opts.onCopy
    }));
    actions.appendChild(el('button', {
      className: 'btn btn-secondary',
      textContent: t('result.download'),
      onClick: opts.onDownload
    }));
    parent.appendChild(actions);

    parent.appendChild(el('button', {
      className: opts.reconvertButtonClass || 'btn btn-secondary btn-full mt-3',
      textContent: t('result.reconvert'),
      onClick: opts.onReconvert
    }));

    if (opts.showMeta !== false) {
      var bytes = new Blob([md]).size;
      var wordMatch = md.match(/\S+/g);
      var words = wordMatch ? wordMatch.length : 0;
      parent.appendChild(el('div', {
        className: bem + '__meta text-muted mt-3',
        textContent: t('result.meta', { size: formatSize(bytes), words: words })
      }));
    }
  };
})(typeof window !== 'undefined' ? window : self);
