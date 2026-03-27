// Shared theme icon builder — returns a sun/moon SVG node (W2M.buildThemeIcon).
(function () {
  var NS = 'http://www.w3.org/2000/svg';

  var SUN_RAYS = [
    ['12','1','12','3'],['12','21','12','23'],
    ['4.22','4.22','5.64','5.64'],['18.36','18.36','19.78','19.78'],
    ['1','12','3','12'],['21','12','23','12'],
    ['4.22','19.78','5.64','18.36'],['18.36','5.64','19.78','4.22']
  ];

  function buildThemeIcon(isDark, size) {
    size = size || 18;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');

    if (isDark) {
      var path = document.createElementNS(NS, 'path');
      path.setAttribute('d', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
      svg.appendChild(path);
    } else {
      var circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '5');
      svg.appendChild(circle);
      SUN_RAYS.forEach(function (r) {
        var line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', r[0]);
        line.setAttribute('y1', r[1]);
        line.setAttribute('x2', r[2]);
        line.setAttribute('y2', r[3]);
        svg.appendChild(line);
      });
    }
    return svg;
  }

  // Expose globally
  window.W2M = window.W2M || {};
  W2M.buildThemeIcon = buildThemeIcon;
})();
