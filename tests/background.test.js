const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

require('./setup.js');
const { handleMessage } = require('../src/background.js');

describe('background service worker handlers', () => {
    beforeEach(() => {
        resetStore();
    });

    describe('PING', () => {
        it('returns PONG', async () => {
            const result = await handleMessage({ type: MESSAGE_TYPES.PING });
            assert.deepStrictEqual(result, { ok: true, data: 'PONG' });
        });
    });

    describe('UNKNOWN_MESSAGE', () => {
        it('returns error for unknown message type', async () => {
            const result = await handleMessage({ type: 'DOES_NOT_EXIST' });
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.error.code, ERROR_CODES.UNKNOWN_MESSAGE);
        });

        it('includes the unknown type in error message', async () => {
            const result = await handleMessage({ type: 'FAKE_TYPE' });
            assert.ok(result.error.message.includes('FAKE_TYPE'));
        });
    });

    describe('GET_LAST_CONVERSION', () => {
        it('returns null when no conversion stored', async () => {
            const result = await handleMessage({ type: MESSAGE_TYPES.GET_LAST_CONVERSION });
            assert.deepStrictEqual(result, { ok: true, data: null });
        });

        it('returns stored conversion data', async () => {
            const conversion = {
                url: 'https://example.com',
                title: 'Example',
                markdown: '# Example',
                timestamp: '2026-06-16T10:00:00.000Z'
            };
            await storageSet(STORAGE_KEYS.LAST_CONVERSION, conversion);

            const result = await handleMessage({ type: MESSAGE_TYPES.GET_LAST_CONVERSION });
            assert.strictEqual(result.ok, true);
            assert.deepStrictEqual(result.data, conversion);
        });
    });

    describe('GET_HISTORY', () => {
        it('returns empty array when no history', async () => {
            const result = await handleMessage({ type: MESSAGE_TYPES.GET_HISTORY });
            assert.deepStrictEqual(result, { ok: true, data: [] });
        });

        it('returns stored history', async () => {
            const entry = {
                url: 'https://example.com',
                title: 'Test',
                markdown: '# Test',
                timestamp: '2026-06-16T10:00:00.000Z',
                source: 'popup'
            };
            await addToHistory(entry);

            const result = await handleMessage({ type: MESSAGE_TYPES.GET_HISTORY });
            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.data.length, 1);
            assert.strictEqual(result.data[0].url, 'https://example.com');
        });
    });

    describe('GET_SETTINGS', () => {
        it('returns default settings when none stored', async () => {
            const result = await handleMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
            assert.strictEqual(result.ok, true);
            assert.deepStrictEqual(result.data, DEFAULT_SETTINGS);
        });

        it('returns stored settings', async () => {
            const custom = { frontmatter: true, headingStyle: 'setext', bulletListMarker: '*', codeBlockStyle: 'indented' };
            await storageSet(STORAGE_KEYS.SETTINGS, custom);

            const result = await handleMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.data.frontmatter, true);
        });
    });

    describe('SAVE_SETTINGS', () => {
        it('persists settings and returns them', async () => {
            const settings = { frontmatter: true, headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' };
            const result = await handleMessage({ type: MESSAGE_TYPES.SAVE_SETTINGS, settings: settings });
            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.data.frontmatter, true);

            const stored = await storageGet(STORAGE_KEYS.SETTINGS);
            assert.strictEqual(stored.frontmatter, true);
        });
    });

    describe('DOWNLOAD_MARKDOWN', () => {
        it('returns error when no markdown provided', async () => {
            const result = await handleMessage({ type: MESSAGE_TYPES.DOWNLOAD_MARKDOWN });
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.error.code, 'NO_CONTENT');
        });

        it('returns filename and markdown', async () => {
            const result = await handleMessage({
                type: MESSAGE_TYPES.DOWNLOAD_MARKDOWN,
                markdown: '# Hello',
                title: 'Hello World',
                timestamp: '2026-06-16T10:00:00.000Z'
            });
            assert.strictEqual(result.ok, true);
            assert.ok(result.data.filename.includes('hello-world'));
            assert.ok(result.data.filename.endsWith('.md'));
            assert.strictEqual(result.data.markdown, '# Hello');
        });
    });
});
