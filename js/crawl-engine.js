// js/crawl-engine.js — CrawlEngine class for crawl orchestration
// Loaded via importScripts() at the end of background.js.
// Global functions urlToPath() and downloadAssets() are available at runtime.
// No Chrome APIs are called at module-parse time.

class CrawlEngine {
  /** Seuls http: et https: sont chargeables par fetch() dans l’extension. */
  static isFetchableHttpUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  constructor(options = {}) {
    this.discoveryQueue = [];
    this.capturedUrls = new Set();
    this.seenUrls = new Set();
    this.blockedUrls = [];
    this.activeWorkers = 0;
    this.config = {
      concurrency: 3,
      maxConsecutiveBlocks: 5,
      depth: 0,
      delay: 1000,
    };
    this.scope = null;
    this.status = "stopped";
    this.stats = {
      captured: 0,
      queued: 0,
      blocked: 0,
      startTime: null,
    };
    this.consecutiveBlocks = 0;
    this.ports = new Set();
    this.logBuffer = [];
    /** @type {(() => Promise<void>) | null} */
    this._onSessionEnded =
      typeof options.onSessionEnded === "function"
        ? options.onSessionEnded
        : null;
    this._onStatusChange =
      typeof options.onStatusChange === "function"
        ? options.onStatusChange
        : null;
  }

  async _invokeSessionEnded() {
    if (!this._onSessionEnded) return;
    try {
      await this._onSessionEnded();
    } catch (e) {
      console.warn("[CrawlEngine] onSessionEnded:", e);
    }
  }

  // ─── Live config update ─────────────────────────────────────────────────────

  updateConfig(patch) {
    if (!patch || typeof patch !== "object") return;
    const map = { delay: "delay", concurrency: "concurrency", maxBlocks: "maxConsecutiveBlocks", depth: "depth" };
    for (const [key, configKey] of Object.entries(map)) {
      if (patch[key] !== undefined) this.config[configKey] = patch[key];
    }
  }

  // ─── Scope ──────────────────────────────────────────────────────────────────

  setScope(startUrl) {
    const u = new URL(startUrl);
    let path = u.pathname;
    // Treat extension-less paths as directories (e.g. /docs → /docs/)
    if (!path.endsWith("/") && !path.split("/").pop().includes(".")) {
      path += "/";
    }
    const pathPrefix = path.substring(0, path.lastIndexOf("/") + 1);
    this.scope = { origin: u.origin, pathPrefix };
  }

  isInScope(url) {
    if (!this.scope) return false;
    try {
      const u = new URL(url);
      const prefix = this.scope.pathPrefix;
      return (
        u.origin === this.scope.origin &&
        (u.pathname.startsWith(prefix) ||
          u.pathname + "/" === prefix)
      );
    } catch {
      return false;
    }
  }

  // ─── Queue ──────────────────────────────────────────────────────────────────

  enqueue(url, depth) {
    if (!CrawlEngine.isFetchableHttpUrl(url)) return;
    if (this.seenUrls.has(url)) return;
    if (!this.isInScope(url)) return;
    if (this.config.depth > 0 && depth > this.config.depth) return;

    this.seenUrls.add(url);
    this.discoveryQueue.push({ url, depth });
    this.stats.queued = this.discoveryQueue.length;
  }

  dequeue() {
    const item = this.discoveryQueue.shift() || null;
    this.stats.queued = this.discoveryQueue.length;
    return item;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async start(startUrl, config = {}) {
    if (!CrawlEngine.isFetchableHttpUrl(startUrl)) {
      throw new Error(
        "Only http(s) pages can be crawled (not chrome://, file://, etc.)",
      );
    }
    Object.assign(this.config, config);
    this.setScope(startUrl);

    // Reset state
    this.discoveryQueue = [];
    this.capturedUrls = new Set();
    this.seenUrls = new Set();
    this.blockedUrls = [];
    this.downloadedAssets = new Map();
    this.consecutiveBlocks = 0;
    this.stats = {
      captured: 0,
      queued: 0,
      blocked: 0,
      startTime: Date.now(),
    };

    this.enqueue(startUrl, 0);
    chrome.alarms.create("crawl-keepalive", { periodInMinutes: 0.4 });
    // Hide Chrome download UI during crawl
    try { chrome.downloads.setUiOptions({ enabled: false }); } catch (_) {}
    this._abortController = new AbortController();
    this.status = "running";
    this.log("info", `Crawl started: ${startUrl}`);
    this.broadcastStatus();
    this.spawnWorkers();
  }

  async pause() {
    this.status = "paused";
    // Abort in-flight fetches so workers stop immediately
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this.log("info", "Crawl paused");
    await this.saveState();
    this.broadcastStatus();
  }

  async resume() {
    // Reload queue from storage in case SW was suspended during pause
    const { crawlQueue } = await chrome.storage.session.get("crawlQueue");
    if (crawlQueue && crawlQueue.length && !this.discoveryQueue.length) {
      this.discoveryQueue = crawlQueue;
      this.stats.queued = this.discoveryQueue.length;
      // Rebuild seenUrls to include restored queue
      for (const item of this.discoveryQueue) this.seenUrls.add(item.url);
    }
    this._abortController = new AbortController();
    this.status = "running";
    this.consecutiveBlocks = 0;
    this.log("info", "Crawl resumed");
    this.broadcastStatus();
    this.spawnWorkers();
  }

  async stop() {
    const wasActive =
      this.status === "running" || this.status === "paused";
    this.status = "stopped";
    this.discoveryQueue = [];
    this.stats.queued = 0;
    chrome.alarms.clear("crawl-keepalive");
    // Re-enable Chrome download UI
    try { chrome.downloads.setUiOptions({ enabled: true }); } catch (_) {}
    this.log("info", "Crawl stopped");
    await this.saveState();
    this.broadcastStatus();
    if (wasActive) await this._invokeSessionEnded();
  }

  async reset() {
    if (this.status !== "stopped") await this.stop();
    this.discoveryQueue = [];
    this.capturedUrls = new Set();
    this.seenUrls = new Set();
    this.blockedUrls = [];
    this.downloadedAssets = new Map();
    this.lastPage = null;
    this.logBuffer = [];
    this.stats = { captured: 0, queued: 0, blocked: 0, startTime: 0 };
    await this.saveState();
    this.broadcastStatus();
  }

  // ─── Workers ────────────────────────────────────────────────────────────────

  spawnWorkers() {
    while (
      this.activeWorkers < this.config.concurrency &&
      this.discoveryQueue.length > 0 &&
      this.status === "running"
    ) {
      this.activeWorkers++;
      this.runWorker();
    }
  }

  async runWorker() {
    try {
      while (this.status === "running") {
        const item = this.dequeue();
        if (!item) break;

        await this.processUrl(item.url, item.depth);

        // Throttle between requests
        if (this.config.delay > 0 && this.status === "running") {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.delay)
          );
        }
      }
    } catch (err) {
      this.log("error", `Worker error: ${err.message}`);
    } finally {
      this.activeWorkers--;

      if (this.activeWorkers === 0 && this.discoveryQueue.length === 0) {
        if (this.status === "running") {
          this.log("info", "Crawl complete");
          this.status = "stopped";
          chrome.alarms.clear("crawl-keepalive");
          await this.saveState();
          this.broadcastStatus();
          await this._invokeSessionEnded();
        }
      }
    }
  }

  async processUrl(url, depth) {
    try {
      if (!CrawlEngine.isFetchableHttpUrl(url)) {
        this.log("skip", `Unsupported URL scheme: ${url}`);
        return;
      }

      const signal = this._abortController ? this._abortController.signal : AbortSignal.timeout(30000);
      const response = await fetch(url, {
        credentials: "omit",
        headers: { Accept: "text/html" },
        signal,
      });

      // Check for blocking responses
      if (response.status === 403 || response.status === 429) {
        this.handleBlocked(url, `HTTP ${response.status}`);
        return;
      }

      // Check Content-Type
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        this.log("skip", `Not HTML (${contentType}): ${url}`);
        return;
      }

      const html = await response.text();

      // Check for CAPTCHA
      if (this.looksLikeCaptcha(html)) {
        this.handleBlocked(url, "CAPTCHA detected");
        return;
      }

      // Parse via offscreen document
      const result = await this.parseInOffscreen(url, html);
      if (!result || !result.markdown) {
        this.log("error", `Parse failed for: ${url}`);
        return;
      }

      // Save markdown
      await this.saveMarkdown(result.markdown, result.title, url);

      // Mark as captured
      this.capturedUrls.add(url);
      this.stats.captured++;
      this.consecutiveBlocks = 0;
      this.lastPage = { url, title: result.title || url, success: true };
      this.log("capture", result.title || url, { pageUrl: url });

      // Enqueue discovered links
      if (result.links && Array.isArray(result.links)) {
        for (const link of result.links) {
          this.enqueue(link, depth + 1);
        }
      }

      this.broadcastStatus();
      await this.saveState();
    } catch (err) {
      if (err.name === "AbortError") {
        // Paused/stopped — re-queue the URL so it's retried on resume
        this.seenUrls.delete(url);
        this.discoveryQueue.unshift({ url, depth });
        this.stats.queued = this.discoveryQueue.length;
        return;
      }
      if (err.name === "TimeoutError") {
        this.log("error", `Timeout: ${url}`);
        this.handleBlocked(url, "Timeout");
      } else {
        this.log("error", `Network error for ${url}: ${err.message}`);
      }
    }
  }

  // ─── Offscreen communication ────────────────────────────────────────────────

  parseInOffscreen(url, html) {
    return chrome.runtime.sendMessage({
      type: "parse:html",
      url,
      html,
    });
  }

  // ─── Anti-bot ───────────────────────────────────────────────────────────────

  looksLikeCaptcha(html) {
    const lower = html.toLowerCase();
    const indicators = [
      "captcha",
      "cf-challenge",
      "hcaptcha",
      "recaptcha",
      "challenge-platform",
    ];
    return indicators.some((term) => lower.includes(term));
  }

  handleBlocked(url, reason) {
    this.blockedUrls.push({ url, reason, timestamp: Date.now() });
    this.consecutiveBlocks++;
    this.stats.blocked = this.blockedUrls.length;
    this.lastPage = { url, title: url, success: false };
    this.log("blocked", `${reason}: ${url}`);

    if (
      this.config.maxConsecutiveBlocks > 0 &&
      this.consecutiveBlocks >= this.config.maxConsecutiveBlocks
    ) {
      this.log(
        "warn",
        `Auto-pausing: ${this.consecutiveBlocks} consecutive blocks`
      );
      this.pause();
    }
  }

  retryBlocked(url) {
    this.blockedUrls = this.blockedUrls.filter((b) => b.url !== url);
    this.stats.blocked = this.blockedUrls.length;
    this.enqueue(url, 0);
    if (this.status === "running") {
      this.spawnWorkers();
    }
    this.broadcastStatus();
  }

  retryAllBlocked() {
    const urls = this.blockedUrls.map((b) => b.url);
    this.blockedUrls = [];
    this.stats.blocked = 0;
    for (const url of urls) {
      this.enqueue(url, 0);
    }
    if (this.status === "running") {
      this.spawnWorkers();
    }
    this.broadcastStatus();
  }

  dismissBlocked(url) {
    this.blockedUrls = this.blockedUrls.filter((b) => b.url !== url);
    this.stats.blocked = this.blockedUrls.length;
    this.broadcastStatus();
    void this.saveState();
  }

  // ─── Download ───────────────────────────────────────────────────────────────

  async saveMarkdown(markdown, title, pageUrl) {
    const { session } = await chrome.storage.local.get("session");
    const folder = session?.folder || "w2m-crawl";

    const { dirs, filename } = urlToPath(pageUrl);
    const mdPath =
      dirs.length > 0 ? `${dirs.join("/")}/${filename}.md` : `${filename}.md`;

    // Download assets if enabled
    let finalMarkdown = markdown;
    if (session?.saveAssets) {
      const pageLabel = title || pageUrl;
      finalMarkdown = await downloadAssets(markdown, folder, mdPath, {
        pageUrl,
        pageLabel,
        downloadedAssets: this.downloadedAssets,
        onAssetSaved: (info) => {
          this.log("asset", info.localName, {
            fileName: info.localName,
            assetUrl: info.imgUrl,
            pageUrl: info.pageUrl || pageUrl,
            pageLabel: info.pageLabel || pageLabel,
          });
        },
      });
    }

    const encoded = encodeURIComponent(finalMarkdown);
    await w2mDownload({
      url: `data:text/markdown;charset=utf-8,${encoded}`,
      filename: `${folder}/${mdPath}`,
      saveAs: false,
      conflictAction: "overwrite",
    });
  }

  getDebugSnapshot(msg = {}) {
    const clampInt = (v, def, max) =>
      Math.min(max, Math.max(1, Number(v) || def));
    const maxCaptured = clampInt(msg.maxCaptured, 200, 500);
    const maxQueued = clampInt(msg.maxQueued, 200, 500);
    const maxLogs = clampInt(msg.maxLogs, 200, 500);
    const maxBlocked = clampInt(msg.maxBlocked, 200, 500);

    const capArr = [...this.capturedUrls];
    const queued = this.discoveryQueue.map((item) => ({ ...item }));
    const blocked = [...this.blockedUrls];
    const logsSlice = this.logBuffer.slice(-maxLogs);

    return {
      type: "crawl:debug-snapshot",
      status: this.status,
      stats: { ...this.stats },
      config: { ...this.config },
      scope: this.scope,
      activeWorkers: this.activeWorkers,
      consecutiveBlocks: this.consecutiveBlocks,
      capturedUrls: capArr.slice(0, maxCaptured),
      discoveryQueue: queued.slice(0, maxQueued),
      blockedUrls: blocked.slice(0, maxBlocked),
      logs: logsSlice,
      truncated: {
        captured: capArr.length > maxCaptured,
        queued: queued.length > maxQueued,
        blocked: blocked.length > maxBlocked,
        logs: this.logBuffer.length > maxLogs,
      },
      totalCaptured: capArr.length,
      totalQueued: queued.length,
      totalBlocked: blocked.length,
      totalLogs: this.logBuffer.length,
    };
  }

  // ─── Port messaging ────────────────────────────────────────────────────────

  addPort(port) {
    this.ports.add(port);

    port.onDisconnect.addListener(() => {
      this.ports.delete(port);
    });

    port.onMessage.addListener((msg) => {
      switch (msg.type) {
        case "crawl:pause":
          this.pause();
          break;
        case "crawl:resume":
          this.resume();
          break;
        case "crawl:stop":
          this.stop();
          break;
        case "crawl:reset":
          this.reset();
          break;
        case "crawl:retry":
          this.retryBlocked(msg.url);
          break;
        case "crawl:retry-all":
          this.retryAllBlocked();
          break;
        case "crawl:dismiss-blocked":
          this.dismissBlocked(msg.url);
          break;
        case "crawl:open-blocked":
          if (CrawlEngine.isFetchableHttpUrl(msg.url)) {
            chrome.tabs.create({ url: msg.url });
          }
          break;
        case "crawl:get-status":
          port.postMessage(this.getStatusPayload());
          break;
        case "crawl:get-debug-snapshot":
          port.postMessage(this.getDebugSnapshot(msg));
          break;
      }
    });

    // Send current status immediately
    port.postMessage(this.getStatusPayload());
  }

  getStatusPayload() {
    const elapsed = this.stats.startTime
      ? (Date.now() - this.stats.startTime) / 60000
      : 0;
    const speed = elapsed > 0 ? Math.round(this.stats.captured / elapsed) : 0;
    return {
      type: "crawl:status",
      status: this.status,
      stats: { ...this.stats, speed, lastPage: this.lastPage || null },
      blockedUrls: [...this.blockedUrls],
      capturedCount: this.capturedUrls.size,
      queueLength: this.discoveryQueue.length,
    };
  }

  broadcastStatus() {
    const payload = this.getStatusPayload();
    for (const port of this.ports) {
      try {
        port.postMessage(payload);
      } catch {
        this.ports.delete(port);
      }
    }
    if (this._onStatusChange) {
      try { this._onStatusChange(this.status); } catch (_) { /* ignore */ }
    }
  }

  // ─── Logging ────────────────────────────────────────────────────────────────

  log(type, message, meta = null) {
    const entry = { type, message, timestamp: Date.now() };
    if (meta && typeof meta === "object") {
      Object.assign(entry, meta);
    }
    this.logBuffer.push(entry);
    if (this.logBuffer.length > 500) {
      this.logBuffer.shift();
    }

    // Broadcast log to all ports
    for (const port of this.ports) {
      try {
        port.postMessage({ type: "crawl:log", log: entry });
      } catch {
        this.ports.delete(port);
      }
    }

    console.log(`[CrawlEngine][${type}] ${message}`);
  }

  // ─── State persistence ─────────────────────────────────────────────────────

  async saveState() {
    await chrome.storage.local.set({
      crawlState: {
        status: this.status,
        stats: this.stats,
        capturedUrls: [...this.capturedUrls],
        blockedUrls: this.blockedUrls,
        config: this.config,
        scope: this.scope,
      },
    });

    await chrome.storage.session.set({
      crawlQueue: this.discoveryQueue,
    });
  }

  async restoreState() {
    const { crawlState } = await chrome.storage.local.get("crawlState");
    const { crawlQueue } = await chrome.storage.session.get("crawlQueue");

    if (!crawlState) return false;

    this.status = crawlState.status;
    this.stats = crawlState.stats;
    this.capturedUrls = new Set(crawlState.capturedUrls || []);
    this.blockedUrls = crawlState.blockedUrls || [];
    this.config = crawlState.config || this.config;
    this.scope = crawlState.scope || null;
    this.discoveryQueue = crawlQueue || [];
    this.stats.queued = this.discoveryQueue.length;
    // Rebuild seenUrls from captured + queued + blocked URLs
    this.seenUrls = new Set(this.capturedUrls);
    for (const item of this.discoveryQueue) this.seenUrls.add(item.url);
    for (const item of this.blockedUrls) this.seenUrls.add(item.url);

    this.log("info", "State restored");

    if (this.status === "running") {
      this.spawnWorkers();
    }

    return true;
  }

  // ─── Keepalive ──────────────────────────────────────────────────────────────

  onAlarm(alarm) {
    if (alarm.name === "crawl-keepalive" && this.status === "running") {
      this.saveState();
      this.spawnWorkers();
    }
  }

  // ─── Storage quota ──────────────────────────────────────────────────────────

  async checkStorageQuota() {
    const bytesInUse = await chrome.storage.local.getBytesInUse();
    const MB = bytesInUse / (1024 * 1024);

    if (MB >= 9) {
      this.log("error", `Storage quota critical (${MB.toFixed(1)}MB) — auto-pausing`);
      await this.pause();
    } else if (MB >= 8) {
      this.log("warn", `Storage usage high (${MB.toFixed(1)}MB)`);
    }
  }
}
