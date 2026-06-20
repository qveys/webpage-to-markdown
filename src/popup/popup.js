class MarkdownConverter {
    constructor() {
        this.defaultSettings = {
            frontmatter: false,
            headingStyle: 'atx',
            bulletListMarker: '-',
            codeBlockStyle: 'fenced'
        };

        this.settings = Object.assign({}, this.defaultSettings);

        this.initializeTheme();
        this.loadSettings();
        this.initializeEventListeners();
        this.restoreLastState();
    }

    createTurndownService() {
        var service = new TurndownService({
            headingStyle: this.settings.headingStyle,
            hr: '---',
            bulletListMarker: this.settings.bulletListMarker,
            codeBlockStyle: this.settings.codeBlockStyle,
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

    async initializeTheme() {
        var toggleBtn = document.getElementById('theme-toggle');

        var data = await chrome.storage.local.get(STORAGE_KEYS.THEME);
        var savedTheme = data[STORAGE_KEYS.THEME];

        if (!savedTheme) {
            var legacyTheme = localStorage.getItem('theme');
            if (legacyTheme) {
                savedTheme = legacyTheme;
                await chrome.storage.local.set({ theme: legacyTheme });
                localStorage.removeItem('theme');
            }
        }

        var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var isDark = savedTheme === 'dark' || (!savedTheme && systemDark);
        this.applyTheme(isDark);

        var self = this;
        toggleBtn.addEventListener('click', function () {
            var isCurrentDark = document.documentElement.getAttribute('data-theme') === 'dark';
            self.setTheme(!isCurrentDark);
        });

        chrome.storage.onChanged.addListener(function (changes, areaName) {
            if (areaName === 'local' && changes.theme) {
                var isDark = changes.theme.newValue === 'dark';
                self.applyTheme(isDark);
            }
        });
    }

    setTheme(isDark) {
        this.applyTheme(isDark);
        chrome.storage.local.set({ theme: isDark ? 'dark' : 'light' });
    }

    applyTheme(isDark) {
        var sunIcon = document.querySelector('.sun-icon');
        var moonIcon = document.querySelector('.moon-icon');

        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        } else {
            document.documentElement.removeAttribute('data-theme');
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        }
    }

    initializeEventListeners() {
        var self = this;
        document.getElementById('panel-open').addEventListener('click', function () { self.openSidePanel(); });
        document.getElementById('convert').addEventListener('click', function () { self.convertPage(); });
        document.getElementById('copy').addEventListener('click', function () { self.copyToClipboard(); });
        document.getElementById('download').addEventListener('click', function () { self.downloadMarkdown(); });
        document.getElementById('settings-toggle').addEventListener('click', function () { self.toggleSettingsPanel(); });

        document.getElementById('setting-frontmatter').addEventListener('change', function (e) { self.saveSetting('frontmatter', e.target.checked); });
        document.getElementById('setting-heading').addEventListener('change', function (e) { self.saveSetting('headingStyle', e.target.value); });
        document.getElementById('setting-bullet').addEventListener('change', function (e) { self.saveSetting('bulletListMarker', e.target.value); });
        document.getElementById('setting-code').addEventListener('change', function (e) { self.saveSetting('codeBlockStyle', e.target.value); });
    }

    loadSettings() {
        var stored = localStorage.getItem('markdownSettings');
        if (stored) {
            this.settings = Object.assign({}, this.defaultSettings, JSON.parse(stored));
        }

        document.getElementById('setting-frontmatter').checked = this.settings.frontmatter;
        document.getElementById('setting-heading').value = this.settings.headingStyle;
        document.getElementById('setting-bullet').value = this.settings.bulletListMarker;
        document.getElementById('setting-code').value = this.settings.codeBlockStyle;
    }

    saveSetting(key, value) {
        this.settings[key] = value;
        localStorage.setItem('markdownSettings', JSON.stringify(this.settings));
    }

    async openSidePanel() {
        try {
            var win = await chrome.windows.getCurrent();
            await chrome.sidePanel.open({ windowId: win.id });
        } catch (e) {
            // sidePanel API unavailable or error — ignore silently
        }
    }

    toggleSettingsPanel() {
        var panel = document.getElementById('settings-panel');
        var btn = document.getElementById('settings-toggle');
        var isHidden = panel.style.display === 'none';

        panel.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    }

    showConversionMeta(url, timestamp) {
        var metaEl = document.getElementById('conversion-meta');
        var urlEl = document.getElementById('meta-url');
        var tsEl = document.getElementById('meta-timestamp');

        if (url) {
            urlEl.textContent = url;
            urlEl.title = url;
        }

        if (timestamp) {
            try {
                var date = new Date(timestamp);
                tsEl.textContent = date.toLocaleString();
            } catch (e) {
                tsEl.textContent = timestamp;
            }
        }

        metaEl.style.display = 'flex';
    }

    hideConversionMeta() {
        document.getElementById('conversion-meta').style.display = 'none';
    }

    async restoreLastState() {
        try {
            var response = await sendMessage(MESSAGE_TYPES.GET_LAST_CONVERSION);
            if (response && response.ok && response.data && response.data.markdown) {
                document.getElementById('output').value = response.data.markdown;
                this.enableActions(true);
                this.showConversionMeta(response.data.url, response.data.timestamp);
            }
        } catch (e) {
            // Corrupted or absent storage — empty state, no error
        }
    }

    async convertPage() {
        try {
            this.setLoading(true);

            var response = await sendMessage(MESSAGE_TYPES.CONVERT_ACTIVE_TAB, {
                settings: this.settings
            });

            if (!response || !response.ok) {
                var classified = classifyError(response && response.error);
                this.showToast(classified.message, 'error', { duration: 4000, retry: true });
                this.enableActions(false);
                document.getElementById('output').value = '';
                this.hideConversionMeta();
                return;
            }

            document.getElementById('output').value = response.data.markdown;
            this.enableActions(true);
            this.showToast('Conversion successful!', 'success');
            this.showConversionMeta(response.data.url, response.data.timestamp);
        } catch (error) {
            console.error('Conversion error:', error);
            var classified = classifyError({ message: error.message });
            this.showToast(classified.message, 'error', { duration: 4000, retry: true });
            this.enableActions(false);
            document.getElementById('output').value = '';
            this.hideConversionMeta();
        } finally {
            this.setLoading(false);
        }
    }

    async copyToClipboard() {
        var output = document.getElementById('output');
        if (!output.value) return;

        try {
            await navigator.clipboard.writeText(output.value);
            this.showToast('Copied to clipboard!', 'success');
        } catch (error) {
            this.showToast('Failed to copy', 'error');
        }
    }

    downloadMarkdown() {
        var output = document.getElementById('output');
        if (!output.value) return;

        try {
            var blob = new Blob([output.value], { type: 'text/markdown' });
            var url = URL.createObjectURL(blob);
            var timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

            var a = document.createElement('a');
            a.href = url;
            a.download = 'page-' + timestamp + '.md';
            a.click();

            URL.revokeObjectURL(url);
            this.showToast('Download started', 'success');
        } catch (error) {
            this.showToast('Download failed', 'error');
        }
    }

    setLoading(isLoading) {
        var btn = document.getElementById('convert');
        if (isLoading) {
            btn.disabled = true;
            var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (prefersReducedMotion) {
                btn.textContent = 'Converting…';
            } else {
                btn.innerHTML = '<svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg> Converting...';
            }
        } else {
            btn.disabled = false;
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg> Convert Page to Markdown';
        }
    }

    enableActions(enabled) {
        document.getElementById('copy').disabled = !enabled;
        document.getElementById('download').disabled = !enabled;
    }

    showToast(message, type, options) {
        var toast = document.getElementById('toast');
        var duration = (options && options.duration) || 1500;

        if (options && options.retry) {
            toast.innerHTML = '';
            var span = document.createElement('span');
            span.textContent = message;
            toast.appendChild(span);

            var retryBtn = document.createElement('button');
            retryBtn.className = 'toast-retry';
            retryBtn.textContent = 'Retry';
            var self = this;
            retryBtn.addEventListener('click', function () {
                toast.className = 'toast hidden';
                self.convertPage();
            });
            toast.appendChild(retryBtn);
        } else {
            toast.textContent = message;
        }

        toast.className = 'toast show ' + (type || 'info');

        if (this.toastTimeout) clearTimeout(this.toastTimeout);

        this.toastTimeout = setTimeout(function () {
            toast.className = 'toast hidden';
        }, duration);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    new MarkdownConverter();
});
