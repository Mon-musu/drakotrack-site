/* ============================================================
   Portada de DrakoTrack — carrusel de funciones (Swiper) y
   brillo de las tarjetas que sigue al puntero.

   Swiper se carga desde vendor/swiper (mismo origen) porque la
   CSP del sitio solo permite scripts propios: no hay peticiones
   a CDNs de terceros.

   Si el script no se ejecuta (JS desactivado o bloqueado), la
   portada sigue siendo válida: se ve el contenido de la primera
   tarjeta y el formulario funciona igual.
   ============================================================ */
'use strict';

(function () {
  /* ---- brillo que sigue al puntero (solo con ratón/lápiz) ---- */
  const cards = document.querySelectorAll('.glow-card');
  cards.forEach(function (card) {
    card.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch') return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--gx', (event.clientX - rect.left) + 'px');
      card.style.setProperty('--gy', (event.clientY - rect.top) + 'px');
    });
  });

  /* ---- carrusel ---- */
  const element = document.querySelector('.auth-swiper');
  if (!element || typeof window.Swiper !== 'function') return;

  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const pagination = element.querySelector('.swiper-pagination');

  window.Swiper && new window.Swiper(element, {
    slidesPerView: 1,
    spaceBetween: 12,
    grabCursor: true,
    watchOverflow: true,
    a11y: { enabled: true },
    pagination: pagination ? { el: pagination, clickable: true } : undefined,
    /* Con movimiento reducido no hay avance automático: nada se mueve solo. */
    autoplay: reduceMotion ? false : {
      delay: 5200,
      disableOnInteraction: false,
      pauseOnMouseEnter: true
    }
  });
})();
