// Valida public/models/catalog.json (y opcionalmente otro catálogo pasado como argumento).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const file = resolve(process.argv[2] ?? 'public/models/catalog.json');
const base = dirname(file);
const cat = JSON.parse(readFileSync(file, 'utf8'));
const errors = [];
const paints = new Set((cat.paints ?? []).map((p) => p.id));
const wheels = new Set((cat.wheels ?? []).map((w) => w.id));
const designs = new Set(['original', 'aero', 'cinco-dobles', 'multirradio', 'turbina', 'y-radios']);
const forwards = new Set(['+x', '-x', '+z', '-z']);
const isExtension = process.argv[2] !== undefined;

for (const w of cat.wheels ?? []) if (!designs.has(w.design)) errors.push(`Llanta ${w.id}: diseño desconocido "${w.design}"`);
for (const p of cat.paints ?? []) if (!/^#[0-9a-f]{6}$/i.test(p.color)) errors.push(`Pintura ${p.id}: color no válido`);
for (const m of cat.models ?? []) {
  if (!m.id || !m.name) errors.push('Modelo sin id o nombre');
  for (const g of m.generations ?? []) {
    const tag = `${m.name} / ${g.label}`;
    if (!forwards.has(g.forward)) errors.push(`${tag}: "forward" debe ser +x, -x, +z o -z`);
    if (!(g.lengthMeters > 1)) errors.push(`${tag}: "lengthMeters" no válido`);
    if (!g.credits?.license || !g.credits?.author || !g.credits?.source) errors.push(`${tag}: faltan créditos/licencia`);
    if (g.available !== false) {
      for (const f of [g.file, ...(g.variants ?? []).map((v) => v.file)])
        if (!existsSync(resolve(base, f))) errors.push(`${tag}: no existe el archivo ${f}`);
    }
    if (!isExtension) {
      for (const p of g.paints ?? []) if (!paints.has(p)) errors.push(`${tag}: pintura desconocida ${p}`);
      for (const w of g.wheels ?? []) if (!wheels.has(w)) errors.push(`${tag}: llanta desconocida ${w}`);
    }
  }
}
if (errors.length) {
  console.error('Catálogo con errores:\n - ' + errors.join('\n - '));
  process.exit(1);
}
console.log(`Catálogo correcto: ${file} (${(cat.models ?? []).length} modelos)`);
