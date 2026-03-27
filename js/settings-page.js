// Settings page bootstrap (title + theme toggle)
(function () {
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function updateThemeIcon(theme) {
    var btn = document.getElementById('settings-theme-btn');
    if (!btn) return;
    while (btn.firstChild) btn.removeChild(btn.firstChild);

    if (theme === 'dark') {
      // Moon icon
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('width', '18');
      svg.setAttribute('height', '18');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
      svg.appendChild(path);
      btn.appendChild(svg);
    } else {
      // Sun icon
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('width', '18');
      svg.setAttribute('height', '18');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      var circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '5');
      svg.appendChild(circle);
      var rays = [
        ['12','1','12','3'],['12','21','12','23'],
        ['4.22','4.22','5.64','5.64'],['18.36','18.36','19.78','19.78'],
        ['1','12','3','12'],['21','12','23','12'],
        ['4.22','19.78','5.64','18.36'],['18.36','5.64','19.78','4.22']
      ];
      rays.forEach(function (r) {
        var line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', r[0]);
        line.setAttribute('y1', r[1]);
        line.setAttribute('x2', r[2]);
        line.setAttribute('y2', r[3]);
        svg.appendChild(line);
      });
      btn.appendChild(svg);
    }
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
