// Muestra, por material, el número de vértices y la caja envolvente en metros
// (eje Y vertical). Útil para preparar la entrada de un modelo en el catálogo.
//   node scripts/inspect-model.mjs modelo.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { getBounds } from '@gltf-transform/core';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const scene = doc.getRoot().listScenes()[0];
const sb = getBounds(scene);
console.log('Escena:', sb.min.map((v) => v.toFixed(2)).join(','), '→', sb.max.map((v) => v.toFixed(2)).join(','));
const stats = new Map();
const mul = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
scene.traverse((node) => {
  const mesh = node.getMesh();
  if (!mesh) return;
  const wm = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const name = prim.getMaterial()?.getName() ?? '(sin material)';
    const pos = prim.getAttribute('POSITION');
    let s = stats.get(name);
    if (!s) stats.set(name, (s = { n: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], nodes: new Set() }));
    s.nodes.add(node.getName());
    const el = [];
    for (let i = 0; i < pos.getCount(); i++) {
      const p = mul(wm, pos.getElement(i, el));
      for (let k = 0; k < 3; k++) {
        if (p[k] < s.min[k]) s.min[k] = p[k];
        if (p[k] > s.max[k]) s.max[k] = p[k];
      }
    }
    s.n += pos.getCount();
  }
});
for (const [name, s] of [...stats].sort((a, b) => b[1].n - a[1].n)) {
  const f = (a) => a.map((v) => v.toFixed(2)).join(',');
  console.log(`${name.padEnd(48)} v=${String(s.n).padStart(7)}  [${f(s.min)}] → [${f(s.max)}]  nodos=${[...s.nodes].slice(0, 3).join('|')}${s.nodes.size > 3 ? '…' : ''}`);
}
