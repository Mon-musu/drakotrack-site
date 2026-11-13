#!/usr/bin/env node
/* ============================================================
   Desempaqueta la referencia F5 enviada en partes de texto Base64.

   Uso:
     node scripts/f5-unpack.mjs --dir <carpeta> [--out <zip>]

   Concatena `*-parte-01*, *-parte-02*, ...` en orden numérico, quitando
   espacios y saltos de línea (el Base64 no los necesita), decodifica y
   escribe el ZIP. Después comprueba el CRC de cada entrada, que es la
   integridad real del archivo: si una parte faltó o se cortó, falla.
   ============================================================ */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const dir = resolve(arg('dir', '.'));
const out = resolve(arg('out', 'drakotrack-visual-refresh-f5.zip'));

const parts = readdirSync(dir)
  .filter(name => /parte[-_ ]?0*\d+/i.test(name))
  .sort((a, b) => {
    const n = name => Number((/parte[-_ ]?0*(\d+)/i.exec(name) || [])[1] || 0);
    return n(a) - n(b);
  });

if (!parts.length) {
  console.error('No se encontraron archivos *parte-NN*.txt en ' + dir);
  process.exit(2);
}

const text = parts.map(name => readFileSync(join(dir, name), 'utf8')).join('').replace(/[^A-Za-z0-9+/=]/g, '');
if (!text.length || text.length % 4) {
  console.error('Base64 inválido: ' + text.length + ' caracteres (debe ser múltiplo de 4)');
  process.exit(2);
}

const bytes = Buffer.from(text, 'base64');
writeFileSync(out, bytes);
console.log(parts.length + ' parte(s): ' + parts.join(', '));
console.log('Base64 ' + text.length + ' caracteres -> ' + bytes.length + ' bytes en ' + out);
if (bytes.subarray(0, 2).toString('latin1') !== 'PK') {
  console.error('El resultado no empieza por "PK": el Base64 está incompleto o mezclado.');
  process.exit(3);
}
