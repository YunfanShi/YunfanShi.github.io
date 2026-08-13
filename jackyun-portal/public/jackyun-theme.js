(function () {
  'use strict';
  var KEY = 'jackyun_theme';

  function normalize(value) {
    return value === 'dark' ? 'dark' : 'light';
  }

  function apply(theme) {
    var next = normalize(theme);
    document.documentElement.dataset.jyTheme = next;
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  function readTheme() {
    try { return normalize(localStorage.getItem(KEY)); } catch (e) { return 'light'; }
  }

  apply(readTheme());

  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'jackyun-theme') apply(event.data.theme);
  });

  window.addEventListener('storage', function (event) {
    if (event.key === KEY) apply(event.newValue);
  });
})();
