// Settings page bootstrap (title + theme toggle)
(function () {
  function updateThemeIcon(theme) {
    var btn = document.getElementById('settings-theme-btn');
    if (!btn) return;
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    btn.appendChild(W2M.buildThemeIcon(W2M.theme.isDarkTheme(theme)));
  }

  var btn = document.getElementById('settings-theme-btn');
  if (btn) {
    btn.addEventListener('click', function () {
      W2M.theme.toggleTheme();
    });
  }

  W2M.theme.subscribe(function (theme) {
    updateThemeIcon(theme);
  });

  // Title
  W2M.i18n.initLocale().then(function () {
    var titleEl = document.getElementById('settings-title');
    if (titleEl) titleEl.textContent = W2M.i18n.t('settings.title');
  });
})();
