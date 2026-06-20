function generateFilename(title, timestamp) {
    var slug = (title || 'page')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
    var ts = timestamp
        ? timestamp.slice(0, 19).replace(/[:T]/g, '-')
        : new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return slug + '-' + ts + '.md';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateFilename };
}
