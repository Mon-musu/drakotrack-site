/* ============================================================
   DrakoTrack — aviso de actualización de la APK (instalación directa).
   La app Android es un contenedor que carga este mismo sitio, así que no
   se actualiza sola: cada compilación añade su versionCode a la URL
   (?apk=4). Comparando ese número con apk/version.json se avisa cuando
   hay una APK más nueva y se ofrece la descarga.
   En el navegador no hay ?apk=, así que aquí no se muestra nada.
   ============================================================ */
'use strict';
window.DrakoUpdate = (function () {
  const ENDPOINT = 'apk/version.json';
  const PARAM = 'apk';
  const DISMISS_KEY = 'draktrack_update_dismissed';

  function installedCode() {
    try {
      const raw = new URLSearchParams(location.search).get(PARAM);
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch (_) { return 0; }
  }

  function isNewer(latest, installed) {
    const a = Number(latest), b = Number(installed);
    return Number.isFinite(a) && Number.isFinite(b) && a > b;
  }

  /* Dentro del WebView un <a download> no descarga: se pasa la URL a la hoja
     de compartir de Android para abrirla en el navegador, que sí descarga. */
  function openExternally(url) {
    try {
      if (window.Capacitor && typeof Capacitor.nativePromise === 'function') {
        return Capacitor.nativePromise('Share', 'share', { title: 'DrakoTrack', url: url, dialogTitle: 'Abrir con' })
          .catch(() => { location.href = url; });
      }
    } catch (_) {}
    location.href = url;
    return Promise.resolve();
  }

  function render(info, installed) {
    if (!document.body) return;
    const bar = document.createElement('div');
    bar.className = 'update-banner';
    bar.setAttribute('role', 'status');

    const text = document.createElement('div');
    text.className = 'update-text';
    const title = document.createElement('strong');
    title.textContent = 'Versión ' + String(info.versionName || '') + ' disponible';
    const sub = document.createElement('span');
    sub.textContent = 'Tienes la build ' + installed + ' · ' +
      (info.notes || 'Descarga la nueva APK para actualizar.');
    text.appendChild(title);
    text.appendChild(sub);

    const get = document.createElement('button');
    get.type = 'button';
    get.className = 'update-get';
    get.textContent = 'Descargar';
    get.addEventListener('click', () => { openExternally(String(info.apkUrl || ENDPOINT)); });

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'update-close';
    close.setAttribute('aria-label', 'Descartar aviso');
    close.textContent = '×';
    close.addEventListener('click', () => {
      try { localStorage.setItem(DISMISS_KEY, String(info.versionCode)); } catch (_) {}
      bar.remove();
    });

    bar.appendChild(text);
    bar.appendChild(get);
    bar.appendChild(close);
    document.body.appendChild(bar);
  }

  /* Los botones de descarga del sitio: se resuelven contra el feed para que
     apunten siempre al archivo de la última release y se descargue solo
     (GitHub sirve los assets con Content-Disposition: attachment). Si el feed
     no responde, el <a> conserva el href de respaldo que trae el HTML. */
  function wireDownloads() {
    const links = document.querySelectorAll('a[data-apk-download]');
    if (!links.length) return Promise.resolve();
    return fetch(ENDPOINT, { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(res => res.ok ? res.json() : null)
      .then(info => {
        if (!info || !info.apkUrl) return;
        links.forEach(a => {
          a.href = String(info.apkUrl);
          a.setAttribute('download', '');
          a.setAttribute('rel', 'noopener');
        });
      })
      .catch(() => {});
  }

  async function check() {
    const installed = installedCode();
    if (!installed) return;                          /* navegador: nada que comparar */
    let info = null;
    try {
      const res = await fetch(ENDPOINT, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      info = await res.json();
    } catch (_) { return; }
    if (!info || !isNewer(info.versionCode, installed)) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === String(info.versionCode)) return;
    } catch (_) {}
    render(info, installed);
  }

  function start() {
    wireDownloads();
    check();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  return { check, wireDownloads, installedCode, isNewer };
})();
