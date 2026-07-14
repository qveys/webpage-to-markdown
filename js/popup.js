(function () {
  'use strict';
  var t = W2M.i18n.t;
  var formatDuration = W2M.i18n.formatDuration;
  var formatTimeAgo = W2M.i18n.formatTimeAgo;
  var formatSize = W2M.i18n.formatSize;
  var STATES = W2M.STATES;
  var AppState = W2M.AppState;
  var el = W2M.el;

  var DEFAULT_CAPTURE_SETTINGS = W2M.DEFAULT_CAPTURE_SETTINGS;
  var DEFAULT_CRAWL_SETTINGS = W2M.DEFAULT_CRAWL_SETTINGS;
  var defaultSessionFolder = W2M.defaultSettings.defaultSessionFolder;
  var requestOriginPermission = W2M.defaultSettings.requestOriginPermission;

  function precrawlDelayLabel(ms) {
    if (ms <= 500) return t('precrawl.delay.fast');
    if (ms >= 5000) return t('precrawl.delay.careful');
    return t('precrawl.delay.normal');
  }

  function precrawlDepthLabel(depth) {
    var d = Number(depth);
    if (d === 0) return t('settings.depth.unlimited');
    if (d === 1) return t('settings.depth.1');
    if (d === 5) return t('settings.depth.5');
    return t('settings.depth.3');
  }

  function precrawlMaxBlocksLabel(maxBlocks) {
    if (maxBlocks === 0) return t('settings.maxerrors.never');
    return String(maxBlocks);
  }

  // =============================================
  // MARKDOWN CONVERTER — full business logic
  // =============================================

  function MarkdownConverter() {
    var mo = W2M.markdownOutput && W2M.markdownOutput.defaults;
    this.defaultSettings = mo ? Object.assign({}, mo) : {
      frontmatter: false,
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced'
    };
    this.settings = {};
    var k;
    for (k in this.defaultSettings) {
      if (this.defaultSettings.hasOwnProperty(k)) {
        this.settings[k] = this.defaultSettings[k];
      }
    }
  }

  MarkdownConverter.prototype.loadSettings = function (callback) {
    var self = this;
    chrome.storage.local.get('markdownSettings', function (data) {
      if (data.markdownSettings) {
        var k;
        for (k in data.markdownSettings) {
          if (data.markdownSettings.hasOwnProperty(k)) {
            self.settings[k] = data.markdownSettings[k];
          }
        }
      }
      if (callback) callback();
    });
  };

  MarkdownConverter.prototype.createTurndownService = function () {
    var service = new TurndownService({
      headingStyle: this.settings.headingStyle,
      hr: '---',
      bulletListMarker: this.settings.bulletListMarker,
      codeBlockStyle: this.settings.codeBlockStyle,
      emDelimiter: '_'
    });

    service.keep(['iframe', 'script', 'style']);

    service.addRule('figures', {
      filter: 'figure',
      replacement: function (content, node) {
        var img = node.querySelector('img');
        var caption = node.querySelector('figcaption');
        if (img) {
          var alt = img.getAttribute('alt') || '';
          var src = img.getAttribute('src') || '';
          var captionText = caption ? caption.textContent : '';
          return '\n\n![' + alt + '](' + src + ')\n' + captionText + '\n\n';
        }
        return content;
      }
    });

    // Skip tiny images (icons < 16px) -- pure noise
    service.addRule('skipTinyImages', {
      filter: function (node) {
        if (node.nodeName !== 'IMG') return false;
        var w = parseInt(node.getAttribute('width') || '0', 10);
        var h = parseInt(node.getAttribute('height') || '0', 10);
        return (w > 0 && w < 16) || (h > 0 && h < 16);
      },
      replacement: function () { return ''; }
    });

    return service;
  };

  // cleanupMarkdown is provided by /js/cleanup-markdown.js (loaded via <script> in popup.html)
  MarkdownConverter.prototype.cleanupMarkdown = function (markdown) {
    return W2M.cleanupMarkdown(markdown);
  };

  MarkdownConverter.prototype.convert = function (callback) {
    var self = this;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        callback(new Error('No active tab found'), null);
        return;
      }

      // Prevent scripting on restricted pages
      if (
        tab.url.indexOf('chrome://') === 0 ||
        tab.url.indexOf('chrome-extension://') === 0 ||
        tab.url.indexOf('edge://') === 0 ||
        tab.url.indexOf('about:') === 0 ||
        tab.url.indexOf('chrome.google.com/webstore') !== -1
      ) {
        callback(new Error('Cannot convert system pages or Web Store'), null);
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function () {
          try {
            if (!document || !document.body) {
              throw new Error('Document body not found');
            }

            var getIframeContent = function (iframe) {
              try {
                var iframeDoc = iframe.contentDocument || (iframe.contentWindow ? iframe.contentWindow.document : null);
                if (!iframeDoc || !iframeDoc.body) return '';
                var iframeClone = iframeDoc.body.cloneNode(true);
                var unwantedIframe = iframeClone.querySelectorAll('script, style, nav, footer, aside, .ads, .comments');
                for (var u = 0; u < unwantedIframe.length; u++) unwantedIframe[u].remove();
                return '<div class="iframe-content">' + iframeClone.innerHTML + '</div>';
              } catch (e) {
                return '';
              }
            };

            // Collect rendered dimensions of small images for post-processing
            var smallImgSizes = {};
            var allImgs = document.querySelectorAll('img');
            for (var si = 0; si < allImgs.length; si++) {
              var rect = allImgs[si].getBoundingClientRect();
              var imgW = Math.round(rect.width);
              var imgSrc = allImgs[si].src;
              if (imgW > 0 && imgW < 200 && imgSrc) {
                smallImgSizes[imgSrc] = imgW;
              }
            }

            var bodyClone = document.body.cloneNode(true);

            var iframes = document.querySelectorAll('iframe');
            var iframeContents = [];
            for (var fi = 0; fi < iframes.length; fi++) {
              var fc = getIframeContent(iframes[fi]);
              if (fc) iframeContents.push(fc);
            }

            var unwanted = bodyClone.querySelectorAll(
              'script, style, nav, footer, aside, .ads, .comments, [role="complementary"], .cookie-banner, .popup, .overlay, .modal'
            );
            for (var ui = 0; ui < unwanted.length; ui++) unwanted[ui].remove();

            var mainSelectors = ['main', 'article', '.content', '.post', '.entry', '[role="main"]', '#content', '.main'];
            var mainContent = null;

            for (var ms = 0; ms < mainSelectors.length; ms++) {
              var found = bodyClone.querySelector(mainSelectors[ms]);
              if (found && found.innerHTML.trim().length > 100) {
                mainContent = found;
                break;
              }
            }

            var finalContent = mainContent ? mainContent.innerHTML : bodyClone.innerHTML;

            if (iframeContents.length > 0) {
              finalContent += '<h2>Embedded Content</h2>' + iframeContents.join('<hr>');
            }

            return {
              title: document.title || 'Untitled Page',
              url: document.location.href,
              content: finalContent,
              smallImgSizes: smallImgSizes,
              success: true
            };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }
      }, function (results) {
        if (chrome.runtime.lastError) {
          callback(new Error(chrome.runtime.lastError.message), null);
          return;
        }
        if (!results || !results[0] || !results[0].result) {
          callback(new Error('Failed to get page content'), null);
          return;
        }

        var result = results[0].result;
        if (!result.success) {
          callback(new Error(result.error || 'Failed to extract content'), null);
          return;
        }

        var title = result.title;
        var url = result.url;
        var content = result.content;
        var smallImgSizes = result.smallImgSizes;

        function escapeHtmlText(s) {
          return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        var wrappedContent =
          '<div class="markdown-content"><h1>' + escapeHtmlText(title) + '</h1>' + content + '</div>';

        // Initialize Turndown with current settings
        var turndownService = self.createTurndownService();
        var markdown = turndownService.turndown(wrappedContent);

        markdown = self.cleanupMarkdown(markdown);

        // Constrain small images to their rendered CSS size
        if (smallImgSizes && Object.keys(smallImgSizes).length > 0) {
          markdown = markdown.replace(
            /!\[([^\]]*)\]\(([^)\s]+)\)/g,
            function (match, alt, src) {
              var w = smallImgSizes[src];
              if (w) {
                return '<img src="' + src + '" alt="' + alt + '" style="max-width:' + w + 'px; height:auto;">';
              }
              return match;
            }
          );
        }

        if (self.settings.frontmatter && W2M.markdownOutput && W2M.markdownOutput.prependYamlFrontmatter) {
          markdown = W2M.markdownOutput.prependYamlFrontmatter(markdown, title, url);
        }

        callback(null, { markdown: markdown, url: url, title: title });

        // Persist last conversion
        chrome.storage.local.set({
          lastConversion: {
            url: url,
            markdown: markdown,
            timestamp: Date.now()
          }
        });
      });
    });
  };

  // =============================================
  // SVG HELPERS (no innerHTML)
  // =============================================

  function createSvgIcon(type) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '48');
    svg.setAttribute('height', '48');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    if (type === 'document') {
      var p1 = document.createElementNS(ns, 'path');
      p1.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
      var p2 = document.createElementNS(ns, 'polyline');
      p2.setAttribute('points', '14 2 14 8 20 8');
      var l1 = document.createElementNS(ns, 'line');
      l1.setAttribute('x1', '16'); l1.setAttribute('y1', '13'); l1.setAttribute('x2', '8'); l1.setAttribute('y2', '13');
      var l2 = document.createElementNS(ns, 'line');
      l2.setAttribute('x1', '16'); l2.setAttribute('y1', '17'); l2.setAttribute('x2', '8'); l2.setAttribute('y2', '17');
      svg.appendChild(p1); svg.appendChild(p2); svg.appendChild(l1); svg.appendChild(l2);
    } else if (type === 'alert') {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z');
      var line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', '12'); line.setAttribute('y1', '9'); line.setAttribute('x2', '12'); line.setAttribute('y2', '13');
      var line2 = document.createElementNS(ns, 'line');
      line2.setAttribute('x1', '12'); line2.setAttribute('y1', '17'); line2.setAttribute('x2', '12.01'); line2.setAttribute('y2', '17');
      svg.appendChild(p); svg.appendChild(line); svg.appendChild(line2);
    }
    return svg;
  }

  // =============================================
  // VIEWS
  // =============================================

  function createHomeView(data) {
    return {
      render: function () {
        var container = el('div', { className: 'view-home' });
        var icon = el('div', { className: 'view-home__icon' });
        icon.appendChild(createSvgIcon('document'));
        container.appendChild(icon);
        container.appendChild(el('h1', { className: 'heading-lg view-home__title', textContent: t('home.title') }));
        var actions = el('div', { className: 'view-home__actions' });
        actions.appendChild(el('button', { className: 'btn btn-primary btn-full', id: 'btn-convert', textContent: t('home.cta'), onClick: function () { app.handleConvert(); } }));
        actions.appendChild(el('button', { className: 'btn btn-secondary btn-full', textContent: t('home.crawl'), onClick: function () { state.navigate(STATES.PRECRAWL, { url: app.currentUrl }); } }));
        container.appendChild(actions);
        if (data && data.lastConversion) {
          var hist = el('div', { className: 'view-home__history text-muted' }, t('home.history') + ' ' + data.lastConversion.url + ' — ' + formatTimeAgo(data.lastConversion.timestamp));
          container.appendChild(hist);
        }
        return container;
      },
      init: function () {
        document.getElementById('header-title').textContent = t('app.title');
        document.getElementById('btn-back').classList.add('hidden');
      }
    };
  }

  function createConvertingView() {
    return {
      render: function () {
        var container = el('div', { className: 'view-home' });
        var spinner = el('div', { className: 'spinner', style: 'margin: var(--space-6) auto' });
        container.appendChild(spinner);
        container.appendChild(el('p', { className: 'text-muted text-center', textContent: t('toast.converting') }));
        return container;
      },
      init: function () {
        document.getElementById('btn-back').classList.add('hidden');
      }
    };
  }

  function createResultView(data) {
    return {
      render: function () {
        var md = data.markdown || '';
        var container = el('div', { className: 'view-result' });
        W2M.appendSingleConversionSuccess(container, {
          bemPrefix: 'view-result',
          markdown: md,
          url: data.url || '',
          showMeta: true,
          onCopy: function () { app.handleCopy(); },
          onDownload: function () { app.handleDownload(); },
          onReconvert: function () { app.handleConvert(); },
          reconvertButtonClass: 'btn btn-secondary btn-full mt-3'
        });
        return container;
      },
      init: function () {
        document.getElementById('header-title').textContent = t('result.title');
        document.getElementById('btn-back').classList.remove('hidden');
      }
    };
  }

  function createErrorView(data) {
    var type = data.errorType || 'convert';
    return {
      render: function () {
        var container = el('div', { className: 'view-error' });
        var icon = el('div', { className: 'view-error__icon' });
        icon.appendChild(createSvgIcon('alert'));
        container.appendChild(icon);
        container.appendChild(el('h1', { className: 'heading-lg view-error__title', textContent: t('error.' + type + '.title') }));
        container.appendChild(el('p', { className: 'view-error__message', textContent: t('error.' + type + '.message') }));
        container.appendChild(el('button', { className: 'btn btn-primary btn-full', textContent: t('error.retry'), onClick: function () { state.navigate(STATES.IDLE, { lastConversion: app.lastConversion }); } }));
        var hint = t('error.' + type + '.hint');
        if (hint && hint !== 'error.' + type + '.hint') {
          container.appendChild(el('p', { className: 'view-error__hint text-muted', textContent: hint }));
        }
        return container;
      },
      init: function () {
        document.getElementById('header-title').textContent = t('error.title');
        document.getElementById('btn-back').classList.remove('hidden');
      }
    };
  }

  function createPreCrawlView(data) {
    var folderInput, urlTreeCb, assetsCb;
    var summaryVals = null;
    var storageListener = null;

    function summaryRow(labelText, valueEl) {
      return el('div', { className: 'precrawl-settings-summary__row' },
        el('span', { className: 'precrawl-settings-summary__label', textContent: labelText }),
        valueEl
      );
    }

    function fillSettingsSummary(cap, cr) {
      if (!summaryVals) return;
      summaryVals.delay.textContent = precrawlDelayLabel(cap.delay);
      summaryVals.depth.textContent = precrawlDepthLabel(cr.depth);
      summaryVals.concurrency.textContent = String(cr.concurrency);
      summaryVals.maxErrors.textContent = precrawlMaxBlocksLabel(cr.maxBlocks);
    }

    function applyPrecrawlFromStorage(data) {
      var cap = Object.assign({}, DEFAULT_CAPTURE_SETTINGS, data.captureSettings || {});
      var cr = Object.assign({}, DEFAULT_CRAWL_SETTINGS, data.crawlSettings || {});
      if (urlTreeCb) urlTreeCb.checked = !!cap.urlTree;
      if (assetsCb) assetsCb.checked = !!cap.saveAssets;
      fillSettingsSummary(cap, cr);
    }

    function persistPrecrawlCheckboxes() {
      chrome.storage.local.get(['captureSettings'], function (store) {
        var cap = Object.assign({}, DEFAULT_CAPTURE_SETTINGS, store.captureSettings || {});
        cap.urlTree = !!(urlTreeCb && urlTreeCb.checked);
        cap.saveAssets = !!(assetsCb && assetsCb.checked);
        chrome.storage.local.set({ captureSettings: cap });
        chrome.runtime.sendMessage({
          type: 'W2M_UPDATE_SESSION',
          patch: { urlTree: cap.urlTree, saveAssets: cap.saveAssets }
        }).catch(function (err) {
          if (err.message && err.message.indexOf('Receiving end does not exist') === -1) {
            console.warn('[W2M] sendMessage:', err.message);
          }
        });
      });
    }

    return {
      render: function () {
        var container = el('div', { className: 'view-precrawl' });
        // URL
        container.appendChild(el('div', { className: 'form-group' },
          el('label', { className: 'form-label text-muted', textContent: t('precrawl.start') }),
          el('div', { className: 'heading-sm', textContent: data.url || '' })
        ));
        // Folder
        var defaultFolder = defaultSessionFolder(data.url || '');
        folderInput = el('input', { className: 'form-input', type: 'text', value: defaultFolder });
        container.appendChild(el('div', { className: 'form-group' },
          el('label', { className: 'form-label', textContent: t('precrawl.folder') }),
          folderInput
        ));
        // Checkboxes
        var cbGroup = el('div', { className: 'form-group' });
        urlTreeCb = el('input', { type: 'checkbox', className: 'form-checkbox', checked: '' });
        var utLabel = el('label', { className: 'form-checkbox-label' });
        utLabel.appendChild(urlTreeCb);
        utLabel.appendChild(document.createTextNode(' ' + t('precrawl.organize')));
        cbGroup.appendChild(utLabel);
        assetsCb = el('input', { type: 'checkbox', className: 'form-checkbox', checked: '' });
        var asLabel = el('label', { className: 'form-checkbox-label' });
        asLabel.appendChild(assetsCb);
        asLabel.appendChild(document.createTextNode(' ' + t('precrawl.assets')));
        cbGroup.appendChild(asLabel);
        container.appendChild(cbGroup);

        summaryVals = {
          delay: el('span', { className: 'precrawl-settings-summary__value' }),
          depth: el('span', { className: 'precrawl-settings-summary__value' }),
          concurrency: el('span', { className: 'precrawl-settings-summary__value' }),
          maxErrors: el('span', { className: 'precrawl-settings-summary__value' })
        };
        var summary = el('div', { className: 'precrawl-settings-summary' },
          el('div', { className: 'precrawl-settings-summary__title', textContent: t('precrawl.activeSettings') }),
          summaryRow(t('settings.delay'), summaryVals.delay),
          summaryRow(t('settings.depth'), summaryVals.depth),
          summaryRow(t('settings.concurrency'), summaryVals.concurrency),
          summaryRow(t('settings.maxerrors'), summaryVals.maxErrors),
          el('p', { className: 'precrawl-settings-summary__hint text-muted', textContent: t('precrawl.settingsFootnote') })
        );
        container.appendChild(summary);

        // CTA
        container.appendChild(el('div', { className: 'mt-5' },
          el('button', {
            className: 'btn btn-primary btn-full', textContent: t('precrawl.cta'), onClick: function () {
              app.handleStartCrawl({
                folder: folderInput.value,
                urlTree: urlTreeCb.checked,
                saveAssets: assetsCb.checked
              });
            }
          })
        ));
        return container;
      },
      init: function () {
        document.getElementById('header-title').textContent = t('precrawl.title');
        document.getElementById('btn-back').classList.remove('hidden');
        var cap0 = Object.assign({}, DEFAULT_CAPTURE_SETTINGS);
        var cr0 = Object.assign({}, DEFAULT_CRAWL_SETTINGS);
        fillSettingsSummary(cap0, cr0);
        chrome.storage.local.get(['captureSettings', 'crawlSettings'], function (data) {
          applyPrecrawlFromStorage(data);
        });
        if (urlTreeCb) urlTreeCb.addEventListener('change', persistPrecrawlCheckboxes);
        if (assetsCb) assetsCb.addEventListener('change', persistPrecrawlCheckboxes);
        storageListener = function (changes, area) {
          if (area !== 'local') return;
          if (!changes.captureSettings && !changes.crawlSettings) return;
          chrome.storage.local.get(['captureSettings', 'crawlSettings'], applyPrecrawlFromStorage);
        };
        chrome.storage.onChanged.addListener(storageListener);
      },
      cleanup: function () {
        if (storageListener) {
          chrome.storage.onChanged.removeListener(storageListener);
          storageListener = null;
        }
      }
    };
  }

  function createProgressView(data) {
    var progressFill, statCaptured, statQueued, statErrors, speedEl, elapsedEl, activityList;
    var startTime = Date.now();

    return {
      render: function () {
        var container = el('div', { className: 'view-progress' });
        container.appendChild(el('div', { className: 'heading-sm mb-3', textContent: data.url || '' }));
        var bar = el('div', { className: 'progress-bar' });
        progressFill = el('div', { className: 'progress-fill', style: 'width:0%' });
        bar.appendChild(progressFill);
        container.appendChild(bar);

        speedEl = el('span', { className: 'text-muted', textContent: t('progress.speed', { speed: 0 }) });
        elapsedEl = el('span', { className: 'text-muted', textContent: t('progress.elapsed', { time: '0s' }) });
        container.appendChild(el('div', { className: 'progress-info mt-3' }, speedEl, elapsedEl));

        var stats = el('div', { className: 'stat-grid mt-3' });
        statCaptured = el('div', { className: 'stat-value', textContent: '0' });
        stats.appendChild(el('div', { className: 'stat-card stat-card--success' }, statCaptured, el('div', { className: 'stat-label', textContent: t('progress.done') })));
        statQueued = el('div', { className: 'stat-value', textContent: '0' });
        stats.appendChild(el('div', { className: 'stat-card stat-card--info' }, statQueued, el('div', { className: 'stat-label', textContent: t('progress.waiting') })));
        statErrors = el('div', { className: 'stat-value', textContent: '0' });
        stats.appendChild(el('div', { className: 'stat-card stat-card--error' }, statErrors, el('div', { className: 'stat-label', textContent: t('progress.errors') })));
        container.appendChild(stats);

        container.appendChild(el('div', { className: 'section-label mt-4', textContent: t('progress.recent') }));
        activityList = el('div', { className: 'activity-list' });
        container.appendChild(activityList);

        var footer = el('div', { className: 'mt-4', style: 'display:flex;gap:var(--space-3)' });
        footer.appendChild(el('button', { className: 'btn btn-secondary', id: 'btn-pause', textContent: t('progress.pause'), style: 'flex:1', onClick: function () { app.handlePause(); } }));
        footer.appendChild(el('button', { className: 'btn btn-danger', textContent: t('progress.stop'), style: 'flex:1', onClick: function () { app.handleStop(); } }));
        container.appendChild(footer);

        container.appendChild(el('div', { className: 'text-center mt-3' },
          el('a', { href: '#', className: 'text-secondary', textContent: t('progress.detail'), onClick: function (e) { e.preventDefault(); app.openDashboard(); } })
        ));
        return container;
      },
      init: function () {
        var header = document.getElementById('header-title');
        if (header) {
          header.textContent = (data && data.folder) ? data.folder : t('progress.title');
        }
        document.getElementById('btn-back').classList.add('hidden');
        startTime = Date.now();
      },
      update: function (d) {
        if (statCaptured) statCaptured.textContent = d.captured || 0;
        if (statQueued) statQueued.textContent = d.queued || 0;
        if (statErrors) statErrors.textContent = d.blocked || 0;
        if (progressFill) {
          var total = (d.captured || 0) + (d.queued || 0);
          progressFill.style.width = (total > 0 ? Math.round((d.captured || 0) / total * 100) : 0) + '%';
        }
        if (speedEl && d.speed !== undefined) speedEl.textContent = t('progress.speed', { speed: d.speed });
        if (elapsedEl) elapsedEl.textContent = t('progress.elapsed', { time: formatDuration(Date.now() - startTime) });
        if (d.lastPage && activityList) {
          var iconChar = d.lastPage.success ? '\u2713' : '\u2717';
          var cls = d.lastPage.success ? 'activity-icon--success' : 'activity-icon--error';
          var item = el('div', { className: 'activity-item' },
            el('span', { className: 'activity-time', textContent: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }),
            el('span', { className: 'activity-icon ' + cls, textContent: iconChar }),
            el('span', { className: 'activity-url', textContent: d.lastPage.url })
          );
          if (activityList.firstChild) activityList.insertBefore(item, activityList.firstChild);
          else activityList.appendChild(item);
          while (activityList.children.length > 20) activityList.removeChild(activityList.lastChild);
        }
        // Update pause button text
        var pauseBtn = document.getElementById('btn-pause');
        if (pauseBtn) {
          var isPaused = state.getState() === STATES.PAUSED;
          pauseBtn.textContent = isPaused ? t('progress.resume') : t('progress.pause');
        }
      },
      cleanup: function () { }
    };
  }

  function createCrawlResultView(data) {
    return {
      render: function () {
        var hasErr = (data.blocked || 0) > 0;
        var captured = data.captured || 0;
        var blocked = data.blocked || 0;
        var images = data.images || 0;
        var container = el('div', { className: 'view-crawl-result' });

        // Hero status
        var iconClass = hasErr ? 'crawl-hero--warning' : 'crawl-hero--success';
        var iconChar = hasErr ? '\u26A0' : '\u2713';
        container.appendChild(el('div', { className: 'crawl-hero ' + iconClass },
          el('div', { className: 'crawl-hero__icon', textContent: iconChar }),
          el('div', { className: 'crawl-hero__title', textContent: t('crawlresult.pages', { count: captured }) }),
          hasErr
            ? el('div', { className: 'crawl-hero__sub', textContent: t('crawlresult.errors', { count: blocked }) })
            : el('div', { className: 'crawl-hero__sub', textContent: t('crawlresult.title') })
        ));

        // Stats row
        var statsGrid = el('div', { className: 'stat-grid mt-4' });
        statsGrid.appendChild(el('div', { className: 'stat-card stat-card--success' },
          el('div', { className: 'stat-value', textContent: String(captured) }),
          el('div', { className: 'stat-label', textContent: t('progress.done') })
        ));
        statsGrid.appendChild(el('div', { className: 'stat-card stat-card--error' },
          el('div', { className: 'stat-value', textContent: String(blocked) }),
          el('div', { className: 'stat-label', textContent: t('progress.errors') })
        ));
        statsGrid.appendChild(el('div', { className: 'stat-card stat-card--info' },
          el('div', { className: 'stat-value', textContent: String(images) }),
          el('div', { className: 'stat-label', textContent: 'Images' })
        ));
        container.appendChild(statsGrid);

        // Details card
        var detailRows = [];
        if (data.folder) {
          detailRows.push(el('div', { className: 'crawl-detail__row' },
            el('span', { className: 'crawl-detail__label', textContent: t('crawlresult.folder', { folder: '' }).replace(':', '').trim() }),
            el('span', { className: 'crawl-detail__value monospace', textContent: data.folder })
          ));
        }
        if (data.duration) {
          detailRows.push(el('div', { className: 'crawl-detail__row' },
            el('span', { className: 'crawl-detail__label', textContent: t('crawlresult.duration', { time: '' }).replace(':', '').trim() }),
            el('span', { className: 'crawl-detail__value', textContent: formatDuration(data.duration) })
          ));
        }
        if (captured > 0 && data.duration > 0) {
          var pagesPerMin = Math.round((captured / data.duration) * 60000);
          detailRows.push(el('div', { className: 'crawl-detail__row' },
            el('span', { className: 'crawl-detail__label', textContent: t('progress.speed', { speed: '' }).replace(':', '').replace('~', '').trim() }),
            el('span', { className: 'crawl-detail__value', textContent: '~' + pagesPerMin + ' pages/min' })
          ));
        }
        if (data.totalSize) {
          detailRows.push(el('div', { className: 'crawl-detail__row' },
            el('span', { className: 'crawl-detail__label', textContent: t('crawlresult.size', { size: '' }).replace(':', '').trim() }),
            el('span', { className: 'crawl-detail__value', textContent: formatSize(data.totalSize) })
          ));
        }
        if (detailRows.length > 0) {
          var detailCard = el('div', { className: 'card crawl-detail mt-4' });
          detailRows.forEach(function (row) { detailCard.appendChild(row); });
          container.appendChild(detailCard);
        }

        // Errors list
        if (hasErr && data.blockedUrls) {
          container.appendChild(el('div', { className: 'section-label mt-4', textContent: t('crawlresult.errors.section', { count: blocked }) }));
          var errList = el('div', { className: 'view-crawl-result__errors' });
          (data.blockedUrls || []).forEach(function (err) {
            errList.appendChild(el('div', { className: 'error-item' },
              el('div', { className: 'error-item__url', textContent: err.url }),
              el('div', { className: 'error-item__reason text-muted', textContent: err.reason || '' }),
              el('div', { className: 'error-item__actions' },
                el('button', { className: 'btn btn-sm', textContent: t('crawlresult.retry'), onClick: function () { app.handleRetry(err.url); } })
              )
            ));
          });
          container.appendChild(errList);
        }

        // Actions
        container.appendChild(el('div', { className: 'mt-4' },
          el('button', { className: 'btn btn-primary btn-full', textContent: t('crawlresult.new'), onClick: function () { state.navigate(STATES.IDLE); } })
        ));
        return container;
      },
      init: function () {
        document.getElementById('header-title').textContent = t('crawlresult.title');
        document.getElementById('btn-back').classList.remove('hidden');
      }
    };
  }

  // =============================================
  // APP CONTROLLER
  // =============================================
  var state = new AppState();
  var app;

  function App() {
    this.converter = new MarkdownConverter();
    this.currentUrl = '';
    this.currentTitle = '';
    this.currentMarkdown = '';
    this.crawlPort = null;
    this.lastConversion = null;
    this.toastTimeout = null;
    this.isDark = false;
    this.elapsedInterval = null;
  }

  App.prototype.init = function () {
    var self = this;

    // Initialize locale
    W2M.i18n.initLocale().then(function () {
      self._setupViews();
      self._setupHeader();
      self._setupTheme();
      self._getCurrentTab(function () {
        self._restoreLastState();
        self.converter.loadSettings(function () {
          self._checkExistingSession();
        });
      });
    }).catch(function (err) {
      console.warn('[W2M] initLocale failed, using fallback:', err && err.message);
      // Fallback if initLocale fails
      self._setupViews();
      self._setupHeader();
      self._setupTheme();
      self._getCurrentTab(function () {
        self._restoreLastState();
        self.converter.loadSettings(function () {
          self._checkExistingSession();
        });
      });
    });
  };

  App.prototype._setupViews = function () {
    state.setContainer(document.getElementById('app-body'));

    state.registerView(STATES.IDLE, function (data) { return createHomeView(data); });
    state.registerView(STATES.CONVERTING, function (data) { return createConvertingView(data); });
    state.registerView(STATES.SUCCESS, function (data) { return createResultView(data); });
    state.registerView(STATES.ERROR, function (data) { return createErrorView(data); });
    state.registerView(STATES.UNAVAILABLE, function (data) { return createErrorView(Object.assign({ errorType: 'unavailable' }, data)); });
    state.registerView(STATES.PRECRAWL, function (data) { return createPreCrawlView(data); });
    state.registerView(STATES.RUNNING, function (data) { return createProgressView(data); });
    state.registerView(STATES.PAUSED, function (data) { return createProgressView(data); });
    state.registerView(STATES.CRAWL_SUCCESS, function (data) { return createCrawlResultView(data); });
    state.registerView(STATES.CRAWL_PARTIAL, function (data) { return createCrawlResultView(data); });

    state.navigate(STATES.IDLE, {});
  };

  App.prototype._setupHeader = function () {
    var self = this;

    document.getElementById('btn-back').addEventListener('click', function () {
      var current = state.getState();
      if (current === STATES.SUCCESS || current === STATES.ERROR || current === STATES.UNAVAILABLE) {
        state.navigate(STATES.IDLE, { lastConversion: self.lastConversion });
      } else if (current === STATES.PRECRAWL) {
        state.navigate(STATES.IDLE, { lastConversion: self.lastConversion });
      } else if (current === STATES.CRAWL_SUCCESS || current === STATES.CRAWL_PARTIAL) {
        state.navigate(STATES.IDLE, { lastConversion: self.lastConversion });
      }
    });

    var sidepanelBtn = document.getElementById('btn-sidepanel-single');
    if (sidepanelBtn) {
      sidepanelBtn.setAttribute('aria-label', t('home.sidePanelSingle'));
      sidepanelBtn.addEventListener('click', function () {
        self.openDashboardSinglePage();
      });
    }

    document.getElementById('btn-settings').addEventListener('click', function () {
      var cur = state.getState();
      if (cur === STATES.RUNNING || cur === STATES.PAUSED) {
        // During crawl, open side panel in settings view
        // Set flag first so dashboard shows settings even if it's just loading
        chrome.storage.local.set({ showSettingsOnOpen: true }, function () {
          chrome.windows.getCurrent(function (win) {
            chrome.sidePanel.open({ windowId: win.id }, function () {
              chrome.runtime.sendMessage({ type: 'W2M_SHOW_SETTINGS' }).catch(function (err) {
                if (err.message && err.message.indexOf('Receiving end does not exist') === -1) {
                  console.warn('[W2M] sendMessage:', err.message);
                }
              });
              window.close();
            });
          });
        });
      } else {
        chrome.runtime.openOptionsPage();
        window.close();
      }
    });

    // Listen for capture count updates and crawl status broadcasts
    chrome.runtime.onMessage.addListener(function (message) {
      if (message.type === 'W2M_CAPTURE_COUNT') {
        var current = state.getState();
        if (current === STATES.RUNNING || current === STATES.PAUSED) {
          state.updateData({ captured: message.count });
        }
      }
      if (message.type === 'W2M_CRAWL_STATUS' && message.status === 'stopped') {
        var cur = state.getState();
        if (cur === STATES.RUNNING || cur === STATES.PAUSED) {
          app._finalizeCrawl(message.stats, message.blockedUrls);
        }
      }
    });
  };

  App.prototype._setupTheme = function () {
    var self = this;
    var themeBtn = document.getElementById('btn-theme');

    themeBtn.addEventListener('click', function () {
      W2M.theme.toggleTheme();
    });

    W2M.theme.subscribe(function (theme) {
      self._updateThemeIcon(theme);
    });
  };

  App.prototype._updateThemeIcon = function (theme) {
    var btn = document.getElementById('btn-theme');
    if (!btn) return;
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    var svg = W2M.buildThemeIcon(W2M.theme.isDarkTheme(theme));
    svg.id = 'icon-theme';
    btn.appendChild(svg);
  };

  App.prototype._getCurrentTab = function (callback) {
    var self = this;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (tab) {
        self.currentUrl = tab.url || '';
        self.currentTitle = tab.title || '';
      }
      callback();
    });
  };

  App.prototype._restoreLastState = function () {
    var self = this;
    chrome.storage.local.get('lastConversion', function (data) {
      if (data.lastConversion) {
        self.lastConversion = data.lastConversion;
        // Update the home view if we are still on it
        if (state.getState() === STATES.IDLE) {
          state.navigate(STATES.IDLE, { lastConversion: self.lastConversion });
        }
      }
    });
  };

  App.prototype._checkExistingSession = function () {
    var self = this;
    chrome.runtime.sendMessage({ type: 'W2M_GET_SESSION' }, function (session) {
      if (chrome.runtime.lastError) return;
      if (session && session.active) {
        // A session is active, show crawl progress
        if (session.crawling) {
          state.navigate(STATES.RUNNING, {
            url: session.startUrl || self.currentUrl,
            folder: session.folder || ''
          });
          self.connectCrawlPort();
        }
      } else if (session && session.lastCrawlResult) {
        // Crawl just ended (stopped from dashboard) — show results
        var result = session.lastCrawlResult;
        // Only show if the result is recent (< 5 min)
        if (Date.now() - result.timestamp < 300000) {
          chrome.runtime.sendMessage({ type: 'W2M_UPDATE_SESSION', patch: { lastCrawlResult: null } });
          self._finalizeCrawl(result.stats, result.blockedUrls);
        }
      }
    });
  };

  // =============================================
  // HANDLERS
  // =============================================

  App.prototype.handleConvert = function () {
    var self = this;
    state.navigate(STATES.CONVERTING, {});

    this.converter.convert(function (err, result) {
      if (err) {
        var errorType = 'convert';
        if (err.message.indexOf('system pages') !== -1 || err.message.indexOf('Web Store') !== -1) {
          errorType = 'unavailable';
        }
        state.navigate(STATES.ERROR, { errorType: errorType, message: err.message });
        return;
      }

      self.currentMarkdown = result.markdown;
      self.currentUrl = result.url;
      self.currentTitle = result.title;
      self.lastConversion = { url: result.url, timestamp: Date.now() };

      state.navigate(STATES.SUCCESS, {
        markdown: result.markdown,
        url: result.url,
        title: result.title
      });
    });
  };

  App.prototype.handleCopy = function () {
    var self = this;
    if (!this.currentMarkdown) return;

    navigator.clipboard.writeText(this.currentMarkdown).then(function () {
      self.showToast(t('toast.copied'), 'success');
    }).catch(function (err) {
      console.warn('[W2M] clipboard write:', err && err.message);
      self.showToast(t('toast.error'), 'error');
    });
  };

  App.prototype.handleDownload = function () {
    var self = this;
    if (!this.currentMarkdown) return;
    chrome.runtime.sendMessage({
      type: 'W2M_DOWNLOAD_MARKDOWN',
      markdown: this.currentMarkdown,
      title: this.currentTitle || 'page'
    }, function (res) {
      if (chrome.runtime.lastError || !res || !res.ok) {
        self.showToast(t('toast.error'), 'error');
        return;
      }
      self.showToast(t('toast.downloaded'), 'success');
    });
  };

  App.prototype.handleStartCrawl = function (options) {
    var self = this;
    var folder = options.folder || '';

    requestOriginPermission(this.currentUrl, function (granted) {
      if (!granted) {
        state.navigate(STATES.ERROR, {
          errorType: 'permission',
          message: t('error.permission')
        });
        return;
      }

      chrome.storage.local.get(['captureSettings', 'crawlSettings'], function (data) {
        var cap = Object.assign({}, DEFAULT_CAPTURE_SETTINGS, data.captureSettings || {});
        var cr = Object.assign({}, DEFAULT_CRAWL_SETTINGS, data.crawlSettings || {});
        cap.urlTree = !!options.urlTree;
        cap.saveAssets = !!options.saveAssets;
        chrome.storage.local.set({ captureSettings: cap });
        chrome.runtime.sendMessage({
          type: 'W2M_UPDATE_SESSION',
          patch: {
            urlTree: cap.urlTree,
            saveAssets: cap.saveAssets,
            maxAssetSizeMb: cap.maxAssetSizeMb,
            maxSessionAssetSizeMb: cap.maxSessionAssetSizeMb
          }
        }).catch(function (err) {
          if (err.message && err.message.indexOf('Receiving end does not exist') === -1) {
            console.warn('[W2M] sendMessage:', err.message);
          }
        });
        var delay = cap.delay;
        var depthNum = Number(cr.depth);
        var depth = Number.isFinite(depthNum) ? depthNum : DEFAULT_CRAWL_SETTINGS.depth;
        var concurrency = Number(cr.concurrency) || DEFAULT_CRAWL_SETTINGS.concurrency;
        var maxBlocksRaw = cr.maxBlocks;
        var maxBlocks = DEFAULT_CRAWL_SETTINGS.maxBlocks;
        if (maxBlocksRaw !== undefined && maxBlocksRaw !== null) {
          var mb = Number(maxBlocksRaw);
          if (Number.isFinite(mb)) maxBlocks = mb;
        }

        chrome.runtime.sendMessage({
          type: 'W2M_CRAWL_START',
          startUrl: self.currentUrl,
          folder: folder,
          delay: delay,
          urlTree: options.urlTree,
          saveAssets: options.saveAssets,
          maxAssetSizeMb: cap.maxAssetSizeMb,
          maxSessionAssetSizeMb: cap.maxSessionAssetSizeMb,
          concurrency: concurrency,
          maxBlocks: maxBlocks,
          depth: depth
        }, function (res) {
          if (chrome.runtime.lastError) {
            state.navigate(STATES.ERROR, { errorType: 'network' });
            return;
          }
          if (res && res.ok) {
            // Keep side panel and popup aligned on Crawl mode when a crawl starts.
            chrome.storage.local.set({ dashboardMode: 'crawl' }, function () {
              chrome.runtime.sendMessage({ type: 'W2M_APPLY_DASHBOARD_MODE', mode: 'crawl' }).catch(function (err) {
                if (err && err.message && err.message.indexOf('Receiving end does not exist') === -1) {
                  console.warn('[W2M] sendMessage:', err.message);
                }
              });
            });
            state.navigate(STATES.RUNNING, { url: self.currentUrl, folder: folder });
            self.connectCrawlPort();
          } else {
            state.navigate(STATES.ERROR, { errorType: 'convert', message: (res && res.error) || 'Failed to start' });
          }
        });
      });
    });
  };

  /**
   * Same control path as dashboard: prefer crawl port → CrawlEngine; fall back to
   * runtime messages if the port died (e.g. service worker restart).
   */
  App.prototype.sendCrawlControl = function (portType, fallbackType, extra) {
    var payload = Object.assign({ type: portType }, extra || {});
    if (this.crawlPort) {
      try {
        this.crawlPort.postMessage(payload);
        return;
      } catch (e) {
        this.crawlPort = null;
      }
    }
    chrome.runtime.sendMessage(Object.assign({ type: fallbackType }, extra || {}));
  };

  App.prototype.handlePause = function () {
    var current = state.getState();
    if (current === STATES.RUNNING) {
      this.sendCrawlControl('crawl:pause', 'W2M_CRAWL_PAUSE');
      state.navigate(STATES.PAUSED, state.getData());
    } else if (current === STATES.PAUSED) {
      this.sendCrawlControl('crawl:resume', 'W2M_CRAWL_RESUME');
      state.navigate(STATES.RUNNING, state.getData());
    }
  };

  // Shared helper: navigate to crawl result state from stats + current data
  App.prototype._finalizeCrawl = function (stats, extraBlockedUrls) {
    var d = state.getData();
    var startMs = (stats && stats.startTime != null) ? stats.startTime : (d.startTime != null ? d.startTime : Date.now());
    var blocked = (stats && stats.blocked != null) ? stats.blocked : (d.blocked || 0);
    var hasErrors = blocked > 0;
    var targetState = hasErrors ? STATES.CRAWL_PARTIAL : STATES.CRAWL_SUCCESS;
    state.navigate(targetState, {
      captured: (stats && stats.captured != null) ? stats.captured : (d.captured || 0),
      blocked: blocked,
      images: (stats && stats.images != null) ? stats.images : (d.images || 0),
      folder: d.folder || '',
      duration: Date.now() - startMs,
      totalSize: (stats && stats.totalSize != null) ? stats.totalSize : (d.totalSize || 0),
      blockedUrls: extraBlockedUrls || d.blockedUrls || []
    });
    if (this.crawlPort) {
      this.crawlPort.disconnect();
      this.crawlPort = null;
    }
  };

  App.prototype.handleStop = function () {
    var self = this;
    chrome.runtime.sendMessage({ type: 'W2M_CRAWL_STOP' }, function () {
      var data = state.getData();
      if (data.startTime != null) {
        self._finalizeCrawl(null);
      } else {
        chrome.runtime.sendMessage({ type: 'W2M_CRAWL_GET_STATUS' }, function (res) {
          self._finalizeCrawl(res && res.stats);
        });
      }
    });
  };

  App.prototype.handleRetry = function (url) {
    this.sendCrawlControl('crawl:retry', 'W2M_CRAWL_RETRY', { url: url });
    this.showToast(t('crawlresult.retry') + ': ' + url, 'info');
  };

  App.prototype.connectCrawlPort = function () {
    var self = this;
    if (this.crawlPort) return;

    this.crawlPort = chrome.runtime.connect({ name: 'crawl' });
    this.crawlPort.onMessage.addListener(function (msg) {
      if (msg.type === 'crawl:status') {
        var stats = msg.stats || {};
        var cur = state.getState();
        if (msg.status === 'stopped' && (cur === STATES.RUNNING || cur === STATES.PAUSED)) {
          self._finalizeCrawl(stats, msg.blockedUrls);
          return;
        }
        var crawlPatch = {
          captured: stats.captured || 0,
          queued: stats.queued || 0,
          blocked: stats.blocked || 0,
          images: stats.images || 0,
          speed: stats.speed || 0,
          totalSize: stats.totalSize || 0,
          blockedUrls: stats.blockedUrls || [],
          lastPage: stats.lastPage || null
        };
        if (stats.startTime != null) crawlPatch.startTime = stats.startTime;
        state.updateData(crawlPatch);
      }
      if (msg.type === 'crawl:done') {
        self._finalizeCrawl(null);
      }
    });
    this.crawlPort.onDisconnect.addListener(function () {
      self.crawlPort = null;
    });
  };

  App.prototype.openDashboard = function () {
    chrome.windows.getCurrent(function (win) {
      chrome.sidePanel.open({ windowId: win.id }, function () {
        window.close();
      });
    });
  };

  /** Open side panel focused on Single page tab (persists dashboard mode + notifies dashboard). */
  App.prototype.openDashboardSinglePage = function () {
    chrome.storage.local.set({ dashboardMode: 'single' }, function () {
      chrome.windows.getCurrent(function (win) {
        chrome.sidePanel.open({ windowId: win.id }, function () {
          if (chrome.runtime.lastError) {
            console.warn('[W2M] sidePanel.open:', chrome.runtime.lastError.message);
          }
          chrome.runtime.sendMessage({ type: 'W2M_APPLY_DASHBOARD_MODE', mode: 'single' }).catch(function (err) {
            if (err && err.message && err.message.indexOf('Receiving end does not exist') === -1) {
              console.warn('[W2M] sendMessage:', err.message);
            }
          });
          window.close();
        });
      });
    });
  };

  App.prototype.showToast = function (message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    var toast = el('div', { className: 'toast toast--' + type, textContent: message });
    container.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(function () {
      toast.classList.add('toast--visible');
    });

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(function () {
      toast.classList.remove('toast--visible');
      toast.addEventListener('transitionend', function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
    }, 2000);
  };

  // =============================================
  // INIT
  // =============================================
  document.addEventListener('DOMContentLoaded', function () {
    app = new App();
    app.init();
  });
})();
