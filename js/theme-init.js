// Apply saved theme synchronously (loaded in <head> to avoid flash)
chrome.storage.local.get('theme', function (r) {
  var theme = r.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
});
