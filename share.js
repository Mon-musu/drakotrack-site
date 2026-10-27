/* ============================================================
   DrakoTrack — compartir gráficas como JPG
   (WhatsApp / hoja de compartir / descarga).
   Funciona en la web y dentro de la app Android (Capacitor).

   El JPG se dibuja ENTERO con el API 2D del canvas: no hay carga
   intermedia de imágenes/SVG, así que la generación es inmediata
   (antes el paso SVG → <img> se atascaba o tardaba mucho en
   algunos WebViews y la imagen nunca llegaba a enviarse).
   ============================================================ */
'use strict';
window.DrakoShare = (function () {
  function isNative() {
    return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  }
  function fmtShort(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.getDate() + ' ' + d.toLocaleDateString('es', { month: 'short' });
  }

  /* Dibuja el gráfico de líneas directamente sobre el canvas. */
  function drawChart(ctx, data, unit, ox, oy, w, h) {
    const P = 46, PB = 30, PT = 14;
    const vals = data.map(d => d.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.18; min -= pad; max += pad;
    const X = i => ox + P + (w - P - 16) * (data.length === 1 ? 0.5 : i / (data.length - 1));
    const Y = v => oy + PT + (h - PT - PB) * (1 - (v - min) / (max - min));

    ctx.save();
    const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

    /* rejilla y etiquetas de valores */
    ctx.lineWidth = 1;
    ctx.font = '600 13px ' + FONT;
    [0, 0.5, 1].forEach(g => {
      const gy = Y(min + g * (max - min));
      ctx.strokeStyle = '#e6e6ea';
      ctx.beginPath(); ctx.moveTo(ox + P, gy); ctx.lineTo(ox + w - 16, gy); ctx.stroke();
      ctx.fillStyle = '#9a9aa4';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(min + g * (max - min))), ox + P - 10, gy + 4);
    });

    /* área bajo la curva */
    const area = new Path2D();
    area.moveTo(X(0), Y(data[0].value));
    for (let i = 1; i < data.length; i++) {
      const mx = (X(i - 1) + X(i)) / 2;
      area.quadraticCurveTo(mx, Y(data[i - 1].value), X(i), Y(data[i].value));
    }
    area.lineTo(X(data.length - 1), Y(min));
    area.lineTo(X(0), Y(min));
    area.closePath();
    const grad = ctx.createLinearGradient(0, oy + PT, 0, oy + h - PB);
    grad.addColorStop(0, 'rgba(255,122,0,.28)');
    grad.addColorStop(1, 'rgba(255,122,0,0)');
    ctx.fillStyle = grad;
    ctx.fill(area);

    /* línea suave (halo + trazo principal) */
    const line = new Path2D();
    line.moveTo(X(0), Y(data[0].value));
    for (let i = 1; i < data.length; i++) {
      const mx = (X(i - 1) + X(i)) / 2;
      line.quadraticCurveTo(mx, Y(data[i - 1].value), X(i), Y(data[i].value));
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,179,107,.18)';
    ctx.lineWidth = 9;
    ctx.stroke(line);
    ctx.strokeStyle = '#ff7a00';
    ctx.lineWidth = 3.5;
    ctx.stroke(line);

    /* puntos de datos */
    data.forEach((d, i) => {
      ctx.beginPath();
      ctx.arc(X(i), Y(d.value), 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff7a00';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    /* fechas del eje y unidad */
    ctx.font = '600 13px ' + FONT;
    ctx.fillStyle = '#9a9aa4';
    ctx.textAlign = 'left';
    ctx.fillText(fmtShort(data[0].label), ox + P, oy + h - 8);
    ctx.textAlign = 'right';
    ctx.fillText(fmtShort(data[data.length - 1].label), ox + w - 16, oy + h - 8);
    if (unit) {
      ctx.fillStyle = '#6c6c76';
      ctx.fillText(unit, ox + w - 16, oy + 4);
    }
    ctx.restore();
  }

  /* Compone el JPG final: franja de marca + cabecera + gráfico + pie. */
  function buildJPG(opts) {
    if (!opts || !opts.data || !opts.data.length) throw new Error('Sin datos');
    const { title, subtitle, data, unit } = opts;

    const W = 840;
    const chartW = W - 56, chartH = Math.round(chartW * (300 / 760));
    const headerH = 108, footerH = 44;
    const H = headerH + chartH + footerH;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#ffa040'); grad.addColorStop(1, '#f05100');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 6);

    ctx.fillStyle = '#17171c';
    ctx.font = '800 24px ' + FONT;
    ctx.fillText('Drako', 28, 52);
    ctx.fillStyle = '#f05f00';
    ctx.fillText('Track', 28 + ctx.measureText('Drako').width, 52);

    ctx.fillStyle = '#17171c';
    ctx.font = '700 20px ' + FONT;
    ctx.fillText(String(title || ''), 28, 84);
    if (subtitle) {
      ctx.fillStyle = '#6c6c76';
      ctx.font = '500 13.5px ' + FONT;
      ctx.fillText(String(subtitle), 28, 103);
    }

    drawChart(ctx, data, unit, 28, headerH, chartW, chartH);

    const lineY = H - footerH + 10;
    ctx.strokeStyle = '#ececef';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(28, lineY); ctx.lineTo(W - 28, lineY); ctx.stroke();

    ctx.fillStyle = '#9a9aa4';
    ctx.font = '600 12px ' + FONT;
    ctx.textAlign = 'center';
    const foot = 'DrakoTrack · generado el ' + new Date().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
    ctx.fillText(foot, W / 2, H - 16);
    ctx.textAlign = 'left';

    return cv.toDataURL('image/jpeg', 0.92);
  }

  /* dataURL base64 → Blob sin pasar por fetch (más rápido y fiable). */
  function dataUrlToBlob(dataUrl) {
    const m = dataUrl.match(/^data:([^;,]+);base64,(.*)$/s);
    if (!m) throw new Error('Imagen inválida');
    const bin = atob(m[2]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] });
  }

  /* Comparte: Capacitor (APK) → Web Share API → descarga como respaldo */
  async function shareJPG(opts) {
    const filename = opts.filename || 'drakotrack.jpg';
    const text = opts.text || '';
    const dataUrl = buildJPG(opts);

    if (isNative()) {
      const base64 = dataUrl.split(',')[1];
      const res = await Capacitor.nativePromise('Filesystem', 'writeFile', {
        path: filename, data: base64, directory: 'CACHE', encoding: 'BASE64',
      });
      /* En Android se comparte SOLO la imagen (sin texto): es lo más fiable
         para que WhatsApp adjunte el JPG al instante en vez de quedarse
         cargándolo. */
      const sres = await Capacitor.nativePromise('Share', 'share', {
        title: 'DrakoTrack', files: [res.uri], dialogTitle: 'Compartir con',
      });
      return sres && sres.completed === false ? 'cancelled' : 'shared';
    }

    const blob = dataUrlToBlob(dataUrl);
    const file = new File([blob], filename, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'DrakoTrack', text });
      return 'shared';
    }
    const a = document.createElement('a');
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    return 'downloaded';
  }

  /* Comparte un archivo de texto (p. ej. el JSON de un entrenamiento).
     En la APK: lo escribe en la caché y abre la hoja de compartir de
     Android (elige WhatsApp, Archivos, Drive… para enviarlo o guardarlo) —
     un <a download> no funciona dentro del WebView de Capacitor, por eso
     el export de JSON fallaba en Android. En la web: descarga normal. */
  async function shareFile(filename, text, mime) {
    if (isNative()) {
      const res = await Capacitor.nativePromise('Filesystem', 'writeFile', {
        path: filename, data: text, directory: 'CACHE', encoding: 'UTF8',
      });
      const sres = await Capacitor.nativePromise('Share', 'share', {
        title: 'DrakoTrack', files: [res.uri], dialogTitle: 'Compartir',
      });
      return sres && sres.completed === false ? 'cancelled' : 'shared';
    }
    const blob = new Blob([text], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return 'downloaded';
  }

  return { shareJPG, shareFile, isNative, buildJPG };
})();
