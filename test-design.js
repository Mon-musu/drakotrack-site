#!/usr/bin/env node
/* ============================================================
   F1 · sistema de diseño
   Comprueba los archivos tal como se sirven: tokens semánticos,
   acento, foco visible, navegación, objetivos táctiles y
   primitivas compartidas. No necesita navegador.
   ============================================================ */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond){
  if(cond){ pass++; console.log('ok   ' + name); }
  else { fail++; console.log('FAIL ' + name); }
}
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const css = read('styles.css');
const html = read('index.html');
const app = read('app.js');
const manifest = JSON.parse(read('manifest.webmanifest'));

const blockOf = sel => {
  const i = css.indexOf(sel);
  if(i < 0) return '';
  const start = css.indexOf('{', i) + 1;
  return css.slice(start, css.indexOf('}', start));
};
const token = (block, name) => {
  const m = block.match(new RegExp('--' + name + ':\\s*([^;]+);'));
  return m ? m[1].trim() : null;
};
const dark = blockOf(':root{');
const light = blockOf(':root[data-theme="light"]{');

/* ---------- 1. el turquesa no vuelve ---------- */
const turquoise = /#19d3c5/i;
check('el turquesa residual no aparece en styles.css', !turquoise.test(css));
check('el turquesa residual no aparece en index.html', !turquoise.test(html));
check('el turquesa residual no aparece en app.js', !turquoise.test(app));
check('el turquesa residual no aparece en el manifest', !turquoise.test(read('manifest.webmanifest')));

/* ---------- 2. capa semántica en ambos temas ---------- */
const semantic = [
  'bg', 'surface', 'surface-2', 'text', 'muted', 'muted-2',
  'accent', 'accent-strong', 'accent-deep', 'accent-ink', 'accent-text', 'accent-rgb',
  'ok', 'warn', 'danger', 'danger-text', 'focus',
  'space-1', 'space-4', 'space-8',
  'radius-xs', 'radius-sm', 'radius-md', 'radius', 'radius-lg', 'radius-pill',
  'font-size-xs', 'font-size-sm', 'font-size-base', 'font-size-lg', 'font-size-2xl',
];
/* los colores y los estados se redefinen en cada tema; las escalas son
   compartidas y viven solo en :root, de modo que el tema claro las hereda. */
const colorTokens = ['bg', 'surface', 'surface-2', 'text', 'muted', 'muted-2',
  'accent', 'accent-strong', 'accent-deep', 'accent-ink', 'accent-text', 'accent-rgb',
  'ok', 'warn', 'danger', 'danger-text', 'focus'];
const scaleTokens = ['space-1', 'space-4', 'space-8', 'radius-xs', 'radius-sm', 'radius-md',
  'radius', 'radius-lg', 'radius-pill', 'font-size-xs', 'font-size-sm', 'font-size-base',
  'font-size-lg', 'font-size-2xl'];
for(const name of colorTokens){
  check(`token --${name} declarado en :root`, !!token(dark, name));
  check(`token --${name} declarado en el tema claro`, !!token(light, name));
}
for(const name of scaleTokens){
  check(`escala --${name} declarada en :root`, !!token(dark, name));
}

/* ---------- 3. acento y alias heredados ---------- */
check('el acento oscuro es el naranja de la marca (#f28c28)', token(dark, 'accent') === '#f28c28');
check('el tema claro redefine el acento', /^#[0-9a-f]{6}$/i.test(token(light, 'accent') || '') && token(light, 'accent') !== token(dark, 'accent'));
for(const alias of ['panel', 'panel-2', 'orange', 'orange-grad', 'green', 'red']){
  check(`alias --${alias} conservado en oscuro`, !!token(dark, alias));
  check(`alias --${alias} conservado en claro`, !!token(light, alias));
}
check('no quedan literales del naranja anterior en styles.css', !/#ff7a00|#ffa040|#f05100/i.test(css));
check('no quedan literales del naranja anterior en app.js', !/#ff7a00|#ffa040|#f05100/i.test(app));

/* ---------- 4. foco visible ---------- */
check('existe una regla :focus-visible', /:focus-visible\s*\{[^}]*outline:3px solid var\(--focus\)/.test(css));
const outlineNone = css.match(/[^{}]*\{[^}]*outline:none[^}]*\}/g) || [];
check('outline:none solo se usa en #main o en campos con anillo propio',
  outlineNone.every(rule => /#main|input|select|textarea/.test(rule.split('{')[0])));
check('los campos sustituyen el outline por un anillo visible',
  /input:focus,select:focus,textarea:focus\{[^}]*box-shadow:0 0 0 3px/.test(css));

/* ---------- 5. tamaño mínimo de texto ---------- */
const tiny = [...css.matchAll(/font-size:\s*([0-9.]+)px/g)].map(m => Number(m[1])).filter(px => px < 12);
check('ningún tamaño de fuente declarado baja de 12 px', tiny.length === 0);

/* ---------- 6. navegación ---------- */
const routes = [...html.matchAll(/data-action="tab" data-route="([a-z]+)"/g)].map(m => m[1]);
const unique = [...new Set(routes)];
check('la navegación declara exactamente 5 destinos', unique.length === 5);
check('cada destino aparece en barra lateral y barra inferior', unique.every(r => routes.filter(x => x === r).length === 2));
const navBlock = (id) => {
  const start = html.indexOf('id="' + id + '"');
  return start < 0 ? '' : html.slice(start, html.indexOf('</nav>', start));
};
for(const id of ['sidebar', 'bottomnav']){
  const block = navBlock(id);
  check(`${id} marca un único destino con aria-current`, (block.match(/aria-current="page"/g) || []).length === 1);
}
check('las dos barras de navegación tienen aria-label', /<nav class="sidebar" id="sidebar" aria-label="[^"]+"/.test(html)
  && /<nav class="bottomnav" id="bottomnav" aria-label="[^"]+"/.test(html));
check('la barra lateral y la inferior comparten los mismos destinos',
  unique.every(r => new RegExp('data-route="' + r + '"').test(navBlock('sidebar'))
    && new RegExp('data-route="' + r + '"').test(navBlock('bottomnav'))));

/* ---------- 7. color del navegador coherente ---------- */
const metaTheme = (html.match(/<meta name="theme-color"[^>]*content="(#[0-9a-f]{6})"/i) || [])[1];
check('index.html declara theme-color', !!metaTheme);
check('el theme-color coincide con el fondo oscuro', metaTheme === token(dark, 'bg'));
check('el manifest usa los mismos colores', manifest.theme_color === token(dark, 'bg') && manifest.background_color === token(dark, 'bg'));

/* ---------- 8. objetivos táctiles y movimiento reducido ---------- */
check('botones y navegación tienen 44 px de alto mínimo', /\.btn,\.nav-btn,\.theme-btn,\.user-chip\{min-height:44px\}/.test(css));
check('existe el bloque de movimiento reducido', /@media \(prefers-reduced-motion:reduce\)/.test(css));

/* ---------- 9. primitivas compartidas ---------- */
for(const primitive of ['.btn-secondary', '.card-head', '.badge{', '.alert{', '.skeleton{', '.badge-ok', '.badge-danger', '.alert-danger']){
  check(`existe la primitiva ${primitive.replace('{', '')}`, css.includes(primitive));
}
check('las primitivas usan tokens, no colores sueltos',
  /\.btn-secondary\{background:var\(--surface-2\)/.test(css) && /\.badge\{[^}]*var\(--radius-pill\)/.test(css));

console.log(`\n${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
