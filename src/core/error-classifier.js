var ERROR_CATEGORIES = {
    NOT_EXTRACTABLE: 'NOT_EXTRACTABLE',
    PERMISSION_REQUIRED: 'PERMISSION_REQUIRED',
    CONVERSION_FAILED: 'CONVERSION_FAILED'
};

var ERROR_MESSAGES = {};
ERROR_MESSAGES[ERROR_CATEGORIES.NOT_EXTRACTABLE] = 'This page cannot be converted (system page or unsupported format).';
ERROR_MESSAGES[ERROR_CATEGORIES.PERMISSION_REQUIRED] =
    'Permission required for this page. Click the extension icon in the address bar to grant access.';
ERROR_MESSAGES[ERROR_CATEGORIES.CONVERSION_FAILED] = 'Conversion failed. Try again in a moment.';

function classifyError(error) {
    if (!error) {
        return {
            category: ERROR_CATEGORIES.CONVERSION_FAILED,
            message: ERROR_MESSAGES[ERROR_CATEGORIES.CONVERSION_FAILED]
        };
    }

    var code = error.code || '';
    var msg = (error.message || '').toLowerCase();
    var category;

    if (code === 'RESTRICTED_PAGE' || code === ERROR_CATEGORIES.NOT_EXTRACTABLE) {
        category = ERROR_CATEGORIES.NOT_EXTRACTABLE;
    } else if (code === ERROR_CATEGORIES.PERMISSION_REQUIRED) {
        category = ERROR_CATEGORIES.PERMISSION_REQUIRED;
    } else if (msg.includes('cannot access') || msg.includes('permission') || msg.includes('host permission')) {
        category = ERROR_CATEGORIES.PERMISSION_REQUIRED;
    } else if (
        msg.includes('chrome://') ||
        msg.includes('system page') ||
        msg.includes('web store') ||
        msg.includes('chrome-extension://')
    ) {
        category = ERROR_CATEGORIES.NOT_EXTRACTABLE;
    } else {
        category = ERROR_CATEGORIES.CONVERSION_FAILED;
    }

    return {
        category: category,
        message: ERROR_MESSAGES[category]
    };
}

function getErrorMessage(category) {
    return ERROR_MESSAGES[category] || ERROR_MESSAGES[ERROR_CATEGORIES.CONVERSION_FAILED];
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ERROR_CATEGORIES, ERROR_MESSAGES, classifyError, getErrorMessage };
}
