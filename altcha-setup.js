/* ============================================================
   DrakoTrack — ALTCHA (captcha de prueba de trabajo, autoalojado)
   Carga el web component desde /altcha.js (mismo origen, sin CDN)
   y registra los textos en español. El widget se monta desde app.js
   solo al crear una cuenta en la nube.
   Sin cookies, sin rastreo, sin servicios de terceros.
   ============================================================ */
import './altcha.js';

const ES = {
  ariaLinkLabel: 'Altcha (sitio web oficial)',
  cancel: 'Cancelar',
  enterCode: 'Introduce el código',
  enterCodeAria: 'Introduce el código que escuchas. Pulsa Espacio para reproducir el audio.',
  enterCodeFromImage: 'Para continuar, introduce el código de la imagen de abajo.',
  error: 'Falló la verificación. Inténtalo de nuevo más tarde.',
  expired: 'La verificación caducó. Vuelve a intentarlo.',
  footer: 'Protegido por <a href="https://altcha.org/" target="_blank" rel="noopener" aria-label="Altcha (sitio web oficial, se abre en una nueva pestaña)">ALTCHA</a>',
  getAudioChallenge: 'Pedir un reto de audio',
  label: 'No soy un robot',
  loading: 'Cargando…',
  reload: 'Recargar',
  verify: 'Verificar',
  verificationRequired: '¡Hace falta verificar!',
  verified: 'Verificado',
  verifying: 'Verificando…',
  waitAlert: 'Verificando… espera un momento.',
};

if (globalThis.$altcha && globalThis.$altcha.i18n) globalThis.$altcha.i18n.set('es-es', ES);

document.dispatchEvent(new Event('altcha-ready'));
