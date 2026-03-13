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

  const wrappedContent = `<div class="markdown-content"><h1>${title}</h1>${content}</div>`;
  let markdown = service.turndown(wrappedContent);
  markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();
  return markdown;
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

  await chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: false,
  });
}

// ─── Listener externe ─────────────────────────────────────────────────────────

chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    if (message?.type !== "W2M_CONVERT_AND_DOWNLOAD") return false;

    console.log("[W2M] External command:", message);

    (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (!tab || !tab.id) throw new Error("No active tab found");

        if (
          tab.url.startsWith("chrome://") ||
          tab.url.startsWith("chrome-extension://") ||
          tab.url.startsWith("edge://") ||
          tab.url.startsWith("about:") ||
          tab.url.includes("chrome.google.com/webstore")
        ) {
          throw new Error("Cannot convert system pages or Web Store");
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractPageContent,
        });

        if (!results?.[0]?.result)
          throw new Error("Failed to get page content");

        const { success, content, title, url, error } = results[0].result;
        if (!success) throw new Error(error || "Failed to extract content");

        const markdown = convertToMarkdown(title, content);

        await downloadMarkdown(markdown, title);

        await chrome.storage.local.set({
          lastConversion: {
            url: tab.url,
            markdown,
            timestamp: new Date().toISOString(),
          },
        });

        sendResponse({ ok: true });
      } catch (err) {
        console.error("[W2M] Error:", err);
        sendResponse({ ok: false, error: err.message });
      }
    })();

    // OBLIGATOIRE : indique à Chrome que sendResponse sera appelé de façon asynchrone
    return true;
  },
);

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

async function updateBadge(active) {
  if (active) {
    await chrome.action.setBadgeText({ text: "●" });
    await chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

// Listener pour les messages du popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "W2M_GET_SESSION") {
    getSession().then(sendResponse);
    return true;
  }
  if (message.type === "W2M_START_SESSION") {
    const folder = message.folder || makeSessionFolder();
    const delay = message.delay ?? DEFAULT_DELAY;
    capturedUrls.clear();
    setSession({ active: true, folder, delay })
      .then((session) => {
        updateBadge(true);
        sendResponse({ ok: true, session });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === "W2M_STOP_SESSION") {
    capturedUrls.clear();
    setSession({ active: false })
      .then((session) => {
        updateBadge(false);
        sendResponse({ ok: true, session });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (message.type === "W2M_UPDATE_SESSION") {
    setSession(message.patch)
      .then((session) => sendResponse({ ok: true, session }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

// ─── Auto-capture : écoute de la navigation ───────────────────────────────

const pendingCaptures = new Map(); // tabId → timeoutId
const capturedUrls = new Set(); // URLs déjà traitées dans la session courante

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

  // Ne pas retraiter une URL déjà capturée dans cette session
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
        files: ["/js/turndown.js"],
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

      await downloadInSession(markdown, title, session.folder);

      capturedUrls.add(url);

      await chrome.storage.local.set({
        lastConversion: { url, markdown, timestamp: new Date().toISOString() },
      });

      chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        func: (pageTitle) => {
          const overlay = document.createElement("div");
          overlay.style.cssText = [
            "position:fixed",
            "inset:0",
            "z-index:2147483647",
            "pointer-events:none",
            "display:flex",
            "align-items:center",
            "justify-content:center",
            "background:rgba(34,197,94,0.12)",
            "transition:opacity 0.4s ease",
            "font-family:system-ui,sans-serif",
          ].join(";");

          const icon = document.createElement("span");
          icon.style.cssText = "font-size:20px;margin-right:8px";
          icon.textContent = "✓";

          const text = document.createElement("span");
          text.textContent = "Captured: " + pageTitle;

          const badge = document.createElement("div");
          badge.style.cssText = [
            "background:rgba(34,197,94,0.92)",
            "color:#fff",
            "padding:12px 24px",
            "border-radius:12px",
            "font-size:15px",
            "font-weight:600",
            "box-shadow:0 4px 20px rgba(0,0,0,0.2)",
            "display:flex",
            "align-items:center",
          ].join(";");
          badge.appendChild(icon);
          badge.appendChild(text);
          overlay.appendChild(badge);
          document.body.appendChild(overlay);

          setTimeout(() => {
            overlay.style.opacity = "0";
          }, 1200);
          setTimeout(() => {
            overlay.remove();
          }, 1600);
        },
        args: [title],
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
          } catch (e) {}
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
        } catch (e) {}
      }
    });

    bodyClone
      .querySelectorAll(
        'script, style, svg, nav, footer, aside, .ads, .comments, [role="complementary"], .cookie-banner, .popup, .overlay, .modal',
      )
      .forEach((el) => el.remove());

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

    let html = mainContent ? mainContent.innerHTML : bodyClone.innerHTML;
    if (iframeContents.length > 0)
      html += "<h2>Embedded Content</h2>" + iframeContents.join("<hr>");

    const title = document.title || "Untitled Page";
    const service = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "_",
    });
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

    let markdown = service.turndown(`<div><h1>${title}</h1>${html}</div>`);
    markdown = markdown.replace(/\n{3,}/g, "\n\n").trim();

    return { success: true, markdown, title };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function downloadInSession(markdown, title, folder) {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const safeTitle = (title || "page")
    .replace(/[^a-z0-9\-_]/gi, "-")
    .slice(0, 60);
  const filename = `${folder}/${safeTitle}-${timestamp}.md`;
  const encoded = encodeURIComponent(markdown);
  await chrome.downloads.download({
    url: `data:text/markdown;charset=utf-8,${encoded}`,
    filename,
    saveAs: false,
  });
}
