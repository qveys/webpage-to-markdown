class MarkdownConverter {
    constructor() {
        this.defaultSettings = {
            frontmatter: false,
            headingStyle: 'atx',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced'
        };

        this.settings = { ...this.defaultSettings };

        this.initializeTheme();
        this.loadSettings();
        this.initializeEventListeners();

        // Restore last conversion if available
        this.restoreLastState();
    }

    createTurndownService() {
        const service = new TurndownService({
            headingStyle: this.settings.headingStyle,
            hr: '---',
            bulletListMarker: this.settings.bulletListMarker,
            codeBlockStyle: this.settings.codeBlockStyle,
            emDelimiter: '_'
        });

        service.keep(['iframe', 'script', 'style']);

        service.addRule('figures', {
            filter: 'figure',
            replacement: (content, node) => {
                const img = node.querySelector('img');
                const caption = node.querySelector('figcaption');
                if (img) {
                    const alt = img.getAttribute('alt') || '';
                    const src = img.getAttribute('src') || '';
                    const captionText = caption ? caption.textContent : '';
                    return `

![${alt}](${src})
${captionText}

`;
                }
                return content;
            }
        });

        return service;
    }

    initializeTheme() {
        const toggleBtn = document.getElementById('theme-toggle');
        const _sunIcon = toggleBtn.querySelector('.sun-icon');
        const _moonIcon = toggleBtn.querySelector('.moon-icon');

        // Check saved theme or system preference
        const savedTheme = localStorage.getItem('theme');
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        const isDark = savedTheme === 'dark' || (!savedTheme && systemDark);
        this.setTheme(isDark);

        toggleBtn.addEventListener('click', () => {
            const isCurrentDark = document.documentElement.getAttribute('data-theme') === 'dark';
            this.setTheme(!isCurrentDark);
        });
    }

    setTheme(isDark) {
        const sunIcon = document.querySelector('.sun-icon');
        const moonIcon = document.querySelector('.moon-icon');

        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        } else {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        }
    }

    initializeEventListeners() {
        document.getElementById('convert').addEventListener('click', () => this.convertPage());
        document.getElementById('copy').addEventListener('click', () => this.copyToClipboard());
        document.getElementById('download').addEventListener('click', () => this.downloadMarkdown());
        document.getElementById('settings-toggle').addEventListener('click', () => this.toggleSettingsPanel());

        // Settings change listeners
        document
            .getElementById('setting-frontmatter')
            .addEventListener('change', (e) => this.saveSetting('frontmatter', e.target.checked));
        document
            .getElementById('setting-heading')
            .addEventListener('change', (e) => this.saveSetting('headingStyle', e.target.value));
        document
            .getElementById('setting-bullet')
            .addEventListener('change', (e) => this.saveSetting('bulletListMarker', e.target.value));
        document
            .getElementById('setting-code')
            .addEventListener('change', (e) => this.saveSetting('codeBlockStyle', e.target.value));
    }

    loadSettings() {
        const stored = localStorage.getItem('markdownSettings');
        if (stored) {
            try {
                this.settings = { ...this.defaultSettings, ...JSON.parse(stored) };
            } catch {
                localStorage.removeItem('markdownSettings');
                this.settings = { ...this.defaultSettings };
            }
        }

        // Update UI
        document.getElementById('setting-frontmatter').checked = this.settings.frontmatter;
        document.getElementById('setting-heading').value = this.settings.headingStyle;
        document.getElementById('setting-bullet').value = this.settings.bulletListMarker;
        document.getElementById('setting-code').value = this.settings.codeBlockStyle;
    }

    saveSetting(key, value) {
        this.settings[key] = value;
        localStorage.setItem('markdownSettings', JSON.stringify(this.settings));
    }

    toggleSettingsPanel() {
        const panel = document.getElementById('settings-panel');
        const btn = document.getElementById('settings-toggle');
        const isOpen = panel.classList.contains('open');

        if (isOpen) {
            panel.classList.remove('open');
            btn.classList.remove('active');
        } else {
            panel.classList.add('open');
            btn.classList.add('active');
        }
    }

    async restoreLastState() {
        try {
            const _data = await chrome.storage.local.get('lastConversion');
            // Logic to restore state if desired
        } catch (e) {
            console.log('Error reading storage', e);
        }
    }

    async convertPage() {
        try {
            this.setLoading(true);

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id || !tab.url) throw new Error('No active tab found');

            // Prevent scripting on restricted pages
            if (
                tab.url.startsWith('chrome://') ||
                tab.url.startsWith('chrome-extension://') ||
                tab.url.startsWith('edge://') ||
                tab.url.startsWith('about:') ||
                tab.url.includes('chromewebstore.google.com') ||
                tab.url.includes('chrome.google.com/webstore')
            ) {
                throw new Error('Cannot convert system pages or Web Store');
            }

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    try {
                        if (!document || !document.body) {
                            throw new Error('Document body not found');
                        }

                        const getIframeContent = (iframe) => {
                            try {
                                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                                if (!iframeDoc || !iframeDoc.body) return '';
                                const iframeClone = iframeDoc.body.cloneNode(true);
                                iframeClone
                                    .querySelectorAll('script, style, nav, footer, aside, .ads, .comments')
                                    .forEach((el) => el.remove());
                                return `<div class="iframe-content">${iframeClone.innerHTML}</div>`;
                            } catch (e) {
                                return '';
                            }
                        };

                        const bodyClone = document.body.cloneNode(true);

                        const iframes = document.querySelectorAll('iframe');
                        let iframeContents = [];
                        iframes.forEach((iframe) => {
                            const content = getIframeContent(iframe);
                            if (content) iframeContents.push(content);
                        });

                        const unwanted = bodyClone.querySelectorAll(
                            'script, style, nav, footer, aside, .ads, .comments, [role="complementary"], .cookie-banner, .popup, .overlay, .modal'
                        );
                        unwanted.forEach((el) => el.remove());

                        const mainSelectors = [
                            'main',
                            'article',
                            '.content',
                            '.post',
                            '.entry',
                            '[role="main"]',
                            '#content',
                            '.main'
                        ];
                        let mainContent = null;

                        for (const selector of mainSelectors) {
                            const found = bodyClone.querySelector(selector);
                            if (found && found.innerHTML.trim().length > 100) {
                                mainContent = found;
                                break;
                            }
                        }

                        let finalContent = mainContent ? mainContent.innerHTML : bodyClone.innerHTML;

                        if (iframeContents.length > 0) {
                            finalContent += '<h2>Embedded Content</h2>' + iframeContents.join('<hr>');
                        }

                        return {
                            title: document.title || 'Untitled Page',
                            url: document.location.href, // Added URL capture
                            content: finalContent,
                            success: true
                        };
                    } catch (error) {
                        return { success: false, error: error.message };
                    }
                }
            });

            if (!results || !results[0] || !results[0].result) {
                throw new Error('Failed to get page content');
            }

            const { success, content, title, url, error } = results[0].result;

            if (!success) throw new Error(error || 'Failed to extract content');

            const escapeHtml = (value) =>
                String(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');

            const wrappedContent = `
                <div class="markdown-content">
                    <h1>${escapeHtml(title)}</h1>
                    ${content}
                </div>
            `;

            // Initialize Turndown with current settings
            const turndownService = this.createTurndownService();
            let markdown = turndownService.turndown(wrappedContent);

            // Post-processing: Collapse multiple newlines (3+) into max 2
            markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

            // Add Frontmatter if enabled
            if (this.settings.frontmatter) {
                const date = new Date().toISOString().split('T')[0];
                const yamlString = (v) => JSON.stringify(String(v));
                const frontmatter = `---
title: ${yamlString(title)}
url: ${yamlString(url)}
date: ${date}
---

`;
                markdown = frontmatter + markdown;
            }

            const output = document.getElementById('output');
            output.value = markdown;

            document.getElementById('conversion-meta').classList.remove('hidden');
            document.getElementById('meta-url').textContent = tab.url;

            this.enableActions(true);
            this.showToast('Conversion successful!', 'success');

            await chrome.storage.local.set({
                lastConversion: {
                    url: tab.url,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error('Conversion error:', error);
            this.showToast(error.message, 'error');
            this.enableActions(false);
            document.getElementById('conversion-meta').classList.add('hidden');
            document.getElementById('output').value = '';
        } finally {
            this.setLoading(false);
        }
    }

    async copyToClipboard() {
        const output = document.getElementById('output');
        if (!output.value) return;

        try {
            await navigator.clipboard.writeText(output.value);
            this.showToast('Copied to clipboard!', 'success');
        } catch (error) {
            this.showToast('Failed to copy', 'error');
        }
    }

    downloadMarkdown() {
        const output = document.getElementById('output');
        if (!output.value) return;

        try {
            const blob = new Blob([output.value], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

            const a = document.createElement('a');
            a.href = url;
            a.download = `page-${timestamp}.md`;
            a.click();

            URL.revokeObjectURL(url);
            this.showToast('Download started', 'success');
        } catch (error) {
            this.showToast('Download failed', 'error');
        }
    }

    setLoading(isLoading) {
        const btn = document.getElementById('convert');
        if (isLoading) {
            btn.disabled = true;
            btn.innerHTML = `<svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg> Converting...`;
        } else {
            btn.disabled = false;
            btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg> Convert Page to Markdown`;
        }
    }

    enableActions(enabled) {
        document.getElementById('copy').disabled = !enabled;
        document.getElementById('download').disabled = !enabled;
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast show ${type}`;

        if (this.toastTimeout) clearTimeout(this.toastTimeout);

        this.toastTimeout = setTimeout(() => {
            toast.className = 'toast hidden';
        }, 1500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MarkdownConverter();
});
