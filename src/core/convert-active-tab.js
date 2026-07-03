async function convertActiveTab(settings, source) {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];

    if (!tab || !tab.id) {
        return { ok: false, error: createError(ERROR_CODES.NOT_EXTRACTABLE, 'No active tab found') };
    }

    if (isRestrictedUrl(tab.url)) {
        return {
            ok: false,
            error: createError(ERROR_CODES.NOT_EXTRACTABLE, 'Cannot convert system pages or Web Store')
        };
    }

    var results;
    try {
        results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractPageContent
        });
    } catch (e) {
        return {
            ok: false,
            error: createError(ERROR_CODES.PERMISSION_REQUIRED, 'Permission needed to access this page')
        };
    }

    if (!results || !results[0] || !results[0].result) {
        return { ok: false, error: createError(ERROR_CODES.CONVERSION_FAILED, 'Failed to get page content') };
    }

    var extraction = results[0].result;

    if (!extraction.success) {
        return {
            ok: false,
            error: createError(ERROR_CODES.CONVERSION_FAILED, extraction.error || 'Failed to extract content')
        };
    }

    var wrappedContent =
        '<div class="markdown-content"><h1>' + extraction.title + '</h1>' + extraction.content + '</div>';

    var turndownService = createTurndownService(settings);
    var markdown = turndownService.turndown(wrappedContent);
    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

    if (settings.frontmatter) {
        var date = new Date().toISOString().split('T')[0];
        var frontmatter =
            '---\ntitle: "' +
            extraction.title.replace(/"/g, '\\"') +
            '"\nurl: "' +
            extraction.url +
            '"\ndate: ' +
            date +
            '\n---\n\n';
        markdown = frontmatter + markdown;
    }

    var timestamp = new Date().toISOString();
    var conversionData = {
        url: tab.url,
        title: extraction.title,
        markdown: markdown,
        timestamp: timestamp,
        source: source || 'popup'
    };

    await storageSet(STORAGE_KEYS.LAST_CONVERSION, conversionData);
    await addToHistory(conversionData);

    return { ok: true, data: conversionData };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { convertActiveTab };
}
