// Shared theme manager. Loaded in <head> so the saved theme is applied early.
(function () {
  'use strict';

  var VALID_THEMES = ['light', 'dark', 'github-dark', 'monokai', 'agentmesh'];
  var VALID_DARK_THEMES = ['dark', 'github-dark', 'monokai', 'agentmesh'];
  var currentTheme = 'light';
  var preferredDarkTheme = 'dark';
  var listeners = [];

  function includes(list, value) {
    return list.indexOf(value) !== -1;
  }

  function normalizeTheme(theme) {
    return includes(VALID_THEMES, theme) ? theme : null;
  }

  function normalizeDarkTheme(theme) {
    return includes(VALID_DARK_THEMES, theme) ? theme : 'dark';
  }

  function isDarkTheme(theme) {
    return includes(VALID_DARK_THEMES, theme);
  }

  function resolveInitialTheme(storedTheme, storedDarkTheme, prefersDark) {
    var normalizedTheme = normalizeTheme(storedTheme);
    if (normalizedTheme) return normalizedTheme;
    return prefersDark ? normalizeDarkTheme(storedDarkTheme) : 'light';
  }

  function nextTheme(theme, darkTheme) {
    return isDarkTheme(theme) ? 'light' : normalizeDarkTheme(darkTheme);
  }

  function notify(theme) {
    listeners.slice().forEach(function (listener) {
      listener(theme);
    });
  }

  function applyTheme(theme) {
    var normalizedTheme = normalizeTheme(theme) || 'light';
    var changed = currentTheme !== normalizedTheme;
    currentTheme = normalizedTheme;
    document.documentElement.setAttribute('data-theme', normalizedTheme);
    document.documentElement.style.colorScheme = isDarkTheme(normalizedTheme) ? 'dark' : 'light';
    if (changed) notify(normalizedTheme);
    return normalizedTheme;
  }

  function setTheme(theme) {
    var normalizedTheme = normalizeTheme(theme) || 'light';
    var patch = { theme: normalizedTheme };
    if (isDarkTheme(normalizedTheme)) {
      preferredDarkTheme = normalizedTheme;
      patch.darkTheme = normalizedTheme;
    }
    applyTheme(normalizedTheme);
    chrome.storage.local.set(patch);
  }

  function toggleTheme() {
    setTheme(nextTheme(currentTheme, preferredDarkTheme));
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.push(listener);
    listener(currentTheme);
    return function () {
      var index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    };
  }

  function init() {
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Seed a synchronous guess before the async storage read resolves, so
    // the initial paint and any early subscribe() calls don't flash 'light'
    // for users who chose a dark theme. The callback below refines this
    // with the persisted preference once chrome.storage.local resolves.
    applyTheme(resolveInitialTheme(null, preferredDarkTheme, prefersDark));

    chrome.storage.local.get(['theme', 'darkTheme'], function (result) {
      result = result || {};
      preferredDarkTheme = normalizeDarkTheme(
        result.darkTheme || (isDarkTheme(result.theme) ? result.theme : null)
      );
      applyTheme(resolveInitialTheme(result.theme, preferredDarkTheme, prefersDark));
    });

    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        if (changes.darkTheme) {
          preferredDarkTheme = normalizeDarkTheme(changes.darkTheme.newValue);
        }
        if (changes.theme) {
          var theme = normalizeTheme(changes.theme.newValue);
          if (!theme) return;
          if (isDarkTheme(theme)) preferredDarkTheme = theme;
          applyTheme(theme);
        }
      });
    }
  }

  window.W2M = window.W2M || {};
  W2M.theme = {
    THEMES: VALID_THEMES.slice(),
    DARK_THEMES: VALID_DARK_THEMES.slice(),
    normalizeTheme: normalizeTheme,
    normalizeDarkTheme: normalizeDarkTheme,
    isDarkTheme: isDarkTheme,
    resolveInitialTheme: resolveInitialTheme,
    nextTheme: nextTheme,
    applyTheme: applyTheme,
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    getCurrentTheme: function () { return currentTheme; },
    getDarkTheme: function () { return preferredDarkTheme; },
    subscribe: subscribe
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = W2M.theme;
  init();
})();
