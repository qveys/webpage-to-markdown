// js/background.js — Service Worker for Webpage to Markdown
// Handles single-page conversion, multi-page crawl, and auto-capture sessions.

importScripts("/js/turndown.js");
importScripts("/js/cleanup-markdown.js");
importScripts("/js/markdown-output.js");

// Reset session on every SW startup (including extension reload)
// New timestamped folder on each startup, delay preserved
chrome.storage.local.get("session", ({ session }) => {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  chrome.storage.local.set({
    session: {
      active: false,
      folder: `w2m-session-${ts}`,
      delay: session?.delay ?? 2000,
      capturedUrls: [], // New session on SW restart
    },
  });
  chrome.action.setBadgeText({ text: "" });
});

// ─── Extraction du contenu de la page ────────────────────────────────────────
// This function is injected into the active tab via chrome.scripting.executeScript.
// It CANNOT reference outer variables (isolated closure).

function extractPageContent() {
  try {
    if (!document || !document.body) {
      throw new Error("Document body not found");
    }

    const getIframeContent = (iframe) => {
      try {
        const iframeDoc =
          iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc || !iframeDoc.body) return "";
        const iframeClone = iframeDoc.body.cloneNode(true);
        iframeClone
          .querySelectorAll(
            "script, style, nav, footer, aside, .ads, .comments",
          )
          .forEach((el) => el.remove());
        return `<div class="iframe-content">${iframeClone.innerHTML}</div>`;
      } catch (e) {
        return "";
      }
    };

    const bodyClone = document.body.cloneNode(true);
    const iframes = document.querySelectorAll("iframe");
    const iframeContents = [];
    iframes.forEach((iframe) => {
      const content = getIframeContent(iframe);
      if (content) iframeContents.push(content);
    });

    const unwanted = bodyClone.querySelectorAll(
      'script, style, nav, footer, aside, .ads, .comments, [role="complementary"], .cookie-banner, .popup, .overlay, .modal',
    );
    unwanted.forEach((el) => el.remove());

    const mainSelectors = [
      "main",
      "article",
      ".content",
      ".post",
      ".entry",
      '[role="main"]',
      "#content",
      ".main",
    ];
    let mainContent = null;
    for (const selector of mainSelectors) {
      const found = bodyClone.querySelector(selector);
      if (found && found.innerHTML.trim().length > 100) {
        mainContent = found;
        break;
      }
    }

    let finalContent = mainContent
      ? mainContent.innerHTML
      : bodyClone.innerHTML;
    if (iframeContents.length > 0) {
      finalContent += "<h2>Embedded Content</h2>" + iframeContents.join("<hr>");
    }

    return {
      title: document.title || "Untitled Page",
      url: document.location.href,
      content: finalContent,
      success: true,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ─── Conversion HTML → Markdown ───────────────────────────────────────────────

function convertToMarkdown(title, content) {
  const service = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
  });

  service.keep(["iframe", "script", "style"]);

  service.addRule("figures", {
    filter: "figure",
    replacement: (ruleContent, node) => {
      const img = node.querySelector("img");
      const caption = node.querySelector("figcaption");
      if (img) {
        const alt = img.getAttribute("alt") || "";
        const src = img.getAttribute("src") || "";
        const captionText = caption ? caption.textContent : "";
        return `\n\n![${alt}](${src})\n${captionText}\n\n`;
      }
      return ruleContent;
    },
  });
  // Constrain small images to their rendered size via HTML <img> tag
  service.addRule("constrainSmallImages", {
    filter: (node) => {
      if (node.nodeName !== "IMG") return false;
      const w = parseInt(node.getAttribute("width") || "0", 10);
      const h = parseInt(node.getAttribute("height") || "0", 10);
      return (w > 0 && w < 200) || (h > 0 && h < 200);
    },
    replacement: (content, node) => {
      const alt = node.getAttribute("alt") || "";
      const src = node.getAttribute("src") || "";
      if (!src) return "";
      const w = parseInt(node.getAttribute("width") || "0", 10);
      const h = parseInt(node.getAttribute("height") || "0", 10);
      const sw = w > 0 && w < 200;
      const sh = h > 0 && h < 200;
      let style;
      if (sw && sh) {
        style = `max-width:${w}px;max-height:${h}px;height:auto;width:auto`;
      } else if (sw) {
        style = `max-width:${w}px;height:auto`;
      } else if (sh) {
        style = `max-height:${h}px;width:auto`;
      } else {
        style = "max-width:64px;height:auto";
      }
      const escAttr = (s) => String(s).replace(/"/g, '&quot;');
      return `<img src="${escAttr(src)}" alt="${escAttr(alt)}" style="${style}">`;
    },
  });

  const wrappedContent = `<div class="markdown-content"><h1>${title}</h1>${content}</div>`;
  let markdown = service.turndown(wrappedContent);
  markdown = cleanupMarkdown(markdown);
  return markdown;
}

// cleanupMarkdown is provided by /js/cleanup-markdown.js (loaded via importScripts above)

// ─── Force-skip "save as" dialog ─────────────────────────────────────────────
// Chrome ignores saveAs:false when "Ask where to save" is enabled in settings.
// We track pending downloads and use onDeterminingFilename to force the filename.

const _pendingDownloads = new Map(); // downloadId → filename
let _downloadQueue = Promise.resolve(); // serialise chrome.downloads calls

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (_pendingDownloads.has(item.id)) {
    suggest({ filename: _pendingDownloads.get(item.id), conflictAction: "overwrite" });
    _pendingDownloads.delete(item.id);
  }
});

async function w2mDownload(options) {
  // Serialise downloads so onDeterminingFilename always finds the pending entry
  const ticket = _downloadQueue;
  let release;
  _downloadQueue = new Promise((r) => { release = r; });
  await ticket;

  try {
    const id = await new Promise((resolve, reject) => {
      chrome.downloads.download(options, (downloadId) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else {
          // Register INSIDE the callback, before the microtask boundary,
          // so onDeterminingFilename always finds the entry.
          if (options.filename) _pendingDownloads.set(downloadId, options.filename);
          resolve(downloadId);
        }
      });
    });
    return id;
  } finally {
    release();
  }
}

// ─── Download via chrome.downloads ──────────────────────────────────────────
// Service workers do not have access to Blob/URL.createObjectURL.
// On encode le markdown en data URL pour chrome.downloads.download().

async function downloadMarkdown(markdown, title) {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const safeTitle = (title || "page")
    .replace(/[^a-z0-9\-_]/gi, "-")
    .slice(0, 40);
  const filename = `${safeTitle}-${timestamp}.md`;

  const encoded = encodeURIComponent(markdown);
  const dataUrl = `data:text/markdown;charset=utf-8,${encoded}`;

  await w2mDownload({
    url: dataUrl,
    filename: filename,
    saveAs: false,
    conflictAction: "overwrite",
  });
}


// ─── Auto-capture session ──────────────────────────────────────────────────

const DEFAULT_DELAY = 2000;

function makeSessionFolder() {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `w2m-session-${ts}`;
}

async function getSession() {
  const { session } = await chrome.storage.local.get("session");
  return (
    session || {
      active: false,
      folder: makeSessionFolder(),
      delay: DEFAULT_DELAY,
    }
  );
}

async function setSession(patch) {
  const current = await getSession();
  const updated = { ...current, ...patch };
  await chrome.storage.local.set({ session: updated });
  return updated;
}

async function updateBadge(status) {
  if (status === "paused") {
    await chrome.action.setBadgeText({ text: "❚❚" });
    await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
  } else if (status === true || status === "running") {
    await chrome.action.setBadgeText({ text: "●" });
    await chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

// Listener pour les messages du popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "W2M_GET_SESSION") {
    getSession().then((session) =>
      sendResponse({
        ...session,
        captureCount: capturedUrls.size,
      }),
    );
    return true;
  }
  if (message.type === "W2M_START_SESSION") {
    const folder = message.folder || makeSessionFolder();
    const delay = message.delay ?? DEFAULT_DELAY;
    const urlTree = message.urlTree ?? true;
    const saveAssets = message.saveAssets ?? true;
    // Ne vider les URLs que si le dossier change (= nouvelle session)
    getSession()
      .then((prev) => {
        if (prev.folder !== folder) {
          capturedUrls.clear();
        }
        return setSession({
          active: true,
          folder,
          delay,
          urlTree,
          saveAssets,
          capturedUrls: [...capturedUrls],
        });
      })
      .then(async (session) => {
        updateBadge(true);
        sendResponse({ ok: true, session });
        // Capture the active page immediately on session start
        try {
          const [tab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
          });
          if (tab && tab.id && tab.url && !navigationUrlIsRestricted(tab.url)) {
            // Check if the page was already captured
            if (capturedUrls.has(tab.url)) {
              return;
            } else {
              const extracted = await extractMarkdownFromTab(tab.id, tab.url);
              if (extracted?.success) {
                const { markdown, title } = extracted;
                await downloadInSession(markdown, title, folder, tab.url);
                await addCapturedUrl(tab.url);
                chrome.runtime
                  .sendMessage({
                    type: "W2M_CAPTURE_COUNT",
                    count: capturedUrls.size,
                  })
                  .catch((err) => {
                    if (!err.message?.includes('Receiving end does not exist')) {
                      console.warn('[W2M] sendMessage:', err.message);
                    }
                  });
                await chrome.storage.local.set({
                  lastConversion: {
                    url: tab.url,
                    markdown,
                    timestamp: new Date().toISOString(),
                  },
                });
              }
            } // end else (not already captured)
          }
        } catch (err) {
          console.error("[W2M] Initial capture error:", err);
        }
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === "W2M_STOP_SESSION") {
    setSession({ active: false })
      .then((session) => {
        updateBadge(false);
        sendResponse({ ok: true, session });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === "W2M_UPDATE_SESSION") {
    if (crawlEngine && crawlEngine.status !== "stopped") {
      crawlEngine.updateConfig(message.patch);
    }
    setSession(message.patch)
      .then((session) => sendResponse({ ok: true, session }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === "W2M_DOWNLOAD_MARKDOWN") {
    (async () => {
      try {
        if (!message.markdown) throw new Error("Missing markdown");
        await downloadMarkdown(message.markdown, message.title);
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
  if (message.type === "W2M_CRAWL_START") {
    (async () => {
      let crawlSessionCommitted = false;
      try {
        await ensureOffscreen();
        const folder = message.folder || makeSessionFolder();
        const delay = message.delay ?? 2000;
        const urlTree = message.urlTree ?? true;
        const saveAssets = message.saveAssets ?? true;
        await setSession({ active: true, folder, delay, urlTree, saveAssets, crawling: true, startUrl: message.startUrl, lastCrawlResult: null });
        crawlSessionCommitted = true;
        updateBadge(true);
        await crawlEngine.start(message.startUrl, {
          concurrency: message.concurrency || 3,
          depth: message.depth ?? 0,
          maxConsecutiveBlocks:
            message.maxBlocks !== undefined && message.maxBlocks !== null
              ? message.maxBlocks
              : 5,
          // Same `delay` as session + popup W2M_CRAWL_START (ms between fetches)
          delay,
        });
        try {
          const w = await chrome.windows.getLastFocused({
            windowTypes: ["normal"],
          });
          if (w?.id != null) {
            await chrome.sidePanel.open({ windowId: w.id });
          }
        } catch (e) {
          console.warn('[W2M] sidePanel.open:', e.message);
        }
        sendResponse({ ok: true });
      } catch (err) {
        try {
          await crawlEngine.stop();
        } catch (e2) {
          console.warn('[W2M] crawlEngine.stop on error:', e2.message);
        }
        if (crawlSessionCommitted) {
          try {
            await setSession({ active: false, crawling: false });
          } catch (e3) {
            console.warn('[W2M] setSession cleanup:', e3.message);
          }
        }
        updateBadge(false);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
  if (message.type === "W2M_CRAWL_STOP") {
    (async () => {
      try {
        await crawlEngine.stop();
      } catch (e) {
        console.warn("[W2M] W2M_CRAWL_STOP:", e);
        await w2mOnCrawlSessionEnded();
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (message.type === "W2M_CRAWL_PAUSE") {
    (async () => {
      try {
        await crawlEngine.pause();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
  if (message.type === "W2M_CRAWL_RESUME") {
    (async () => {
      try {
        await crawlEngine.resume();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
  if (message.type === "W2M_CRAWL_RETRY") {
    try {
      if (message.url) crawlEngine.retryBlocked(message.url);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
    return true;
  }
  if (message.type === "W2M_CRAWL_GET_STATUS") {
    sendResponse(crawlEngine.getStatusPayload());
    return true;
  }
  if (message.type === "W2M_CRAWL_DISMISS") {
    if (message.url) {
      crawlEngine.dismissBlocked(message.url);
    }
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "W2M_OPEN_DASHBOARD") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (message.mode === "single" || message.mode === "crawl") {
          await chrome.storage.local.set({ dashboardMode: message.mode });
        }
        await chrome.sidePanel.open({ windowId: tab?.windowId });
        // If a specific view was requested, broadcast it to the dashboard
        if (message.view) {
          setTimeout(() => {
            chrome.runtime.sendMessage({ type: "W2M_SHOW_SETTINGS" }).catch((err) => {
              if (!err.message?.includes('Receiving end does not exist')) {
                console.warn('[W2M] sendMessage:', err.message);
              }
            });
          }, 300); // small delay to let the side panel load
        } else if (message.mode === "single" || message.mode === "crawl") {
          setTimeout(() => {
            chrome.runtime
              .sendMessage({ type: "W2M_APPLY_DASHBOARD_MODE", mode: message.mode })
              .catch((err) => {
                if (!err.message?.includes("Receiving end does not exist")) {
                  console.warn("[W2M] sendMessage:", err.message);
                }
              });
          }, 300);
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
  if (message.type === "W2M_SINGLE_CONVERT") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab || !tab.id || !tab.url) throw new Error("No active tab found");
        const url = tab.url;
        if (navigationUrlIsRestricted(url)) {
          throw new Error("Cannot convert system pages or Web Store");
        }
        const res = await extractMarkdownFromTab(tab.id, url);
        if (!res || !res.success) {
          throw new Error((res && res.error) || "Extraction failed");
        }
        const { singlePageSettings } = await chrome.storage.local.get('singlePageSettings');
        if (
          singlePageSettings &&
          singlePageSettings.autoDownload &&
          (await shouldAllowSinglePageAutoDownload())
        ) {
          try {
            await downloadMarkdown(res.markdown, res.title);
          } catch (dlErr) {
            console.warn('[W2M] Single auto-download failed:', dlErr);
          }
        }
        sendResponse({ ok: true, markdown: res.markdown, title: res.title, url });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
  if (message.type === "W2M_SINGLE_SET_SETTINGS") {
    (async () => {
      try {
        const { singlePageSettings } = await chrome.storage.local.get('singlePageSettings');
        const updated = Object.assign({}, singlePageSettings || {}, message.patch || {});
        await chrome.storage.local.set({ singlePageSettings: updated });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
});

// ─── Auto-capture: navigation listener ─────────────────────────────────────

const pendingCaptures = new Map(); // tabId → timeoutId
const pendingSingleCaptures = new Map(); // tabId → timeoutId for auto single-page convert
const SINGLE_CONVERT_DEBOUNCE_MS = 1000; // debounce for single-page auto-convert on navigation
let capturedUrls = new Set(); // URLs already processed in the current session

// Reload captured URLs from storage on SW startup
chrome.storage.local.get("session", ({ session }) => {
  if (session?.capturedUrls?.length) {
    capturedUrls = new Set(session.capturedUrls);
  }
});

// Ajouter une URL et persister dans le storage
async function addCapturedUrl(url) {
  capturedUrls.add(url);
  await setSession({ capturedUrls: [...capturedUrls] });
}

function isChromeWebStoreUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === "chromewebstore.google.com" ||
      (parsedUrl.hostname === "chrome.google.com" &&
        parsedUrl.pathname.startsWith("/webstore"))
    );
  } catch (_err) {
    return false;
  }
}

function navigationUrlIsRestricted(url) {
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("view-source:") ||
    isChromeWebStoreUrl(url)
  );
}

/**
 * True if this tab is the selected tab in the Chrome window returned by
 * `chrome.windows.getLastFocused()` (most recently focused browser window — not OS-level focus).
 */
async function isForegroundActiveTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active) return false;
    const focusedWin = await chrome.windows.getLastFocused();
    return tab.windowId === focusedWin.id;
  } catch (err) {
    console.warn("[W2M] isForegroundActiveTab:", err.message);
    return false;
  }
}

async function scheduleSinglePageAutoConvert(tabId, url) {
  const { singlePageSettings } = await chrome.storage.local.get("singlePageSettings");
  if (!singlePageSettings?.autoConvert) return;

  if (pendingSingleCaptures.has(tabId)) {
    clearTimeout(pendingSingleCaptures.get(tabId));
  }
  const singleTimerId = setTimeout(async () => {
    pendingSingleCaptures.delete(tabId);
    try {
      const { singlePageSettings: sp } = await chrome.storage.local.get("singlePageSettings");
      if (!sp?.autoConvert) return;

      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab?.id || !tab.url) return;
      if (navigationUrlIsRestricted(tab.url)) return;
      if (!(await isForegroundActiveTab(tabId))) return;
      const currentUrl = tab.url;

      const res = await extractMarkdownFromTab(tabId, currentUrl);
      if (res && res.success) {
        let autoDownloaded = false;
        if (sp.autoDownload && (await shouldAllowSinglePageAutoDownload())) {
          try {
            await downloadMarkdown(res.markdown, res.title);
            autoDownloaded = true;
          } catch (dlErr) {
            console.warn("[W2M] Single auto-download failed:", dlErr);
          }
        }
        chrome.runtime
          .sendMessage({
            type: "W2M_SINGLE_RESULT",
            ok: true,
            markdown: res.markdown,
            title: res.title,
            url: currentUrl,
            autoDownloaded: autoDownloaded,
          })
          .catch((err) => {
            if (!err.message?.includes("Receiving end does not exist")) {
              console.warn("[W2M] sendMessage:", err.message);
            }
          });
      } else {
        chrome.runtime
          .sendMessage({
            type: "W2M_SINGLE_RESULT",
            ok: false,
            error: (res && res.error) || "Extraction failed",
            url: currentUrl,
          })
          .catch((err) => {
            if (!err.message?.includes("Receiving end does not exist")) {
              console.warn("[W2M] sendMessage:", err.message);
            }
          });
      }
    } catch (err) {
      // Benign races we should not surface as failures:
      // - "ExtensionsSettings policy" → admin-locked page we can never script
      // - "Frame with ID 0 was removed" / "No tab with id" → tab navigated/closed mid-debounce
      const msg = typeof err === "string" ? err : err?.message || "";
      const benignPatterns = [
        "ExtensionsSettings policy",
        "Frame with ID 0 was removed",
        "No frame with id",
        "No tab with id",
        "The tab was closed",
      ];
      if (benignPatterns.some((p) => msg.includes(p))) {
        console.debug("[W2M] Single auto-convert skipped:", msg);
        return;
      }
      console.error("[W2M] Single auto-convert error:", err);
      let failUrl = url;
      try {
        const t = await chrome.tabs.get(tabId);
        if (t?.url) failUrl = t.url;
      } catch (_e) {
        /* keep navigation url */
      }
      chrome.runtime
        .sendMessage({ type: "W2M_SINGLE_RESULT", ok: false, error: msg, url: failUrl })
        .catch(() => {});
    }
  }, SINGLE_CONVERT_DEBOUNCE_MS);
  pendingSingleCaptures.set(tabId, singleTimerId);
}

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const url = details.url;
  const isRestricted = navigationUrlIsRestricted(url);

  const foregroundOk = await isForegroundActiveTab(details.tabId);

  // ─── Session auto-capture (existing behaviour) ──────────────────────────
  const session = await getSession();
  if (session.active && !isRestricted && foregroundOk) {
    // URL already captured
    if (capturedUrls.has(url)) {
      console.log("[W2M] Already captured, skipping:", url);
    } else {
      if (pendingCaptures.has(details.tabId)) {
        clearTimeout(pendingCaptures.get(details.tabId));
      }

      const timerId = setTimeout(async () => {
        pendingCaptures.delete(details.tabId);
        try {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: details.tabId },
              func: () =>
                new Promise((resolve) => {
                  if (document.readyState !== "complete") {
                    window.addEventListener("load", () => resolve(), { once: true });
                    return;
                  }
                  let timer;
                  const observer = new MutationObserver(() => {
                    clearTimeout(timer);
                    timer = setTimeout(() => { observer.disconnect(); resolve(); }, 300);
                  });
                  observer.observe(document.body, { childList: true, subtree: true });
                  timer = setTimeout(() => { observer.disconnect(); resolve(); }, 500);
                }),
            });
          } catch (stabilityErr) {
            console.warn("[W2M] DOM stability wait failed, proceeding anyway:", stabilityErr);
          }

          const extracted = await extractMarkdownFromTab(details.tabId, url);
          if (!extracted?.success) return;
          const { markdown, title } = extracted;

          await downloadInSession(markdown, title, session.folder, url);
          await addCapturedUrl(url);

          chrome.runtime.sendMessage({ type: "W2M_CAPTURE_COUNT", count: capturedUrls.size })
            .catch((err) => {
              if (!err.message?.includes('Receiving end does not exist')) {
                console.warn('[W2M] sendMessage:', err.message);
              }
            });

          await chrome.storage.local.set({
            lastConversion: { url, markdown, timestamp: new Date().toISOString() },
          });
        } catch (err) {
          console.error("[W2M] Auto-capture error:", err);
        }
      }, session.delay);

      pendingCaptures.set(details.tabId, timerId);
    }
  }

  // ─── Single-page auto-convert (full page load) ──────────────────────────
  if (!isRestricted && foregroundOk) {
    await scheduleSinglePageAutoConvert(details.tabId, url);
  }
});

// SPAs / client-side routing (pushState / replaceState) — no full reload, so onCompleted does not run.
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = details.url;
  if (navigationUrlIsRestricted(url)) return;
  if (!(await isForegroundActiveTab(details.tabId))) return;
  await scheduleSinglePageAutoConvert(details.tabId, url);
});

// In-page hash navigations (#…) without a document reload.
chrome.webNavigation.onReferenceFragmentUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const url = details.url;
  if (navigationUrlIsRestricted(url)) return;
  if (!(await isForegroundActiveTab(details.tabId))) return;
  await scheduleSinglePageAutoConvert(details.tabId, url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (pendingCaptures.has(tabId)) {
    clearTimeout(pendingCaptures.get(tabId));
    pendingCaptures.delete(tabId);
  }
  if (pendingSingleCaptures.has(tabId)) {
    clearTimeout(pendingSingleCaptures.get(tabId));
    pendingSingleCaptures.delete(tabId);
  }
});

async function injectConversionLibraries(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [
      "/js/Readability.js",
      "/js/turndown.js",
      "/js/turndown-plugin-gfm.js",
      "/js/cleanup-markdown.js",
    ],
  });
}

/**
 * Same Markdown pipeline as the toolbar popup: markdownSettings (Turndown options, YAML frontmatter).
 */
async function extractMarkdownFromTab(tabId, pageUrl) {
  const { markdownSettings } = await chrome.storage.local.get("markdownSettings");
  const m = self.W2M.markdownOutput.mergeSettings(markdownSettings);
  await injectConversionLibraries(tabId);
  const injectOpts = {
    headingStyle: m.headingStyle,
    bulletListMarker: m.bulletListMarker,
    codeBlockStyle: m.codeBlockStyle,
  };
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractAndConvert,
    args: [injectOpts],
  });
  const res = results?.[0]?.result;
  if (!res?.success) return res;
  let markdown = res.markdown;
  if (m.frontmatter) {
    markdown = self.W2M.markdownOutput.prependYamlFrontmatter(
      markdown,
      res.title,
      pageUrl,
    );
  }
  return { success: true, markdown, title: res.title };
}


// Executed in the tab (has access to DOM and injected TurndownService)
function extractAndConvert(options) {
  try {
    if (!document || !document.body) throw new Error("Document body not found");

    const getIframeContent = (iframe) => {
      try {
        const iframeDoc =
          iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc || !iframeDoc.body) return "";
        const clone = iframeDoc.body.cloneNode(true);
        clone
          .querySelectorAll(
            "script, style, nav, footer, aside, .ads, .comments",
          )
          .forEach((el) => el.remove());
        return `<div class="iframe-content">${clone.innerHTML}</div>`;
      } catch (e) {
        return "";
      }
    };

    const bodyClone = document.body.cloneNode(true);
    const iframeContents = [];
    document.querySelectorAll("iframe").forEach((iframe) => {
      const c = getIframeContent(iframe);
      if (c) iframeContents.push(c);
    });

    // Resolve all relative URLs to absolute
    const baseUrl = document.location.href;
    bodyClone
      .querySelectorAll("img[src], img[data-src], img[data-lazy-src]")
      .forEach((img) => {
        const src = img.getAttribute("src");
        const dataSrc =
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          img.getAttribute("data-original");
        // Prefer data-src if src is empty or a placeholder (short base64, or "about:blank")
        const effectiveSrc =
          dataSrc && (!src || src.startsWith("data:") || src === "about:blank")
            ? dataSrc
            : src;
        if (
          effectiveSrc &&
          !effectiveSrc.startsWith("data:") &&
          !effectiveSrc.startsWith("blob:")
        ) {
          try {
            img.setAttribute("src", new URL(effectiveSrc, baseUrl).href);
          } catch (e) { console.warn('[W2M] invalid img src:', effectiveSrc); }
        }
      });
    bodyClone.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (
        href &&
        !href.startsWith("http") &&
        !href.startsWith("mailto:") &&
        !href.startsWith("#")
      ) {
        try {
          a.setAttribute("href", new URL(href, baseUrl).href);
        } catch (e) { console.warn('[W2M] invalid href:', href); }
      }
    });

    bodyClone
      .querySelectorAll(
        'script, style, svg, nav, footer, aside, .ads, .comments, [role="complementary"], .cookie-banner, .popup, .overlay, .modal',
      )
      .forEach((el) => el.remove());

    let html;

    if (typeof Readability !== "undefined") {
      try {
        const docClone = document.cloneNode(true);
        const article = new Readability(docClone, {
          keepClasses: false,
        }).parse();
        if (article && article.content && article.content.length > 200) {
          html = article.content;
        }
      } catch (e) {
        console.warn("[W2M] Readability failed, falling back", e);
      }
    }

    if (!html) {
      // Fallback heuristique
      let mainContent = null;
      for (const sel of [
        "main",
        "article",
        ".content",
        ".post",
        ".entry",
        '[role="main"]',
        "#content",
        ".main",
      ]) {
        const found = bodyClone.querySelector(sel);
        if (found && found.innerHTML.trim().length > 100) {
          mainContent = found;
          break;
        }
      }
      html = mainContent ? mainContent.innerHTML : bodyClone.innerHTML;
    }
    if (iframeContents.length > 0)
      html += "<h2>Embedded Content</h2>" + iframeContents.join("<hr>");

    // ─── Clean HTML of non-content elements before Turndown ───────────
    // Uses a detached DOM container (never inserted into page) to strip
    // interactive controls, hidden decorations, and social widgets that
    // produce noise lines in the Markdown output.
    const _clean = document.createElement("div");
    _clean.innerHTML = html; // safe: html comes from Readability / same-origin DOM

    // Remove interactive controls (buttons, forms, toolbars)
    _clean
      .querySelectorAll(
        'button, [role="button"], [role="toolbar"], [role="group"], ' +
        '[role="menubar"], [role="menu"], [role="menuitem"], ' +
        "input, select, textarea, form",
      )
      .forEach((el) => el.remove());

    // Remove hidden/decorative elements (tooltips, screen-reader duplicates)
    _clean
      .querySelectorAll("[aria-hidden=\"true\"]")
      .forEach((el) => el.remove());

    // Convert embedded tweets to clean blockquotes (for non-Twitter pages)
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

    // Remove social share/follow widgets by class patterns
    _clean
      .querySelectorAll(
        '[class*="share-button"], [class*="social-share"], [class*="share-buttons"], ' +
        '[class*="follow-btn"], [class*="follow-button"], [class*="social-widget"], ' +
        '[class*="social-links"], [class*="social-icons"]',
      )
      .forEach((el) => el.remove());

    // Stamp rendered dimensions from live DOM onto _clean images,
    // so the Turndown rule can constrain them to their CSS-rendered size.
    const imgSizes = new Map();
    try {
      document.querySelectorAll("img").forEach((img) => {
        const rect = img.getBoundingClientRect();
        if (rect.width > 0) {
          imgSizes.set(img.getAttribute("src") || "", Math.round(rect.width));
          imgSizes.set(img.src, Math.round(rect.width)); // resolved URL too
        }
      });
    } catch (e) { console.warn('[W2M] imgSizes collection:', e.message); }
    _clean.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      const w = imgSizes.get(src);
      if (w && w < 200) {
        img.setAttribute("data-w2m-width", w);
      }
    });

    html = _clean.innerHTML;
    // ─── End HTML cleanup ─────────────────────────────────────────────

    const title = document.title || "Untitled Page";
    const opts = options || {};
    const headingStyle = opts.headingStyle === "setext" ? "setext" : "atx";
    let bullet = opts.bulletListMarker;
    if (bullet !== "-" && bullet !== "*" && bullet !== "+") bullet = "-";
    const codeBlockStyle = opts.codeBlockStyle === "indented" ? "indented" : "fenced";

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const service = new TurndownService({
      headingStyle,
      hr: "---",
      bulletListMarker: bullet,
      codeBlockStyle,
      emDelimiter: "_",
    });
    if (typeof turndownPluginGfm !== "undefined") {
      service.use(turndownPluginGfm.gfm);
    }
    service.keep(["iframe"]);
    service.addRule("codeBlocks", {
      filter: (node) => node.nodeName === "PRE" && node.querySelector("code"),
      replacement: (content, node) => {
        const code = node.querySelector("code");
        const rawCode = code.textContent || "";

        // Detect language from multiple possible attributes
        const lang =
          // class="language-json" ou class="lang-json"
          (code.className.match(/(?:language-|lang-)(\S+)/) || [])[1] ||
          // data-lang="json"
          code.getAttribute("data-lang") ||
          node.getAttribute("data-lang") ||
          // data-language="json"
          code.getAttribute("data-language") ||
          node.getAttribute("data-language") ||
          // GitLab: <code data-sourcepos lang="json">
          code.getAttribute("lang") ||
          "";

        return `\n\n\`\`\`${lang}\n${rawCode.replace(/\n$/, "")}\n\`\`\`\n\n`;
      },
    });
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
    service.addRule("details", {
      filter: "details",
      replacement: (content, node) => {
        const summary = node.querySelector("summary");
        const summaryText = summary ? summary.textContent.trim() : "Details";
        const bodyContent = content.replace(summaryText, "").trim();
        return `\n\n<details>\n<summary>${summaryText}</summary>\n\n${bodyContent}\n\n</details>\n\n`;
      },
    });
    service.addRule("imgWithAriaLabel", {
      filter: (node) =>
        node.nodeName === "IMG" &&
        !node.getAttribute("alt") &&
        node.getAttribute("aria-label"),
      replacement: (content, node) => {
        const alt = node.getAttribute("aria-label") || "";
        const src = node.getAttribute("src") || "";
        return src ? `![${alt}](${src})` : "";
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
        const escAttr = (s) => String(s).replace(/"/g, '&quot;');
        return `<img src="${escAttr(src)}" alt="${escAttr(alt)}" style="max-width:${maxW}px; height:auto;">`;
      },
    });

    const wrapHtml = `<div><h1>${escapeHtml(title)}</h1>${html}</div>`;
    let markdown = service.turndown(wrapHtml);
    markdown = cleanupMarkdown(markdown);

    return { success: true, markdown, title };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function urlToPath(pageUrl) {
  try {
    const u = new URL(pageUrl);
    const clean = (s) =>
      s.replace(/[^a-z0-9\-_.]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    // Nettoyer le hostname
    const host = clean(u.hostname);
    // Split pathname into segments, sanitize each segment
    const segments = u.pathname.split("/").map(clean).filter(Boolean);
    // Le dernier segment devient le nom de fichier (.md), les autres sont des dossiers
    let filename = segments.pop() || "index";
    // Include query params in the name to avoid collisions
    // ex: ?tab=ios → mullvad-exit-nodes--tab-ios.md
    if (u.search) {
      const suffix = clean(u.search.slice(1)); // drop the leading '?'
      if (suffix) filename += "--" + suffix;
    }
    return { dirs: [host, ...segments], filename };
  } catch (e) {
    return { dirs: [], filename: "page" };
  }
}

async function downloadInSession(markdown, title, folder, pageUrl) {
  const session = await getSession();

  let mdPath; // chemin du fichier .md sans le dossier racine
  if (session.urlTree && pageUrl) {
    const { dirs, filename: name } = urlToPath(pageUrl);
    mdPath = dirs.length > 0 ? `${dirs.join("/")}/${name}.md` : `${name}.md`;
  } else {
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-");
    const safeTitle = (title || "page")
      .replace(/[^a-z0-9\-_]/gi, "-")
      .slice(0, 60);
    mdPath = `${safeTitle}-${timestamp}.md`;
  }

  // Download assets if the option is enabled
  if (session.saveAssets) {
    markdown = await downloadAssets(markdown, folder, mdPath);
  }

  const encoded = encodeURIComponent(markdown);
  await w2mDownload({
    url: `data:text/markdown;charset=utf-8,${encoded}`,
    filename: `${folder}/${mdPath}`,
    saveAs: false,
    conflictAction: "overwrite",
  });
}

// Short stable identifier from the full URL (avoids collisions like image.png).
function w2mAssetIdFromUrl(urlString) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < urlString.length; i++) {
    h ^= urlString.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function w2mEscapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Downloads images (![…](url) and <img src="url">) then rewrites to ./assets/name
// — same parent folder as the .md file.
async function downloadAssets(markdown, folder, mdPath, options = {}) {
  const mdImgRegex = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  const htmlImgSrcRegex =
    /<img\b[^>]*?\bsrc\s*=\s*(["'])(https?:\/\/[^"']+)\1[^>]*>/gi;

  const urls = new Set();
  for (const m of markdown.matchAll(mdImgRegex)) urls.add(m[2]);
  for (const m of markdown.matchAll(htmlImgSrcRegex)) urls.add(m[2]);
  if (urls.size === 0) return markdown;

  // Assets folder: same level as the .md file
  const mdDir = mdPath.includes("/")
    ? mdPath.slice(0, mdPath.lastIndexOf("/"))
    : "";
  const assetsDir = mdDir ? `${folder}/${mdDir}/assets` : `${folder}/assets`;

  const downloaded = new Map(); // url absolue → nom fichier local
  const usedLocalNames = new Set();

  for (const imgUrl of urls) {
    try {
      const urlObj = new URL(imgUrl);
      const rawName = urlObj.pathname.split("/").pop() || "image";
      const dotIdx = rawName.lastIndexOf(".");
      const ext =
        dotIdx > -1
          ? rawName.slice(dotIdx).split("?")[0].toLowerCase()
          : ".jpg";
      let stem = rawName
        .slice(0, dotIdx > -1 ? dotIdx : undefined)
        .replace(/[^a-z0-9\-_]/gi, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 28);
      if (!stem) stem = "img";
      const id = w2mAssetIdFromUrl(imgUrl);
      let localName = `${stem}-${id}${ext}`.replace(/[/\\:*?"<>|]/g, "-");
      let n = 0;
      while (usedLocalNames.has(localName)) {
        n++;
        localName = `${stem}-${id}-${n}${ext}`.replace(/[/\\:*?"<>|]/g, "-");
      }
      usedLocalNames.add(localName);

      // Skip if already downloaded in this session (e.g. shared across pages)
      const downloadedAssets = options.downloadedAssets;
      if (downloadedAssets && downloadedAssets.has(imgUrl)) {
        downloaded.set(imgUrl, downloadedAssets.get(imgUrl));
        continue;
      }

      await w2mDownload({
        url: imgUrl,
        filename: `${assetsDir}/${localName}`,
        saveAs: false,
        conflictAction: "uniquify",
      });

      downloaded.set(imgUrl, localName);
      if (downloadedAssets) downloadedAssets.set(imgUrl, localName);

      if (typeof options.onAssetSaved === "function") {
        try {
          options.onAssetSaved({
            localName,
            imgUrl,
            pageUrl: options.pageUrl,
            pageLabel: options.pageLabel,
          });
        } catch (e) {
          console.warn('[W2M] onAssetSaved callback:', e.message);
        }
      }
    } catch (err) {
      console.warn("[W2M] Asset download failed:", imgUrl, err);
    }
  }

  if (downloaded.size === 0) return markdown;

  let result = markdown;
  const pairs = [...downloaded.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [imgUrl, localName] of pairs) {
    const rel = `./assets/${localName}`;
    const esc = w2mEscapeRegExp(imgUrl);
    result = result.replace(
      new RegExp(`!\\[([^\\]]*)\\]\\(${esc}\\)`, "g"),
      `![$1](${rel})`,
    );
    result = result.replace(
      new RegExp(`(src\\s*=\\s*)(["'])${esc}\\2`, "gi"),
      `$1$2${rel}$2`,
    );
  }

  return result;
}

// ─── Offscreen document lifecycle ─────────────────────────────────
let offscreenReady = false;

async function ensureOffscreen() {
  const exists = await chrome.offscreen.hasDocument();
  if (exists) { offscreenReady = true; return; }
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: "Parse HTML for crawl: Readability + link extraction + Turndown",
    });
    offscreenReady = true;
  } catch (e) {
    if (e.message?.includes("Only a single offscreen")) {
      offscreenReady = true;
    } else {
      console.error("[W2M] Offscreen creation failed:", e);
    }
  }
}

async function closeOffscreen() {
  try {
    await chrome.offscreen.closeDocument();
  } catch (e) {
    if (!e.message?.includes('not open')) console.warn('[W2M] closeOffscreen:', e.message);
  }
  offscreenReady = false;
}

// ─── Port-based messaging for crawl ──────────────────────
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "crawl") {
    crawlEngine.addPort(port);
  }
});

// ─── Keepalive alarm for crawl ───────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  crawlEngine.onAlarm(alarm);
  if (alarm.name === "crawl-keepalive") {
    crawlEngine.checkStorageQuota();
  }
});

// ─── Crawl engine (must be after all function definitions) ────────────
/** Clear extension session UI when a crawl ends (stop, dashboard stop, or natural completion). */
async function w2mOnCrawlSessionEnded() {
  try {
    await closeOffscreen();
  } catch (e) {
    console.warn('[W2M] closeOffscreen on session end:', e.message);
  }
  // Save final stats so the popup can display the results
  const finalStats = crawlEngine ? crawlEngine.getStatusPayload() : null;
  try {
    await setSession({
      active: false,
      crawling: false,
      lastCrawlResult: finalStats ? {
        stats: finalStats.stats,
        blockedUrls: finalStats.blockedUrls,
        timestamp: Date.now()
      } : null
    });
  } catch (e) {
    console.warn("[W2M] setSession after crawl end:", e);
  }
  try {
    await updateBadge(false);
  } catch (e) {
    console.warn('[W2M] updateBadge on session end:', e.message);
  }
}

importScripts("/js/crawl-engine.js");

const crawlEngine = new CrawlEngine({
  onSessionEnded: w2mOnCrawlSessionEnded,
  onStatusChange: (status) => {
    updateBadge(status);
    if (status === "stopped" || status === "done") {
      const payload = crawlEngine.getStatusPayload();
      chrome.runtime.sendMessage({ type: "W2M_CRAWL_STATUS", ...payload }).catch((err) => {
        if (!err.message?.includes('Receiving end does not exist')) {
          console.warn('[W2M] sendMessage:', err.message);
        }
      });
    }
  },
});

/** Auto-download only when the side panel dashboard is open (crawl port) and Single Page tab is selected. */
async function shouldAllowSinglePageAutoDownload() {
  const { dashboardMode } = await chrome.storage.local.get("dashboardMode");
  if (dashboardMode !== "single") return false;
  return crawlEngine.ports.size > 0;
}

crawlEngine.restoreState();
