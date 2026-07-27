(function (global) {
  'use strict';
  var W2M = global.W2M || {};
  global.W2M = W2M;

  W2M.formatShortcut = function (shortcut) {
    var nav = typeof navigator !== 'undefined' ? navigator : {};
    var platform = nav.platform || '';
    if (/Mac|iPhone|iPad/.test(platform)) {
      return shortcut
        .replace(/MacCtrl\+/g, '⌃')
        .replace(/Ctrl\+/g, '⌃')
        .replace(/Alt\+/g, '⌥')
        .replace(/Shift\+/g, '⇧')
        .replace(/Command\+/g, '⌘');
    }
    return shortcut;
  };
})(typeof window !== 'undefined' ? window : self);
