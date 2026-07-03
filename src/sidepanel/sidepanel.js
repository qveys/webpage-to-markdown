class SidePanelController {
    constructor() {
        this.currentView = 'history';
        this.historyItems = [];
        this.selectedHistoryId = null;
        this.autoDownload = false;
        this.autoDownloadFirstSeen = false;
        this.isConverting = false;
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.toastTimeout = null;

        this.initialize();
    }

    async initialize() {
        await this.initializeTheme();
        await this.loadPreferences();
        await this.loadHistory();
        this.initializeEventListeners();
        this.initializeStorageListener();
        this.initializeKeyboardShortcut();
        this.render();
    }

    async initializeTheme() {
        var stored = await chrome.storage.local.get('theme');
        var theme = stored.theme;
        if (!theme) {
            theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        this.applyTheme(theme === 'dark');

        var self = this;
        document.getElementById('theme-toggle').addEventListener('click', function () {
            var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            var newTheme = isDark ? 'light' : 'dark';
            chrome.storage.local.set({ theme: newTheme });
            self.applyTheme(!isDark);
        });
    }

    applyTheme(isDark) {
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        var sunIcon = document.querySelector('.sun-icon');
        var moonIcon = document.querySelector('.moon-icon');
        if (sunIcon && moonIcon) {
            sunIcon.style.display = isDark ? 'block' : 'none';
            moonIcon.style.display = isDark ? 'none' : 'block';
        }
    }

    async loadPreferences() {
        var prefs = await chrome.storage.local.get('panelPreferences');
        var p = prefs.panelPreferences || {};
        this.selectedHistoryId = p.selectedHistoryId || null;
        this.autoDownload = p.autoDownload || false;
        this.autoDownloadFirstSeen = p.autoDownloadFirstSeen || false;

        document.getElementById('auto-download').checked = this.autoDownload;
    }

    async savePreferences() {
        await chrome.storage.local.set({
            panelPreferences: {
                selectedHistoryId: this.selectedHistoryId,
                autoDownload: this.autoDownload,
                autoDownloadFirstSeen: this.autoDownloadFirstSeen
            }
        });
    }

    async loadHistory() {
        var response = await sendMessage(MESSAGE_TYPES.GET_HISTORY);
        if (response && response.ok) {
            this.historyItems = response.data || [];
        }
    }

    initializeEventListeners() {
        var self = this;

        document.getElementById('auto-download').addEventListener('change', function (e) {
            self.autoDownload = e.target.checked;
            self.savePreferences();
        });

        document.getElementById('convert-btn').addEventListener('click', function () {
            self.convertActiveTab();
        });

        document.getElementById('back-btn').addEventListener('click', function () {
            self.showHistoryView();
        });

        document.getElementById('copy-btn').addEventListener('click', function () {
            self.copyToClipboard();
        });

        document.getElementById('download-btn').addEventListener('click', function () {
            self.downloadCurrent();
        });
    }

    initializeKeyboardShortcut() {
        this.isMac = /Mac/.test(navigator.platform);
        this.kbdLabel = this.isMac ? '⌘↩' : 'Ctrl↩';
        var badge = document.getElementById('kbd-hint');
        if (badge) {
            badge.textContent = this.kbdLabel;
        }

        var self = this;
        document.addEventListener('keydown', function (e) {
            var tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                self.convertActiveTab();
            }
        });
    }

    initializeStorageListener() {
        var self = this;
        chrome.storage.onChanged.addListener(function (changes, namespace) {
            if (namespace !== 'local') return;

            if (changes.conversionHistory) {
                self.historyItems = changes.conversionHistory.newValue || [];
                if (self.currentView === 'history') {
                    self.renderHistoryList();
                }
            }

            if (changes.theme) {
                var newTheme = changes.theme.newValue;
                self.applyTheme(newTheme === 'dark');
            }
        });
    }

    render() {
        if (this.selectedHistoryId && this.currentView === 'history') {
            var item = this.historyItems.find(
                function (h) {
                    return h.id === this.selectedHistoryId;
                }.bind(this)
            );
            if (!item) {
                this.selectedHistoryId = null;
                this.savePreferences();
            }
        }
        this.renderHistoryList();
    }

    renderHistoryList() {
        var emptyState = document.getElementById('empty-state');
        var historyList = document.getElementById('history-list');

        if (this.historyItems.length === 0 && !this.isConverting) {
            emptyState.style.display = 'flex';
            historyList.style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';
        historyList.style.display = 'flex';
        historyList.innerHTML = '';

        if (this.isConverting) {
            historyList.appendChild(this.createSkeletonItem());
        }

        var self = this;
        this.historyItems.forEach(function (item) {
            historyList.appendChild(self.createHistoryItem(item));
        });
    }

    createSkeletonItem() {
        var el = document.createElement('div');
        el.className = 'history-item skeleton';
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML =
            '<div class="history-item-indicator"></div>' +
            '<div class="history-item-content">' +
            '<div class="skeleton-line skeleton-title"></div>' +
            '<div class="skeleton-line skeleton-url"></div>' +
            '<div class="skeleton-line skeleton-meta"></div>' +
            '</div>';
        return el;
    }

    createHistoryItem(item) {
        var isSelected = item.id === this.selectedHistoryId;
        var el = document.createElement('button');
        el.className = 'history-item';
        el.setAttribute('data-id', item.id);
        if (isSelected) {
            el.setAttribute('data-selected', 'true');
        }

        var indicator = isSelected ? '●' : '○';
        var hostname = '';
        try {
            hostname = new URL(item.url).hostname;
        } catch (e) {
            hostname = item.url;
        }
        var dateStr = this.formatDate(item.timestamp);
        var sizeKB = (item.markdown.length / 1024).toFixed(1);

        el.innerHTML =
            '<div class="history-item-indicator">' +
            indicator +
            '</div>' +
            '<div class="history-item-content">' +
            '<div class="history-item-title">' +
            this.escapeHtml(item.title || 'Untitled') +
            '</div>' +
            '<div class="history-item-url">' +
            this.escapeHtml(hostname) +
            '</div>' +
            '<div class="history-item-meta">' +
            dateStr +
            ' · ' +
            sizeKB +
            ' KB</div>' +
            '</div>';

        var self = this;
        el.addEventListener('click', function () {
            self.showDetailView(item);
        });

        return el;
    }

    showDetailView(item) {
        this.currentView = 'detail';
        this.selectedHistoryId = item.id;
        this.savePreferences();

        document.getElementById('detail-title').textContent = item.title || 'Untitled';
        var urlEl = document.getElementById('detail-url');
        urlEl.textContent = item.url;
        urlEl.href = item.url;
        urlEl.title = item.url;
        document.getElementById('detail-timestamp').textContent = this.formatDateFull(item.timestamp);
        document.getElementById('detail-output').value = item.markdown;

        document.getElementById('history-view').style.display = 'none';
        document.getElementById('detail-view').style.display = 'flex';
        document.getElementById('footer-history').style.display = 'none';
        document.getElementById('footer-detail').style.display = 'grid';

        this.renderHistoryList();
    }

    showHistoryView() {
        this.currentView = 'history';

        document.getElementById('history-view').style.display = '';
        document.getElementById('detail-view').style.display = 'none';
        document.getElementById('footer-history').style.display = '';
        document.getElementById('footer-detail').style.display = 'none';

        this.renderHistoryList();
    }

    async convertActiveTab() {
        if (this.isConverting) return;

        this.isConverting = true;
        this.setConvertLoading(true);

        if (this.currentView === 'history') {
            this.renderHistoryList();
        }

        try {
            var response = await sendMessage(MESSAGE_TYPES.CONVERT_ACTIVE_TAB, {
                source: 'sidepanel'
            });

            if (!response || !response.ok) {
                var classified = classifyError((response && response.error) || {});
                this.isConverting = false;
                this.setConvertLoading(false);
                this.renderHistoryList();
                this.showToast(
                    classified.message,
                    'error',
                    classified.category === ERROR_CATEGORIES.CONVERSION_FAILED ? 4000 : 1500
                );
                return;
            }

            this.isConverting = false;
            this.setConvertLoading(false);

            await this.loadHistory();
            this.selectedHistoryId = response.data.timestamp + '::' + response.data.url;
            this.renderHistoryList();

            if (this.autoDownload) {
                await this.performAutoDownload(response.data);
            } else {
                this.showToast('Conversion successful!', 'success', 1500);
            }

            this.savePreferences();
        } catch (err) {
            this.isConverting = false;
            this.setConvertLoading(false);
            this.renderHistoryList();
            var fallback = classifyError({ message: err.message });
            this.showToast(fallback.message, 'error', 1500);
        }
    }

    async performAutoDownload(data) {
        var filename = generateFilename(data.title, data.timestamp);

        try {
            var blob = new Blob([data.markdown], { type: 'text/markdown' });
            var url = URL.createObjectURL(blob);
            await chrome.downloads.download({ url: url, filename: filename, saveAs: false });
            URL.revokeObjectURL(url);
        } catch (e) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([data.markdown], { type: 'text/markdown' }));
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
        }

        if (!this.autoDownloadFirstSeen) {
            this.autoDownloadFirstSeen = true;
            this.savePreferences();
            this.showToast('Saved as ' + filename + ' in your Downloads folder.', 'info', 3500);
        } else {
            this.showToast('Conversion successful!', 'success', 1500);
        }
    }

    setConvertLoading(isLoading) {
        var btn = document.getElementById('convert-btn');
        var kbd = this.kbdLabel ? ' <kbd class="kbd-hint">' + this.kbdLabel + '</kbd>' : '';
        if (isLoading) {
            btn.disabled = true;
            if (this.reducedMotion) {
                btn.innerHTML = 'Converting…';
            } else {
                btn.innerHTML =
                    '<svg class="icon animate-spin" width="18" height="18"><use href="../assets/icons.svg#icon-loader"/></svg> Converting…';
            }
        } else {
            btn.disabled = false;
            btn.innerHTML =
                '<svg class="icon" width="18" height="18"><use href="../assets/icons.svg#icon-file"/></svg> Convert Active Tab' +
                kbd;
        }
    }

    async copyToClipboard() {
        var output = document.getElementById('detail-output');
        if (!output.value) return;

        try {
            await navigator.clipboard.writeText(output.value);
            this.showButtonSuccess(document.getElementById('copy-btn'), 'Copied!');
        } catch (e) {
            this.showToast('Failed to copy', 'error', 1500);
        }
    }

    downloadCurrent() {
        var output = document.getElementById('detail-output');
        if (!output.value) return;

        var item = this.historyItems.find(
            function (h) {
                return h.id === this.selectedHistoryId;
            }.bind(this)
        );
        var title = item ? item.title : 'page';
        var timestamp = item ? item.timestamp : new Date().toISOString();
        var filename = generateFilename(title, timestamp);

        try {
            var blob = new Blob([output.value], { type: 'text/markdown' });
            var url = URL.createObjectURL(blob);
            chrome.downloads.download({ url: url, filename: filename, saveAs: false });
            URL.revokeObjectURL(url);
            this.showButtonSuccess(document.getElementById('download-btn'), 'Downloaded!');
        } catch (e) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([output.value], { type: 'text/markdown' }));
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
            this.showButtonSuccess(document.getElementById('download-btn'), 'Downloaded!');
        }
    }

    showButtonSuccess(btn, label) {
        if (btn._successTimeout) {
            clearTimeout(btn._successTimeout);
        } else {
            btn._originalHTML = btn.innerHTML;
        }
        btn.classList.add('btn-success-feedback');
        btn.innerHTML =
            '<svg class="icon" width="18" height="18"><use href="../assets/icons.svg#icon-check"/></svg> <span>' +
            label +
            '</span>';

        btn._successTimeout = setTimeout(function () {
            btn.classList.remove('btn-success-feedback');
            btn.innerHTML = btn._originalHTML;
            delete btn._originalHTML;
            delete btn._successTimeout;
        }, 1500);
    }

    showToast(message, type, duration) {
        var toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast show ' + (type || 'info');

        if (this.toastTimeout) clearTimeout(this.toastTimeout);

        this.toastTimeout = setTimeout(function () {
            toast.className = 'toast hidden';
        }, duration || 1500);
    }

    formatDate(timestamp) {
        var date = new Date(timestamp);
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var day = date.getDate();
        var month = months[date.getMonth()];
        var hours = String(date.getHours()).padStart(2, '0');
        var minutes = String(date.getMinutes()).padStart(2, '0');
        return day + ' ' + month + ' · ' + hours + ':' + minutes;
    }

    formatDateFull(timestamp) {
        var date = new Date(timestamp);
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var day = date.getDate();
        var month = months[date.getMonth()];
        var year = date.getFullYear();
        var hours = String(date.getHours()).padStart(2, '0');
        var minutes = String(date.getMinutes()).padStart(2, '0');
        return day + ' ' + month + ' ' + year + ' · ' + hours + ':' + minutes;
    }

    escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', function () {
    new SidePanelController();
});
