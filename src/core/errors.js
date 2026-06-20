function createError(code, message) {
    return { code: code, message: message };
}

function isRestrictedUrl(url) {
    return !url ||
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.includes('chrome.google.com/webstore');
}

var ERROR_DISPLAY = {
    NOT_EXTRACTABLE: 'This page cannot be converted (restricted or system page).',
    PERMISSION_REQUIRED: 'Permission required to access this page.',
    CONVERSION_FAILED: 'Conversion failed. Please try again.'
};

function classifyError(error) {
    if (error && error.code && ERROR_DISPLAY[error.code]) {
        return { message: ERROR_DISPLAY[error.code], code: error.code };
    }
    if (error && error.message) {
        if (/permission|access denied|not allowed/i.test(error.message)) {
            return { message: ERROR_DISPLAY.PERMISSION_REQUIRED, code: 'PERMISSION_REQUIRED' };
        }
        if (/restricted|chrome:\/\/|system page/i.test(error.message)) {
            return { message: ERROR_DISPLAY.NOT_EXTRACTABLE, code: 'NOT_EXTRACTABLE' };
        }
        return { message: error.message, code: null };
    }
    return { message: 'An unexpected error occurred.', code: null };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createError, isRestrictedUrl, classifyError, ERROR_DISPLAY };
}
