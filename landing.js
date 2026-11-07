/* ============================================================
   Portada de DrakoTrack — carrusel de funciones (Swiper) y
   brillo de las tarjetas que sigue al puntero.

   El carrusel se maneja con teclado (flechas, Inicio y Fin), con
   sus flechas visibles, con los puntos y con el botón de pausa.
   Cada cambio provocado por la persona se anuncia en una región
   viva, así que un lector de pantalla lee la diapositiva nueva.

   El avance automático lo lleva un temporizador propio (no el de
   Swiper) para que la pausa sea real: se detiene con el foco
   dentro, con el puntero encima, con la pestaña oculta o con su
   botón, y no se rearma solo tras usar las flechas. Con
   movimiento reducido no hay avance automático.

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
  const DELAY = 5200;
  const pagination = element.querySelector('.swiper-pagination');
  const status = document.getElementById('carousel-status');
  const controls = element.querySelector('.swiper-controls');
  const prevBtn = element.querySelector('[data-carousel="prev"]');
  const nextBtn = element.querySelector('[data-carousel="next"]');
  const toggleBtn = element.querySelector('[data-carousel="toggle"]');
  const slides = element.querySelectorAll('.swiper-slide');
  const total = slides.length;

  const swiper = new window.Swiper(element, {
    slidesPerView: 1,
    spaceBetween: 12,
    grabCursor: true,
    watchOverflow: true,
    /* El avance automático se gestiona aquí abajo, no con Swiper. */
    autoplay: false,
    a11y: {
      enabled: true,
      containerRoleDescriptionMessage: 'carrusel',
      itemRoleDescriptionMessage: 'diapositiva',
      slideLabelMessage: '{{index}} de {{slidesLength}}'
    },
    /* Puntos como botones de verdad: se pueden tabular y activar con
       Enter o Espacio, y cada uno dice a qué diapositiva lleva. */
    pagination: pagination ? {
      el: pagination,
      clickable: true,
      renderBullet: function (index, className) {
        return '<button type="button" class="' + className + '" aria-label="Ir a la diapositiva ' +
          (index + 1) + ' de ' + total + '"></button>';
      }
    } : undefined
  });

  /* Swiper puede marcar el carrusel como región viva y repetir cada
     diapositiva a quien use lector de pantalla. Lo quitamos: solo se
     anuncia lo que la persona provoca. */
  element.removeAttribute('aria-live');
  const wrapper = element.querySelector('.swiper-wrapper');
  if (wrapper) wrapper.removeAttribute('aria-live');
  if (typeof window.MutationObserver === 'function') {
    new window.MutationObserver(function () {
      if (element.hasAttribute('aria-live')) element.removeAttribute('aria-live');
    }).observe(element, { attributes: true, attributeFilter: ['aria-live'] });
  }

  /* Una sola diapositiva: no hay nada que controlar. */
  if (total < 2) {
    if (controls) controls.hidden = true;
    if (pagination) pagination.hidden = true;
    return;
  }

  /* Sin animación el avance automático no existe: el botón se oculta. */
  if (reduceMotion && toggleBtn) toggleBtn.hidden = true;

  let autoTimer = null;
  let userPaused = false;
  /* Reanudar a mano gana sobre la pausa por foco hasta que el foco salga. */
  let explicitResume = false;
  let hovering = false;
  let userNavigated = false;

  function focusInside() {
    return element.contains(document.activeElement);
  }

  function autoAllowed() {
    if (reduceMotion || userPaused || document.hidden) return false;
    if (hovering) return false;
    if (focusInside() && !explicitResume) return false;
    return true;
  }

  function syncToggle() {
    if (!toggleBtn || reduceMotion) return;
    const stopped = !autoAllowed();
    toggleBtn.setAttribute('aria-pressed', stopped ? 'true' : 'false');
    toggleBtn.setAttribute('aria-label', stopped
      ? 'Reanudar el cambio automático'
      : 'Pausar el cambio automático');
  }

  function stopAuto() {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  }

  /* Cuando la persona toma el control (flechas, puntos o arrastre), el
     avance automático se detiene y solo vuelve con su botón. Nadie sigue
     cambiando la tarjeta por debajo de quien está leyendo o navegando. */
  function takeControl() {
    userPaused = true;
    explicitResume = false;
    stopAuto();
    syncToggle();
  }

  function scheduleAuto() {
    stopAuto();
    if (!autoAllowed()) { syncToggle(); return; }
    autoTimer = setTimeout(function () {
      autoTimer = null;
      const next = swiper.activeIndex >= total - 1 ? 0 : swiper.activeIndex + 1;
      swiper.slideTo(next);
    }, DELAY);
    syncToggle();
  }

  function titleOf(index) {
    const slide = slides[index];
    const title = slide && slide.querySelector('b');
    return title ? title.textContent.trim() : '';
  }

  function announce() {
    if (!status || !userNavigated) return;
    userNavigated = false;
    const index = swiper.activeIndex;
    const title = titleOf(index);
    status.textContent = 'Diapositiva ' + (index + 1) + ' de ' + total + (title ? ': ' + title : '');
  }

  function syncBullets() {
    if (!pagination) return;
    const bullets = pagination.querySelectorAll('.swiper-pagination-bullet');
    bullets.forEach(function (bullet, index) {
      if (index === swiper.activeIndex) bullet.setAttribute('aria-current', 'true');
      else bullet.removeAttribute('aria-current');
    });
  }

  swiper.on('slideChange', function () {
    syncBullets();
    announce();
    scheduleAuto();
  });
  syncBullets();
  scheduleAuto();

  /* --- teclado: flechas, Inicio y Fin --- */
  element.addEventListener('keydown', function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const before = swiper.activeIndex;
    if (event.key === 'ArrowRight') { takeControl(); userNavigated = true; swiper.slideNext(); }
    else if (event.key === 'ArrowLeft') { takeControl(); userNavigated = true; swiper.slidePrev(); }
    else if (event.key === 'Home') { takeControl(); userNavigated = true; swiper.slideTo(0); }
    else if (event.key === 'End') { takeControl(); userNavigated = true; swiper.slideTo(total - 1); }
    else return;
    event.preventDefault();
    /* En el primer o último extremo no hay cambio: no dejamos el aviso
       pendiente para un avance que no ha ocurrido. */
    if (swiper.activeIndex === before) {
      userNavigated = false;
      scheduleAuto();
    }
  });

  /* --- flechas visibles y puntos --- */
  if (prevBtn) prevBtn.addEventListener('click', function () { takeControl(); userNavigated = true; swiper.slidePrev(); });
  if (nextBtn) nextBtn.addEventListener('click', function () { takeControl(); userNavigated = true; swiper.slideNext(); });
  if (pagination) pagination.addEventListener('click', function () { takeControl(); userNavigated = true; }, true);
  /* Arrastrar con el dedo o con el ratón también es tomar el control. */
  swiper.on('sliderMove', takeControl);

  /* --- pausas automáticas: foco, puntero y pestaña oculta --- */
  element.addEventListener('focusin', function () { explicitResume = false; scheduleAuto(); });
  element.addEventListener('focusout', function (event) {
    if (!element.contains(event.relatedTarget)) { explicitResume = false; scheduleAuto(); }
  });
  element.addEventListener('mouseenter', function () { hovering = true; scheduleAuto(); });
  element.addEventListener('mouseleave', function () { hovering = false; scheduleAuto(); });
  document.addEventListener('visibilitychange', scheduleAuto);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      if (autoAllowed()) {
        userPaused = true;
        explicitResume = false;
      } else {
        userPaused = false;
        explicitResume = true;
      }
      scheduleAuto();
      syncToggle();
    });
  }
})();
