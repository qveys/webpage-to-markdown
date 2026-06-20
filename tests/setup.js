let store = {};

global.chrome = {
    storage: {
        local: {
            get: async function (key) {
                if (typeof key === 'string') {
                    var result = {};
                    result[key] = store[key];
                    return result;
                }
                return {};
            },
            set: async function (obj) {
                Object.assign(store, obj);
            }
        },
        onChanged: {
            addListener: function () {}
        }
    },
    runtime: {
        sendMessage: async function () { return {}; },
        onMessage: {
            addListener: function () {}
        },
        lastError: null
    },
    tabs: {
        query: async function () { return []; }
    },
    scripting: {
        executeScript: async function () { return []; }
    }
};

global.resetStore = function () {
    store = {};
    global.chrome.storage.local.get = async function (key) {
        if (typeof key === 'string') {
            var result = {};
            result[key] = store[key];
            return result;
        }
        return {};
    };
    global.chrome.storage.local.set = async function (obj) {
        Object.assign(store, obj);
    };
};

const mt = require('../src/messaging/message-types.js');
global.MESSAGE_TYPES = mt.MESSAGE_TYPES;
global.ERROR_CODES = mt.ERROR_CODES;

const err = require('../src/core/errors.js');
global.createError = err.createError;
global.isRestrictedUrl = err.isRestrictedUrl;
global.classifyError = err.classifyError;
global.ERROR_DISPLAY = err.ERROR_DISPLAY;

const st = require('../src/core/storage.js');
global.STORAGE_KEYS = st.STORAGE_KEYS;
global.DEFAULT_SETTINGS = st.DEFAULT_SETTINGS;
global.storageGet = st.storageGet;
global.storageSet = st.storageSet;

const hist = require('../src/core/history.js');
global.HISTORY_MAX = hist.HISTORY_MAX;
global.addToHistory = hist.addToHistory;
global.getHistory = hist.getHistory;

const dl = require('../src/core/download.js');
global.generateFilename = dl.generateFilename;
