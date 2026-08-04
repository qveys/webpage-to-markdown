(function () {
  'use strict';

  var t = function (key, params) { return W2M.i18n.t(key, params); };
  var el = W2M.el;

  var DEFAULTS = {
    markdown: { frontmatter: false, headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' },
    capture: { delay: 2000, urlTree: true, saveAssets: true, maxAssetSizeMb: 10, maxSessionAssetSizeMb: 50 },
    crawl: { concurrency: 3, maxBlocks: 5, depth: 0 }
  };

  function SettingsController(containerId) {
    this.containerId = containerId;
    this.container = null;
    this.settings = {
      markdown: Object.assign({}, DEFAULTS.markdown),
      capture: Object.assign({}, DEFAULTS.capture),
      crawl: Object.assign({}, DEFAULTS.crawl)
    };
    this._refs = {};
    this.debugCrawlPanel = false;
    this.theme = W2M.theme.getCurrentTheme();
  }

  SettingsController.prototype.init = function () {
    this.container = document.getElementById(this.containerId);
    if (!this.container) return;
    if (!this._externalStorageBound) {
      this._externalStorageBound = true;
      var self = this;
      chrome.storage.onChanged.addListener(function w2mSettingsExternalSync(changes, area) {
        if (area !== 'local') return;
        if (!changes.captureSettings && !changes.crawlSettings && !changes.markdownSettings) return;
        if (!self.container || !document.body.contains(self.container)) return;
        // Skip re-render for our own saves
        if (self._ownSave) return;
        self.loadSettings();
      });
    }
    if (!this._themeUnsubscribe) {
      var controller = this;
      this._themeUnsubscribe = W2M.theme.subscribe(function (theme) {
        controller.theme = theme;
        if (controller._refs.theme) controller._refs.theme.value = theme;
      });
    }
    this.loadSettings();
  };

  SettingsController.prototype.loadSettings = function () {
    var self = this;
    chrome.storage.local.get(['markdownSettings', 'captureSettings', 'crawlSettings', 'debugCrawlPanel'], function (data) {
      self.settings.markdown = Object.assign({}, DEFAULTS.markdown, data.markdownSettings || {});
      self.settings.capture = Object.assign({}, DEFAULTS.capture, data.captureSettings || {});
      self.settings.crawl = Object.assign({}, DEFAULTS.crawl, data.crawlSettings || {});
      self.debugCrawlPanel = data.debugCrawlPanel === true;
      self.render();
    });
  };

  SettingsController.prototype.render = function () {
    if (!this.container) return;
    while (this.container.firstChild) this.container.removeChild(this.container.firstChild);

    var md = this.settings.markdown;
    var cap = this.settings.capture;
    var cr = this.settings.crawl;

    // --- APPEARANCE SECTION ---
    var themeSelect = el('select', { className: 'form-select', id: 'sc-theme' },
      el('option', { value: 'light', textContent: t('settings.theme.light') }),
      el('option', { value: 'dark', textContent: t('settings.theme.dark') }),
      el('option', { value: 'midnight-blue', textContent: t('settings.theme.midnightBlue') }),
      el('option', { value: 'synthwave', textContent: t('settings.theme.synthwave') }),
      el('option', { value: 'solarized-dark', textContent: t('settings.theme.solarizedDark') }),
      el('option', { value: 'catppuccin', textContent: t('settings.theme.catppuccin') }),
      el('option', { value: 'dracula', textContent: t('settings.theme.dracula') }),
      el('option', { value: 'nord', textContent: t('settings.theme.nord') }),
      el('option', { value: 'vercel', textContent: t('settings.theme.vercel') }),
      el('option', { value: 'retro-terminal', textContent: t('settings.theme.retroTerminal') }),
      el('option', { value: 'paper', textContent: t('settings.theme.paper') })
    );
    themeSelect.value = this.theme;
    this._refs.theme = themeSelect;

    var appearanceSection = el('div', { className: 'settings-section' },
      el('div', { className: 'section-label' }, t('settings.appearance')),
      el('div', { className: 'card' },
        el('div', { className: 'form-group mb-0' },
          el('label', { className: 'form-label', 'for': 'sc-theme' }, t('settings.theme')),
          themeSelect,
          el('div', { className: 'form-hint' }, t('settings.theme.hint'))
        )
      )
    );

    // --- MARKDOWN SECTION ---
    var frontmatterCheck = el('input', { className: 'form-checkbox', type: 'checkbox', id: 'sc-frontmatter' });
    frontmatterCheck.checked = md.frontmatter;
    this._refs.frontmatter = frontmatterCheck;

    var headingSelect = el('select', { className: 'form-select', id: 'sc-heading' },
      el('option', { value: 'atx', textContent: t('settings.headings.atx') }),
      el('option', { value: 'setext', textContent: t('settings.headings.setext') })
    );
    headingSelect.value = md.headingStyle;
    this._refs.heading = headingSelect;

    var bulletSelect = el('select', { className: 'form-select', id: 'sc-bullet' },
      el('option', { value: '-', textContent: t('settings.bullets.dash') }),
      el('option', { value: '*', textContent: t('settings.bullets.star') }),
      el('option', { value: '+', textContent: t('settings.bullets.plus') })
    );
    bulletSelect.value = md.bulletListMarker;
    this._refs.bullet = bulletSelect;

    var codeSelect = el('select', { className: 'form-select', id: 'sc-code' },
      el('option', { value: 'fenced', textContent: t('settings.codeblock.fenced') }),
      el('option', { value: 'indented', textContent: t('settings.codeblock.indented') })
    );
    codeSelect.value = md.codeBlockStyle;
    this._refs.code = codeSelect;

    var markdownSection = el('div', { className: 'settings-section' },
      el('div', { className: 'section-label' }, t('settings.markdown')),
      el('div', { className: 'card' },
        el('label', { className: 'form-checkbox-label mb-3' },
          frontmatterCheck,
          document.createTextNode(t('settings.frontmatter'))
        ),
        el('div', { className: 'form-group' },
          el('label', { className: 'form-label' }, t('settings.headings')),
          headingSelect
        ),
        el('div', { className: 'form-group' },
          el('label', { className: 'form-label' }, t('settings.bullets')),
          bulletSelect
        ),
        el('div', { className: 'form-group' },
          el('label', { className: 'form-label' }, t('settings.codeblock')),
          codeSelect
        )
      )
    );

    // --- CAPTURE SECTION ---
    var delayValue = cap.delay;
    var delayFast = this._radioInput('sc-delay', 'fast', delayValue === 500);
    var delayNormal = this._radioInput('sc-delay', 'normal', delayValue === 2000);
    var delayCareful = this._radioInput('sc-delay', 'careful', delayValue === 5000);
    this._refs.delayFast = delayFast;
    this._refs.delayNormal = delayNormal;
    this._refs.delayCareful = delayCareful;

    var delaySegmented = el('div', { className: 'segmented' },
      delayFast,
      el('label', { 'for': 'sc-delay-fast', textContent: t('precrawl.delay.fast') }),
      delayNormal,
      el('label', { 'for': 'sc-delay-normal', textContent: t('precrawl.delay.normal') }),
      delayCareful,
      el('label', { 'for': 'sc-delay-careful', textContent: t('precrawl.delay.careful') })
    );

    var organizeCheck = el('input', { className: 'form-checkbox', type: 'checkbox', id: 'sc-organize' });
    organizeCheck.checked = cap.urlTree;
    this._refs.organize = organizeCheck;

    var assetsCheck = el('input', { className: 'form-checkbox', type: 'checkbox', id: 'sc-assets' });
    assetsCheck.checked = cap.saveAssets;
    this._refs.assets = assetsCheck;

    var maxAssetSizeInput = el('input', {
      className: 'form-input', type: 'number', id: 'sc-max-asset-size',
      min: '1', max: '100', step: '1', value: String(cap.maxAssetSizeMb)
    });
    this._refs.maxAssetSize = maxAssetSizeInput;

    var maxSessionAssetSizeInput = el('input', {
      className: 'form-input', type: 'number', id: 'sc-max-session-asset-size',
      min: '1', max: '1000', step: '1', value: String(cap.maxSessionAssetSizeMb)
    });
    this._refs.maxSessionAssetSize = maxSessionAssetSizeInput;

    var captureSection = el('div', { className: 'settings-section' },
      el('div', { className: 'section-label' }, t('settings.capture')),
      el('div', { className: 'card' },
        el('div', { className: 'form-group' },
          el('label', { className: 'form-label' }, t('settings.delay')),
          delaySegmented
        ),
        el('label', { className: 'form-checkbox-label mb-2' },
          organizeCheck,
          document.createTextNode(t('settings.organize'))
        ),
        el('label', { className: 'form-checkbox-label' },
          assetsCheck,
          document.createTextNode(t('settings.assets'))
        ),
        el('div', { className: 'form-group mt-3' },
          el('label', { className: 'form-label', 'for': 'sc-max-asset-size' }, t('settings.maxAssetSize')),
          maxAssetSizeInput
        ),
        el('div', { className: 'form-group' },
          el('label', { className: 'form-label', 'for': 'sc-max-session-asset-size' }, t('settings.maxSessionAssetSize')),
          maxSessionAssetSizeInput
        )
      )
    );

    // --- CRAWL SECTION ---
    var concurrencySelect = el('select', { className: 'form-select', id: 'sc-concurrency' });
    [1, 2, 3, 5, 8, 10].forEach(function (v) {
      var opt = el('option', { value: String(v), textContent: String(v) });
      concurrencySelect.appendChild(opt);
    });
    concurrencySelect.value = String(cr.concurrency);
    this._refs.concurrency = concurrencySelect;

    var maxErrorsSelect = el('select', { className: 'form-select', id: 'sc-maxerrors' });
    [3, 5, 10, 20].forEach(function (v) {
      var opt = el('option', { value: String(v), textContent: String(v) });
      maxErrorsSelect.appendChild(opt);
    });
    maxErrorsSelect.value = String(cr.maxBlocks);
    this._refs.maxErrors = maxErrorsSelect;

    var neverStopCheck = el('input', { className: 'form-checkbox', type: 'checkbox', id: 'sc-neverstop' });
    neverStopCheck.checked = cr.maxBlocks === 0;
    this._refs.neverStop = neverStopCheck;

    // When never-stop is checked, disable the select
    if (cr.maxBlocks === 0) {
      maxErrorsSelect.disabled = true;
    }

    var depthRadios = this._buildDepthRadios(cr.depth);

    var crawlSection = el('div', { className: 'settings-section' },
      el('div', { className: 'section-label' }, t('settings.crawl')),
      el('div', { className: 'card' },
        el('div', { className: 'form-group' },
          el('label', { className: 'form-label' }, t('settings.concurrency')),
          concurrencySelect
        ),
        el('div', { className: 'form-group' },
          el('label', { className: 'form-label' }, t('settings.maxerrors')),
          maxErrorsSelect,
          el('label', { className: 'form-checkbox-label mt-2' },
            neverStopCheck,
            document.createTextNode(t('settings.maxerrors.never'))
          ),
          el('div', { className: 'form-hint' }, t('settings.maxerrors.hint'))
        ),
        el('div', { className: 'form-group' },
          el('label', { className: 'form-label' }, t('settings.depth')),
          depthRadios
        )
      )
    );

    var debugCheck = el('input', { className: 'form-checkbox', type: 'checkbox', id: 'sc-debug-crawl' });
    debugCheck.checked = this.debugCrawlPanel;
    this._refs.debugCrawl = debugCheck;

    var debugSection = el('div', { className: 'settings-section' },
      el('div', { className: 'section-label' }, t('settings.debug')),
      el('div', { className: 'card' },
        el('label', { className: 'form-checkbox-label' },
          debugCheck,
          document.createTextNode(t('settings.debugCrawl'))
        ),
        el('div', { className: 'form-hint' }, t('settings.debugCrawl.hint'))
      )
    );

    this.container.appendChild(appearanceSection);
    this.container.appendChild(markdownSection);
    this.container.appendChild(captureSection);
    this.container.appendChild(crawlSection);
    this.container.appendChild(debugSection);

    this._bindEvents();
  };

  SettingsController.prototype._radioInput = function (name, value, checked) {
    var input = el('input', { type: 'radio', name: name, id: name + '-' + value, value: value });
    if (checked) input.checked = true;
    return input;
  };

  SettingsController.prototype._buildDepthRadios = function (currentDepth) {
    var self = this;
    var depthOptions = [
      { value: '1', label: t('settings.depth.1') },
      { value: '3', label: t('settings.depth.3') },
      { value: '5', label: t('settings.depth.5') },
      { value: '0', label: t('settings.depth.unlimited') }
    ];

    var group = el('div', { className: 'radio-group' });
    self._refs.depthRadios = [];

    depthOptions.forEach(function (opt) {
      var radio = el('input', { type: 'radio', name: 'sc-depth', id: 'sc-depth-' + opt.value, value: opt.value });
      if (String(currentDepth) === opt.value) radio.checked = true;
      self._refs.depthRadios.push(radio);

      var label = el('label', { className: 'radio-option', 'for': 'sc-depth-' + opt.value },
        radio,
        document.createTextNode(opt.label)
      );
      group.appendChild(label);
    });

    return group;
  };

  SettingsController.prototype._bindEvents = function () {
    var self = this;
    var save = function () { self.saveFromUI(); };

    this._refs.theme.addEventListener('change', function () {
      W2M.theme.setTheme(self._refs.theme.value);
    });

    // Markdown controls
    this._refs.frontmatter.addEventListener('change', save);
    this._refs.heading.addEventListener('change', save);
    this._refs.bullet.addEventListener('change', save);
    this._refs.code.addEventListener('change', save);

    // Capture controls
    this._refs.delayFast.addEventListener('change', save);
    this._refs.delayNormal.addEventListener('change', save);
    this._refs.delayCareful.addEventListener('change', save);
    this._refs.organize.addEventListener('change', save);
    this._refs.assets.addEventListener('change', save);
    this._refs.maxAssetSize.addEventListener('change', save);
    this._refs.maxSessionAssetSize.addEventListener('change', save);

    // Crawl controls
    this._refs.concurrency.addEventListener('change', save);
    this._refs.maxErrors.addEventListener('change', save);
    this._refs.neverStop.addEventListener('change', function () {
      self._refs.maxErrors.disabled = self._refs.neverStop.checked;
      save();
    });
    this._refs.depthRadios.forEach(function (radio) {
      radio.addEventListener('change', save);
    });

    if (this._refs.debugCrawl) {
      this._refs.debugCrawl.addEventListener('change', function () {
        chrome.storage.local.set({ debugCrawlPanel: self._refs.debugCrawl.checked });
      });
    }
  };

  SettingsController.prototype.saveFromUI = function () {
    var delayMap = { fast: 500, normal: 2000, careful: 5000 };
    var delayVal = 2000;
    if (this._refs.delayFast.checked) delayVal = 500;
    else if (this._refs.delayCareful.checked) delayVal = 5000;
    else delayVal = 2000;

    var maxBlocks = this._refs.neverStop.checked ? 0 : (Number(this._refs.maxErrors.value) || 5);

    var depthVal = 0;
    for (var i = 0; i < this._refs.depthRadios.length; i++) {
      if (this._refs.depthRadios[i].checked) {
        depthVal = Number(this._refs.depthRadios[i].value);
        break;
      }
    }

    var markdownSettings = {
      frontmatter: this._refs.frontmatter.checked,
      headingStyle: this._refs.heading.value,
      bulletListMarker: this._refs.bullet.value,
      codeBlockStyle: this._refs.code.value
    };

    var captureSettings = {
      delay: delayVal,
      urlTree: this._refs.organize.checked,
      saveAssets: this._refs.assets.checked,
      maxAssetSizeMb: Math.min(100, Math.max(1, Number.isFinite(Number(this._refs.maxAssetSize.value)) ? Number(this._refs.maxAssetSize.value) : 10)),
      maxSessionAssetSizeMb: Math.min(1000, Math.max(1, Number.isFinite(Number(this._refs.maxSessionAssetSize.value)) ? Number(this._refs.maxSessionAssetSize.value) : 50))
    };
    if (captureSettings.maxSessionAssetSizeMb < captureSettings.maxAssetSizeMb) {
      captureSettings.maxSessionAssetSizeMb = captureSettings.maxAssetSizeMb;
      this._refs.maxSessionAssetSize.value = String(captureSettings.maxSessionAssetSizeMb);
    }

    var crawlSettings = {
      concurrency: Number(this._refs.concurrency.value) || 3,
      maxBlocks: maxBlocks,
      depth: depthVal
    };

    this._ownSave = true;
    var self = this;
    chrome.storage.local.set({
      markdownSettings: markdownSettings,
      captureSettings: captureSettings,
      crawlSettings: crawlSettings,
      debugCrawlPanel: this._refs.debugCrawl ? this._refs.debugCrawl.checked : this.debugCrawlPanel
    }, function () { self._ownSave = false; });

    chrome.runtime.sendMessage({
      type: 'W2M_UPDATE_SESSION',
      patch: Object.assign({}, captureSettings, crawlSettings)
    }).catch(function (err) {
      if (err.message && err.message.indexOf('Receiving end does not exist') === -1) {
        console.warn('[W2M] sendMessage:', err.message);
      }
    });
  };

  // --- Auto-init on DOMContentLoaded ---
  document.addEventListener('DOMContentLoaded', function () {
    W2M.i18n.initLocale().then(function () {
      var dashContainer = document.getElementById('dash-settings');
      if (dashContainer) {
        var ctrl = new SettingsController('dash-settings');
        ctrl.init();
      }
      var standaloneContainer = document.getElementById('settings-container');
      if (standaloneContainer) {
        var ctrl2 = new SettingsController('settings-container');
        ctrl2.init();
      }
    });
  });

  window.W2M = window.W2M || {};
  window.W2M.SettingsController = SettingsController;
})();
