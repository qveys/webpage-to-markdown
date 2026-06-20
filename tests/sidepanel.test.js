const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

require('./setup.js');

describe('autoDownloadFirstSeen flag (R7)', function () {
    beforeEach(function () {
        resetStore();
    });

    it('defaults to false when no panelPreferences exist', async function () {
        var prefs = await storageGet(STORAGE_KEYS.PANEL_PREFERENCES);
        assert.equal(prefs, undefined);
    });

    it('persists autoDownloadFirstSeen = true', async function () {
        await storageSet(STORAGE_KEYS.PANEL_PREFERENCES, {
            selectedHistoryId: null,
            autoDownload: true,
            autoDownloadFirstSeen: true
        });

        var prefs = await storageGet(STORAGE_KEYS.PANEL_PREFERENCES);
        assert.equal(prefs.autoDownloadFirstSeen, true);
    });

    it('flag stays true after toggle off and back on', async function () {
        await storageSet(STORAGE_KEYS.PANEL_PREFERENCES, {
            selectedHistoryId: null,
            autoDownload: true,
            autoDownloadFirstSeen: true
        });

        await storageSet(STORAGE_KEYS.PANEL_PREFERENCES, {
            selectedHistoryId: null,
            autoDownload: false,
            autoDownloadFirstSeen: true
        });

        await storageSet(STORAGE_KEYS.PANEL_PREFERENCES, {
            selectedHistoryId: null,
            autoDownload: true,
            autoDownloadFirstSeen: true
        });

        var prefs = await storageGet(STORAGE_KEYS.PANEL_PREFERENCES);
        assert.equal(prefs.autoDownloadFirstSeen, true);
        assert.equal(prefs.autoDownload, true);
    });

    it('preserves selectedHistoryId alongside autoDownload settings', async function () {
        var historyId = '2026-06-17T10:00:00.000Z::https://example.com';
        await storageSet(STORAGE_KEYS.PANEL_PREFERENCES, {
            selectedHistoryId: historyId,
            autoDownload: false,
            autoDownloadFirstSeen: false
        });

        var prefs = await storageGet(STORAGE_KEYS.PANEL_PREFERENCES);
        assert.equal(prefs.selectedHistoryId, historyId);
        assert.equal(prefs.autoDownload, false);
        assert.equal(prefs.autoDownloadFirstSeen, false);
    });
});

describe('error classification integration (R2)', function () {
    const { classifyError, ERROR_CATEGORIES } = require('../src/core/error-classifier.js');

    it('classifies chrome:// page errors as NOT_EXTRACTABLE', function () {
        var result = classifyError({ code: 'NOT_EXTRACTABLE', message: 'Cannot convert system pages' });
        assert.equal(result.category, ERROR_CATEGORIES.NOT_EXTRACTABLE);
    });

    it('classifies permission errors as PERMISSION_REQUIRED', function () {
        var result = classifyError({ code: 'PERMISSION_REQUIRED', message: 'Permission needed' });
        assert.equal(result.category, ERROR_CATEGORIES.PERMISSION_REQUIRED);
    });

    it('classifies network errors as CONVERSION_FAILED', function () {
        var result = classifyError({ code: 'CONVERSION_FAILED', message: 'Network error' });
        assert.equal(result.category, ERROR_CATEGORIES.CONVERSION_FAILED);
    });

    it('all three categories have distinct user-facing messages', function () {
        var a = classifyError({ code: 'NOT_EXTRACTABLE' });
        var b = classifyError({ code: 'PERMISSION_REQUIRED' });
        var c = classifyError({ code: 'CONVERSION_FAILED' });
        assert.notEqual(a.message, b.message);
        assert.notEqual(b.message, c.message);
        assert.notEqual(a.message, c.message);
    });
});

describe('history source tracking', function () {
    beforeEach(function () {
        resetStore();
    });

    it('history entry records source field', async function () {
        var entry = await addToHistory({
            url: 'https://example.com',
            title: 'Test',
            markdown: '# Test',
            timestamp: '2026-06-17T10:00:00.000Z',
            source: 'sidepanel'
        });
        assert.equal(entry.source, 'sidepanel');
    });

    it('popup and sidepanel entries coexist in history', async function () {
        await addToHistory({
            url: 'https://a.com',
            title: 'From popup',
            markdown: '# A',
            timestamp: '2026-06-17T10:00:00.000Z',
            source: 'popup'
        });
        await addToHistory({
            url: 'https://b.com',
            title: 'From panel',
            markdown: '# B',
            timestamp: '2026-06-17T10:01:00.000Z',
            source: 'sidepanel'
        });

        var history = await getHistory();
        assert.equal(history.length, 2);
        assert.equal(history[0].source, 'sidepanel');
        assert.equal(history[1].source, 'popup');
    });
});
