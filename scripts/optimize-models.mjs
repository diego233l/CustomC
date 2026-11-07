// Optimiza un modelo GLB/GLTF para la web sin perder detalle geométrico:
// compresión Meshopt y texturas WebP (máx. 2048 px). A diferencia de
// `gltf-transform optimize`, NO fusiona materiales iguales: cada pieza
// (pintura, neumático, faros…) debe conservar su propio material para que
// el configurador pueda modificarla por separado.
//   npm run models:optimize -- entrada.gltf salida.glb [tamaño_textura]
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, meshopt, prune, resample, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [input, output, size = '2048'] = process.argv.slice(2);
if (!input || !output) {
  console.error('Uso: npm run models:optimize -- <entrada.gltf|glb> <salida.glb> [tamaño_textura]');
  process.exit(1);
}
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(input);
const extras = doc.getRoot().getAsset().extras;
await doc.transform(
  dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
  flatten(),
  join({ keepNamed: false }),
  weld(),
  resample(),
  prune({ keepAttributes: false }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [Number(size), Number(size)] }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
// Conserva los metadatos de autoría/licencia del archivo original.
if (extras) doc.getRoot().getAsset().extras = extras;
await io.write(output, doc);
console.log(`Escrito ${output}`);
