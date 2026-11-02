'use strict';
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

for (const f of ['supabase.js', 'boostcamp.js', 'share.js', 'app.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx, { filename: f });
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
const g = expr => vm.runInContext(expr, ctx, { filename: 'sup' });
const tick = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // fetch stub reading from disk
  g(`window.fetch = async url => {
    const clean = String(url).split('?')[0].replace(/^\\//, '');
    try {
      const fs = { read: () => null };
      const data = await (window.__readFile ? window.__readFile(clean) : null);
      return { ok: true, json: async () => data };
    } catch (e) { return { ok: false, status: 404, json: async () => { throw new Error('nf'); } }; }
  };`);
  // real impl via host fs
  g(`window.__readFile = p => 'pending';`);
  window.__readFile = undefined;
  // simpler: patch fetch via ctx built with host calls
  g(`window.fetch = async url => {
    const clean = String(url).split('?')[0].replace(/^\\//, '');
    const data = await window.__hostRead(clean);
    if (data == null) return { ok: false, status: 404, json: async () => { throw new Error('nf'); } };
    return { ok: true, json: async () => JSON.parse(data) };
  };`);
  window.__hostRead = file => {
    const p = path.join(__dirname, file);
    try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; } catch (e) { return null; }
  };

  window.render();
  check('auth screen shown when signed out', !window.document.querySelector('#auth-screen').classList.contains('hidden'));

  // weak password via UI (signup tab is cloud-first; switch to local via its link)
  const form = window.document.querySelector('#auth-form');
  window.document.querySelector('.auth-tab[data-auth="signup"]').click();
  check('signup tab is cloud-first', window.document.querySelector('#auth-submit').textContent === 'Crear cuenta en la nube');
  check('local option offered on signup', !window.document.querySelector('[data-auth-alt="local-signup"]').classList.contains('hidden'));
  window.document.querySelector('[data-auth-alt="local-signup"]').click();
  check('local signup mode via link', g('state.authMode') === 'signup-local' && window.document.querySelector('#auth-submit').textContent === 'Crear cuenta local');
  const errText = () => window.document.querySelector('#auth-err').textContent || '';
  const submit = () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  // ===== consentimiento informado (RGPD) + edad =====
  const consentBox = () => window.document.querySelector('#consent-box');
  check('consent section shown when signing up', consentBox() && !consentBox().classList.contains('hidden'));
  check('consent and age boxes start unchecked',
    window.document.querySelector('#consent-terms').checked === false
    && window.document.querySelector('#consent-age').checked === false);
  check('consent links to legal page', (consentBox().innerHTML || '').includes('legal.html#terminos')
    && (consentBox().innerHTML || '').includes('legal.html#privacidad'));
  window.document.querySelector('#auth-user').value = 'tester_01';
  window.document.querySelector('#auth-pass').value = 'local-pass-2026';
  submit();
  await tick(200);
  check('signup blocked without accepting terms', /Términos/.test(errText()) && g('currentUser') === null);
  window.document.querySelector('#consent-terms').checked = true;
  submit();
  await tick(200);
  check('signup blocked without age confirmation', /16 años/.test(errText()) && g('currentUser') === null);
  window.document.querySelector('#consent-age').checked = true;

  // weak password via UI
  window.document.querySelector('#auth-pass').value = 'abc';
  submit();
  await tick(400);
  check('short password rejected', /al menos|6/.test(errText()));

  // el mensaje promete guiones: un usuario con guion debe poder crearse
  g("signup('tester-02-pruebas','local-pass-2026')");
  await tick(600);
  check('local signup accepts hyphens in the username', g('currentUser') === 'tester-02-pruebas');
  g("logout()");
  await tick(100);

  // real signup via UI
  window.document.querySelector('#auth-pass').value = 'local-pass-2026';
  submit();
  await tick(600);
  check('signup logs in', g('currentUser') === 'tester_01');
  check('app shown after login', window.document.querySelector('#app').classList.contains('hidden') === false);
  check('a brand-new account lands on the three-step plan', !!window.document.querySelector('.onb-card') && g('state.onb.step') === 1);
  g("nav('#/workouts')");
  await tick(80);
  check('password stored as PBKDF2 hash', (() => {
    const users = g('JSON.stringify(Object.keys(db.users))');
    const u = g('db.users["tester_01"]');
    return !!u && !!u.salt && String(u.h).length === 64 && u.iter >= 100000;
  })());

  // ===== consentimiento registrado + minimización de datos =====
  const consentRec = JSON.parse(g('JSON.stringify(dataFor("tester_01").consent)') || 'null');
  check('consent recorded with version + timestamp', !!consentRec
    && consentRec.version === g('LEGAL_VERSION') && consentRec.terms === true
    && consentRec.age16 === true && !isNaN(Date.parse(consentRec.at)));
  check('consent also stored on the local user record', !!g('db.users["tester_01"].consent'));
  check('header masks the account identifier', (window.document.querySelector('#user-chip').textContent || '').includes('•••')
    && !(window.document.querySelector('#user-chip').textContent || '').includes('tester_01'));
  check('user menu head is masked too', (window.document.querySelector('#user-menu-head').textContent || '').includes('•••'));
  g('openChangePass()');
  check('change-password intro does not print the full account', !(window.document.querySelector('.modal').textContent || '').includes('tester_01'));
  g('closeModal()');
  check('consent boxes hidden outside signup', (() => {
    g("setAuthMode('login')");
    return window.document.querySelector('#consent-box').classList.contains('hidden')
      && !window.document.querySelector('#consent-terms').checked;
  })());

  // ===== captcha ALTCHA: solo al crear cuenta en la nube =====
  const captchaBox = () => window.document.querySelector('#captcha-box');
  g("setAuthMode('signup')");
  check('captcha section shown when creating a cloud account', captchaBox() && !captchaBox().classList.contains('hidden'));
  g("setAuthMode('signup-local')");
  check('captcha hidden for device-only accounts', captchaBox().classList.contains('hidden'));
  g("setAuthMode('login')");
  check('captcha hidden on login', captchaBox().classList.contains('hidden'));

  // sin el widget cargado, el registro se bloquea con un mensaje claro
  g(`(function(){
    window.__signupArgs = null;
    DrakoSB.signUp = async (m, p, c, proof) => { window.__signupArgs = { proof }; return 'stop-for-test'; };
  })()`);
  g("setAuthMode('signup')");
  window.document.querySelector('#auth-user').value = 'cloud@drakotrack.test';
  window.document.querySelector('#auth-pass').value = 'cloud-pass-2026';
  window.document.querySelector('#consent-terms').checked = true;
  window.document.querySelector('#consent-age').checked = true;
  submit();
  await tick(200);
  check('signup blocked when the captcha widget is unavailable', /anti-bots/.test(errText()) && g('window.__signupArgs') === null);

  // con el widget listo se monta solo y la prueba viaja en la petición
  g(`(function(){
    if(!customElements.get('altcha-widget')){
      customElements.define('altcha-widget', class extends HTMLElement {
        constructor(){ super(); this._state = 'unverified'; }
        getState(){ return this._state; }
        verify(){ this._state = 'verified'; return Promise.resolve({ payload: 'proof-' + 'x'.repeat(40) }); }
        reset(){ this._state = 'unverified'; }
      });
    }
    document.dispatchEvent(new Event('altcha-ready'));
  })()`);
  g("setAuthMode('signup')");
  check('captcha widget mounts inside the signup form', !!window.document.querySelector('#captcha-box altcha-widget'));
  submit();
  await tick(300);
  const sent = g('window.__signupArgs');
  check('cloud signup sends the ALTCHA proof', !!sent && /^proof-/.test(sent.proof));
  check('captcha is described as cookie-free', /cookies/.test(captchaBox().textContent || ''));
  const csp = (window.document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '';
  check('CSP allows the ALTCHA worker (blob + data fallback)',
    /worker-src[^;]*blob:/.test(csp) && /worker-src[^;]*data:/.test(csp)
    && /child-src[^;]*blob:/.test(csp));
  g("setAuthMode('login')");

  // login wrong password = generic error
  const err1 = await g(`login('tester_01','wrongpass')`);
  check('generic login error', /Usuario o contraseña incorrectos/.test(err1));
  const err2 = await g(`login('nosuchuser','wrongpass')`);
  check('no user leak (same message)', err1 === err2);
  const err3 = await g(`login('tester_01','local-pass-2026')`);
  check('correct password ok', err3 === null);

  // ===== la pestaña "Iniciar sesión" (abre por defecto) deja entrar =====
  g('currentUser = null; localStorage.removeItem(SESSION_KEY);');
  g("setAuthMode('login')");
  window.document.querySelector('#auth-user').value = 'tester_01';
  window.document.querySelector('#auth-pass').value = 'local-pass-2026';
  submit();
  await tick(600);
  check('default login tab signs a device account in', g('currentUser') === 'tester_01');
  check('login tab does not demand picking a mode first', !/Elige iniciar sesión/.test(errText()));

  // un correo en esa misma pestaña se resuelve contra la nube
  g('currentUser = null; localStorage.removeItem(SESSION_KEY);');
  g("setAuthMode('login')");
  g(`(function(){
    window.__origSignIn = DrakoSB.signIn;
    window.__signInArgs = null;
    DrakoSB.signIn = async (m, p) => { window.__signInArgs = { m, p }; return 'stop-for-test'; };
  })()`);
  window.document.querySelector('#auth-user').value = 'Entrenador@DrakoTrack.test';
  window.document.querySelector('#auth-pass').value = 'cloud-pass-2026';
  submit();
  await tick(400);
  const signInArgs = g('window.__signInArgs');
  check('an email on the login tab goes to the cloud sign-in', !!signInArgs && signInArgs.m === 'entrenador@drakotrack.test');
  g('DrakoSB.signIn = window.__origSignIn;');

  g("login('tester_01','local-pass-2026')");
  await tick(400);
  window.render();
  await tick(50);

  const mainHtml = () => window.document.querySelector('#main').innerHTML;
  const libStart = () => window.document.querySelectorAll('#main [data-action="start-session"]').length;
  check('library renders 6 cards with start buttons', libStart() === 6);

  // per-card hide (eye) removed — hiding is now section-level collapse
  check('eye hide button removed from library cards', !window.document.querySelector('[data-action="hide-lib"]'));

  // collapsible sections: hide all at once, not one at a time
  const libT = () => window.document.querySelector('[data-action="toggle-section"][data-section="lib"]');
  const bcT = () => window.document.querySelector('[data-action="toggle-section"][data-section="bc"]');
  check('both sections render collapse toggles', !!libT() && !!bcT());
  check('sections start expanded', !window.document.querySelector('#lib-body').classList.contains('hidden')
    && !window.document.querySelector('#bc-body').classList.contains('hidden'));
  const cardsBefore = libStart();
  libT().click();
  await tick(20);
  check('library collapses all cards at once', window.document.querySelector('#lib-body').classList.contains('hidden')
    && libStart() === cardsBefore);
  check('collapse sets aria-expanded=false', libT().getAttribute('aria-expanded') === 'false');
  check('collapse persisted to storage', (JSON.parse(g("localStorage.getItem('draktrack_ui_v1')") || '{}').lib || {}).collapsed === true);
  window.render();
  await tick(20);
  check('collapsed state survives re-render', window.document.querySelector('#lib-body').classList.contains('hidden'));
  libT().click();
  await tick(20);
  check('library expands again', !window.document.querySelector('#lib-body').classList.contains('hidden')
    && libT().getAttribute('aria-expanded') === 'true');
  bcT().click();
  await tick(20);
  check('boostcamp section collapses', window.document.querySelector('#bc-body').classList.contains('hidden'));
  bcT().click();
  await tick(20);
  check('boostcamp section expands again', !window.document.querySelector('#bc-body').classList.contains('hidden'));

  // erase flow via confirm modal
  const eraseBtn = window.document.querySelector('[data-action="erase-lib"]');
  const eraseId = eraseBtn.dataset.id;
  eraseBtn.click();
  await tick(20);
  const confirmDo = window.document.querySelector('[data-action="confirm-do"]');
  check('erase asks confirmation', !!confirmDo);
  confirmDo.click();
  await tick(50);
  check('erase recorded', JSON.parse(g('JSON.stringify(dataFor(currentUser).hiddenLib)')).includes(eraseId));
  window.document.querySelector('[data-action="open-hidden"]').click();
  await tick(20);
  check('hidden modal lists erased item for restore', (window.document.querySelector('#modal-root').innerHTML || '').includes('Restaurar'));
  window.document.querySelector('[data-action="restore-all-lib"]').click();
  await tick(50);

  // Boostcamp catalog on workouts page
  await tick(150);
  const bcCards = window.document.querySelectorAll('#bc-result .wcard').length;
  const bcTotal = g("bcCache.filter(p => p.ok !== false).length");
  check('bc catalog renders every program', bcCards === bcTotal && bcTotal >= 132);

  // search filter
  const search = window.document.querySelector('#bc-search');
  search.value = 'wendler';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  const filtered = window.document.querySelectorAll('#bc-result .wcard').length;
  check('bc search narrows results (wendler)', filtered >= 2 && filtered < bcTotal);
  search.value = 'nsuns';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));

  // categories by objective (chips)
  await g("bcFilter=''");
  await g("renderBCList()");
  const chips = () => [...window.document.querySelectorAll('#bc-cats .bc-chip')];
  check('5 category chips rendered (Todos + 4)', chips().length === 5);
  const chipCount = slug => parseInt(chips().find(c => c.dataset.cat === slug).querySelector('.chip-n').textContent, 10);
  const sumCats = ['hyper', 'strength', 'endurance', 'fitness'].reduce((a, k) => a + chipCount(k), 0);
  check('category counts cover the whole catalog', sumCats >= bcTotal);
  chips().find(c => c.dataset.cat === 'strength').click();
  await tick(50);
  check('strength chip active + filtered', window.document.querySelector('.bc-chip.active').dataset.cat === 'strength'
    && window.document.querySelectorAll('#bc-result .wcard').length === chipCount('strength'));
  chips().find(c => c.dataset.cat === 'endurance').click();
  await tick(50);
  check('endurance filter small list incl. hybrid', window.document.querySelectorAll('#bc-result .wcard').length === chipCount('endurance')
    && mainHtml().includes('boostcamp-hybrid-athlete-program'));
  chips().find(c => c.dataset.cat === 'fitness').click();
  await tick(50);
  check('fitness filter includes calisthenics', window.document.querySelectorAll('#bc-result .wcard').length === chipCount('fitness'));
  // search inside a category
  const s2 = window.document.querySelector('#bc-search');
  s2.value = 'bodyweight';
  s2.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick(50);
  check('search narrows inside category', window.document.querySelectorAll('#bc-result .wcard').length < chipCount('fitness'));
  s2.value = '';
  s2.dispatchEvent(new window.Event('input', { bubbles: true }));
  chips().find(c => c.dataset.cat === 'all').click();
  await tick(50);
  check('back to Todos shows every program', window.document.querySelectorAll('#bc-result .wcard').length === bcTotal);

  // open a program (nsuns: multiple variations, 4 days)
  window.nav('#/program/nsuns-linear-progression');
  await tick(250);
  const body = window.document.querySelector('#program-body').innerHTML;
  check('program page renders title/weeks', body.includes('Semana 1') && (body.includes('nSuns') || body.includes('Variación')));
  const startBtns = [...window.document.querySelectorAll('[data-action="start-prog-session"]')];
  check('4 day cards with start buttons', startBtns.length === 4);

  // start a program session
  startBtns[0].click();
  await tick(250);
  const sess = g('getSession(state.sessionId)');
  check('program session created', !!sess && sess.exercises.length === 2);
  check('sets prescription shown (8×65%)', mainHtml().includes('8×65%'));

  // complete every set of the session through the per-set UI
  let guardSets = 0;
  while(window.document.querySelector('[data-action="toggle-set"][aria-pressed="false"]') && guardSets++ < 80){
    const btn = window.document.querySelector('[data-action="toggle-set"][aria-pressed="false"]');
    const row = btn.closest('[data-set-item]');
    const w = row.querySelector('input[data-field="weight"]');
    const r = row.querySelector('input[data-field="reps"]');
    w.value = '100.5';
    w.dispatchEvent(new window.Event('input', { bubbles: true }));
    r.value = '8';
    r.dispatchEvent(new window.Event('input', { bubbles: true }));
    btn.click();
  }
  check('every set completed through the UI', g(`(function(){ const s = getSession(state.sessionId); return s.exercises.every(e => e.sets.every(st => st.completed)); })()`));
  check('per-set weight/reps persisted', g(`(function(){ const s = getSession(state.sessionId); return s.exercises.every(e => e.sets.every(st => st.weight === 100.5 && st.reps === 8)); })()`));
  const finBtn = window.document.querySelector('[data-action="finish-session"]');
  check('finish enabled at 100%', finBtn && finBtn.disabled === false);
  finBtn.click();
  await tick(50);
  check('session finished', g('getSession(state.sessionId).finished') === true);

  // history shows weights and reps
  const sessId = g('state.sessionId');
  window.nav('#/history');
  await tick(50);
  const histHtml = mainHtml();
  check('history lists the session', histHtml.includes('Sesión') || histHtml.includes('nSuns'));
  check('history shows weight 100.5 kg', histHtml.includes('100.5 kg'));
  check('history shows reps ×8', histHtml.includes('× 8'));

  // restart shows last-used chip with previous weight
  window.nav('#/session/' + sessId);
  await tick(50);
  const again = window.document.querySelector('[data-action="restart-session"]');
  again.click();
  await tick(50);
  const nsId = g('state.sessionId');
  check('restart created a new session', nsId && nsId !== sessId);
  window.nav('#/session/' + nsId);
  await tick(50);
  const chip = window.document.querySelector('.last-used');
  check('last-used chip present with previous weight', !!chip && /Anterior\s+100\.5/.test(chip.textContent || ''));

  // clamps: PR beyond cap rejected
  const beforePR = g('dataFor(currentUser).prs.length');
  g(`(function(){
    window.__d = document.createElement('div');
    __d.innerHTML = '<input id="prf-exercise" value="Press de banca"><input id="prf-date" value="2026-10-25"><input id="prf-weight" value="5000"><input id="prf-reps" value="5">';
    document.body.appendChild(__d);
    const b = document.createElement('button'); b.dataset.action='save-pr'; b.id='x'; document.body.appendChild(b);
  })()`);
  window.document.getElementById('x').click();
  await tick(50);
  check('PR weight > 1000 rejected', g('dataFor(currentUser).prs.length') === beforePR);

  // ===== password change without data loss =====
  const dataCount = () => g('dataFor("tester_01").sessions.length');
  const beforeSessions = dataCount(), beforePrs = g('dataFor("tester_01").prs.length');
  g('openChangePass()');
  check('change-password modal opens', !!window.document.querySelector('#cp-old'));
  // wrong current password → hash unchanged
  g(`(function(){
    document.querySelector('#cp-old').value = 'wrongcurrent';
    document.querySelector('#cp-new').value = 'changed-pass-2026';
    document.querySelector('#cp-new2').value = 'changed-pass-2026';
  })()`);
  await g('saveChangePass()');
  check('wrong current password rejected', /actual no es correcta/.test(window.document.querySelector('#cp-err').textContent || ''));
  // mismatched new passwords
  g(`(function(){
    document.querySelector('#cp-old').value = 'local-pass-2026';
    document.querySelector('#cp-new').value = 'changed-pass-2026';
    document.querySelector('#cp-new2').value = 'mismatch-pass-2026';
  })()`);
  await g('saveChangePass()');
  check('mismatched new passwords rejected', /no coinciden/.test(window.document.querySelector('#cp-err').textContent || ''));
  // short new password
  g(`(function(){
    document.querySelector('#cp-new').value = '123';
    document.querySelector('#cp-new2').value = '123';
  })()`);
  await g('saveChangePass()');
  check('short new password rejected', /al menos 12/.test(window.document.querySelector('#cp-err').textContent || ''));
  // successful change
  const hashBefore = g("db.users['tester_01'].h");
  g(`(function(){
    document.querySelector('#cp-old').value = 'local-pass-2026';
    document.querySelector('#cp-new').value = 'changed-pass-2026';
    document.querySelector('#cp-new2').value = 'changed-pass-2026';
  })()`);
  await g('saveChangePass()');
  await tick(100);
  check('change succeeds, modal closes', window.document.querySelector('#modal-root').innerHTML === '');
  check('hash rotated', g("db.users['tester_01'].h") !== hashBefore);
  check('old password no longer logs in', /incorrectos/.test(await g("login('tester_01','local-pass-2026')") || ''));
  check('login with new password works', await g("login('tester_01','changed-pass-2026')") === null);
  check('data untouched after change', dataCount() === beforeSessions && g('dataFor("tester_01").prs.length') === beforePrs);
  g("logout(); signup('pw_change','previous-pass-2026')");
  await tick(300);
  // ===== cloud change path (stubbed DrakoSB) =====
  g(`(function(){
    window.__sbCalls = [];
    DrakoSB.setSession({ access_token: 'at', refresh_token: 'rt', expires_at: null, user: { id: 'u-test', email: 'cloud@drakotrack.test' } });
    currentUser = 'cloud@drakotrack.test';
    localStorage.setItem(SESSION_KEY, currentUser);
    DrakoSB.changePassword = async (p, current) => {
      window.__sbCalls.push(['change', p, current]);
      return current === 'cloud-current-2026' ? null : 'La contraseña actual no es correcta.';
    };
  })()`);
  g('openChangePass()');
  check('cloud modal mentions cloud account', (window.document.querySelector('.modal').textContent || '').includes('nube'));
  g(`(function(){
    document.querySelector('#cp-old').value = 'wrong';
    document.querySelector('#cp-new').value = 'cloud-changed-2026';
    document.querySelector('#cp-new2').value = 'cloud-changed-2026';
  })()`);
  await g('saveChangePass()');
  check('cloud wrong current rejected by server-side reauthentication', /actual no es correcta/.test(window.document.querySelector('#cp-err').textContent || ''));
  check('cloud change request includes current password', JSON.parse(g('JSON.stringify(window.__sbCalls)')).some(c => c[0] === 'change' && c[2] === 'wrong'));
  g(`(function(){
    document.querySelector('#cp-old').value = 'cloud-current-2026';
  })()`);
  await g('saveChangePass()');
  await tick(100);
  check('cloud change called with new password after valid reauthentication', JSON.parse(g('JSON.stringify(window.__sbCalls)')).some(c => c[0] === 'change' && c[1] === 'cloud-changed-2026' && c[2] === 'cloud-current-2026'));
  check('cloud success closes modal', window.document.querySelector('#modal-root').innerHTML === '');

  // ===== JSON export from cloud account =====
  // local user: button hidden in menu
  // local user: export button now visible (every account can back up)
  g('renderHeader()');
  check('sb-export visible for local user (backup for everyone)', window.document.querySelector('#sb-export').classList.contains('hidden') === false);
  // stub: cloud row for loadData + capture downloads instead of real blob/click
  g(`(function(){
    const prev = window.fetch;
    window.__cloudDoc = { workouts: [{ id: 'w1', name: 'Test Cloud Workout', exercises: [] }], sessions: [], prs: [], weights: [], photo: null, hiddenLib: [] };
    window.fetch = async url => {
      const u = String(url);
      if (u.includes('/api/data/profile')) return { ok: true, json: async () => ({ data: window.__cloudDoc, updated_at: 't' }) };
      return prev(url);
    };
    window.__exported = null;
    DrakoShare.shareFile = (fn, text) => { window.__exported = { fn, text }; return Promise.resolve('downloaded'); };
  })()`);
  // sign in a cloud in-app session
  g(`(function(){
    DrakoSB.setSession({ access_token: 'at', refresh_token: 'rt', expires_at: null, user: { id: 'u-test', email: 'cloud@drakotrack.test' } });
    currentUser = 'cloud@drakotrack.test';
    localStorage.setItem(SESSION_KEY, currentUser);
    state.sb.timer = null;
  })()`);
  g('renderHeader()');
  check('sb-export visible for cloud user', window.document.querySelector('#sb-export').classList.contains('hidden') === false);
  // click the menu button end-to-end
  g("window.__clicked = false;");
  window.document.querySelector('#sb-export').addEventListener('click', () => g("window.__clicked = true"));
  window.document.querySelector('#sb-export').click();
  await tick(120);
  check('menu button triggers export', g('window.__clicked') === true && !!g('window.__exported'));
  const exported = JSON.parse(g('window.__exported.text'));
  check('export pulls the CLOUD copy', exported.source === 'cloud');
  check('export carries account + full doc', exported.account === 'cloud@drakotrack.test' && exported.app === 'DrakoTrack' && exported.kind === 'full-export' && exported.data.workouts[0].name === 'Test Cloud Workout');
  check('export filename is account/date based', /drakotrack-cloud-drakotrack-test-\d{4}-\d{2}-\d{2}\.json/.test(g('window.__exported.fn')));
  // offline fallback: cloud session but server unreachable → local copy exported
  g(`(function(){
    const prev = window.fetch;
    window.fetch = async url => { if (String(url).includes('/api/data/profile')) throw new Error('offline'); return prev(url); };
  })()`);
  g("window.__exported = null;");
  await g(`exportCloudJSON()`);
  await tick(120);
  check('export falls back to local copy when cloud unreachable', g('window.__exported && JSON.parse(window.__exported.text).source') === 'local');

  // ===== local export (non-cloud account) =====
  g(`(function(){
    DrakoSB.setSession(null);
    currentUser = 'pw_change';
    localStorage.setItem(SESSION_KEY, currentUser);
    window.__exported = null;
  })()`);
  await g('exportCloudJSON()');
  await tick(120);
  check('local user export works (source local)', g('window.__exported && JSON.parse(window.__exported.text).source') === 'local');
  check('local export carries account name', g('window.__exported && JSON.parse(window.__exported.text).account') === 'pw_change');

  // ===== bi-weekly backup reminder =====
  g("window.__toasts = []; window.__origToast = toast; toast = function(){ window.__toasts.push([].slice.call(arguments)); };");
  g('localStorage.removeItem(BACKUP_REMINDER_KEY)');
  g('maybeBackupReminder()');
  check('first run sets baseline without toast', g('window.__toasts.length') === 0
    && parseInt(g("localStorage.getItem(BACKUP_REMINDER_KEY)"), 10) > Date.now());
  g("localStorage.setItem(BACKUP_REMINDER_KEY, String(Date.now() - 1000))");
  g('render();');
  await tick(30);
  check('overdue reminder fires on render', g('window.__toasts.some(t => /Recordatorio/.test(String(t[0])))') === true);
  check('reminder reschedules ~14 days', parseInt(g("localStorage.getItem(BACKUP_REMINDER_KEY)"), 10) > Date.now() + 13 * 864e5);
  const toastCount = g('window.__toasts.length');
  g('render();');
  await tick(30);
  check('reminder does not fire again right away', g('window.__toasts.length') === toastCount);
  g("localStorage.setItem(BACKUP_REMINDER_KEY, String(Date.now() - 1000)); noteBackupDone();");
  check('backup action resets the clock', parseInt(g("localStorage.getItem(BACKUP_REMINDER_KEY)"), 10) > Date.now() + 13 * 864e5);
  g('toast = window.__origToast;');

  // ===== accesibilidad: teclado, etiquetas, regiones vivas =====
  check('skip link present and points to main', (() => {
    const a = window.document.querySelector('.skip-link');
    return !!a && a.getAttribute('href') === '#main';
  })());
  check('main is focusable for skip navigation', window.document.querySelector('#main').getAttribute('tabindex') === '-1');
  check('toasts are announced (status / alert per type)', (() => {
    window.document.querySelector('#toast-root').innerHTML = '';
    g("toast('ok')");
    g("toast('mal','error')");
    const nodes = [...window.document.querySelectorAll('#toast-root .toast')];
    return nodes.length === 2 && nodes[0].getAttribute('role') === 'status' && nodes[1].getAttribute('role') === 'alert';
  })());
  check('auth errors announced as alerts', window.document.querySelector('#auth-err').getAttribute('role') === 'alert');
  g("nav('#/history')");
  await tick(80);
  const currentNav = window.document.querySelector('.sidebar .nav-btn.active');
  check('nav marks the current page', !!currentNav && currentNav.getAttribute('aria-current') === 'page'
    && currentNav.dataset.route === 'history');
  check('nav landmarks are labelled', (window.document.querySelector('#sidebar').getAttribute('aria-label') || '').length > 3
    && (window.document.querySelector('#bottomnav').getAttribute('aria-label') || '').length > 3);
  check('user chip exposes menu state', window.document.querySelector('#user-chip').getAttribute('aria-expanded') === 'false'
    && window.document.querySelector('#user-chip').getAttribute('aria-controls') === 'user-menu');
  g("nav('#/workouts')");
  await tick(100);
  check('icon-only buttons have accessible names', (() => {
    const icons = [...window.document.querySelectorAll('.icon-btn')];
    return icons.length > 0 && icons.every(b => (b.getAttribute('aria-label') || '').length > 5);
  })());
  check('exercise checkboxes have accessible names', (() => {
    const s = [...window.document.querySelectorAll('.check input[type=checkbox]')];
    return s.length === 0 || s.every(i => (i.getAttribute('aria-label') || '').length > 5);
  })());
  check('modal is a labelled dialog', (() => {
    g('openChangePass()');
    const m = window.document.querySelector('.modal');
    return !!m && m.getAttribute('role') === 'dialog' && m.getAttribute('aria-modal') === 'true'
      && m.getAttribute('aria-labelledby') === 'modal-title' && !!window.document.querySelector('#modal-title');
  })());
  g('closeModal()');
  const beforeDialog = window.document.querySelector('#theme-btn');
  beforeDialog.focus();
  g('openChangePass()');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  check('Escape closes the dialog and restores focus',
    window.document.querySelector('#modal-root').innerHTML === ''
    && window.document.activeElement === beforeDialog);
  check('Tab is trapped inside the dialog', (() => {
    g('openDeleteAccount()');
    const modal = window.document.querySelector('.modal');
    const items = [...modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden])')];
    const last = items[items.length - 1];
    last.focus();
    modal.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    const moved = window.document.activeElement;
    g('closeModal()');
    return moved && moved !== last && modal.contains(moved);
  })());
  check('data deletion option is reachable from the menu', !!window.document.querySelector('[data-action="open-delete-account"]'));
  check('menu links to the legal page', !!window.document.querySelector('#user-menu a[href="legal.html"]'));
  g("(function(){const d=dataFor('pw_change'); d.weights=[{id:'wa',date:'2026-01-01',weight:80},{id:'wb',date:'2026-01-15',weight:78}]; saveDB();})()");
  g("nav('#/weight')");
  await tick(80);
  const chartSvg = window.document.querySelector('#w-chart svg');
  const chartLabel = chartSvg ? chartSvg.getAttribute('aria-label') || '' : '';
  check('chart exposes a data summary as its text alternative', /2 registros/.test(chartLabel)
    && /80 kg/.test(chartLabel) && /78 kg/.test(chartLabel) && chartSvg.getAttribute('role') === 'img');
  g("nav('#/workouts')");
  await tick(80);
  const decoSvg = window.document.querySelector('.wcard-emoji svg');
  check('decorative workout icon hidden from screen readers', !!decoSvg && decoSvg.getAttribute('aria-hidden') === 'true');

  // ===== contraste AA de los colores de texto =====
  const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
  const blockOf = sel => {
    const i = css.indexOf(sel);
    if (i < 0) return '';
    const start = css.indexOf('{', i) + 1;
    return css.slice(start, css.indexOf('}', start));
  };
  const token = (block, name) => {
    const m = block.match(new RegExp('--' + name + ':\\s*([^;]+);'));
    return m ? m[1].trim() : null;
  };
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = hex => {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    return 0.2126 * lin(parseInt(h.slice(0, 2), 16)) + 0.7152 * lin(parseInt(h.slice(2, 4), 16)) + 0.0722 * lin(parseInt(h.slice(4, 6), 16));
  };
  const contrast = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  for (const [name, sel] of [['dark', ':root{'], ['light', ':root[data-theme="light"]{']]) {
    const blk = blockOf(sel);
    const pairs = [
      ['text', token(blk, 'text')], ['muted', token(blk, 'muted')], ['muted-2', token(blk, 'muted-2')],
      ['accent-text', token(blk, 'accent-text')], ['danger-text', token(blk, 'danger-text')],
    ];
    const panel = token(blk, 'panel');
    const bg = token(blk, 'bg');
    for (const [tok, val] of pairs) {
      const r1 = contrast(val, panel), r2 = contrast(val, bg);
      check(`contrast ${name} --${tok} on panel/bg >= 4.5 (${r1.toFixed(1)}/${r2.toFixed(1)})`, r1 >= 4.5 && r2 >= 4.5);
    }
  }

  // ===== página legal =====
  const legalHtml = fs.readFileSync(path.join(__dirname, 'legal.html'), 'utf8');
  for (const id of ['titular', 'privacidad', 'cookies', 'terceros', 'menores', 'derechos', 'terminos', 'licencias', 'accesibilidad']) {
    check('legal page has section #' + id, new RegExp('id="' + id + '"').test(legalHtml));
  }
  check('privacy policy names purposes, bases and rights', /art\. 9 de la Ley 18\.331/.test(legalHtml) && /art\. 18 de la Ley 18\.331/.test(legalHtml)
    && /portabilidad/.test(legalHtml) && /Unidad Reguladora y de Control de Datos Personales/.test(legalHtml));
  check('terms include health disclaimer and governing law', /no es un servicio médico/.test(legalHtml) && /legislación uruguaya/.test(legalHtml));
  check('owner details are filled in (no pending placeholders)', /Ignacio Benitez/.test(legalHtml) && /Drako Gym/.test(legalHtml)
    && /Ciudad de la Costa/.test(legalHtml) && /Canelones/.test(legalHtml) && !/legal-todo/.test(legalHtml)
    && !/Pendiente de completar/.test(legalHtml));
  check('third-party audit lists every provider and rules out trackers', /Supabase/.test(legalHtml) && /Vercel/.test(legalHtml)
    && /Google Fonts/.test(legalHtml) && /Sin Google Analytics/.test(legalHtml));
  check('licenses cover font, logo, icons and program data', /SIL Open Font License/.test(legalHtml) && /Boostcamp/.test(legalHtml)
    && /logo/i.test(legalHtml) && /Iconos/.test(legalHtml));
  check('legal page has no inline scripts (CSP-safe)', !/<script(?![^>]*\bsrc=)/i.test(legalHtml));
  check('index links to privacy and terms', /legal\.html#privacidad/.test(html) && /legal\.html#terminos/.test(html));
  check('contact email is published and linked', /mailto:mn\.manzur@protonmail\.com/.test(legalHtml) && /mailto:mn\.manzur@protonmail\.com/.test(html)
    && /mn\.manzur@protonmail\.com/.test(legalHtml));
  check('CSP keeps scripts self-hosted and framing blocked', (() => {
    const vj = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
    const csp = vj.headers.find(h => h.source === '/(.*)').headers.find(x => x.key === 'Content-Security-Policy').value;
    return /script-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp) && !/unsafe-inline/.test(csp.split('style-src')[0]);
  })());

  // ===== eliminación de cuenta (derecho de supresión) =====
  g("logout();");
  await g("signup('borrar_me','local-delete-2026')");
  g('render()');
  g("(function(){const d=dataFor('borrar_me'); d.weights.push({id:'wz',date:'2026-01-02',weight:81}); saveDB();})()");
  window.document.querySelector('[data-action="open-delete-account"]').click();
  await tick(80);
  const delModalText = window.document.querySelector('.modal').textContent || '';
  check('delete modal explains what is erased', /historial/i.test(delModalText) && /irreversible/i.test(delModalText));
  check('delete modal offers a JSON backup first', !!window.document.querySelector('.modal [data-action="sb-export"]'));
  check('delete requires typed confirmation', window.document.querySelector('#del-go').disabled === true);
  const delInput = window.document.querySelector('#del-confirm');
  delInput.value = 'eliminar';
  delInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('typing ELIMINAR enables the destructive button', window.document.querySelector('#del-go').disabled === false);
  window.document.querySelector('#del-go').click();
  await tick(250);
  check('local account and data are gone', g("!db.users['borrar_me']") && g("!db.data['borrar_me']") && g('currentUser') === null);
  check('deletion is persisted to storage', !String(g("localStorage.getItem('draktrack_v1')")).includes('borrar_me'));
  check('back to the auth screen after deletion', window.document.querySelector('#auth-screen').classList.contains('hidden') === false);

  // cloud deletion calls the RPC (stubbed) and clears local cache
  g(`(function(){
    window.__deletedCloud = 0;
    DrakoSB.setSession({ access_token:'at', refresh_token:'rt', expires_at:null, user:{ id:'u-del', email:'borrar@drakotrack.test' } });
    currentUser = 'borrar@drakotrack.test';
    localStorage.setItem(SESSION_KEY, currentUser);
    DrakoSB.deleteAccount = async () => { window.__deletedCloud++; DrakoSB.setSession(null); return null; };
  })()`);
  g('render()');
  window.document.querySelector('[data-action="open-delete-account"]').click();
  await tick(80);
  const delInput2 = window.document.querySelector('#del-confirm');
  delInput2.value = 'ELIMINAR';
  delInput2.dispatchEvent(new window.Event('input', { bubbles: true }));
  window.document.querySelector('#del-go').click();
  await tick(250);
  check('cloud deletion calls deleteAccount', g('window.__deletedCloud') === 1);
  check('cloud account and local cache removed', g("!db.data['borrar@drakotrack.test']") && g('currentUser') === null);
  check('cloud account deletion leaves other accounts intact', g("!!db.users['tester_01']") || g("!!db.users['pw_change']"));

  // ===== modelo de series individuales (aceptación) =====
  // la sección anterior deja la app sin sesión: se vuelve a entrar como cuenta local
  g(`(function(){ closeModal(); currentUser = 'sets_tester'; dataFor(currentUser); localStorage.setItem(SESSION_KEY, currentUser); saveDB(); })()`);
  window.render();
  await tick(60);
  const sid2 = g('startOrGetSession(LIBRARY[0].id).id');
  window.nav('#/session/' + sid2);
  await tick(60);
  const setCount = () => g(`getSession('${sid2}').exercises[0].sets.length`);
  const baseCount = setCount();
  window.document.querySelector('[data-ex-block] [data-action="add-set"]').click();
  await tick(40);
  check('add-set appends a set', setCount() === baseCount + 1);
  check('new set is not marked completed', g(`getSession('${sid2}').exercises[0].sets.slice(-1)[0].completed`) === false);
  window.document.querySelectorAll('[data-ex-block] [data-action="duplicate-set"]')[1].click();
  await tick(40);
  check('duplicate-set inserts a copy', setCount() === baseCount + 2);
  window.document.querySelectorAll('[data-ex-block] [data-action="delete-set"]')[0].click();
  await tick(40);
  check('delete-set removes one set', setCount() === baseCount + 1);
  check('sets stay renumbered from 1', g(`getSession('${sid2}').exercises[0].sets.map(st => st.number).join(',')`) === Array.from({length: baseCount + 1}, (_, i) => i + 1).join(','));

  // two sets of the same exercise hold independent values
  const setRowsOf = () => [...window.document.querySelectorAll('[data-ex-block]')[0].querySelectorAll('.set-row')];
  let rr = setRowsOf();
  const w0 = rr[0].querySelector('input[data-field="weight"]');
  const w1 = rr[1].querySelector('input[data-field="weight"]');
  w0.value = '60'; w0.dispatchEvent(new window.Event('input', { bubbles: true }));
  w1.value = '70'; w1.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('each set keeps its own weight', g(`(function(){ const s = getSession('${sid2}').exercises[0].sets; return s[0].weight === 60 && s[1].weight === 70; })()`));

  // el marcado de superset de la UI anterior sigue disponible
  let supBtn = window.document.querySelector('[data-ex-block] [data-action="toggle-superset"]');
  check('superset toggle available per exercise', !!supBtn);
  if(supBtn){
    supBtn.click();
    await tick(40);
    check('superset toggle marks the exercise', g(`getSession('${sid2}').exercises[0].superset`) === true);
    check('superset chip rendered on the block', /SUPERSET/.test(window.document.querySelector('[data-ex-block]').innerHTML));
    supBtn = window.document.querySelector('[data-ex-block] [data-action="toggle-superset"]');
    supBtn.click();
    await tick(40);
    check('superset toggle can be undone', g(`getSession('${sid2}').exercises[0].superset`) === false);
  }

  // optional RIR/RPE/type/notes on a single set
  const set0 = window.document.querySelector('[data-ex-block] [data-set-item] select[data-field="rir"]');
  set0.value = '2';
  set0.dispatchEvent(new window.Event('change', { bubbles: true }));
  const set0rpe = window.document.querySelector('[data-ex-block] [data-set-item] select[data-field="rpe"]');
  set0rpe.value = '8';
  set0rpe.dispatchEvent(new window.Event('change', { bubbles: true }));
  const set0type = window.document.querySelector('[data-ex-block] [data-set-item] select[data-field="type"]');
  set0type.value = 'warmup';
  set0type.dispatchEvent(new window.Event('change', { bubbles: true }));
  const set0note = window.document.querySelector('[data-ex-block] [data-set-item] input[data-field="notes"]');
  set0note.value = 'calentamiento';
  set0note.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('RIR, RPE, tipo y nota se guardan por serie', g(`(function(){ const st = getSession('${sid2}').exercises[0].sets[0]; return st.rir === 2 && st.rpe === 8 && st.type === 'warmup' && st.notes === 'calentamiento'; })()`));

  // warm-up sets never count as effective work
  g(`(function(){ const s = getSession('${sid2}'); s.exercises[0].sets.forEach(st => { st.completed = true; if(st.weight === '') st.weight = 50; if(st.reps === '') st.reps = 10; }); saveDB(); })()`);
  window.nav('#/session/' + sid2);
  await tick(50);
  window.document.querySelector('[data-action="finish-session"]').click();
  await tick(60);
  if(g(`getSession('${sid2}').finished`) !== true){
    const modalBtns = [...window.document.querySelectorAll('.modal button')];
    const go = modalBtns.find(b => /terminar|confirmar|s[ií]/i.test(b.textContent || ''));
    if(go){ go.click(); await tick(80); }
  }
  check('confirming finishes a session with pending sets', g(`getSession('${sid2}').finished`) === true);
  const rep = g(`(function(){ const s = getSession('${sid2}'); const sm = s.summary || {};
    const all = s.exercises.flatMap(e => e.sets || []);
    const counted = all.filter(st => st.completed && st.type !== 'warmup');
    return { warmup: sm.warmupSets, effective: sm.setsEffective, volume: sm.volume,
      expected: Math.round(counted.reduce((a, st) => a + (Number(st.weight) || 0) * (Number(st.reps) || 0), 0) * 10) / 10,
      warmupExpected: all.filter(st => st.completed && st.type === 'warmup').length,
      effectiveExpected: counted.length, setsTotal: all.length }; })()`);
  check('summary separates warm-up from effective sets',
    rep.warmup === rep.warmupExpected && rep.effective === rep.effectiveExpected && rep.warmup >= 1);
  check('summary volume uses completed effective sets only', Math.abs(rep.volume - rep.expected) < 0.05);

  // legacy sessions (no sets array) stay readable and are never invented into sets
  g(`(function(){ const d = dataFor(currentUser);
    d.sessions.push({ id: 'legacy_sess', workoutId: 'w-legacy', workoutName: 'Rutina antigua', date: '2026-01-05',
      finished: true, exercises: [{ id: 'le1', name: 'Press banca', weight: 80, reps: 6, done: true, targetSets: 3 }] });
    saveDB(); })()`);
  window.nav('#/history');
  await tick(60);
  const legacyHtml = mainHtml();
  check('legacy session listed in history', legacyHtml.includes('Rutina antigua'));
  check('legacy values preserved verbatim', legacyHtml.includes('80 kg') && legacyHtml.includes('× 6'));
  check('legacy record marked as inherited, not expanded', legacyHtml.includes('heredado'));
  check('no invented sets for legacy sessions', g(`(function(){ const s = getSession('legacy_sess'); return !s.exercises[0].sets; })()`));

  // an interrupted session is offered for resuming
  g(`(function(){ const s = startOrGetSession(LIBRARY[1].id); s.status = 'paused'; saveDB(); })()`);
  window.nav('#/workouts');
  await tick(60);
  check('interrupted session offers a resume card', /Continuar/.test(mainHtml()) && /sin terminar|pausada/i.test(mainHtml()));

  // ===== PROMPT 2: biblioteca de ejercicios =====
  g(`(function(){ closeModal(); currentUser = 'lib_tester'; dataFor(currentUser); localStorage.setItem(SESSION_KEY, currentUser); saveDB(); })()`);
  window.render();
  await tick(60);

  check('catalog has stable ids, group and equipment', g(`(function(){ return EXERCISE_CATALOG.length >= 40 && EXERCISE_CATALOG.every(x => x.id && x.name && x.group && x.equip && Array.isArray(x.aliases)); })()`));
  check('catalog ids are unique', g(`(function(){ const s = new Set(EXERCISE_CATALOG.map(x => x.id)); return s.size === EXERCISE_CATALOG.length; })()`));
  check('alias resolves to the same stable id', g(`(function(){ const d = dataFor(currentUser); return resolveExerciseId('RDL', d) === 'peso-muerto-rumano' && resolveExerciseId('peso muerto rumano', d) === 'peso-muerto-rumano' && resolveExerciseId('bench press', d) === 'press-de-banca'; })()`));
  check('search ignores accents, case and punctuation', g(`(function(){ const d = dataFor(currentUser); return resolveExerciseId('JALÓN AL PECHO', d) === 'jalon-al-pecho' && resolveExerciseId('jalon', d) === 'jalon-al-pecho'; })()`));
  check('an unknown name still gets a deterministic id', g(`(function(){ const d = dataFor(currentUser); return resolveExerciseId('Press banca pausa', d) === resolveExerciseId('press  BANCA, pausa', d) && resolveExerciseId('Press banca pausa', d).indexOf('custom:') === 0; })()`));

  // página de biblioteca con filtros combinables
  window.nav('#/library');
  await tick(80);
  check('library page lists the whole catalog', /Biblioteca de ejercicios/.test(mainHtml()) && window.document.querySelectorAll('#lib-list .ex-pick').length >= 40);
  const libSearch = window.document.querySelector('#lib-search');
  libSearch.value = 'bench press';
  libSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick(30);
  check('alias search finds the exercise', window.document.querySelectorAll('#lib-list .ex-pick').length === 1 && /Press de banca/.test(window.document.querySelector('#lib-list').textContent));
  const libGroup = window.document.querySelector('#lib-group');
  libGroup.value = 'piernas';
  libGroup.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick(30);
  check('group filter excludes exercises from other groups', window.document.querySelectorAll('#lib-list .ex-pick').length === 0);
  libSearch.value = '';
  libSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick(30);
  const legsCount = window.document.querySelectorAll('#lib-list .ex-pick').length;
  const libEquip = window.document.querySelector('#lib-equip');
  libEquip.value = 'maquina';
  libEquip.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick(30);
  const legsMachine = window.document.querySelectorAll('#lib-list .ex-pick').length;
  check('equipment filter narrows the list further', legsCount > 6 && legsMachine > 0 && legsMachine < legsCount);

  // ejercicio propio con alias
  window.document.querySelector('[data-action="custom-ex-new"]').click();
  await tick(60);
  check('custom exercise form opens', !!window.document.querySelector('#cex-name'));
  const cexName = window.document.querySelector('#cex-name');
  cexName.value = 'Press banca con pausa';
  cexName.dispatchEvent(new window.Event('input', { bubbles: true }));
  window.document.querySelector('#cex-group').value = 'pecho';
  const cexAliases = window.document.querySelector('#cex-aliases');
  cexAliases.value = 'banca pausa, pause bench';
  cexAliases.dispatchEvent(new window.Event('input', { bubbles: true }));
  window.document.querySelector('[data-action="custom-ex-save"]').click();
  await tick(80);
  const customId = g(`(function(){ const x = userExercises(dataFor(currentUser)).find(e => e.name === 'Press banca con pausa'); return x ? x.id : ''; })()`);
  check('custom exercise saved with its own id', customId.indexOf('custom:') === 0);
  check('its alias is searchable', g(`filterExercises(dataFor(currentUser), 'pause bench', '', '').some(x => x.id === '${customId}')`));
  window.document.querySelector('#lib-group').value = '';
  window.document.querySelector('#lib-group').dispatchEvent(new window.Event('change', { bubbles: true }));
  window.document.querySelector('#lib-equip').value = '';
  window.document.querySelector('#lib-equip').dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick(30);
  check('it appears in the library list', [...window.document.querySelectorAll('#lib-list .ex-pick')].some(x => /Press banca con pausa/.test(x.textContent) && /propio/.test(x.textContent)));

  // editor: selector con filtros
  window.nav('#/editor/new');
  await tick(80);
  window.document.querySelector('[data-action="add-ex"]').click();
  await tick(60);
  check('picker opens with search and both filters', !!window.document.querySelector('#exp-search') && !!window.document.querySelector('#exp-group') && !!window.document.querySelector('#exp-equip'));
  const expSearch = window.document.querySelector('#exp-search');
  expSearch.value = 'RDL';
  expSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick(30);
  check('alias filter works inside the picker', window.document.querySelectorAll('#exp-list .ex-pick').length === 1 && /Peso muerto rumano/.test(window.document.querySelector('#exp-list').textContent));
  window.document.querySelector('#exp-list [data-action="pick-ex"]').click();
  await tick(50);
  check('picked exercise becomes a row with its id', g(`(function(){ const e = state.editor.exercises[0]; return e.exId === 'peso-muerto-rumano' && e.name === 'Peso muerto rumano'; })()`));
  check('row shows group and equipment', /Piernas · Barra/.test(window.document.querySelector('.ex-row-edit').textContent));

  window.document.querySelector('[data-action="add-ex"]').click();
  await tick(50);
  const exp2 = window.document.querySelector('#exp-search');
  exp2.value = 'press de banca';
  exp2.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick(30);
  window.document.querySelector('#exp-list [data-action="pick-ex"]').click();
  await tick(50);
  check('editor holds both exercises', g('state.editor.exercises.length') === 2);

  const restInput = window.document.querySelector('.ex-row-edit input[data-field="rest"]');
  restInput.value = '150';
  restInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('rest target is stored on the row', g('state.editor.exercises[0].rest') === 150);

  window.document.querySelectorAll('[data-action="ex-down"]')[0].click();
  await tick(40);
  check('ex-down moves the exercise down', g('state.editor.exercises[0].exId') === 'press-de-banca');
  window.document.querySelectorAll('[data-action="ex-up"]')[1].click();
  await tick(40);
  check('ex-up restores the order', g('state.editor.exercises[0].exId') === 'peso-muerto-rumano');
  window.document.querySelectorAll('[data-action="dup-ex"]')[0].click();
  await tick(40);
  check('duplicate copies the exercise right below', g('state.editor.exercises.length') === 3 && g('state.editor.exercises[1].exId') === 'peso-muerto-rumano');
  check('duplicate gets a fresh row id', g('state.editor.exercises[0].id !== state.editor.exercises[1].id'));
  window.document.querySelectorAll('[data-action="del-ex"]')[1].click();
  await tick(40);
  check('delete removes the duplicate', g('state.editor.exercises.length') === 2);

  const nameBox = window.document.querySelectorAll('.ex-row-edit textarea')[0];
  nameBox.value = 'PM rumano (día pesado)';
  nameBox.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('renaming keeps the stable id', g('state.editor.exercises[0].exId') === 'peso-muerto-rumano');

  const edName = window.document.querySelector('#ed-name');
  edName.value = 'Rutina biblioteca';
  edName.dispatchEvent(new window.Event('input', { bubbles: true }));
  window.document.querySelector('[data-action="save-workout"]').click();
  await tick(140);
  const savedW = g(`(function(){ const w = dataFor(currentUser).workouts.find(x => x.name === 'Rutina biblioteca'); return w ? { exId: w.exercises[0].exId, rest: w.exercises[0].rest, name: w.exercises[0].name, n: w.exercises.length } : null; })()`);
  check('workout saves ids, rest and the new name', !!savedW && savedW.exId === 'peso-muerto-rumano' && savedW.rest === 150 && savedW.n === 2 && savedW.name === 'PM rumano (día pesado)');

  // migración: datos antiguos se etiquetan sin cambiar nada
  const mig = g(`(function(){ const d = dataFor(currentUser);
    d.workouts.push({ id:'w-legacy-2', name:'Antigua', exercises:[{ id:'x1', name:'Press banca', sets:3, reps:10, weight:60 }] });
    d.prs.push({ id:'pr-legacy', exercise:'Press banca', date:'2026-01-01', weight:80, reps:5 });
    migrateExerciseIds(d);
    const e = d.workouts[d.workouts.length-1].exercises[0];
    const p = d.prs.find(x => x.id === 'pr-legacy');
    return { exId: e.exId, sets: e.sets, name: e.name, weight: e.weight, prId: p.exId };
  })()`);
  check('legacy exercises get a stable id on migration', mig.exId === 'press-de-banca');
  check('migration keeps name, sets and weight untouched', mig.name === 'Press banca' && mig.sets === 3 && mig.weight === 60);
  check('legacy PRs get the same stable id', mig.prId === 'press-de-banca');

  // borrar un ejercicio propio no toca los entrenamientos que lo usan
  window.nav('#/library');
  await tick(80);
  const customRow = [...window.document.querySelectorAll('#lib-list .ex-pick')].find(x => /Press banca con pausa/.test(x.textContent));
  check('custom exercise is listed with the "propio" tag', !!customRow && /propio/.test(customRow.textContent));
  customRow.querySelector('[data-action="custom-ex-del"]').click();
  await tick(60);
  window.document.querySelector('[data-action="confirm-do"]').click();
  await tick(80);
  check('custom exercise can be deleted from the library', g(`!userExercises(dataFor(currentUser)).some(x => x.id === '${customId}')`));
  check('workouts keep their data after deleting the custom exercise', g(`!!dataFor(currentUser).workouts.find(w => w.name === 'Rutina biblioteca')`));

  // ===== PROMPT 3: descanso persistente, historial por serie y superseries =====
  g(`(function(){ closeModal(); currentUser = 'timer_tester'; dataFor(currentUser); localStorage.setItem(SESSION_KEY, currentUser); saveDB(); })()`);
  window.render();
  await tick(60);
  const tid = g(`(function(){ const d = dataFor(currentUser);
    d.workouts.push({ id:'w-rest', name:'Rutina descanso', exercises:[
      { id:'wx1', name:'Sentadilla trasera', exId:'sentadilla-trasera', sets:2, reps:5, weight:60, rest:120, superset:false },
      { id:'wx2', name:'Press de banca', exId:'press-de-banca', sets:2, reps:5, weight:50, rest:90, superset:false }
    ] });
    saveDB();
    return startOrGetSession('w-rest').id; })()`);
  window.nav('#/session/' + tid);
  await tick(80);
  check('the session inherits the planned rest', g(`getSession('${tid}').exercises[0].rest`) === 120);
  check('no rest timer runs before the first set', !g(`getSession('${tid}').rest`) && !window.document.querySelector('#rest-time'));

  // completar una serie arranca el descanso planificado
  window.document.querySelectorAll('[data-ex-block]')[0].querySelector('[data-action="toggle-set"]').click();
  await tick(60);
  const rest1 = g(`getSession('${tid}').rest`);
  check('completing a set starts the rest timer', !!rest1 && rest1.duration === 120);
  check('the timer ends in the future', !!rest1 && rest1.endsAt > Date.now() + 100000);
  check('the rest bar shows a countdown', !!window.document.querySelector('#rest-time') && /^2:00$|^1:59$/.test(window.document.querySelector('#rest-time').textContent.trim()));

  window.document.querySelector('[data-action="rest-plus"]').click();
  await tick(40);
  const afterPlus = g(`Math.round(getSession('${tid}').rest.endsAt - Date.now()) / 1000`);
  check('+15 s extends the rest', afterPlus > 130 && afterPlus <= 137);
  window.document.querySelector('[data-action="rest-minus"]').click();
  await tick(40);
  const afterMinus = g(`Math.round(getSession('${tid}').rest.endsAt - Date.now()) / 1000`);
  check('-15 s shortens the rest', afterMinus < afterPlus - 10 && afterMinus > 110);

  // recarga: el temporizador se retoma porque se guarda con hora de fin absoluta
  const endsBefore = g(`getSession('${tid}').rest.endsAt`);
  window.render();
  await tick(60);
  check('the rest timer survives a reload', !!window.document.querySelector('#rest-time') && g(`getSession('${tid}').rest.endsAt`) === endsBefore);
  check('the timer is actually persisted in storage',
    g(`JSON.parse(localStorage.getItem('draktrack_v1')).data['timer_tester'].sessions.find(s => s.id === '${tid}').rest.endsAt`) === endsBefore);

  window.document.querySelector('[data-action="rest-skip"]').click();
  await tick(40);
  check('skip clears the timer', !g(`getSession('${tid}').rest`) && !window.document.querySelector('#rest-time'));

  // un temporizador caducado se muestra terminado, nunca en negativo
  g(`(function(){ const s = getSession('${tid}'); s.rest = { startedAt: Date.now()-130000, duration: 120, endsAt: Date.now()-10000 }; saveDB(); })()`);
  window.nav('#/workouts');
  await tick(40);
  window.nav('#/session/' + tid);
  await tick(60);
  check('an expired timer shows as finished', /Descanso completado/.test(window.document.querySelector('#rest-slot').textContent || ''));
  g(`(function(){ const s = getSession('${tid}'); s.rest = null; saveDB(); })()`);

  // historial por serie de la sesión anterior
  g(`(function(){ const d = dataFor(currentUser);
    d.sessions.push({ id:'sess-prev', workoutId:'w-rest', workoutName:'Rutina descanso', date:'2026-01-01',
      startedAt:'2026-01-01T10:00:00.000Z', finishedAt:'2026-01-01T10:40:00.000Z', finished:true, status:'completed',
      setModel:2, notes:'', exercises:[{ id:'pe1', name:'Sentadilla trasera', targetSets:2, targetReps:5, superset:false, done:true, setModel:2,
        sets:[{ id:'ps1', number:1, weight:80, reps:8, completed:true, type:'working', rir:null, rpe:null, restSeconds:null, notes:'' },
              { id:'ps2', number:2, weight:85, reps:6, completed:true, type:'working', rir:null, rpe:null, restSeconds:null, notes:'' }] }] });
    saveDB(); })()`);
  window.nav('#/workouts');
  await tick(40);
  window.nav('#/session/' + tid);
  await tick(80);
  const prevLines = [...window.document.querySelectorAll('[data-ex-block]')[0].querySelectorAll('.set-prev')].map(x => x.textContent.trim());
  check('every set shows what was done last time', prevLines.length === 2 && /80 kg/.test(prevLines[0]) && /85 kg/.test(prevLines[1]));

  // superseries: dos ejercicios consecutivos encadenados
  window.document.querySelectorAll('[data-action="link-superset"]')[0].click();
  await tick(60);
  check('link-superset pairs two exercises', g(`getSession('${tid}').exercises[0].superset === true && getSession('${tid}').exercises[1].superset === true`));
  const blocks = () => [...window.document.querySelectorAll('[data-ex-block]')];
  check('members are numbered A1 and A2', /A1/.test(blocks()[0].textContent) && /A2/.test(blocks()[1].textContent));
  check('the superset line names both exercises', /Superserie A/.test(blocks()[0].textContent) && /Press de banca/.test(blocks()[0].querySelector('.sup-line').textContent));

  g(`(function(){ const s = getSession('${tid}');
    s.exercises.forEach(e => e.sets.forEach(st => st.completed = false));
    s.rest = null; saveDB(); })()`);
  window.nav('#/workouts');
  await tick(40);
  window.nav('#/session/' + tid);
  await tick(60);
  blocks()[0].querySelector('[data-action="toggle-set"]').click();
  await tick(60);
  check('no rest between the members of a superset', !g(`getSession('${tid}').rest`));
  check('it tells you to move to the next member', /sigue con/i.test(window.document.querySelector('#toast-root').textContent || ''));
  blocks()[1].querySelector('[data-action="toggle-set"]').click();
  await tick(60);
  check('rest starts after the last member of the superset', !!g(`getSession('${tid}').rest`) && g(`getSession('${tid}').rest.duration`) === 90);

  // terminar la sesión apaga el temporizador
  window.document.querySelector('[data-action="finish-session"]').click();
  await tick(60);
  if(g(`getSession('${tid}').finished`) !== true){
    const go = [...window.document.querySelectorAll('.modal button')].find(b => /terminar/i.test(b.textContent || ''));
    if(go){ go.click(); await tick(80); }
  }
  check('finishing the session clears the rest timer', !g(`getSession('${tid}').rest`));

  // ===== récords e historial por identificador estable =====
  g(`(function(){ closeModal(); currentUser = 'pr_tester'; dataFor(currentUser); localStorage.setItem(SESSION_KEY, currentUser); saveDB(); })()`);
  window.render();
  await tick(60);

  g(`(function(){ const d = dataFor(currentUser);
    d.prs.push({ id:'p1', exercise:'Press banca', exId:'press-de-banca', date:'2026-02-01', weight:80, reps:5 });
    d.prs.push({ id:'p2', exercise:'Press de banca con barra', exId:'press-de-banca', date:'2026-02-08', weight:85, reps:5 });
    d.prs.push({ id:'p3', exercise:'Press de banca', date:'2026-02-15', weight:90, reps:3 });
    saveDB(); migrateExerciseIds(d); })()`);
  check('an old PR gets the id of its exercise', g(`dataFor(currentUser).prs.find(p => p.id === 'p3').exId`) === 'press-de-banca');

  g(`state.prExercise = 'press-de-banca'`);
  window.nav('#/prs');
  await tick(80);
  const prOptions = [...window.document.querySelectorAll('#pr-select option')].map(o => ({ v: o.value, t: o.textContent.trim() }));
  check('the PR selector is keyed by stable id', prOptions.filter(o => o.v === 'press-de-banca').length === 1);
  check('the label comes from the library, not from the stored name',
    (prOptions.find(o => o.v === 'press-de-banca') || {}).t === 'Press de banca');
  check('records with different names are grouped under one id', window.document.querySelectorAll('.pr-item').length === 3);
  check('the maximum uses every record of the id', /90 kg/.test(mainHtml()));

  g(`(function(){ const d = dataFor(currentUser);
    d.exercises.push({ id:'custom:remo-propio', name:'Remo propio', group:'espalda', equip:'mancuernas', aliases:['remo x'] });
    d.prs.push({ id:'p4', exercise:'Remo propio', exId:'custom:remo-propio', date:'2026-02-20', weight:40, reps:10 });
    saveDB(); })()`);
  g(`(function(){ const d = dataFor(currentUser); d.exercises.find(x => x.id === 'custom:remo-propio').name = 'Remo con mancuerna propio'; saveDB(); })()`);
  g(`state.prExercise = 'custom:remo-propio'`);
  window.nav('#/prs');
  await tick(80);
  const remoOption = [...window.document.querySelectorAll('#pr-select option')].find(o => o.value === 'custom:remo-propio');
  check('the renamed exercise keeps its id and shows the new name', !!remoOption && /Remo con mancuerna propio/.test(remoOption.textContent));
  check('its records survive the rename', window.document.querySelectorAll('.pr-item').length === 1 && /40 kg/.test(mainHtml()));

  g(`state.prExercise = 'sentadilla-trasera'`);
  window.nav('#/prs');
  await tick(60);
  window.document.querySelector('[data-action="log-pr"]').click();
  await tick(60);
  window.document.querySelector('#prf-weight').value = '140';
  window.document.querySelector('#prf-date').value = '2026-03-01';
  window.document.querySelector('[data-action="save-pr"]').click();
  await tick(80);
  check('a PR recorded from the UI stores the stable id',
    g(`(function(){ const p = dataFor(currentUser).prs.find(x => x.weight === 140); return !!p && p.exId === 'sentadilla-trasera' && p.exercise === 'Sentadilla trasera'; })()`));

  g(`(function(){ const d = dataFor(currentUser);
    d.sessions.push({ id:'s-old', workoutId:'w-pr', workoutName:'Rutina PR', date:'2026-03-02',
      startedAt:'2026-03-02T10:00:00.000Z', finishedAt:'2026-03-02T11:00:00.000Z', finished:true, status:'completed',
      setModel:2, notes:'', exercises:[{ id:'oe1', exId:'press-de-banca', name:'Press banca', targetSets:1, targetReps:5, done:true, setModel:2,
        sets:[{ id:'os1', number:1, weight:100, reps:5, completed:true, type:'working', rir:null, rpe:null, restSeconds:null, notes:'' }] }] });
    d.workouts.push({ id:'w-pr', name:'Rutina PR', exercises:[{ id:'ne1', exId:'press-de-banca', name:'Press de banca con barra', sets:1, reps:5, weight:100 }] });
    saveDB(); })()`);
  const sid3 = g(`startOrGetSession('w-pr').id`);
  check('previous sets are found by id, not by name', g(`(function(){ const s = getSession('${sid3}'); const prev = lastSetsFor(s, s.exercises[0]); return prev.length === 1 && prev[0].weight === 100; })()`));
  window.nav('#/session/' + sid3);
  await tick(80);
  check('the session shows the previous set under another name', /Anterior: 100 kg/.test(window.document.querySelector('[data-ex-block]').textContent));

  g(`(function(){ const s = getSession('${sid3}'); const st = s.exercises[0].sets[0];
    st.weight = 110; st.reps = 5; st.completed = true; s.finished = true; s.status = 'completed'; saveDB(); })()`);
  check('records compare by id, not by name', g(`(function(){ const s = getSession('${sid3}'); const r = detectNewRecords(s);
    return r.length === 1 && r[0].weight === 110 && r[0].exId === 'press-de-banca'; })()`));

  const sid4 = g(`startSessionFromPrevious(getSession('${sid3}')).id`);
  check('starting from a previous session seeds weights by id',
    g(`(function(){ const s = getSession('${sid4}'); return s.exercises[0].exId === 'press-de-banca' && s.exercises[0].sets[0].weight === 110; })()`));

  // ===== PROMPT 4: detección automática de récords =====
  g(`(function(){ closeModal(); currentUser='rec_tester'; dataFor(currentUser); localStorage.setItem(SESSION_KEY, currentUser); saveDB(); })()`);
  window.render();
  await tick(60);
  g(`(function(){ const d = dataFor(currentUser);
    d.sessions.push({ id:'rec-old', workoutId:'w-rec', workoutName:'Rutina rec', date:'2026-04-01',
      startedAt:'2026-04-01T10:00:00.000Z', finishedAt:'2026-04-01T11:00:00.000Z', finished:true, status:'completed', setModel:2, notes:'',
      exercises:[{ id:'re1', exId:'press-de-banca', name:'Press banca', targetSets:1, targetReps:5, done:true, setModel:2,
        sets:[{ id:'rs1', number:1, weight:90, reps:5, completed:true, type:'working', rir:null, rpe:null, restSeconds:null, notes:'' }] }] });
    d.workouts.push({ id:'w-rec', name:'Rutina rec', exercises:[{ id:'rw1', exId:'press-de-banca', name:'Press de banca con barra', sets:3, reps:5, weight:90, rest:90 }] });
    saveDB(); })()`);
  const rid = g(`startOrGetSession('w-rec').id`);
  const openRec = async () => { window.nav('#/workouts'); await tick(40); window.nav('#/session/' + rid); await tick(70); };
  const clickToggle = async i => { g(`window.document.querySelectorAll('[data-action="toggle-set"]')[${i}].click()`); await tick(70); };
  const setWeight = (i, w, r) => g(`(function(){ const st = getSession('${rid}').exercises[0].sets[${i}]; st.weight = ${w}; st.reps = ${r}; saveDB(); })()`);

  await openRec();
  setWeight(0, 100, 5);
  await clickToggle(0);
  check('a set that beats the historical best is marked as a PR', g(`getSession('${rid}').exercises[0].sets[0].pr === true`));
  check('the PR is stored with the stable exercise id',
    g(`(function(){ const r = getSession('${rid}').records || []; return r.length === 1 && r[0].exId === 'press-de-banca' && r[0].weight === 100 && r[0].previous.weight === 90; })()`));
  check('the session shows the record on its set', /Récord personal/.test(window.document.querySelector('[data-set-item]').textContent));
  check('the app announces the new record', /Nuevo récord/i.test(window.document.querySelector('#toast-root').textContent || ''));

  setWeight(1, 80, 5);
  await clickToggle(1);
  check('a set below the best is not a record', g(`getSession('${rid}').exercises[0].sets[1].pr !== true`));

  g(`(function(){ const s = getSession('${rid}'); s.exercises[0].sets[2].type = 'warmup'; saveDB(); })()`);
  await openRec();
  setWeight(2, 130, 5);
  await clickToggle(2);
  check('warm-up sets never count as records', g(`(function(){ const s = getSession('${rid}'); return s.exercises[0].sets[2].pr !== true && (s.records || []).length === 1; })()`));

  await clickToggle(0);
  check('unchecking the set clears its record', g(`(function(){ const s = getSession('${rid}'); return s.exercises[0].sets[0].pr === false && (s.records || []).length === 0; })()`));

  await clickToggle(0);
  check('checking it again detects the record once more', g(`(function(){ const s = getSession('${rid}'); return s.exercises[0].sets[0].pr === true && (s.records || []).length === 1; })()`));

  g(`(function(){ const s = getSession('${rid}'); s.exercises[0].sets[0].completed = true; saveDB(); })()`);
  await openRec();
  g(`(window.document.querySelector('[data-action="finish-session"]') || {}).click()`);
  await tick(80);
  if(g(`getSession('${rid}').finished`) !== true && window.document.querySelector('[data-action="confirm-finish"]')){
    g(`window.document.querySelector('[data-action="confirm-finish"]').click()`);
    await tick(120);
  }
  check('finishing keeps the record with its session',
    g(`(function(){ const r = (dataFor(currentUser).records || []).filter(x => x.sessionId === '${rid}'); return r.length === 1 && r[0].exId === 'press-de-banca' && r[0].weight === 100; })()`));
  g(`persistSessionRecords(getSession('${rid}'))`);
  check('re-persisting does not duplicate the record',
    g(`(dataFor(currentUser).records || []).filter(x => x.sessionId === '${rid}').length === 1`));

  g(`state.prExercise = 'press-de-banca'`);
  window.nav('#/prs'); await tick(80);
  check('the records page lists automatic records by id',
    /Récords automáticos/.test(mainHtml()) && /100 kg × 5/.test(mainHtml()));
  g(`state.prExercise = 'sentadilla-trasera'`);
  window.nav('#/prs'); await tick(80);
  check('automatic records are filtered by exercise', !/Récords automáticos/.test(mainHtml()));

  // ===== aviso sonoro y vibración al terminar el descanso =====
  g(`(function(){ closeModal(); currentUser='rest_tester'; dataFor(currentUser); localStorage.setItem(SESSION_KEY,currentUser); saveDB(); })()`);
  window.render();
  await tick(60);
  g(`window.__vib = []; Object.defineProperty(window.navigator, 'vibrate', { value: p => { window.__vib.push(p); return true; }, configurable: true })`);
  check('rest alerts are on by default', g(`restAlertsEnabled() === true`));

  const rsid = g(`(function(){ const d = dataFor(currentUser);
    d.workouts.push({ id:'w-rest', name:'Rutina descanso', exercises:[{ id:'wr1', exId:'press-de-banca', name:'Press banca', sets:2, reps:5, weight:60, rest:60 }] });
    saveDB();
    const s = startOrGetSession('w-rest');
    startRestTimer(s, 5, s.exercises[0], s.exercises[0].sets[0]);
    s.rest.endsAt = Date.now() - 1000; s.rest.duration = 5; saveDB();
    return s.id; })()`);

  window.nav('#/session/' + rsid);
  await tick(120);
  check('an expired rest shows as completed', /Descanso completado/.test(mainHtml()));
  check('the end of the rest vibrates the device', g(`window.__vib.length`) === 1);
  check('the alert is only marked once', g(`!!getSession('${rsid}').rest.notifiedAt`));

  window.nav('#/workouts'); await tick(40); window.nav('#/session/' + rsid); await tick(120);
  check('reopening the finished rest does not buzz again', g(`window.__vib.length`) === 1);
  check('the rest bar shows a mute control', !!window.document.querySelector('[data-action="rest-alerts"]'));

  g(`window.document.querySelector('[data-action="rest-alerts"]').click()`);
  await tick(80);
  check('muting is stored per user', g(`dataFor(currentUser).prefs.restAlerts === false`));
  check('the control shows the muted state', /🔕/.test((window.document.querySelector('[data-action="rest-alerts"]') || {}).textContent || ''));

  g(`(function(){ const s = getSession('${rsid}'); s.rest.notifiedAt = null; saveDB(); })()`);
  window.nav('#/workouts'); await tick(40); window.nav('#/session/' + rsid); await tick(120);
  check('a muted rest finishes silently', g(`window.__vib.length`) === 1 && g(`!!getSession('${rsid}').rest.notifiedAt`));

  g(`window.document.querySelector('[data-action="rest-alerts"]').click()`);
  await tick(80);
  check('the alert can be switched back on', g(`restAlertsEnabled() === true`));
  check('the preference survives a save and reload', g(`(function(){ const d = dataFor(currentUser); return d.prefs && d.prefs.restAlerts === true; })()`));

  // ===== vista de progreso por ejercicio =====
  g(`(function(){ closeModal(); currentUser='pg_tester'; dataFor(currentUser); localStorage.setItem(SESSION_KEY,currentUser); saveDB(); })()`);
  window.render(); await tick(60);
  g(`(function(){ const d = dataFor(currentUser);
    const set = (id, num, w, r, done, type) => ({ id, number:num, weight:w, reps:r, completed:done, type: type || 'working', rir:null, rpe:null, restSeconds:null, notes:'' });
    d.sessions.push({ id:'pg1', workoutId:'w-pg', workoutName:'Rutina A', date:'2026-01-10', startedAt:'2026-01-10T10:00:00.000Z', finished:true, status:'completed', setModel:2, notes:'',
      exercises:[{ id:'a1', exId:'press-de-banca', name:'Press banca', targetSets:2, done:true, setModel:2,
        sets:[ set('x1',1,80,5,true), set('x2',2,60,5,true,'warmup'), set('x3',3,120,5,false) ] }] });
    d.sessions.push({ id:'pg2', workoutId:'w-pg', workoutName:'Rutina B', date:'2026-02-10', startedAt:'2026-02-10T10:00:00.000Z', finished:true, status:'completed', setModel:2, notes:'',
      exercises:[{ id:'b1', exId:'press-de-banca', name:'Press de banca con barra', targetSets:1, done:true, setModel:2,
        sets:[ set('y1',1,100,5,true) ] }] });
    d.sessions.push({ id:'pg3', workoutId:'w-pg2', workoutName:'Rutina C', date:'2026-03-01', startedAt:'2026-03-01T10:00:00.000Z', finished:true, status:'completed', setModel:2, notes:'',
      exercises:[{ id:'c1', exId:'sentadilla-trasera', name:'Sentadilla trasera', targetSets:1, done:true, setModel:2,
        sets:[ set('z1',1,140,3,true) ] }] });
    d.sessions.push({ id:'pg4', workoutId:'w-pg', workoutName:'Rutina D', date:'2026-04-01', startedAt:'2026-04-01T10:00:00.000Z', finished:true, status:'cancelled', setModel:2, notes:'',
      exercises:[{ id:'d1', exId:'press-de-banca', name:'Press banca', targetSets:1, done:true, setModel:2, sets:[ set('w1',1,200,1,true) ] }] });
    saveDB(); })()`);

  const pg = () => g(`exerciseProgress(dataFor(currentUser), 'press-de-banca')`);
  check('progress keeps only finished sessions', pg().length === 2);
  check('volume adds completed working sets only', pg().reduce((a, r) => a + r.volume, 0) === 900);
  check('warm-up and unfinished sets are ignored', pg().reduce((a, r) => a + r.reps, 0) === 10);
  check('sessions with another name join the same exercise', pg().map(r => r.name).join('|') === 'Press banca|Press de banca con barra');
  check('the best set of each session is tracked', pg()[1].best.weight === 100 && pg()[1].best.reps === 5);

  g(`state.progressExercise = 'press-de-banca'`);
  window.nav('#/progress'); await tick(80);
  check('the progress view renders the exercise', /Progreso por ejercicio/.test(mainHtml()));
  check('the progress selector uses the stable id', g(`(function(){ const o = [...window.document.querySelectorAll('#pg-select option')].find(x => x.value === 'press-de-banca'); return !!o && o.textContent.trim() === 'Press de banca'; })()`));
  check('the summary shows the best weight and volume', /100 kg/.test(mainHtml()) && /900 kg/.test(mainHtml()));
  check('both charts are drawn', !!window.document.querySelector('#pg-weight svg') && !!window.document.querySelector('#pg-volume svg'));
  check('the session breakdown lists both sessions', window.document.querySelectorAll('.pg-row').length === 2);

  g(`(function(){ const sel = window.document.querySelector('#pg-select'); sel.value = 'sentadilla-trasera'; sel.dispatchEvent(new window.Event('change')); })()`);
  await tick(80);
  check('switching the selector changes the exercise', g(`state.progressExercise === 'sentadilla-trasera'`) && /420 kg/.test(mainHtml()) && !/900 kg/.test(mainHtml()));

  g(`state.prExercise = 'press-de-banca'`);
  window.nav('#/prs'); await tick(70);
  g(`window.document.querySelector('[data-action="pr-progress"]').click()`);
  await tick(80);
  check('the records page links to the exercise progress', g(`state.progressExercise === 'press-de-banca'`) && /Progreso por ejercicio/.test(mainHtml()) && !!window.document.querySelector('#pg-select'));

  // ===== duración del aviso y tono de serie pesada =====
  g(`(function(){ closeModal(); currentUser='rest_tone'; const d = dataFor(currentUser); d.prefs = {}; d.sessions = [];
    d.sessions.push({ id:'rt1', workoutId:'w-rt', workoutName:'Rutina', date:'2026-05-01', finished:true, status:'completed', setModel:2,
      exercises:[{ id:'e1', exId:'sentadilla-trasera', name:'Sentadilla trasera', targetSets:1, done:true, setModel:2,
        sets:[{ id:'s1', number:1, weight:100, reps:5, completed:true, type:'working' }] }] });
    saveDB(); })()`);

  check('alert duration defaults to two seconds', g(`restAlertSeconds()`) === 2);
  check('alert duration is clamped to one..four seconds', g(`(function(){ setRestAlertSeconds(4); const a = restAlertSeconds(); setRestAlertSeconds(9); const b = restAlertSeconds(); setRestAlertSeconds(0); const c = restAlertSeconds(); return a === 4 && b === 4 && c === 2; })()`));
  check('alert duration is stored per account', g(`(function(){ setRestAlertSeconds(3); return dataFor(currentUser).prefs.restAlertSeconds === 3; })()`));

  const planNormal = g(`restAlertPlan(false, 2)`);
  const planHeavy = g(`restAlertPlan(true, 2)`);
  check('the normal alert plays three notes', planNormal.beeps.length === 3);
  check('the heavy alert plays four longer notes', planHeavy.beeps.length === 4 && planHeavy.beeps[3].dur > planNormal.beeps[0].dur);
  check('the heavy alert vibrates longer', planHeavy.vibration.length > planNormal.vibration.length);
  check('a longer setting stretches the alert', g(`restAlertPlan(false, 4).beeps[2].offset > restAlertPlan(false, 2).beeps[2].offset`));

  check('a set near the best weight counts as heavy', g(`(function(){ const d = dataFor(currentUser); const ex = d.sessions[0].exercises[0]; return isHeavySet(d, ex, { weight:85, reps:5, completed:true, type:'working' }) && !isHeavySet(d, ex, { weight:80, reps:5, completed:true, type:'working' }); })()`));
  check('warm-up sets are never heavy', g(`(function(){ const d = dataFor(currentUser); const ex = d.sessions[0].exercises[0]; return !isHeavySet(d, ex, { weight:100, reps:5, completed:true, type:'warmup' }); })()`));

  g(`(function(){ const d = dataFor(currentUser); const s = d.sessions[0]; s.finished = false; window.__rs = s; startRestTimer(s, 60, s.exercises[0], s.exercises[0].sets[0]); })()`);
  check('the rest records whether the set was heavy', g(`window.__rs.rest.heavy === true`));
  g(`(function(){ document.querySelector('#main').innerHTML = '<div id="rest-slot"></div>'; renderRestBar(window.__rs); })()`);
  check('the rest bar flags the heavy set', /Serie pesada/.test(g(`document.querySelector('#rest-slot').innerHTML`)));
  check('the rest bar offers the alert duration', g(`(function(){ const sel = document.querySelector('#rest-slot select[data-action="rest-alert-len"]'); return !!sel && sel.value === '3' && [...sel.options].map(o => o.value).join(',') === '1,2,3,4'; })()`));
  g(`(function(){ const sel = document.querySelector('#rest-slot select[data-action="rest-alert-len"]'); sel.value = '1'; sel.dispatchEvent(new window.Event('change')); })()`);
  await tick(30);
  check('changing the duration from the bar saves it', g(`restAlertSeconds() === 1`));
  g(`stopRestClock()`);

  check('the alert can still be muted', g(`(function(){ setRestAlertSeconds(2); toggleRestAlerts(); const off = !restAlertsEnabled(); toggleRestAlerts(); return off && restAlertsEnabled(); })()`));
  check('the end of rest is announced once', g(`(function(){ const s = window.__rs; delete s.rest.notifiedAt; const a = notifyRestEnd(s); const b = notifyRestEnd(s); stopRestClock(); return a === true && b === false; })()`));
  check('a light set keeps the short alert', g(`restAlertPlan(false).beeps.length === 3 && restAlertPlan(false).beeps[0].dur < restAlertPlan(true).beeps[0].dur`));

  // ===== ajustes de la cuenta =====
  g(`(function(){ closeModal(); currentUser='set_tester'; const d = dataFor(currentUser); d.prefs = {}; d.sessions = []; d.records = []; saveDB(); })()`);
  check('preferences start enabled', g(`restAlertsEnabled() && restSoundEnabled() && restVibrateEnabled() && prefEnabled('notifyRecords')`));

  g(`setTheme('light')`); await tick(40);
  check('the theme is applied and saved on the account', g(`document.documentElement.getAttribute('data-theme')`) === 'light' && g(`dataFor(currentUser).prefs.theme`) === 'light');
  g(`setTheme('dark')`); await tick(40);
  check('the theme returns to dark', g(`document.documentElement.getAttribute('data-theme')`) === 'dark');

  window.nav('#/settings'); await tick(70);
  check('the settings page renders its three blocks', /Ajustes de la cuenta/.test(mainHtml()) && /Descanso entre series/.test(mainHtml()) && /Notificaciones/.test(mainHtml()));
  check('the theme control marks the current theme', g(`document.querySelector('[data-action="set-theme"][data-theme="dark"]').getAttribute('aria-pressed')`) === 'true');
  g(`document.querySelector('[data-action="set-theme"][data-theme="light"]').click()`); await tick(60);
  check('choosing light from settings works', g(`document.documentElement.getAttribute('data-theme')`) === 'light' && g(`dataFor(currentUser).prefs.theme`) === 'light');
  g(`document.querySelector('[data-action="set-theme"][data-theme="dark"]').click()`); await tick(60);

  g(`(function(){ const cb = document.querySelector('.set-check[data-pref="restAlerts"]'); cb.checked = false; cb.dispatchEvent(new window.Event('change')); })()`); await tick(60);
  check('the rest alert can be muted from settings', g(`restAlertsEnabled() === false && dataFor(currentUser).prefs.restAlerts === false`));
  check('the rest bar reflects the mute', g(`restAlertsBtn().indexOf('🔕') >= 0`));
  g(`(function(){ const cb = document.querySelector('.set-check[data-pref="restAlerts"]'); cb.checked = true; cb.dispatchEvent(new window.Event('change')); })()`); await tick(60);
  check('the rest alert can be re-enabled', g(`restAlertsEnabled() === true`));

  g(`(function(){ const sel = document.querySelector('#set-rest-len'); sel.value = '4'; sel.dispatchEvent(new window.Event('change')); })()`);
  check('the settings page sets the alert duration', g(`restAlertSeconds()`) === 4);
  window.render(); await tick(40);
  check('the duration is reflected on the page', g(`document.querySelector('#set-rest-len').value`) === '4');

  g(`(function(){ window.__beeps = 0; window.__vibes = 0; window.__beepOrig = window.beepRestEnd; window.__vibeOrig = window.vibrateRestEnd;
    window.beepRestEnd = function(){ window.__beeps++; }; window.vibrateRestEnd = function(){ window.__vibes++; };
    const d = dataFor(currentUser); d.prefs.restSound = false; saveDB();
    notifyRestEnd({ id:'ax1', finished:false, rest:{ heavy:true } }); })()`);
  check('sound can be turned off', g(`window.__beeps`) === 0 && g(`window.__vibes`) === 1);
  g(`(function(){ const d = dataFor(currentUser); d.prefs.restSound = true; d.prefs.restVibrate = false; saveDB();
    notifyRestEnd({ id:'ax2', finished:false, rest:{ heavy:false } }); })()`);
  check('vibration can be turned off separately', g(`window.__beeps`) === 1 && g(`window.__vibes`) === 1);
  g(`(function(){ const d = dataFor(currentUser); d.prefs.restVibrate = true; d.prefs.restAlerts = false; saveDB();
    notifyRestEnd({ id:'ax3', finished:false, rest:{ heavy:true } }); })()`);
  check('muting stops both channels', g(`window.__beeps`) === 1 && g(`window.__vibes`) === 1);
  g(`(function(){ const d = dataFor(currentUser); d.prefs.restAlerts = true; d.prefs.restSound = true; d.prefs.restVibrate = true; saveDB();
    window.beepRestEnd = window.__beepOrig; window.vibrateRestEnd = window.__vibeOrig; })()`);

  g(`(function(){ const d = dataFor(currentUser); d.prefs.notifyRecords = false;
    d.sessions = [
      { id:'rec0', workoutId:'w-rec', workoutName:'Rutina', date:'2026-05-01', finished:true, status:'completed', setModel:2, records:[],
        exercises:[{ id:'rw', exId:'sentadilla-trasera', name:'Sentadilla trasera', setModel:2, sets:[{ id:'rw0', number:1, weight:100, reps:5, completed:true, type:'working' }] }] },
      { id:'rec1', workoutId:'w-rec', workoutName:'Rutina', date:'2026-06-01', finished:true, status:'completed', setModel:2, records:[],
        exercises:[{ id:'rx', exId:'sentadilla-trasera', name:'Sentadilla trasera', setModel:2, sets:[{ id:'rs0', number:1, weight:100, reps:5, completed:true, type:'working' }] }] }];
    window.__toasts = 0; window.__toastOrig = window.toast; window.toast = function(){ window.__toasts++; }; saveDB(); })()`);
  g(`(function(){ const d = dataFor(currentUser); const s = d.sessions[1]; window.__marked = maybeMarkRecord(s, s.exercises[0], { id:'rs1', weight:105, reps:5, completed:true, type:'working' }); })()`);
  check('a record still counts with its notice off', g(`window.__marked === true`) && g(`window.__toasts`) === 0);
  g(`(function(){ const d = dataFor(currentUser); d.prefs.notifyRecords = true; saveDB(); const s = d.sessions[1]; maybeMarkRecord(s, s.exercises[0], { id:'rs2', weight:110, reps:5, completed:true, type:'working' }); })()`);
  check('the record notice returns when enabled', g(`window.__toasts`) === 1);
  g(`window.toast = window.__toastOrig`);

  g(`nav('#/workouts')`); await tick(50);
  g(`document.querySelector('[data-action="open-settings"]').click()`); await tick(60);
  check('the account menu opens the settings', g(`location.hash`) === '#/settings' && /Ajustes de la cuenta/.test(mainHtml()));

  g(`(function(){ const d = dataFor(currentUser); d.prefs.theme = 'light'; saveDB(); theme = 'dark'; document.documentElement.setAttribute('data-theme','dark'); render(); })()`); await tick(50);
  check('the account theme wins on the next render', g(`document.documentElement.getAttribute('data-theme')`) === 'light');
  g(`setTheme('dark')`); await tick(40);

  // ===== progresión de carga =====
  g(`(function(){ closeModal(); currentUser='prog_tester'; const d = dataFor(currentUser); d.prefs = {}; d.sessions = [];
    const mk = (id, date, exId, name, targetSets, target, sets, status) => ({ id, workoutId:'w-prog', workoutName:'Rutina', date, finished:true, status: status || 'completed', setModel:2, records:[],
      exercises:[{ id:id+'-ex', exId, name, targetSets, target, setModel:2, sets }] });
    const st = (id, w, r, done, type) => ({ id, number:1, weight:w, reps:r, completed:done !== false, type:type || 'working' });
    d.sessions.push(mk('pg-a', '2026-01-05', 'press-de-banca', 'Press banca plano', 3, '8', [st('a1',90,8), st('a2',90,8), st('a3',90,8)]));
    d.sessions.push(mk('pg-b', '2026-01-12', 'press-de-banca', 'Press de banca', 3, '8', [st('b1',100,8), st('b2',100,8), st('b3',100,8)]));
    d.sessions.push(mk('pg-c', '2026-01-12', 'press-de-banca', 'Press banca', 1, '8', [st('c1',200,8)], 'cancelled'));
    d.sessions.push(mk('pg-d', '2026-01-15', 'sentadilla-trasera', 'Sentadilla trasera', 3, '6-8', [st('d1',140,7), st('d2',140,7), st('d3',140,7)]));
    d.sessions.push(mk('pg-e', '2026-01-16', 'custom:prog-hold', 'Remo en polea', 3, '8-12', [st('e1',60,10), st('e2',60,10)]));
    d.sessions.push(mk('pg-f', '2026-01-17', 'custom:prog-down', 'Curl con barra', 3, '8-12', [st('f1',50,6), st('f2',50,6), st('f3',50,6)]));
    d.sessions.push(mk('pg-g', '2026-01-18', 'custom:prog-bw', 'Dominadas', 3, '8-12', [st('g1',0,12), st('g2',0,12), st('g3',0,12)]));
    saveDB(); })()`);

  check('rep targets are parsed from ranges', g(`parseRepTarget('8-12').min === 8 && parseRepTarget('8-12').max === 12 && parseRepTarget('10').max === 10`));
  check('topping the range raises the load', g(`(function(){ const s = progressionSuggestion(dataFor(currentUser), 'press-de-banca'); return s.kind === 'up' && s.weight === 102.5 && s.reps === 8; })()`));
  check('the rise keeps two decimals readable', g(`fmtKg(progressionSuggestion(dataFor(currentUser), 'press-de-banca').weight)`) === '102,5');
  check('one more rep before adding weight', g(`(function(){ const s = progressionSuggestion(dataFor(currentUser), 'sentadilla-trasera'); return s.kind === 'reps' && s.weight === 140 && s.reps === 8; })()`));
  check('missing sets keep the same weight', g(`(function(){ const s = progressionSuggestion(dataFor(currentUser), 'custom:prog-hold'); return s.kind === 'hold' && s.weight === 60 && s.reps === 8; })()`));
  check('falling below the range lowers the load', g(`(function(){ const s = progressionSuggestion(dataFor(currentUser), 'custom:prog-down'); return s.kind === 'down' && s.weight === 47.5 && s.reps === 8; })()`));
  check('bodyweight exercises add a repetition', g(`(function(){ const s = progressionSuggestion(dataFor(currentUser), 'custom:prog-bw'); return s.kind === 'reps' && s.weight === 0 && s.reps === 13; })()`));
  check('without history no load is invented', g(`(function(){ const s = progressionSuggestion(dataFor(currentUser), 'custom:sin-historial'); return s.kind === 'none' && s.weight === 0; })()`));
  check('the suggestion groups sessions by stable id', g(`progressionSuggestion(dataFor(currentUser), 'press-de-banca').sessions`) === 2);

  g(`state.progressExercise = 'press-de-banca'; nav('#/progress')`); await tick(80);
  check('the progress view shows the suggestion', /Sugerencia/.test(mainHtml()) && /Sube a 102,5 kg/.test(mainHtml()));

  g(`(function(){ const d = dataFor(currentUser); d.sessions.push({ id:'prog-live', workoutId:'w-prog', workoutName:'Rutina', date:'2026-02-01', finished:false, status:'in_progress', setModel:2, records:[],
    exercises:[{ id:'lv-ex', exId:'press-de-banca', name:'Press de banca', targetSets:3, target:'8', setModel:2,
      sets:[{ id:'lv1', number:1, weight:100, reps:8, completed:true, type:'working' },
            { id:'lv2', number:2, weight:'', reps:'', completed:false, type:'working' },
            { id:'lv3', number:3, weight:'', reps:'', completed:false, type:'warmup' },
            { id:'lv4', number:4, weight:'', reps:'', completed:false, type:'working' }] }] });
    state.sessionId = 'prog-live'; saveDB(); nav('#/session/prog-live'); })()`); await tick(80);
  check('the live session shows its suggestion', /Sugerencia:/.test(mainHtml()) && !!g(`document.querySelector('[data-action="apply-prog"]')`));
  g(`document.querySelector('[data-action="apply-prog"]').click()`); await tick(80);
  check('applying fills only pending working sets', g(`(function(){ const s = getSession('prog-live'); const ex = s.exercises[0]; const by = {}; ex.sets.forEach(st => by[st.id] = st);
    return by.lv1.weight === 100 && by.lv1.reps === 8 && by.lv2.weight === 102.5 && by.lv2.reps === 8 && by.lv4.weight === 102.5 && by.lv3.weight === ''; })()`));
  check('applying never marks the sets as done', g(`getSession('prog-live').exercises[0].sets.filter(st => st.completed).length`) === 1);

  // ===== mejor marca en biblioteca y rutinas =====
  g(`(function(){ closeModal(); currentUser='marks_tester'; const d = dataFor(currentUser); d.prefs = {}; d.sessions = []; d.prs = []; d.records = [];
    const mk = (id, date, exId, name, sets, status) => ({ id, workoutId:'w-mk', workoutName:'Rutina', date, finished:true, status: status || 'completed', setModel:2, records:[],
      exercises:[{ id:id+'-ex', exId, name, targetSets:3, target:'5', setModel:2, sets }] });
    d.sessions.push(mk('mk1', '2026-01-01', 'press-de-banca', 'Press banca', [
      { id:'k1', number:1, weight:100, reps:5, completed:true, type:'working' },
      { id:'k2', number:2, weight:120, reps:5, completed:true, type:'warmup' }]));
    d.sessions.push(mk('mk2', '2026-01-08', 'press-de-banca', 'Press de banca con barra', [
      { id:'k3', number:1, weight:102, reps:3, completed:true, type:'working' }]));
    d.sessions.push(mk('mk3', '2026-01-09', 'sentadilla-trasera', 'Sentadilla trasera', [
      { id:'k4', number:1, weight:140, reps:3, completed:true, type:'working' }]));
    d.sessions.push(mk('mk4', '2026-01-10', 'press-de-banca', 'Press banca', [
      { id:'k5', number:1, weight:300, reps:1, completed:true, type:'working' }], 'cancelled'));
    d.prs.push({ id:'pr1', exercise:'Press de banca', exId:'press-de-banca', date:'2026-01-11', weight:105, reps:2 });
    d.records.push({ id:'ac1', exId:'press-de-banca', exercise:'Press banca', weight:100, reps:5, date:'2026-01-01', sessionId:'mk1' });
    d.records.push({ id:'ac2', exId:'press-de-banca', exercise:'Press de banca con barra', weight:102, reps:3, date:'2026-01-08', sessionId:'mk2' });
    d.records.push({ id:'ac3', exId:'sentadilla-trasera', exercise:'Sentadilla trasera', weight:140, reps:3, date:'2026-01-09', sessionId:'mk3' });
    saveDB(); })()`);

  check('the best mark takes the manual record', g(`(function(){ const m = bestMarkFor(dataFor(currentUser), 'press-de-banca'); return m.weight === 105 && m.reps === 2; })()`));
  check('the best mark ignores warm-ups and cancelled sessions', g(`(function(){ const d = dataFor(currentUser); const keep = d.prs; d.prs = []; const m = bestMarkFor(d, 'press-de-banca'); d.prs = keep; return m.weight === 102 && m.reps === 3; })()`));
  check('the best mark groups sessions by stable id', g(`(function(){ const m = bestMarkFor(dataFor(currentUser), 'sentadilla-trasera'); return m.weight === 140 && m.reps === 3 && m.date === '2026-01-09'; })()`));
  check('automatic records are counted per exercise', g(`autoRecordsFor(dataFor(currentUser), 'press-de-banca').length === 2 && autoRecordsFor(dataFor(currentUser), 'sentadilla-trasera').length === 1`));
  check('the mark label is readable', g(`markText(bestMarkFor(dataFor(currentUser), 'press-de-banca'))`) === '🏆 105 kg × 2');

  g(`nav('#/library')`); await tick(80);
  const libHtml = g(`document.querySelector('#lib-list').innerHTML`);
  check('the library shows the best mark', /🏆 105 kg × 2/.test(libHtml));
  check('the library shows the automatic record count', /2 récords automáticos/.test(libHtml));

  check('routine chips resolve the exercise by name', g(`wcardExChips({ exercises:[{ name:'Press de banca' }] }, dataFor(currentUser))`).indexOf('🏆 105 kg × 2') >= 0);
  check('routine cards count their automatic records', g(`wcardRecordsLine({ exercises:[{ exId:'press-de-banca' }, { exId:'sentadilla-trasera' }, { name:'Dominadas' }] }, dataFor(currentUser))`).indexOf('3 récords automáticos') >= 0);
  check('the routine card prints the mark', g(`workoutCard({ id:'wk1', name:'Rutina test', exercises:[{ exId:'press-de-banca', name:'Press de banca' }] })`).indexOf('🏆 105 kg × 2') >= 0);

  // ===== comparativa de 4 semanas y 1RM =====
  g(`(function(){ closeModal(); currentUser='cmp_tester'; const d = dataFor(currentUser); d.prefs = {}; d.sessions = []; d.prs = []; d.records = [];
    const iso = n => { const x = new Date(); x.setHours(12,0,0,0); x.setDate(x.getDate() - n); return x.toISOString().slice(0,10); };
    const mk = (id, days, w, reps) => ({ id, workoutId:'w-cmp', workoutName:'Rutina', date: iso(days), finished:true, status:'completed', setModel:2, records:[],
      exercises:[{ id:id+'-ex', exId:'press-de-banca', name:'Press de banca', targetSets:1, target:'5', setModel:2,
        sets:[{ id:id+'-s', number:1, weight:w, reps, completed:true, type:'working' }] }] });
    d.sessions.push(mk('c1', 5, 100, 5));
    d.sessions.push(mk('c2', 20, 105, 5));
    d.sessions.push(mk('c3', 40, 95, 5));
    d.sessions.push(mk('c4', 50, 90, 5));
    d.sessions.push(mk('c5', 70, 80, 5));
    saveDB(); })()`);

  check('the 1RM estimate follows Epley', g(`epley1RM(100, 5)`) === 116.7 && g(`epley1RM(100, 1)`) === 100 && g(`epley1RM(0, 5)`) === 0);
  check('the best estimate uses the heaviest session', g(`bestE1RM(exerciseProgress(dataFor(currentUser), 'press-de-banca'))`) === 122.5);
  check('the recent window holds the last four weeks', g(`(function(){ const w = progressWindows(exerciseProgress(dataFor(currentUser), 'press-de-banca')); return w.recent.sessions === 2 && w.recent.volume === 1025 && w.recent.reps === 10; })()`));
  check('the previous window holds the four weeks before', g(`(function(){ const w = progressWindows(exerciseProgress(dataFor(currentUser), 'press-de-banca')); return w.previous.sessions === 2 && w.previous.volume === 925; })()`));
  check('older sessions stay out of both windows', g(`(function(){ const w = progressWindows(exerciseProgress(dataFor(currentUser), 'press-de-banca')); return w.recent.volume + w.previous.volume === 1950; })()`));
  check('each window keeps its own best set', g(`(function(){ const w = progressWindows(exerciseProgress(dataFor(currentUser), 'press-de-banca')); return w.recent.best.weight === 105 && w.previous.best.weight === 95; })()`));
  check('deltas compare the two windows', g(`cmpDelta(925, 1025).text`) === '+11 %' && g(`cmpDelta(925, 1025).cls`) === 'up' && g(`cmpDelta(100, 90).cls`) === 'down');
  check('a window without history is flagged as new', g(`cmpDelta(0, 3).text`) === 'nuevo' && g(`cmpDelta(0, 0).text`) === '—');

  g(`state.progressExercise = 'press-de-banca'; nav('#/progress')`); await tick(80);
  const cmpHtml = mainHtml();
  check('the progress view shows the estimated 1RM', /1RM estimado/.test(cmpHtml) && /122,5 kg/.test(cmpHtml));
  check('the progress view compares the two windows', /Últimas 4 semanas/.test(cmpHtml) && /Frente a las 4 anteriores/.test(cmpHtml));
  check('the comparison prints both windows and the delta', /1025 kg/.test(cmpHtml) && /925 kg/.test(cmpHtml) && /\+11 %/.test(cmpHtml));
  check('the comparison explains the formula', /Epley/.test(cmpHtml));

  g(`(function(){ const d = dataFor(currentUser); d.sessions.forEach(s => { if(s.id === 'c3' || s.id === 'c4') s.finished = false; }); saveDB(); })()`); await tick(30);
  window.render(); await tick(60);
  check('without a previous window the row reads new', /nuevo/.test(mainHtml()));

  // ===== compartir la gráfica de progreso =====
  g(`(function(){ closeModal(); currentUser='share_tester'; const d = dataFor(currentUser); d.prefs = {}; d.sessions = []; d.prs = []; d.records = [];
    const mk = (id, date, exId, name, w, reps) => ({ id, workoutId:'w-sh', workoutName:'Rutina', date, finished:true, status:'completed', setModel:2, records:[],
      exercises:[{ id:id+'-ex', exId, name, targetSets:1, target:'5', setModel:2,
        sets:[{ id:id+'-s', number:1, weight:w, reps, completed:true, type:'working' }] }] });
    for(let i = 0; i < 14; i++){
      d.sessions.push(mk('sh' + i, '2026-01-' + String(i + 1).padStart(2, '0'), 'sentadilla-trasera', 'Sentadilla trasera', 100 + i, 5));
    }
    d.sessions.push(mk('sh-p1', '2026-02-01', 'press-de-banca', 'Press de banca', 100, 5));
    d.sessions.push(mk('sh-p2', '2026-02-08', 'press-de-banca', 'Press de banca', 110, 5));
    saveDB(); })()`);

  const payload = g(`progressSharePayload(dataFor(currentUser), 'press-de-banca')`);
  check('the share payload names the exercise', payload.title === 'Press de banca');
  check('the share payload plots the best set per session', payload.data.length === 2 && payload.data[0].value === 100 && payload.data[1].value === 110);
  check('the share payload uses the same unit and file naming', payload.unit === 'kg' && payload.filename === 'drakotrack-progreso-press-de-banca.jpg');
  check('the share text quotes the best mark and the estimate', /110 kg × 5/.test(payload.text) && /128,3 kg/.test(payload.text));
  check('the subtitle summarises the sessions', /2 sesiones/.test(payload.subtitle) && /mejor 110 kg/.test(payload.subtitle));
  check('long histories are capped for the image', g(`progressSharePayload(dataFor(currentUser), 'sentadilla-trasera').data.length`) === 12);
  check('the capped window keeps the most recent sessions', g(`(function(){ const p = progressSharePayload(dataFor(currentUser), 'sentadilla-trasera'); return p.data[0].value === 102 && p.data[p.data.length-1].value === 113; })()`));
  check('without history there is nothing to share', g(`progressSharePayload(dataFor(currentUser), 'custom:sin-datos')`) === null);

  g(`state.progressExercise = 'press-de-banca'; nav('#/progress')`); await tick(80);
  check('the progress view offers the share button', !!g(`document.querySelector('[data-action="share-progress"]')`) && g(`document.querySelector('[data-action="share-progress"]').disabled`) === false);
  g(`(function(){ window.__shareOrig = window.DrakoShare; window.DrakoShare = { shareJPG: async o => { window.__shared = o; return 'downloaded'; } }; })()`);
  g(`document.querySelector('[data-action="share-progress"]').click()`); await tick(60);
  check('sharing hands the chart to DrakoShare', g(`window.__shared && window.__shared.title === 'Press de banca' && window.__shared.data.length === 2 && window.__shared.unit === 'kg'`));
  check('sharing keeps the WhatsApp-friendly caption', g(`window.__shared.text`).indexOf('DrakoTrack') >= 0);
  g(`window.DrakoShare = window.__shareOrig`);

  // ===== v2: racha, logros, CSV y PWA =====
  const monday = g('weekStartISO(todayISO())');
  g(`(function(){
    const d = dataFor(currentUser);
    d.sessions = []; d.records = []; d.achievements = {}; d.weights = [];
    window.__mk = (date, name) => ({ id: 'sid-' + date + '-' + name + Math.random(), date, finished: true,
      workoutName: name, durationSec: 3600,
      exercises: [{ name: 'Press, "banca"', exId: 'press-banca',
        sets: [{ number: 1, type: 'working', weight: 80, reps: 5, completed: true, rir: 2 }] }],
      records: [] });
    d.sessions.push(window.__mk(shiftISO('${monday}', -14), 'A'));
    d.sessions.push(window.__mk(shiftISO('${monday}', -7), 'A'));
  })()`);
  check('streak counts past weeks when the current one is empty', g('streakWeeks(dataFor(currentUser)).weeks') === 2);
  check('an empty current week does not break the streak', g('streakWeeks(dataFor(currentUser)).activeThisWeek') === false);
  g(`dataFor(currentUser).sessions.push(window.__mk('${monday}', 'A'))`);
  check('training this week extends the streak', g('streakWeeks(dataFor(currentUser)).weeks') === 3 && g('streakWeeks(dataFor(currentUser)).activeThisWeek') === true);
  check('ten sessions stays locked at three', g(`achievementList(dataFor(currentUser)).find(a => a.id === 'ten-sessions').unlocked`) === false);
  check('a half month does not count as a full month', g(`achievementList(dataFor(currentUser)).find(a => a.id === 'full-month').unlocked`) === false);

  g(`(function(){
    const d = dataFor(currentUser);
    for(let i = 0; i < 7; i++){ const s = window.__mk(shiftISO('${monday}', -21), 'B'); s.id = 'bulk-' + i; d.sessions.push(s); }
    d.records.push({ id: 'r1', date: todayISO(), exercise: 'Press, "banca"', weight: 80, reps: 5 });
  })()`);
  check('ten sessions unlocks', g(`achievementList(dataFor(currentUser)).find(a => a.id === 'ten-sessions').unlocked`) === true);
  check('first record unlocks', g(`achievementList(dataFor(currentUser)).find(a => a.id === 'first-record').unlocked`) === true);
  check('PR of the month unlocks', g(`achievementList(dataFor(currentUser)).find(a => a.id === 'month-pr').unlocked`) === true);
  g('unlockAchievements(dataFor(currentUser), false)');
  check('achievements remember their unlock date', g(`!!dataFor(currentUser).achievements['ten-sessions']`));
  check('unlocking again reports nothing new', g('unlockAchievements(dataFor(currentUser), false).length') === 0);
  g(`nav('#/progress')`); await tick(60);
  check('the progress view shows the streak card', !!g(`document.querySelector('.streak-card .streak-value')`));
  check('the progress view lists the four achievements', g(`document.querySelectorAll('.streak-card .ach-item').length`) === 4);

  const setsCsv = g('csvText(csvSetsRows(dataFor(currentUser)))');
  check('CSV starts with a UTF-8 BOM', setsCsv.charCodeAt(0) === 0xFEFF);
  const csvHeader = setsCsv.replace(/^\uFEFF/, '').split('\r\n')[0];
  check('series CSV header is Spanish', csvHeader === 'fecha,ejercicio,serie,peso,repeticiones,rpe,notas');
  check('CSV quotes commas and quotes', setsCsv.includes('"Press, ""banca"""'));
  check('CSV derives RPE from RIR', setsCsv.includes(',8,'));
  check('CSV lines end with CRLF', setsCsv.includes('\r\n'));
  const sessionsCsv = g('csvText(csvSessionsRows(dataFor(currentUser)))');
  check('sessions CSV has one row per finished session', sessionsCsv.trim().split('\r\n').length === g('finishedSessions(dataFor(currentUser)).length') + 1);
  g("dataFor(currentUser).weights = [{ id:'w1', date:'2026-10-01', weight: 78.4 }]");
  check('weights CSV carries date and kilograms', /2026-10-01,78\.4/.test(g('csvText(csvWeightsRows(dataFor(currentUser)))')));
  g("nav('#/settings')"); await tick(60);
  check('settings offers the three CSV exports', g(`document.querySelectorAll('[data-action^="csv-"]').length`) === 3);

  // ===== v2 Lote B: plan en tres pasos, volumen por grupo y mes a mes =====
  const planErr = await g("signup('lote-b','local-pass-2026')");
  check('plan block starts with a fresh account', planErr === null && g('currentUser') === 'lote-b');
  check('no plan is assumed before answering', g('profileDone(dataFor(currentUser))') === false);
  check('a malformed profile is ignored', g("userProfile({ profile:{ goal:'fuerza', days:4, level:'raro' } })") === null
    && g("userProfile({ profile:{ goal:'fuerza', days:9, level:'intermedio' } })") === null);

  g("nav('#/start')");
  await tick(80);
  check('wizard starts at step 1 with the goal question', g('state.onb.step') === 1 && /¿Qué buscas\?/.test(mainHtml()));
  check('step 1 offers four goals', g(`document.querySelectorAll('[data-action="onb-goal"]').length`) === 4);
  check('step 1 can be skipped', !!window.document.querySelector('[data-action="onb-skip"]'));
  window.document.querySelector('[data-action="onb-goal"][data-id="fuerza"]').click();
  await tick(60);
  check('choosing a goal moves to the days step', g('state.onb.goal') === 'fuerza' && g('state.onb.step') === 2);
  check('days step offers 2 to 6 days a week',
    g(`Array.from(document.querySelectorAll('[data-action="onb-days"]')).map(b => b.dataset.id).join(',')`) === '2,3,4,5,6');
  window.document.querySelector('[data-action="onb-days"][data-id="4"]').click();
  await tick(60);
  check('choosing days moves to the experience step', g('state.onb.step') === 3 && g('state.onb.days') === 4);
  check('saving is blocked until all three answers exist',
    window.document.querySelector('[data-action="onb-save"]').disabled === true);
  window.document.querySelector('[data-action="onb-level"][data-id="intermedio"]').click();
  await tick(400);
  check('saving unlocks once experience is chosen',
    window.document.querySelector('[data-action="onb-save"]').disabled === false);
  check('experience step sums up the answers',
    /Fuerza · 4 días · Intermedio/.test(window.document.querySelector('.onb-summary').textContent || ''));
  check('catalog recommendations are listed', g(`document.querySelectorAll('#onb-recs .onb-rec').length`) === 3);
  window.document.querySelector('[data-action="onb-save"]').click();
  await tick(120);
  check('plan is stored in the account data', g("JSON.stringify(userProfile(dataFor(currentUser)))").includes('"goal":"fuerza"')
    && g('userProfile(dataFor(currentUser)).days') === 4 && g('userProfile(dataFor(currentUser)).level') === 'intermedio');
  check('plan survives a reload of the profile reader', g("profileDone({ profile: dataFor(currentUser).profile })") === true);
  check('plan sets series, reps and rest defaults',
    g('planDefaults(dataFor(currentUser)).sets') === 4 && g('planDefaults(dataFor(currentUser)).reps') === 8
    && g('planDefaults(dataFor(currentUser)).rest') === 120);
  check('no plan means no invented defaults', g("planDefaults({ profile:{ skipped:true } })") === null);

  g("nav('#/editor/new')");
  await tick(80);
  check('new workouts start with the plan defaults', g('state.editor.exercises[0].sets') === 4 && g('state.editor.exercises[0].reps') === 8);

  g("nav('#/workouts')");
  await tick(80);
  check('home no longer asks for the plan', !mainHtml().includes('data-action="open-onboarding"'));
  g("nav('#/settings')");
  await tick(80);
  check('settings shows the saved plan', /Fuerza · 4 días por semana · Intermedio/.test(mainHtml())
    && mainHtml().includes('data-action="open-onboarding"'));

  check('programs are ranked by goal, level and days',
    g(`rankPrograms({ goal:'fuerza', days:4, level:'intermedio' }, [
        { t:'B', slug:'b', c:['hyper'], diff:['Beginner'], dpw:3 },
        { t:'A', slug:'a', c:['strength'], diff:['Intermediate'], dpw:4 },
        { t:'C', slug:'c', c:['strength'], diff:['Advanced'], dpw:6 }
      ]).map(p => p.slug).join(',')`) === 'a,c,b');
  check('ranking ignores programs without data', g("rankPrograms({ goal:'fuerza', days:4, level:'intermedio' }, [{ t:'X', slug:'x', ok:false }]).length") === 0);

  // Semana en curso: series efectivas por grupo, sin calentamientos ni series a medias
  g(`(function(){
    const d = dataFor(currentUser);
    const w = weekStartISO(todayISO());
    d.sessions = [{
      id: 'lb-s1', date: w, finished: true, workoutName: 'Pecho', exercises: [
        { id:'lb-e1', name:'Press de banca', exId:'press-de-banca', sets:[
          { id:'lb-x1', weight:100, reps:5, completed:true, type:'working' },
          { id:'lb-x2', weight:40, reps:10, completed:true, type:'warmup' },
          { id:'lb-x3', weight:90, reps:8, completed:false, type:'working' }
        ]},
        { id:'lb-e2', name:'Ejercicio propio raro', exId:'custom:propio-raro', sets:[
          { id:'lb-x4', weight:20, reps:10, completed:true, type:'working' }
        ]},
        { id:'lb-e3', name:'Remo con barra', exId:'remo-con-barra', done:true, weight:60, reps:5 }
      ]
    }, {
      id: 'lb-s0', date: shiftISO(w, -7), finished: true, workoutName: 'Empuje', exercises: [
        { id:'lb-e4', name:'Press de banca', exId:'press-de-banca', sets:[
          { id:'lb-x5', weight:95, reps:5, completed:true, type:'working' },
          { id:'lb-x6', weight:92, reps:5, completed:true, type:'working' }
        ]}
      ]
    }];
    d.records = [{ id:'lb-r1', date: todayISO(), exId:'press-de-banca', exercise:'Press de banca', weight:100, reps:5 }];
  })()`);
  check('warmups and unfinished sets do not count', g('effectiveSets({ sets:[{weight:100,reps:5,completed:true,type:"working"},{weight:40,reps:10,completed:true,type:"warmup"},{weight:90,reps:8,completed:false,type:"working"}] }).sets') === 1);
  check('legacy exercises count as one set when done', g("effectiveSets({ done:true, weight:60, reps:5 })").volume === 300);
  check('weekly volume is grouped by muscle group',
    g("weekMuscleVolume(dataFor(currentUser), weekStartISO(todayISO())).map(r => r.id + ':' + r.sets + ':' + r.volume).join('|')")
    === 'pecho:1:500|espalda:1:300|sin-grupo:1:200');
  check('unknown exercises fall back to a named group', g("groupName('sin-grupo')") === 'Sin grupo');

  g("nav('#/progress')");
  await tick(120);
  const mvRows = window.document.querySelectorAll('.mv-row').length;
  check('progress shows one bar per worked group', mvRows === 3);
  check('bars compare against the previous week',
    /-1/.test(window.document.querySelector('.mv-delta').textContent || ''));
  check('weekly card adds up the week', /3 series efectivas/.test(mainHtml()));

  // Comparación mes a mes
  check('months shift backwards across the year',
    g("shiftMonth('2026-01', -1)") === '2025-12' && g("shiftMonth('2026-12', 1)") === '2027-01');
  check('month label is readable Spanish', /^[A-ZÁÉÍÓÚ]/.test(g("monthLabel('2026-11')")));
  g(`(function(){
    const d = dataFor(currentUser);
    const prev = shiftMonth(monthKey(todayISO()), -1) + '-15';
    d.sessions = [
      { id:'lb-m1', date: todayISO(), finished: true, workoutName: 'Actual', exercises:[
        { id:'lb-me1', name:'Sentadilla trasera', exId:'sentadilla-trasera', sets:[
          { id:'lb-mx1', weight:100, reps:5, completed:true, type:'working' },
          { id:'lb-mx2', weight:100, reps:5, completed:true, type:'working' },
          { id:'lb-mx3', weight:80, reps:8, completed:true, type:'working' }
        ]}
      ]},
      { id:'lb-m2', date: prev, finished: true, workoutName: 'Anterior', exercises:[
        { id:'lb-me2', name:'Sentadilla trasera', exId:'sentadilla-trasera', sets:[
          { id:'lb-mx4', weight:100, reps:5, completed:true, type:'working' },
          { id:'lb-mx5', weight:100, reps:5, completed:true, type:'working' }
        ]}
      ]},
      { id:'lb-m3', date: prev, finished: false, workoutName: 'Sin terminar', exercises: [] }
    ];
    d.records = [{ id:'lb-mr1', date: todayISO(), exId:'sentadilla-trasera', exercise:'Sentadilla trasera', weight:100, reps:5 }];
  })()`);
  const nowMonth = g('monthStats(dataFor(currentUser), monthKey(todayISO()))');
  const prevMonth = g("monthStats(dataFor(currentUser), shiftMonth(monthKey(todayISO()), -1))");
  check('current month counts its finished sessions and effective sets',
    nowMonth.sessions === 1 && nowMonth.sets === 3 && nowMonth.volume === 1640);
  check('previous month is measured on its own, without unfinished sessions',
    prevMonth.sessions === 1 && prevMonth.sets === 2 && prevMonth.volume === 1000 && prevMonth.records === 0);
  check('records are counted per month', nowMonth.records === 1);
  check('month comparison renders both months', g('monthCompareHTML(dataFor(currentUser))').includes('Este mes frente al anterior'));
  check('month comparison hides itself without sessions', g("monthCompareHTML({ sessions: [] })") === '');

  // Omitir el plan no vuelve a preguntar y deja la puerta abierta en Ajustes
  g("nav('#/start')");
  await tick(80);
  g("state.onb = onboardingState(dataFor(currentUser))");
  g('skipOnboarding()');
  await tick(80);
  check('skipping the wizard is remembered', g('dataFor(currentUser).profile.skipped') === true && g('profileDone(dataFor(currentUser))') === false);
  check('a skipped plan does not nag on home', g('planCardHTML(dataFor(currentUser))') === '');
  check('home asks for the plan only when never answered', g('planCardHTML({})').includes('data-action="open-onboarding"'));
  g("nav('#/settings')");
  await tick(80);
  check('settings still offers the plan after skipping', /Configurar plan/.test(mainHtml()));

  // PWA: manifiesto, iconos y service worker
  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check('index links the web manifest', /rel="manifest" href="manifest\.webmanifest"/.test(indexHtml));
  check('index declares an iOS icon', /rel="apple-touch-icon"/.test(indexHtml));
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.webmanifest'), 'utf8'));
  check('manifest is installable', manifest.display === 'standalone' && manifest.start_url === './' && manifest.icons.length >= 3);
  check('manifest has a maskable icon', manifest.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512'));
  for (const icon of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
    check('icon present: ' + icon, fs.existsSync(path.join(__dirname, icon)));
  }
  const swSource = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
  check('service worker precaches the shell', /const VERSION = /.test(swSource) && swSource.includes("'./index.html'") && swSource.includes('./app.js?v='));
  check('service worker leaves the API uncached', /startsWith\('\/api\/'\)/.test(swSource));
  check('service worker revalidates in the background', /cache\.put\(request, response\.clone\(\)\)/.test(swSource));
  check('app registers the service worker', /serviceWorker\.register\('sw\.js'\)/.test(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8')));

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
