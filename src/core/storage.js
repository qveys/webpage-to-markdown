var STORAGE_KEYS = {
    LAST_CONVERSION: 'lastConversion',
    CONVERSION_HISTORY: 'conversionHistory',
    SETTINGS: 'settings',
    PANEL_PREFERENCES: 'panelPreferences',
    THEME: 'theme'
};

var DEFAULT_SETTINGS = {
    frontmatter: false,
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced'
};

async function storageGet(key) {
    var data = await chrome.storage.local.get(key);
    return data[key];
}

async function storageSet(key, value) {
    var obj = {};
    obj[key] = value;
    await chrome.storage.local.set(obj);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STORAGE_KEYS, DEFAULT_SETTINGS, storageGet, storageSet };
}
