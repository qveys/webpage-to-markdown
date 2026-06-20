const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

require('./setup.js');
const { ERROR_CATEGORIES, classifyError, getErrorMessage } = require('../src/core/error-classifier.js');

describe('classifyError', function () {
    it('returns NOT_EXTRACTABLE for RESTRICTED_PAGE code', function () {
        var result = classifyError({ code: 'RESTRICTED_PAGE', message: 'Cannot convert' });
        assert.equal(result.category, ERROR_CATEGORIES.NOT_EXTRACTABLE);
    });

    it('returns NOT_EXTRACTABLE for NOT_EXTRACTABLE code', function () {
        var result = classifyError({ code: 'NOT_EXTRACTABLE', message: '' });
        assert.equal(result.category, ERROR_CATEGORIES.NOT_EXTRACTABLE);
    });

    it('returns PERMISSION_REQUIRED for PERMISSION_REQUIRED code', function () {
        var result = classifyError({ code: 'PERMISSION_REQUIRED', message: '' });
        assert.equal(result.category, ERROR_CATEGORIES.PERMISSION_REQUIRED);
    });

    it('returns PERMISSION_REQUIRED when message contains "cannot access"', function () {
        var result = classifyError({ code: 'UNKNOWN', message: 'Cannot access this page' });
        assert.equal(result.category, ERROR_CATEGORIES.PERMISSION_REQUIRED);
    });

    it('returns PERMISSION_REQUIRED when message contains "permission"', function () {
        var result = classifyError({ message: 'Need host permission for this tab' });
        assert.equal(result.category, ERROR_CATEGORIES.PERMISSION_REQUIRED);
    });

    it('returns NOT_EXTRACTABLE when message contains "chrome://"', function () {
        var result = classifyError({ message: 'Cannot inject into chrome:// pages' });
        assert.equal(result.category, ERROR_CATEGORIES.NOT_EXTRACTABLE);
    });

    it('returns NOT_EXTRACTABLE when message contains "chrome-extension://"', function () {
        var result = classifyError({ message: 'URL chrome-extension:// is restricted' });
        assert.equal(result.category, ERROR_CATEGORIES.NOT_EXTRACTABLE);
    });

    it('returns NOT_EXTRACTABLE when message contains "web store"', function () {
        var result = classifyError({ message: 'Chrome web store pages are restricted' });
        assert.equal(result.category, ERROR_CATEGORIES.NOT_EXTRACTABLE);
    });

    it('returns CONVERSION_FAILED for unknown errors', function () {
        var result = classifyError({ code: 'SOMETHING_ELSE', message: 'timeout' });
        assert.equal(result.category, ERROR_CATEGORIES.CONVERSION_FAILED);
    });

    it('returns CONVERSION_FAILED for null error', function () {
        var result = classifyError(null);
        assert.equal(result.category, ERROR_CATEGORIES.CONVERSION_FAILED);
    });

    it('returns CONVERSION_FAILED for empty error', function () {
        var result = classifyError({});
        assert.equal(result.category, ERROR_CATEGORIES.CONVERSION_FAILED);
    });

    it('includes user-facing message for NOT_EXTRACTABLE', function () {
        var result = classifyError({ code: 'NOT_EXTRACTABLE' });
        assert.ok(result.message.includes('cannot be converted'));
    });

    it('includes user-facing message for PERMISSION_REQUIRED', function () {
        var result = classifyError({ code: 'PERMISSION_REQUIRED' });
        assert.ok(result.message.includes('Permission required'));
    });

    it('includes user-facing message for CONVERSION_FAILED', function () {
        var result = classifyError({});
        assert.ok(result.message.includes('failed'));
    });
});

describe('getErrorMessage', function () {
    it('returns correct message for each category', function () {
        assert.ok(getErrorMessage(ERROR_CATEGORIES.NOT_EXTRACTABLE).includes('cannot be converted'));
        assert.ok(getErrorMessage(ERROR_CATEGORIES.PERMISSION_REQUIRED).includes('Permission'));
        assert.ok(getErrorMessage(ERROR_CATEGORIES.CONVERSION_FAILED).includes('failed'));
    });

    it('returns CONVERSION_FAILED message for unknown category', function () {
        assert.ok(getErrorMessage('NOPE').includes('failed'));
    });
});
