// js/background.js — Service Worker pour Webpage to Markdown
// Expose chrome.runtime.onMessageExternal pour le message { type: "W2M_CONVERT_AND_DOWNLOAD" }

importScripts("turndown.js");

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
