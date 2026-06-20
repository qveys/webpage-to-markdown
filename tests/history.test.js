const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

require('./setup.js');

describe('history', () => {
    beforeEach(() => {
        resetStore();
    });

    describe('addToHistory', () => {
        it('adds entry to empty history', async () => {
            const entry = {
                url: 'https://example.com',
                title: 'Test',
                markdown: '# Test',
                timestamp: '2026-06-16T10:00:00.000Z',
                source: 'popup'
            };

            const result = await addToHistory(entry);
            assert.strictEqual(result.id, '2026-06-16T10:00:00.000Z::https://example.com');
            assert.strictEqual(result.url, 'https://example.com');

            const history = await getHistory();
            assert.strictEqual(history.length, 1);
        });

        it('prepends new entries (most recent first)', async () => {
            await addToHistory({
                url: 'https://first.com',
                title: 'First',
                markdown: '# First',
                timestamp: '2026-06-16T09:00:00.000Z',
                source: 'popup'
            });
            await addToHistory({
                url: 'https://second.com',
                title: 'Second',
                markdown: '# Second',
                timestamp: '2026-06-16T10:00:00.000Z',
                source: 'popup'
            });

            const history = await getHistory();
            assert.strictEqual(history.length, 2);
            assert.strictEqual(history[0].url, 'https://second.com');
            assert.strictEqual(history[1].url, 'https://first.com');
        });
    });

    describe('FIFO rotation at 50 entries', () => {
        it('caps history at HISTORY_MAX entries', async () => {
            assert.strictEqual(HISTORY_MAX, 50);

            for (let i = 0; i < 55; i++) {
                await addToHistory({
                    url: 'https://example.com/page-' + i,
                    title: 'Page ' + i,
                    markdown: '# Page ' + i,
                    timestamp: '2026-06-16T10:' + String(i).padStart(2, '0') + ':00.000Z',
                    source: 'popup'
                });
            }

            const history = await getHistory();
            assert.strictEqual(history.length, 50);
        });

        it('drops oldest entries when limit exceeded', async () => {
            for (let i = 0; i < 55; i++) {
                await addToHistory({
                    url: 'https://example.com/page-' + i,
                    title: 'Page ' + i,
                    markdown: '# Page ' + i,
                    timestamp: '2026-06-16T10:' + String(i).padStart(2, '0') + ':00.000Z',
                    source: 'popup'
                });
            }

            const history = await getHistory();
            assert.strictEqual(history[0].url, 'https://example.com/page-54');
            assert.strictEqual(history[49].url, 'https://example.com/page-5');
        });
    });

    describe('getHistory', () => {
        it('returns empty array when no history exists', async () => {
            const history = await getHistory();
            assert.deepStrictEqual(history, []);
        });
    });
});
