var HISTORY_MAX = 50;

async function addToHistory(entry) {
    var history = (await storageGet(STORAGE_KEYS.CONVERSION_HISTORY)) || [];
    var newEntry = {
        id: entry.timestamp + '::' + entry.url,
        url: entry.url,
        title: entry.title,
        markdown: entry.markdown,
        timestamp: entry.timestamp,
        source: entry.source
    };
    history.unshift(newEntry);
    if (history.length > HISTORY_MAX) {
        history.length = HISTORY_MAX;
    }
    await storageSet(STORAGE_KEYS.CONVERSION_HISTORY, history);
    return newEntry;
}

async function getHistory() {
    return (await storageGet(STORAGE_KEYS.CONVERSION_HISTORY)) || [];
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HISTORY_MAX, addToHistory, getHistory };
}
