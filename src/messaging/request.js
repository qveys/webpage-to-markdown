async function sendMessage(type, payload) {
    try {
        var message = Object.assign({ type: type }, payload || {});
        var response = await chrome.runtime.sendMessage(message);
        return response;
    } catch (error) {
        return {
            ok: false,
            error: { code: 'SW_UNAVAILABLE', message: error.message }
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sendMessage };
}
