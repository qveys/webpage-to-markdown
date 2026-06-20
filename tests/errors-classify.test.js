const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

require('./setup.js');
const { classifyError, ERROR_DISPLAY } = require('../src/core/errors.js');

describe('R2 — error classification', () => {
    describe('known error codes', () => {
        it('maps NOT_EXTRACTABLE to user-friendly message', () => {
            const result = classifyError({ code: 'NOT_EXTRACTABLE', message: 'whatever' });
            assert.strictEqual(result.message, ERROR_DISPLAY.NOT_EXTRACTABLE);
            assert.strictEqual(result.code, 'NOT_EXTRACTABLE');
        });

        it('maps PERMISSION_REQUIRED to user-friendly message', () => {
            const result = classifyError({ code: 'PERMISSION_REQUIRED', message: 'x' });
            assert.strictEqual(result.message, ERROR_DISPLAY.PERMISSION_REQUIRED);
            assert.strictEqual(result.code, 'PERMISSION_REQUIRED');
        });

        it('maps CONVERSION_FAILED to user-friendly message', () => {
            const result = classifyError({ code: 'CONVERSION_FAILED', message: 'x' });
            assert.strictEqual(result.message, ERROR_DISPLAY.CONVERSION_FAILED);
            assert.strictEqual(result.code, 'CONVERSION_FAILED');
        });
    });

    describe('fallback heuristic on error.message', () => {
        it('detects permission-related messages', () => {
            const result = classifyError({ message: 'Access denied for this page' });
            assert.strictEqual(result.code, 'PERMISSION_REQUIRED');
        });

        it('detects restricted-page messages', () => {
            const result = classifyError({ message: 'Cannot access chrome:// URLs' });
            assert.strictEqual(result.code, 'NOT_EXTRACTABLE');
        });

        it('falls back to raw message for unrecognized errors', () => {
            const result = classifyError({ message: 'Something weird happened' });
            assert.strictEqual(result.message, 'Something weird happened');
            assert.strictEqual(result.code, null);
        });
    });

    describe('edge cases', () => {
        it('handles null error', () => {
            const result = classifyError(null);
            assert.ok(result.message);
            assert.strictEqual(result.code, null);
        });

        it('handles undefined error', () => {
            const result = classifyError(undefined);
            assert.ok(result.message);
        });

        it('handles error with no code and no message', () => {
            const result = classifyError({});
            assert.ok(result.message);
        });

        it('prefers code over message heuristic', () => {
            const result = classifyError({ code: 'NOT_EXTRACTABLE', message: 'permission denied' });
            assert.strictEqual(result.code, 'NOT_EXTRACTABLE');
        });
    });
});
