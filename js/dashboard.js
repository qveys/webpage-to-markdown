(function () {
  'use strict';

  var t = function (key, params) { return W2M.i18n.t(key, params); };
  var el = W2M.el;

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var MAX_DISPLAY_ITEMS = 50;
  var MAX_STORED_ITEMS = 200;

  function createSvgIcon(paths, width, height, fill, stroke) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(width || 16));
    svg.setAttribute('height', String(height || 16));
    svg.setAttribute('viewBox', '0 0 24 24');
    if (fill) svg.setAttribute('fill', fill);
    else svg.setAttribute('fill', 'none');
    if (stroke) svg.setAttribute('stroke', stroke);
    paths.forEach(function (p) {
      if (p.tag === 'path') {
        var path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', p.d);
        if (p.fill) path.setAttribute('fill', p.fill);
        svg.appendChild(path);
      } else if (p.tag === 'rect') {
        var rect = document.createElementNS(SVG_NS, 'rect');
        Object.keys(p).forEach(function (k) { if (k !== 'tag') rect.setAttribute(k, p[k]); });
        svg.appendChild(rect);
      } else if (p.tag === 'circle') {
        var circle = document.createElementNS(SVG_NS, 'circle');
        Object.keys(p).forEach(function (k) { if (k !== 'tag') circle.setAttribute(k, p[k]); });
        svg.appendChild(circle);
      } else if (p.tag === 'polygon') {
        var polygon = document.createElementNS(SVG_NS, 'polygon');
        polygon.setAttribute('points', p.points);
        if (p.fill) polygon.setAttribute('fill', p.fill);
        svg.appendChild(polygon);
      } else if (p.tag === 'line') {
        var line = document.createElementNS(SVG_NS, 'line');
        Object.keys(p).forEach(function (k) { if (k !== 'tag') line.setAttribute(k, p[k]); });
        svg.appendChild(line);
      }
    });
    return svg;
  }

  var ICON_CHECK = [{ tag: 'path', d: 'M20 6L9 17l-5-5', fill: 'none' }];
  var ICON_CLOCK = [{ tag: 'circle', cx: '12', cy: '12', r: '10' }, { tag: 'path', d: 'M12 6v6l4 2', fill: 'none' }];
  var ICON_ALERT = [{ tag: 'path', d: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', fill: 'none' }, { tag: 'line', x1: '12', y1: '9', x2: '12', y2: '13' }, { tag: 'line', x1: '12', y1: '17', x2: '12.01', y2: '17' }];
  var ICON_IMAGE = [
    { tag: 'rect', x: '3', y: '3', width: '18', height: '18', rx: '2', ry: '2', fill: 'none' },
    { tag: 'circle', cx: '8.5', cy: '8.5', r: '1.5', fill: 'currentColor' },
    { tag: 'path', d: 'M21 15l-5-5L5 21', fill: 'none' }
  ];
  var ICON_PAUSE = [{ tag: 'rect', x: '6', y: '4', width: '4', height: '16', fill: 'currentColor' }, { tag: 'rect', x: '14', y: '4', width: '4', height: '16', fill: 'currentColor' }];
  var ICON_PLAY = [{ tag: 'polygon', points: '5 3 19 12 5 21', fill: 'currentColor' }];

  function Dashboard() {
    this.port = null;
    this.status = 'stopped';
    this.stats = { captured: 0, queued: 0, blocked: 0, startTime: 0 };
    this.baseDomain = '';
    this.activityItems = [];
    this.blockedUrls = [];
    this.elapsedTimer = null;
    this.settingsVisible = false;
    this.debugCrawlPanel = false;
    this._debugSnapshot = null;
    this._debugTab = 'done';
    this._debugBuilt = false;
    this._debugEls = null;
    this._debugFilterTimer = null;

    this._initLocale();
  }

  Dashboard.prototype._initLocale = function () {
    var self = this;
    W2M.i18n.initLocale().then(function () {
      self._cacheElements();
      self._initLabels();
      self._initTheme();
      self._initControls();
      self._listenForMessages();
      self._connectPort();
      self._loadSession();
      self._initDebugMode();
    });
  };

  Dashboard.prototype._cacheElements = function () {
    this.$site = document.getElementById('dash-site');
    this.$badge = document.getElementById('dash-badge');
    this.$progressFill = document.getElementById('dash-progress-fill');
    this.$speed = document.getElementById('dash-speed');
    this.$elapsed = document.getElementById('dash-elapsed');
    this.$captured = document.getElementById('dash-captured');
    this.$queued = document.getElementById('dash-queued');
    this.$blocked = document.getElementById('dash-blocked');
    this.$activity = document.getElementById('dash-activity');
    this.$lblErrors = document.getElementById('lbl-errors');
    this.$errors = document.getElementById('dash-errors');
    this.$monitor = document.getElementById('dash-monitor');
    this.$settingsView = document.getElementById('dash-settings');
    this.$footer = document.getElementById('dash-footer');
    this.$pauseBtn = document.getElementById('dash-pause');
    this.$stopBtn = document.getElementById('dash-stop');
    this.$resetBtn = document.getElementById('dash-reset');
    this.$retryAllBtn = document.getElementById('dash-retry-all');
    this.$settingsBtn = document.getElementById('dash-settings-btn');
    this.$backBtn = document.getElementById('dash-back-btn');
    this.$themeBtn = document.getElementById('dash-theme-btn');
    this.$debug = document.getElementById('dash-debug');
  };

  Dashboard.prototype._initLabels = function () {
    var lblCaptured = document.getElementById('lbl-captured');
    var lblQueued = document.getElementById('lbl-queued');
    var lblBlocked = document.getElementById('lbl-blocked');
    var lblActivity = document.getElementById('lbl-activity');

    if (lblCaptured) lblCaptured.textContent = t('dashboard.done');
    if (lblQueued) lblQueued.textContent = t('dashboard.queue');
    if (lblBlocked) lblBlocked.textContent = t('dashboard.errors');
    if (lblActivity) lblActivity.textContent = t('dashboard.activity');
    if (this.$retryAllBtn) this.$retryAllBtn.textContent = t('dashboard.retryall', { count: 0 });
  };

  // --- Theme ---

  Dashboard.prototype._initTheme = function () {
    var self = this;
    chrome.storage.local.get('theme', function (r) {
      var theme = r.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', theme);
      self._updateThemeIcon(theme);
    });

    if (this.$themeBtn) {
      this.$themeBtn.addEventListener('click', function () {
        var cur = document.documentElement.getAttribute('data-theme');
        var next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        chrome.storage.local.set({ theme: next });
        self._updateThemeIcon(next);
      });
    }

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'local' && changes.theme) {
        var theme = changes.theme.newValue;
        document.documentElement.setAttribute('data-theme', theme);
        self._updateThemeIcon(theme);
      }
    });
  };

  Dashboard.prototype._updateThemeIcon = function (theme) {
    var iconHost = document.getElementById('dash-theme-icon');
    if (!iconHost || !iconHost.parentNode) return;

    var parent = iconHost.parentNode;
    while (parent.firstChild) parent.removeChild(parent.firstChild);

    var svg = W2M.buildThemeIcon(theme === 'dark');
    svg.id = 'dash-theme-icon';
    parent.appendChild(svg);
  };

  // --- Session ---

  Dashboard.prototype._loadSession = function () {
    var self = this;
    chrome.storage.local.get('session', function (r) {
      if (self.$site && r.session && r.session.folder) {
        self.$site.textContent = r.session.folder;
      }
    });
  };

  // --- Port connection ---

  Dashboard.prototype._connectPort = function () {
    var self = this;
    try {
      this.port = chrome.runtime.connect({ name: 'crawl' });

      this.port.onMessage.addListener(function (msg) {
        self._onMessage(msg);
      });

      this.port.onDisconnect.addListener(function () {
        self.port = null;
        setTimeout(function () { self._connectPort(); }, 1000);
      });

      this.port.postMessage({ type: 'crawl:get-status' });
      if (self.debugCrawlPanel) {
        this.port.postMessage({ type: 'crawl:get-debug-snapshot' });
      }
    } catch (e) {
      setTimeout(function () { self._connectPort(); }, 1000);
    }
  };

  Dashboard.prototype._onMessage = function (msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'crawl:status':
        this.stats = msg.stats || this.stats;
        this.blockedUrls = msg.blockedUrls || [];
        this._handleStatus(msg);
        break;
      case 'crawl:log':
        this._handleLog(msg.log || msg);
        break;
      case 'crawl:debug-snapshot':
        this._debugSnapshot = msg;
        this._updateDebugMeta();
        this._renderDebugTabContent();
        break;
      default:
        break;
    }
  };

  // --- Status handling ---

  Dashboard.prototype._handleStatus = function (msg) {
    var newStatus = msg.status || 'stopped';
    var stats = msg.stats || {};

    this.stats = {
      captured: stats.captured || 0,
      queued: stats.queued || 0,
      blocked: stats.blocked || 0,
      startTime: stats.startTime || 0
    };

    this._setStatus(newStatus);
    this._updateUI();
    this._renderErrors();
    if (this.debugCrawlPanel) {
      this._requestDebugSnapshot();
    }
  };

  Dashboard.prototype._handleLog = function (entry) {
    this._rememberBaseDomain((entry && entry.pageUrl) || (entry && entry.message) || '');
    var item = {
      type: entry.type || 'info',
      url: entry.message || '',
      fileName: entry.fileName || '',
      assetUrl: entry.assetUrl || '',
      pageUrl: entry.pageUrl || '',
      pageLabel: entry.pageLabel || '',
      timestamp: entry.timestamp || Date.now()
    };

    this.activityItems.unshift(item);
    if (this.activityItems.length > MAX_STORED_ITEMS) {
      this.activityItems.length = MAX_STORED_ITEMS;
    }

    this._renderActivityItem(item, true);
    this._trimActivityList();
  };

  // --- Status & badge ---

  Dashboard.prototype._setStatus = function (newStatus) {
    var prev = this.status;
    this.status = newStatus;

    if (!this.$badge) return;

    switch (newStatus) {
      case 'running':
        this.$badge.textContent = t('dashboard.live');
        this.$badge.className = 'badge badge--live';
        break;
      case 'paused':
        this.$badge.textContent = t('dashboard.paused');
        this.$badge.className = 'badge badge--paused';
        break;
      case 'stopped':
      default:
        this.$badge.textContent = t('dashboard.stopped');
        this.$badge.className = 'badge badge--stopped';
        break;
    }

    // Update pause button icon
    this._updatePauseIcon();

    // Manage elapsed timer
    if (newStatus === 'running' && prev !== 'running') {
      this._startElapsedTimer();
    } else if (newStatus !== 'running') {
      this._stopElapsedTimer();
    }

    // Enable/disable footer buttons
    var isStopped = newStatus === 'stopped';
    if (this.$pauseBtn) this.$pauseBtn.disabled = isStopped;
    if (this.$stopBtn) this.$stopBtn.disabled = isStopped;
    if (this.$resetBtn) this.$resetBtn.disabled = !isStopped;
  };

  Dashboard.prototype._updatePauseIcon = function () {
    if (!this.$pauseBtn) return;
    while (this.$pauseBtn.firstChild) this.$pauseBtn.removeChild(this.$pauseBtn.firstChild);

    if (this.status === 'running') {
      this.$pauseBtn.appendChild(createSvgIcon(ICON_PAUSE, 16, 16, 'currentColor'));
      this.$pauseBtn.setAttribute('aria-label', t('progress.pause'));
    } else {
      this.$pauseBtn.appendChild(createSvgIcon(ICON_PLAY, 16, 16, 'currentColor'));
      this.$pauseBtn.setAttribute('aria-label', t('progress.resume'));
    }
  };

  // --- UI update ---

  Dashboard.prototype._updateUI = function () {
    var captured = this.stats.captured;
    var queued = this.stats.queued;
    var blocked = this.stats.blocked;
    var total = captured + queued;

    if (this.$captured) this.$captured.textContent = String(captured);
    if (this.$queued) this.$queued.textContent = String(queued);
    if (this.$blocked) this.$blocked.textContent = String(blocked);

    // Progress
    var pct = total > 0 ? Math.min(100, Math.round((captured / total) * 100)) : 0;
    if (this.$progressFill) this.$progressFill.style.width = pct + '%';

    // Speed
    if (this.$speed) {
      if (this.stats.startTime && captured > 0) {
        var elapsedSec = (Date.now() - this.stats.startTime) / 1000;
        var pagesPerMin = elapsedSec > 0 ? Math.round((captured / elapsedSec) * 60) : 0;
        this.$speed.textContent = t('progress.speed', { speed: pagesPerMin });
      } else {
        this.$speed.textContent = t('progress.speed', { speed: 0 });
      }
    }

    // Retry all button
    if (this.$retryAllBtn) {
      this.$retryAllBtn.textContent = t('dashboard.retryall', { count: blocked });
      this.$retryAllBtn.disabled = blocked === 0;
    }
  };

  // --- Elapsed timer ---

  Dashboard.prototype._startElapsedTimer = function () {
    this._stopElapsedTimer();
    var self = this;
    this.elapsedTimer = setInterval(function () {
      if (self.$elapsed && self.stats.startTime) {
        var elapsed = Date.now() - self.stats.startTime;
        self.$elapsed.textContent = t('progress.elapsed', { time: W2M.i18n.formatDuration(elapsed) });
      }
    }, 1000);
  };

  Dashboard.prototype._stopElapsedTimer = function () {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  };

  // --- Activity rendering ---

  Dashboard.prototype._renderActivityItem = function (item, prepend) {
    if (!this.$activity) return;
    this._rememberBaseDomain((item && item.pageUrl) || (item && item.url) || '');

    var now = new Date(item.timestamp);
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    var ss = String(now.getSeconds()).padStart(2, '0');
    var timeStr = hh + ':' + mm + ':' + ss;

    var iconClass = 'activity-icon';
    var iconPaths;
    var iconStroke = 'currentColor';

    switch (item.type) {
      case 'capture':
        iconClass += ' activity-icon--success';
        iconPaths = ICON_CHECK;
        break;
      case 'asset':
        iconClass += ' activity-icon--asset';
        iconPaths = ICON_IMAGE;
        iconStroke = 'currentColor';
        break;
      case 'error':
      case 'blocked':
        iconClass += ' activity-icon--error';
        iconPaths = ICON_ALERT;
        iconStroke = 'currentColor';
        break;
      default:
        iconClass += ' activity-icon--pending';
        iconPaths = ICON_CLOCK;
        break;
    }

    var iconEl = el('span', { className: iconClass });
    var svg = createSvgIcon(iconPaths, 14, 14, 'none', iconStroke);
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    iconEl.appendChild(svg);

    var textCell;
    if (item.type === 'asset' && item.fileName) {
      var assetChildren = [
        el('div', { className: 'activity-url activity-item__page', textContent: item.fileName, title: item.assetUrl || item.fileName })
      ];
      if (item.assetUrl) {
        assetChildren.push(el('div', { className: 'activity-item__detail text-muted', textContent: 'URL: ' + this._displayPath(item.assetUrl), title: item.assetUrl }));
      }
      if (item.pageLabel) {
        assetChildren.push(el('div', { className: 'activity-item__detail text-muted', textContent: 'Page: ' + item.pageLabel, title: item.pageUrl }));
      }
      textCell = el('div', { className: 'activity-item__stack' });
      for (var i = 0; i < assetChildren.length; i++) textCell.appendChild(assetChildren[i]);
    } else if (item.type === 'capture' && item.pageUrl) {
      textCell = el('div', { className: 'activity-item__stack' },
        el('div', { className: 'activity-url activity-item__page', textContent: this._displayPath(item.pageUrl), title: item.pageUrl }),
        el('div', { className: 'activity-item__detail text-muted', textContent: 'Title: ' + item.url, title: item.url })
      );
    } else {
      var shownUrl = this._displayPath(item.url);
      textCell = el('span', { className: 'activity-url', textContent: shownUrl, title: item.url });
    }

    var rowClass = 'activity-item' + (item.type === 'asset' ? ' activity-item--asset' : '');
    var row = el('div', { className: rowClass },
      el('span', { className: 'activity-time', textContent: timeStr }),
      iconEl,
      textCell
    );

    if (prepend && this.$activity.firstChild) {
      this.$activity.insertBefore(row, this.$activity.firstChild);
    } else {
      this.$activity.appendChild(row);
    }
  };

  Dashboard.prototype._trimActivityList = function () {
    if (!this.$activity) return;
    while (this.$activity.children.length > MAX_DISPLAY_ITEMS) {
      this.$activity.removeChild(this.$activity.lastChild);
    }
  };

  Dashboard.prototype._rememberBaseDomain = function (url) {
    if (this.baseDomain || !url || typeof url !== 'string') return;
    try {
      var parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        this.baseDomain = parsed.origin;
      }
    } catch (_) {
      // Ignore non-URL values.
    }
  };

  Dashboard.prototype._displayPath = function (fullPath) {
    if (!fullPath || typeof fullPath !== 'string') return '';
    this._rememberBaseDomain(fullPath);
    if (!this.baseDomain) return fullPath;
    if (fullPath.indexOf(this.baseDomain) !== 0) return fullPath;
    try {
      var parsed = new URL(fullPath);
      return (parsed.pathname || '/') + (parsed.search || '') + (parsed.hash || '');
    } catch (_) {
      return fullPath.slice(this.baseDomain.length) || '/';
    }
  };

  // --- Errors rendering ---

  Dashboard.prototype._renderErrors = function () {
    if (!this.$errors || !this.$lblErrors) return;

    if (!this.blockedUrls || this.blockedUrls.length === 0) {
      this.$lblErrors.classList.add('hidden');
      this.$errors.classList.add('hidden');
      this._lastBlockedKey = '';
      return;
    }

    // Skip full DOM rebuild if the list hasn't changed
    var urlKeys = this.blockedUrls.map(function (entry) {
      return typeof entry === 'string' ? entry : entry.url;
    }).join('\n');
    if (urlKeys === this._lastBlockedKey) return;
    this._lastBlockedKey = urlKeys;

    this.$lblErrors.classList.remove('hidden');
    this.$errors.classList.remove('hidden');
    this.$lblErrors.textContent = t('dashboard.errors.section', { count: this.blockedUrls.length });

    while (this.$errors.firstChild) this.$errors.removeChild(this.$errors.firstChild);

    var self = this;
    this.blockedUrls.forEach(function (entry) {
      var url = typeof entry === 'string' ? entry : entry.url;
      var reason = typeof entry === 'object' && entry.reason ? entry.reason : '';
      var shownUrl = self._displayPath(url);

      var retryBtn = el('button', {
        className: 'btn btn-secondary btn-sm',
        textContent: t('dashboard.retry'),
        onClick: function () { self._retryUrl(url); }
      });

      var openBtn = el('button', {
        className: 'btn btn-secondary btn-sm',
        textContent: t('dashboard.open'),
        onClick: function () { self._openUrl(url); }
      });

      var dismissBtn = el('button', {
        className: 'btn btn-secondary btn-sm',
        textContent: t('dashboard.dismiss'),
        onClick: function () { self._dismissUrl(url); }
      });

      var errorItem = el('div', { className: 'error-item' },
        el('div', { className: 'error-item__url', textContent: shownUrl, title: url }),
        reason ? el('div', { className: 'error-item__reason', textContent: reason }) : document.createTextNode(''),
        el('div', { className: 'error-item__actions' }, retryBtn, openBtn, dismissBtn)
      );

      self.$errors.appendChild(errorItem);
    });
  };

  // --- Controls ---

  Dashboard.prototype._initControls = function () {
    var self = this;

    if (this.$pauseBtn) {
      this.$pauseBtn.addEventListener('click', function () { self._togglePause(); });
    }

    if (this.$stopBtn) {
      this.$stopBtn.addEventListener('click', function () { self._stopCrawl(); });
    }

    if (this.$retryAllBtn) {
      this.$retryAllBtn.addEventListener('click', function () { self._retryAll(); });
    }

    if (this.$resetBtn) {
      this.$resetBtn.addEventListener('click', function () { self._resetDashboard(); });
    }

    if (this.$settingsBtn) {
      this.$settingsBtn.addEventListener('click', function () { self._toggleSettings(); });
    }

    if (this.$backBtn) {
      this.$backBtn.addEventListener('click', function () {
        if (self.settingsVisible) self._toggleSettings();
      });
    }
  };

  Dashboard.prototype._togglePause = function () {
    if (!this.port) return;
    if (this.status === 'paused') {
      this.port.postMessage({ type: 'crawl:resume' });
    } else {
      this.port.postMessage({ type: 'crawl:pause' });
    }
  };

  Dashboard.prototype._stopCrawl = function () {
    if (!this.port) return;
    this.port.postMessage({ type: 'crawl:stop' });
  };

  Dashboard.prototype._resetDashboard = function () {
    // Clear stats
    this.stats = { captured: 0, queued: 0, blocked: 0, startTime: 0 };
    this.blockedUrls = [];
    this._updateUI();
    this._renderErrors();

    // Clear activity list
    if (this.$activity) {
      while (this.$activity.firstChild) this.$activity.removeChild(this.$activity.firstChild);
    }

    // Clear debug
    if (this.$debug) {
      this._debugBuilt = false;
      while (this.$debug.firstChild) this.$debug.removeChild(this.$debug.firstChild);
    }

    // Reset progress
    if (this.$progressFill) this.$progressFill.style.width = '0%';
    if (this.$speed) this.$speed.textContent = '';
    if (this.$elapsed) this.$elapsed.textContent = '';

    // Tell background to clear crawl state
    if (this.port) {
      this.port.postMessage({ type: 'crawl:reset' });
    }

    this._loadSession();
  };

  Dashboard.prototype._retryUrl = function (url) {
    if (!this.port) return;
    this.port.postMessage({ type: 'crawl:retry', url: url });
  };

  Dashboard.prototype._retryAll = function () {
    if (!this.port) return;
    this.port.postMessage({ type: 'crawl:retry-all' });
  };

  Dashboard.prototype._openUrl = function (url) {
    if (!this.port) return;
    this.port.postMessage({ type: 'crawl:open-blocked', url: url });
  };

  Dashboard.prototype._dismissUrl = function (url) {
    this.blockedUrls = (this.blockedUrls || []).filter(function (entry) {
      var u = typeof entry === 'string' ? entry : entry.url;
      return u !== url;
    });
    if (this.stats) {
      this.stats.blocked = this.blockedUrls.length;
    }
    this._updateUI();
    this._renderErrors();

    if (this.port) {
      this.port.postMessage({ type: 'crawl:dismiss-blocked', url: url });
    } else {
      chrome.runtime.sendMessage({ type: 'W2M_CRAWL_DISMISS', url: url }, function () { });
    }
  };

  // --- Settings toggle ---

  Dashboard.prototype._toggleSettings = function () {
    this.settingsVisible = !this.settingsVisible;

    if (this.settingsVisible) {
      if (this.$monitor) this.$monitor.classList.add('hidden');
      if (this.$footer) this.$footer.classList.add('hidden');
      if (this.$settingsView) this.$settingsView.classList.remove('hidden');
      if (this.$site) this.$site.textContent = t('settings.title');
      if (this.$backBtn) this.$backBtn.classList.remove('hidden');
      if (this.$settingsBtn) this.$settingsBtn.classList.add('hidden');
    } else {
      if (this.$monitor) this.$monitor.classList.remove('hidden');
      if (this.$footer) this.$footer.classList.remove('hidden');
      if (this.$settingsView) this.$settingsView.classList.add('hidden');
      if (this.$backBtn) this.$backBtn.classList.add('hidden');
      if (this.$settingsBtn) this.$settingsBtn.classList.remove('hidden');
      this._loadSession();
    }
  };

  // --- Message listener ---

  Dashboard.prototype._listenForMessages = function () {
    var self = this;
    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg && msg.type === 'W2M_SHOW_SETTINGS') {
        if (!self.settingsVisible) {
          self._toggleSettings();
        }
      }
    });
  };

  // --- Debug panel ---

  Dashboard.prototype._initDebugMode = function () {
    var self = this;
    chrome.storage.local.get('debugCrawlPanel', function (r) {
      self.debugCrawlPanel = r.debugCrawlPanel === true;
      self._applyDebugPanelVisibility();
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes.debugCrawlPanel) return;
      self.debugCrawlPanel = changes.debugCrawlPanel.newValue === true;
      self._applyDebugPanelVisibility();
    });
  };

  Dashboard.prototype._applyDebugPanelVisibility = function () {
    if (!this.$debug) return;
    if (this.debugCrawlPanel) {
      this.$debug.classList.remove('hidden');
      this._ensureDebugShell();
      this._requestDebugSnapshot();
    } else {
      this.$debug.classList.add('hidden');
    }
  };

  Dashboard.prototype._ensureDebugShell = function () {
    if (this._debugBuilt || !this.$debug) return;
    this._debugBuilt = true;
    var self = this;

    var warn = el('div', { className: 'dash-debug__warn text-muted' }, t('debug.warn'));
    var chevron = el('span', { className: 'dash-debug__chevron' }, '\u25BC');
    var title = el('div', { className: 'dash-debug__title section-label', style: 'cursor:pointer;display:flex;align-items:center;gap:6px;user-select:none' }, chevron, t('debug.title'));

    var meta = el('div', { className: 'dash-debug__meta text-muted' });
    var syncBadge = el('span', { className: 'dash-debug__sync dash-debug__sync--bad hidden' });

    var btnRefresh = el('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: t('debug.refresh'), onClick: function () { self._requestDebugSnapshot(); } });
    var btnCopy = el('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: t('debug.copy'), onClick: function () { self._debugCopyJson(); } });
    var btnDownload = el('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: t('debug.download'), onClick: function () { self._debugDownloadJson(); } });

    var toolbar = el('div', { className: 'dash-debug__toolbar' }, btnRefresh, btnCopy, btnDownload);

    function tabBtn(id, labelKey) {
      return el('button', {
        className: 'btn btn-sm dash-debug__tab',
        type: 'button',
        textContent: t(labelKey),
        dataset: { tab: id },
        onClick: function () { self._setDebugTab(id); }
      });
    }

    var tabs = el('div', { className: 'dash-debug__tabs' },
      tabBtn('done', 'debug.tab.done'),
      tabBtn('queued', 'debug.tab.queued'),
      tabBtn('errors', 'debug.tab.errors'),
      tabBtn('logs', 'debug.tab.logs'),
      tabBtn('state', 'debug.tab.state')
    );

    var filterInput = el('input', {
      className: 'form-input dash-debug__filter',
      type: 'search',
      placeholder: t('debug.filter'),
      onInput: function () { self._debugFilterDebounce(); }
    });

    var logSelect = el('select', { className: 'form-select dash-debug__logtype hidden', onChange: function () { self._renderDebugTabContent(); } });
    logSelect.appendChild(el('option', { value: '', textContent: t('debug.logFilter.all') }));
    ['info', 'error', 'blocked', 'skip', 'capture', 'asset', 'warn'].forEach(function (val) {
      logSelect.appendChild(el('option', { value: val, textContent: val }));
    });

    var filterRow = el('div', { className: 'dash-debug__filter-row' }, filterInput, logSelect);
    var content = el('div', { className: 'dash-debug__content' });

    var body = el('div', { className: 'dash-debug__body' });
    body.appendChild(warn);
    body.appendChild(el('div', { className: 'dash-debug__meta-row' }, meta, syncBadge));
    body.appendChild(toolbar);
    body.appendChild(tabs);
    body.appendChild(filterRow);
    body.appendChild(content);

    title.addEventListener('click', function () {
      var collapsed = body.classList.toggle('hidden');
      chevron.textContent = collapsed ? '\u25B6' : '\u25BC';
    });

    this.$debug.appendChild(title);
    this.$debug.appendChild(body);

    this._debugEls = { meta: meta, syncBadge: syncBadge, filterInput: filterInput, logSelect: logSelect, content: content, tabs: tabs };
    this._setDebugTab('done');
  };

  Dashboard.prototype._setDebugTab = function (id) {
    this._debugTab = id;
    if (!this._debugEls) return;
    var buttons = this._debugEls.tabs.querySelectorAll('.dash-debug__tab');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      b.classList.toggle('dash-debug__tab--active', b.getAttribute('data-tab') === id);
    }
    var logs = id === 'logs';
    var state = id === 'state';
    this._debugEls.logSelect.classList.toggle('hidden', !logs);
    this._debugEls.filterInput.classList.toggle('hidden', state);
    this._renderDebugTabContent();
  };

  Dashboard.prototype._debugFilterDebounce = function () {
    var self = this;
    if (this._debugFilterTimer) clearTimeout(this._debugFilterTimer);
    this._debugFilterTimer = setTimeout(function () { self._renderDebugTabContent(); }, 150);
  };

  Dashboard.prototype._requestDebugSnapshot = function () {
    if (!this.debugCrawlPanel || !this.port) return;
    this.port.postMessage({ type: 'crawl:get-debug-snapshot' });
  };

  Dashboard.prototype._updateDebugMeta = function () {
    var self = this;
    if (!this._debugEls || !this._debugSnapshot) return;
    var snap = this._debugSnapshot;

    chrome.storage.local.getBytesInUse(null, function (bytes) {
      if (!self._debugEls) return;
      var parts = [
        t('debug.workers', { n: snap.activeWorkers }),
        t('debug.blocks', { n: snap.consecutiveBlocks }),
        t('debug.storage', { size: W2M.i18n.formatSize(bytes) })
      ];
      self._debugEls.meta.textContent = parts.join(' · ');
    });

    var bad = snap.stats && typeof snap.totalQueued === 'number' && snap.stats.queued !== snap.totalQueued;
    this._debugEls.syncBadge.classList.toggle('hidden', !bad);
    this._debugEls.syncBadge.textContent = t('debug.syncWarn');
  };

  Dashboard.prototype._debugRowUrl = function (url, extraNode) {
    var shownUrl = this._displayPath(url);
    var openBtn = el('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: t('dashboard.open'), onClick: function () { chrome.tabs.create({ url: url }); } });
    var row = el('div', { className: 'dash-debug__row' },
      el('div', { className: 'dash-debug__url monospace', textContent: shownUrl, title: url })
    );
    if (extraNode) row.appendChild(extraNode);
    row.appendChild(openBtn);
    return row;
  };

  Dashboard.prototype._debugRowUrlSimple = function (url) {
    return this._debugRowUrl(url, null);
  };

  Dashboard.prototype._renderDebugTabContent = function () {
    if (!this._debugEls) return;
    var c = this._debugEls.content;
    while (c.firstChild) c.removeChild(c.firstChild);

    var snap = this._debugSnapshot;
    if (!snap) {
      c.appendChild(el('div', { className: 'text-muted', textContent: t('debug.refresh') }));
      return;
    }

    var tab = this._debugTab;
    var filter = (this._debugEls.filterInput.value || '').trim().toLowerCase();
    var self = this;

    function truncNote(key, shownLen, total) {
      if (!snap.truncated || !snap.truncated[key]) return;
      c.appendChild(el('div', { className: 'text-muted dash-debug__trunc' },
        t('debug.truncated', { shown: shownLen, total: total })
      ));
    }

    if (tab === 'done') {
      var urls = snap.capturedUrls || [];
      if (filter) urls = urls.filter(function (u) { return u.toLowerCase().indexOf(filter) !== -1; });
      urls.forEach(function (url) { c.appendChild(self._debugRowUrlSimple(url)); });
      truncNote('captured', snap.capturedUrls.length, snap.totalCaptured);
      return;
    }

    if (tab === 'queued') {
      var q = snap.discoveryQueue || [];
      if (filter) q = q.filter(function (item) { return (item.url || '').toLowerCase().indexOf(filter) !== -1; });
      q.forEach(function (item) {
        var depthEl = el('span', { className: 'dash-debug__depth text-muted', textContent: t('debug.depth', { depth: item.depth }) });
        c.appendChild(self._debugRowUrl(item.url, depthEl));
      });
      truncNote('queued', snap.discoveryQueue.length, snap.totalQueued);
      return;
    }

    if (tab === 'errors') {
      var errs = snap.blockedUrls || [];
      if (filter) {
        errs = errs.filter(function (e) {
          var u = (e.url || '').toLowerCase();
          var r = (e.reason || '').toLowerCase();
          return u.indexOf(filter) !== -1 || r.indexOf(filter) !== -1;
        });
      }
      errs.forEach(function (e) {
        var url = e.url || '';
        var reason = e.reason || '';
        var reasonEl = reason ? el('div', { className: 'dash-debug__reason text-muted', textContent: reason }) : document.createTextNode('');
        c.appendChild(self._debugRowUrl(url, reasonEl));
      });
      truncNote('blocked', snap.blockedUrls.length, snap.totalBlocked);
      return;
    }

    if (tab === 'logs') {
      var logs = snap.logs || [];
      var typeF = this._debugEls.logSelect.value;
      if (typeF) logs = logs.filter(function (l) { return l.type === typeF; });
      if (filter) logs = logs.filter(function (l) { return (String(l.message || '')).toLowerCase().indexOf(filter) !== -1; });
      logs.forEach(function (l) {
        var line = '[' + (l.type || '') + '] ' + (l.message || '');
        c.appendChild(el('div', { className: 'dash-debug__logline monospace', textContent: line, title: line }));
      });
      truncNote('logs', snap.logs.length, snap.totalLogs);
      return;
    }

    if (tab === 'state') {
      var stateObj = {
        status: snap.status,
        stats: snap.stats,
        config: snap.config,
        scope: snap.scope,
        activeWorkers: snap.activeWorkers,
        consecutiveBlocks: snap.consecutiveBlocks,
        truncated: snap.truncated,
        totalCaptured: snap.totalCaptured,
        totalQueued: snap.totalQueued,
        totalBlocked: snap.totalBlocked,
        totalLogs: snap.totalLogs
      };
      var pre = el('pre', { className: 'dash-debug__pre monospace', textContent: JSON.stringify(stateObj, null, 2) });
      c.appendChild(pre);
    }
  };

  Dashboard.prototype._debugSnapshotForExport = function () {
    return this._debugSnapshot ? JSON.parse(JSON.stringify(this._debugSnapshot)) : null;
  };

  Dashboard.prototype._debugCopyJson = function () {
    var data = this._debugSnapshotForExport();
    if (!data) return;
    var text = JSON.stringify(data, null, 2);
    var self = this;
    navigator.clipboard.writeText(text).then(function () {
      self._showToast(t('toast.copied'));
    }).catch(function () { });
  };

  Dashboard.prototype._debugDownloadJson = function () {
    var data = this._debugSnapshotForExport();
    if (!data) return;
    var text = JSON.stringify(data, null, 2);
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'w2m-crawl-debug-snapshot.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  Dashboard.prototype._showToast = function (message) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = el('div', { className: 'toast toast--info', textContent: message });
    container.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('toast--visible'); });
    setTimeout(function () {
      toast.classList.remove('toast--visible');
      toast.addEventListener('transitionend', function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
    }, 2200);
  };

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function () {
    new Dashboard();
  });
})();
