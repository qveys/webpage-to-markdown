// Settings page bootstrap (title + theme toggle)
(function () {
  function updateThemeIcon(theme) {
    var btn = document.getElementById('settings-theme-btn');
    if (!btn) return;
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    btn.appendChild(W2M.buildThemeIcon(theme === 'dark'));
  }

  // Set initial icon from saved theme
  chrome.storage.local.get('theme', function (r) {
    var theme = r.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    updateThemeIcon(theme);
  });

  // Toggle on click
  var btn = document.getElementById('settings-theme-btn');
  if (btn) {
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') || 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      chrome.storage.local.set({ theme: next });
      updateThemeIcon(next);
    });
  }

  // Sync if changed from another page
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes.theme) {
      var theme = changes.theme.newValue;
      document.documentElement.setAttribute('data-theme', theme);
      updateThemeIcon(theme);
    }
  });

  // Title
  W2M.i18n.initLocale().then(function () {
    var titleEl = document.getElementById('settings-title');
    if (titleEl) titleEl.textContent = W2M.i18n.t('settings.title');
  });
})();
