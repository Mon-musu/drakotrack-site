'use strict';
/* ============================================================
   DrakoTrack — página legal
   Aplica el mismo tema claro/oscuro que la app (sin scripts inline,
   para respetar la CSP `script-src 'self'`).
   ============================================================ */
(function () {
  var theme = 'dark';
  try { theme = localStorage.getItem('draktrack_theme_v1') || 'dark'; } catch (e) { }
  if (theme !== 'light') theme = 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f5f7' : '#0a0a0c');
})();
