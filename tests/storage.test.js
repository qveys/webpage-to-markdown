const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

require('./setup.js');

describe('storage', () => {
    beforeEach(() => {
        resetStore();
    });

    describe('storageGet', () => {
        it('returns undefined for missing key', async () => {
            const result = await storageGet('nonexistent');
            assert.strictEqual(result, undefined);
        });

        it('returns stored value', async () => {
            await storageSet('testKey', { foo: 'bar' });
            const result = await storageGet('testKey');
            assert.deepStrictEqual(result, { foo: 'bar' });
        });
    });

    describe('storageSet', () => {
        it('persists a value', async () => {
            await storageSet('myKey', 42);
            const result = await storageGet('myKey');
            assert.strictEqual(result, 42);
        });

        it('overwrites existing value', async () => {
            await storageSet('myKey', 'old');
            await storageSet('myKey', 'new');
            const result = await storageGet('myKey');
            assert.strictEqual(result, 'new');
        });
    });

    describe('STORAGE_KEYS', () => {
        it('defines expected keys', () => {
            assert.strictEqual(STORAGE_KEYS.LAST_CONVERSION, 'lastConversion');
            assert.strictEqual(STORAGE_KEYS.CONVERSION_HISTORY, 'conversionHistory');
            assert.strictEqual(STORAGE_KEYS.SETTINGS, 'settings');
            assert.strictEqual(STORAGE_KEYS.PANEL_PREFERENCES, 'panelPreferences');
        });
    });

    describe('DEFAULT_SETTINGS', () => {
        it('has expected defaults', () => {
            assert.strictEqual(DEFAULT_SETTINGS.frontmatter, false);
            assert.strictEqual(DEFAULT_SETTINGS.headingStyle, 'atx');
            assert.strictEqual(DEFAULT_SETTINGS.bulletListMarker, '-');
            assert.strictEqual(DEFAULT_SETTINGS.codeBlockStyle, 'fenced');
        });
    });
});

describe('errors', () => {
    describe('createError', () => {
        it('creates error object with code and message', () => {
            const err = createError('TEST_ERROR', 'Something went wrong');
            assert.deepStrictEqual(err, { code: 'TEST_ERROR', message: 'Something went wrong' });
        });
    });

    describe('isRestrictedUrl', () => {
        it('flags chrome:// pages', () => {
            assert.strictEqual(isRestrictedUrl('chrome://extensions'), true);
        });

        it('flags chrome-extension:// pages', () => {
            assert.strictEqual(isRestrictedUrl('chrome-extension://abc/popup.html'), true);
        });

        it('flags edge:// pages', () => {
            assert.strictEqual(isRestrictedUrl('edge://settings'), true);
        });

        it('flags about: pages', () => {
            assert.strictEqual(isRestrictedUrl('about:blank'), true);
        });

        it('flags Web Store', () => {
            assert.strictEqual(isRestrictedUrl('https://chrome.google.com/webstore/detail/abc'), true);
        });

        it('flags empty/null URL', () => {
            assert.strictEqual(isRestrictedUrl(''), true);
            assert.strictEqual(isRestrictedUrl(null), true);
            assert.strictEqual(isRestrictedUrl(undefined), true);
        });

        it('allows normal URLs', () => {
            assert.strictEqual(isRestrictedUrl('https://example.com'), false);
            assert.strictEqual(isRestrictedUrl('https://blog.example.com/post'), false);
        });
    });
});
