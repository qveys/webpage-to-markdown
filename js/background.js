// js/background.js — Service Worker pour Webpage to Markdown
// Expose chrome.runtime.onMessageExternal pour le message { type: "W2M_CONVERT_AND_DOWNLOAD" }

importScripts("/js/turndown.js");

// Réinitialiser la session à chaque démarrage du SW (rechargement extension inclus)
// Nouveau folder horodaté à chaque démarrage, délai conservé
chrome.storage.local.get("session", ({ session }) => {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  chrome.storage.local.set({
    session: {
      active: false,
      folder: `w2m-session-${ts}`,
      delay: session?.delay ?? 2000,
      capturedUrls: [], // Nouvelle session au redémarrage du SW
    },
  });
  chrome.action.setBadgeText({ text: "" });
});

// ─── Extraction du contenu de la page ────────────────────────────────────────
// Cette fonction est injectée dans l'onglet actif via chrome.scripting.executeScript.
// Elle ne peut PAS référencer des variables extérieures (closure isolée).

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
      return `<img src="${src}" alt="${alt}" style="${style}">`;
    },
  });

  const wrappedContent = `<div class="markdown-content"><h1>${title}</h1>${content}</div>`;
  let markdown = service.turndown(wrappedContent);
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
    if (t.length === 0) return false; // blank lines handled separately
    if (t.length >= 30) return false; // too long to be UI noise
    // Skip markdown constructs
    if (/^(?:#{1,6}\s|>\s|```|[-+*]\s|\d+\.\s|\[|!\[|---|\*{3}|_{3})/.test(t))
      return false;
    return true;
  };
  for (let k = 0; k < lines.length;) {
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
        end++; // skip blank lines between noise
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

// ─── Téléchargement via chrome.downloads ────────────────────────────────────
// Les service workers n'ont pas accès à Blob/URL.createObjectURL.
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
        // Capturer immédiatement la page active au démarrage
        try {
          const [tab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
          });
          if (
            tab &&
            tab.id &&
            tab.url &&
            !tab.url.startsWith("chrome://") &&
            !tab.url.startsWith("chrome-extension://") &&
            !tab.url.startsWith("edge://") &&
            !tab.url.startsWith("about:") &&
            !tab.url.includes("chrome.google.com/webstore")
          ) {
            // Vérifier si la page est déjà capturée
            if (capturedUrls.has(tab.url)) {
              return;
            } else {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: [
                  "/js/Readability.js",
                  "/js/turndown.js",
                  "/js/turndown-plugin-gfm.js",
                ],
              });
              const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: extractAndConvert,
              });
              if (results?.[0]?.result?.success) {
                const { markdown, title } = results[0].result;
                await downloadInSession(markdown, title, folder, tab.url);
                await addCapturedUrl(tab.url);
                chrome.runtime
                  .sendMessage({
                    type: "W2M_CAPTURE_COUNT",
                    count: capturedUrls.size,
                  })
                  .catch(() => { });
                await chrome.storage.local.set({
                  lastConversion: {
                    url: tab.url,
                    markdown,
                    timestamp: new Date().toISOString(),
                  },
                });
              }
            } // fin else (pas déjà capturée)
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
        await setSession({ active: true, folder, delay, urlTree, saveAssets, crawling: true, startUrl: message.startUrl });
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
        } catch {
          /* May require user gesture; popup already calls openDashboard */
        }
        sendResponse({ ok: true });
      } catch (err) {
        try {
          await crawlEngine.stop();
        } catch {
          /* ignore */
        }
        if (crawlSessionCommitted) {
          try {
            await setSession({ active: false, crawling: false });
          } catch {
            /* ignore */
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
        await chrome.sidePanel.open({ windowId: tab?.windowId });
        // If a specific view was requested, broadcast it to the dashboard
        if (message.view) {
          setTimeout(() => {
            chrome.runtime.sendMessage({ type: "W2M_SHOW_SETTINGS" }).catch(() => { });
          }, 300); // small delay to let the side panel load
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
});

// ─── Auto-capture : écoute de la navigation ───────────────────────────────

const pendingCaptures = new Map(); // tabId → timeoutId
let capturedUrls = new Set(); // URLs déjà traitées dans la session courante

// Recharger les URLs capturées depuis le storage au démarrage du SW
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

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  const session = await getSession();
  if (!session.active) return;

  const [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!activeTab || activeTab.id !== details.tabId) return;

  const url = details.url;
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.includes("chrome.google.com/webstore")
  )
    return;

  // URL déjà capturée
  if (capturedUrls.has(url)) {
    console.log("[W2M] Already captured, skipping:", url);
    return;
  }

  if (pendingCaptures.has(details.tabId)) {
    clearTimeout(pendingCaptures.get(details.tabId));
  }

  const timerId = setTimeout(async () => {
    pendingCaptures.delete(details.tabId);
    try {
      // Injecter Turndown + la fonction de conversion dans l'onglet pour avoir accès au DOM
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        files: [
          "/js/Readability.js",
          "/js/turndown.js",
          "/js/turndown-plugin-gfm.js",
        ],
      });

      // Attendre que le DOM soit stable (plus de mutations pendant 500ms)
      try {
        await chrome.scripting.executeScript({
          target: { tabId: details.tabId },
          func: () =>
            new Promise((resolve) => {
              if (document.readyState !== "complete") {
                window.addEventListener("load", () => resolve(), {
                  once: true,
                });
                return;
              }
              // Surveiller les mutations pendant 500ms max
              let timer;
              const observer = new MutationObserver(() => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                  observer.disconnect();
                  resolve();
                }, 300);
              });
              observer.observe(document.body, {
                childList: true,
                subtree: true,
              });
              // Timeout de sécurité : si pas de mutations pendant 500ms, on part
              timer = setTimeout(() => {
                observer.disconnect();
                resolve();
              }, 500);
            }),
        });
      } catch (stabilityErr) {
        console.warn(
          "[W2M] DOM stability wait failed, proceeding anyway:",
          stabilityErr,
        );
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        func: extractAndConvert,
      });
      if (!results?.[0]?.result) return;
      const { success, markdown, title } = results[0].result;
      if (!success) return;

      await downloadInSession(markdown, title, session.folder, url);

      await addCapturedUrl(url);

      chrome.runtime
        .sendMessage({
          type: "W2M_CAPTURE_COUNT",
          count: capturedUrls.size,
        })
        .catch(() => { });

      await chrome.storage.local.set({
        lastConversion: { url, markdown, timestamp: new Date().toISOString() },
      });

    } catch (err) {
      console.error("[W2M] Auto-capture error:", err);
    }
  }, session.delay);

  pendingCaptures.set(details.tabId, timerId);
});

// Exécutée dans l'onglet (a accès au DOM et à TurndownService injecté)
function extractAndConvert() {
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

    // Résoudre toutes les URLs relatives en absolues
    const baseUrl = document.location.href;
    bodyClone
      .querySelectorAll("img[src], img[data-src], img[data-lazy-src]")
      .forEach((img) => {
        const src = img.getAttribute("src");
        const dataSrc =
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          img.getAttribute("data-original");
        // Préférer data-src si src est vide ou un placeholder (base64 court, ou "about:blank")
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
          } catch (e) { }
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
        } catch (e) { }
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
    } catch (_) { }
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
    const service = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
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

        // Détecter le langage depuis plusieurs attributs possibles
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
        return `<img src="${src}" alt="${alt}" style="max-width:${maxW}px; height:auto;">`;
      },
    });

    let markdown = service.turndown(`<div><h1>${title}</h1>${html}</div>`);
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
    // Découper le pathname en segments, nettoyer chaque segment
    const segments = u.pathname.split("/").map(clean).filter(Boolean);
    // Le dernier segment devient le nom de fichier (.md), les autres sont des dossiers
    let filename = segments.pop() || "index";
    // Inclure les query params dans le nom pour éviter les collisions
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

  // Télécharger les assets si l'option est activée
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

// Identifiant stable et court à partir de l’URL complète (évite collisions type image.png).
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

// Télécharge les images (syntaxe ![…](url) et balises <img src="url">) puis réécrit
// vers ./assets/nom — même dossier parent que le .md (visionneuses / sandbox macOS).
async function downloadAssets(markdown, folder, mdPath, options = {}) {
  const mdImgRegex = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  const htmlImgSrcRegex =
    /<img\b[^>]*?\bsrc\s*=\s*(["'])(https?:\/\/[^"']+)\1[^>]*>/gi;

  const urls = new Set();
  for (const m of markdown.matchAll(mdImgRegex)) urls.add(m[2]);
  for (const m of markdown.matchAll(htmlImgSrcRegex)) urls.add(m[2]);
  if (urls.size === 0) return markdown;

  // Dossier assets : même niveau que le fichier .md
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
        } catch (_) {
          /* ignore */
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
    offscreenReady = false;
  } catch (e) { /* not open */ }
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
  } catch {
    /* ignore */
  }
  try {
    await setSession({ active: false, crawling: false });
  } catch (e) {
    console.warn("[W2M] setSession after crawl end:", e);
  }
  try {
    await updateBadge(false);
  } catch {
    /* ignore */
  }
}

importScripts("/js/crawl-engine.js");

const crawlEngine = new CrawlEngine({
  onSessionEnded: w2mOnCrawlSessionEnded,
  onStatusChange: (status) => {
    updateBadge(status);
    if (status === "stopped" || status === "done") {
      const payload = crawlEngine.getStatusPayload();
      chrome.runtime.sendMessage({ type: "W2M_CRAWL_STATUS", ...payload }).catch(() => {});
    }
  },
});
crawlEngine.restoreState();
