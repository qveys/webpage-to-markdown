if (typeof importScripts === 'function') {
    importScripts(
        'lib/turndown.js',
        'messaging/message-types.js',
        'core/errors.js',
        'core/storage.js',
        'core/history.js',
        'core/turndown-service.js',
        'core/page-extractor.js',
        'core/convert-active-tab.js',
        'core/download.js'
    );
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        handleMessage(message)
            .then(sendResponse)
            .catch(function (err) {
                sendResponse({ ok: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
            });
        return true;
    });
}

async function handleMessage(message) {
    switch (message.type) {
        case MESSAGE_TYPES.PING:
            return { ok: true, data: 'PONG' };

        case MESSAGE_TYPES.GET_LAST_CONVERSION:
            return handleGetLastConversion();

        case MESSAGE_TYPES.GET_HISTORY:
            return handleGetHistory();

        case MESSAGE_TYPES.GET_SETTINGS:
            return handleGetSettings();

        case MESSAGE_TYPES.SAVE_SETTINGS:
            return handleSaveSettings(message);

        case MESSAGE_TYPES.CONVERT_ACTIVE_TAB:
            return handleConvertActiveTab(message);

        case MESSAGE_TYPES.DOWNLOAD_MARKDOWN:
            return handleDownloadMarkdown(message);

        default:
            return {
                ok: false,
                error: createError(ERROR_CODES.UNKNOWN_MESSAGE, 'Unknown message type: ' + message.type)
            };
    }
}

async function handleGetLastConversion() {
    var data = await storageGet(STORAGE_KEYS.LAST_CONVERSION);
    return { ok: true, data: data || null };
}

async function handleGetHistory() {
    var history = await getHistory();
    return { ok: true, data: history };
}

async function handleGetSettings() {
    var settings = await storageGet(STORAGE_KEYS.SETTINGS);
    return { ok: true, data: settings || DEFAULT_SETTINGS };
}

async function handleSaveSettings(message) {
    var settings = Object.assign({}, DEFAULT_SETTINGS, message.settings || {});
    await storageSet(STORAGE_KEYS.SETTINGS, settings);
    return { ok: true, data: settings };
}

async function handleConvertActiveTab(message) {
    var settings = message.settings || DEFAULT_SETTINGS;
    var source = message.source || 'popup';
    return convertActiveTab(settings, source);
}

async function handleDownloadMarkdown(message) {
    var markdown = message.markdown;
    var title = message.title;
    var timestamp = message.timestamp;

    if (!markdown) {
        return { ok: false, error: createError('NO_CONTENT', 'No markdown content to download') };
    }

    var filename = generateFilename(title, timestamp);
    return { ok: true, data: { filename: filename, markdown: markdown } };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handleMessage,
        handleGetLastConversion,
        handleGetHistory,
        handleGetSettings,
        handleSaveSettings,
        handleConvertActiveTab,
        handleDownloadMarkdown
    };
}
