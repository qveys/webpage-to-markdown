function createTurndownService(settings) {
    var service = new TurndownService({
        headingStyle: settings.headingStyle || 'atx',
        hr: '---',
        bulletListMarker: settings.bulletListMarker || '-',
        codeBlockStyle: settings.codeBlockStyle || 'fenced',
        emDelimiter: '_'
    });

    service.keep(['iframe', 'script', 'style']);

    service.addRule('figures', {
        filter: 'figure',
        replacement: function (content, node) {
            var img = node.querySelector('img');
            var caption = node.querySelector('figcaption');
            if (img) {
                var alt = img.getAttribute('alt') || '';
                var src = img.getAttribute('src') || '';
                var captionText = caption ? caption.textContent : '';
                return '\n\n![' + alt + '](' + src + ')\n' + captionText + '\n\n';
            }
            return content;
        }
    });

    return service;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createTurndownService };
}
