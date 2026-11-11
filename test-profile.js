'use strict';
/* ============================================================
   F2 · perfil deportivo
   Comprueba el modelo (campos permitidos, visibilidad mínima por
   defecto), la persistencia en el documento y que el perfil nunca
   pinta peso, correo ni foto de progreso.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost:8765/index.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  beforeParse(w) {
    Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true });
  },
});
const { window } = dom;
const ctx = dom.getInternalVMContext();
for (const f of ['sync.js', 'supabase.js', 'boostcamp.js', 'share.js', 'progress.js', 'planner.js',
  'offline.js', 'analytics.js', 'activity.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
const g = expr => vm.runInContext(expr, ctx, { filename: 'sup' });
const tick = ms => new Promise(r => setTimeout(r, ms));
const $ = sel => window.document.querySelector(sel);
const stored = () => JSON.parse(window.localStorage.getItem('draktrack_v1') || '{}');

(async () => {
  const user = 'perfil_' + Date.now().toString(36).slice(-5);
  await g(`signup('${user}', 'secret123')`);
  await tick(60);
  check('la cuenta local arranca con sesión', g('currentUser') === user);

  /* ---------- modelo y valores por defecto ---------- */
  const profile = g('profileFor(currentUser)');
  check('el perfil existe con apodo vacío', !!profile && profile.displayName === '');
  check('la fecha de alta es válida', isFinite(profile.joinedAt) && profile.joinedAt > 0);
  check('la visibilidad arranca vacía (lo mínimo)', Object.keys(profile.visibility).length === 0);
  check('por defecto no se publican estadísticas', g("profileVisible('stats')") === false);
  check('por defecto no se publica la fecha de alta', g("profileVisible('since')") === false);

  /* ---------- normalización: no entra nada que no esté permitido ---------- */
  const clean = g(`normalizeProfile({
    displayName: '  Ana  ',
    avatar: 'javascript:alert(1)',
    joinedAt: 1700000000000,
    visibility: { stats: true, routine: 'sí', since: 1, hack: true },
    admin: true,
    email: 'ana@example.com',
    weight: 83.4
  })`);
  check('el apodo se recorta en espacios', clean.displayName === 'Ana');
  check('se descarta un avatar que no es imagen', clean.avatar === '');
  check('se descartan campos desconocidos del perfil', !('admin' in clean) && !('email' in clean) && !('weight' in clean));
  check('la visibilidad solo acepta booleanos permitidos',
    clean.visibility.stats === true && !('routine' in clean.visibility) && !('since' in clean.visibility) && !('hack' in clean.visibility));
  check('la fecha de alta válida se conserva', clean.joinedAt === 1700000000000);

  const longName = g("normalizeProfile({ displayName: 'x'.repeat(40) }).displayName");
  check('el apodo se corta a 24 caracteres', longName.length === 24);
  const goodAvatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  check('un avatar PNG en data URL se acepta', g(`normalizeProfile({ avatar: '${goodAvatar}' }).avatar`) === goodAvatar);

  /* ---------- iniciales ---------- */
  check('las iniciales salen del apodo', g("profileInitials('Ana María')") === 'AM');
  check('sin nombre hay inicial de reserva', g("profileInitials('') ").length >= 1);

  /* ---------- guardar apodo y visibilidad ---------- */
  g("nav('#/profile')");
  await tick(80);
  check('la ruta de perfil existe', g('location.hash') === '#/profile');
  check('el título del documento lo refleja', /Perfil/.test(window.document.title));

  const nameInput = $('#profile-name');
  check('el perfil ofrece editar el apodo', !!nameInput);
  nameInput.value = '  Drako Ana  ';
  $('#main [data-action="profile-save"]').click();
  await tick(80);
  check('el apodo se guarda recortado', g('profileFor(currentUser).displayName') === 'Drako Ana');
  check('el apodo llega al documento persistido',
    ((stored().data || {})[user] || {}).profile.pub.displayName === 'Drako Ana');

  const statsBox = $('#main [data-profile-vis="stats"]');
  check('existe el interruptor de estadísticas', !!statsBox && statsBox.checked === false);
  statsBox.checked = true;
  statsBox.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick(80);
  check('activar la visibilidad se guarda en el perfil', g("profileFor(currentUser).visibility.stats") === true);
  check('la visibilidad persiste en el documento',
    ((stored().data || {})[user] || {}).profile.pub.visibility.stats === true);

  /* ---------- el perfil no publica datos privados ---------- */
  g(`(function(){
    const d = dataFor(currentUser);
    d.weights.push({ date: '2026-01-02', kg: 83.4 });
    d.photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    saveDB();
  })()`);
  g("nav('#/workouts')");
  await tick(60);
  g("nav('#/profile')");
  await tick(80);
  const perfilHtml = $('#main').innerHTML;
  check('el perfil no muestra el peso corporal', !/83[.,]4/.test(perfilHtml));
  check('el perfil no muestra la foto de progreso', !perfilHtml.includes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'));
  check('el perfil no muestra el correo de la cuenta', !/@/.test(perfilHtml));
  check('el perfil no incluye formularios de peso', !$('#main #w-chart') && !$('#main input[type="number"]'));
  check('la vista pública nombra al usuario', /Drako Ana/.test(perfilHtml));
  check('con visibilidad activa se ven los entrenamientos', /entrenamientos ·/.test(perfilHtml));

  /* ---------- el inicio usa datos reales ---------- */
  g("nav('#/workouts')");
  await tick(80);
  const inicio = $('#main').innerHTML;
  check('el inicio saluda con el apodo del perfil', /Drako Ana/.test(inicio));
  check('el inicio ofrece empezar a entrenar', !!$('#main [data-route="start"]'));
  check('el inicio enlaza al perfil', !!$('#main [data-action="open-profile"]'));
  check('sin sesiones el inicio muestra un estado vacío', /Aún no hay sesiones/.test(inicio));
  check('el inicio no inventa récords', /Todavía no hay marcas/.test(inicio));

  console.log(`\n${pass} ok, ${fail} fallo(s)`);
  process.exit(fail ? 1 : 0);
})();
