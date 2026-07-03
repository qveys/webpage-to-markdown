function extractPageContent() {
    try {
        if (!document || !document.body) {
            throw new Error('Document body not found');
        }

        var getIframeContent = function (iframe) {
            try {
                var iframeDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
                if (!iframeDoc || !iframeDoc.body) return '';
                var iframeClone = iframeDoc.body.cloneNode(true);
                iframeClone
                    .querySelectorAll('script, style, nav, footer, aside, .ads, .comments')
                    .forEach(function (el) {
                        el.remove();
                    });
                return '<div class="iframe-content">' + iframeClone.innerHTML + '</div>';
            } catch (e) {
                return '';
            }
        };

        var bodyClone = document.body.cloneNode(true);

        var iframes = document.querySelectorAll('iframe');
        var iframeContents = [];
        iframes.forEach(function (iframe) {
            var content = getIframeContent(iframe);
            if (content) iframeContents.push(content);
        });

        bodyClone
            .querySelectorAll(
                'script, style, nav, footer, aside, .ads, .comments, [role="complementary"], ' +
                    '.cookie-banner, .cookie-notice, .cookie-consent, #cookie-consent, ' +
                    '.popup, .overlay, .modal, [aria-modal="true"], ' +
                    '.gdpr, .consent-banner, .newsletter-popup'
            )
            .forEach(function (el) {
                el.remove();
            });

        var mainSelectors = ['main', 'article', '#content', '.content', '.post', '.entry', '[role="main"]', '.main'];
        var mainContent = null;

        for (var i = 0; i < mainSelectors.length; i++) {
            var found = bodyClone.querySelector(mainSelectors[i]);
            if (found && found.innerHTML.trim().length > 100) {
                mainContent = found;
                break;
            }
        }

        var finalContent = mainContent ? mainContent.innerHTML : bodyClone.innerHTML;

        if (iframeContents.length > 0) {
            finalContent += '<h2>Embedded Content</h2>' + iframeContents.join('<hr>');
        }

        return {
            title: document.title || 'Untitled Page',
            url: document.location.href,
            content: finalContent,
            success: true
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractPageContent };
}
