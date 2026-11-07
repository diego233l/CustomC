import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

const ROAD_WIDTH = 7.6; // dos carriles de 3,5 m + arcenes
const ROAD_LENGTH = 220;
const PERIOD = 12; // metros por repetición de la textura (marca discontinua 4,5 m)

/** Textura procedural de asfalto con marcas viales (sin recursos externos). */
function createAsphaltTextures() {
  const w = 512;
  const h = Math.round((w / ROAD_WIDTH) * PERIOD);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < w * h; i++) {
    const n = rand();
    // Árido claro ocasional sobre base gris oscura.
    const v = n > 0.985 ? 120 + rand() * 60 : 52 + n * 26;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v * 1.02;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const px = w / ROAD_WIDTH;
  // Rodadas ligeramente más oscuras y pulidas.
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (const x of [1.0, 2.6, 4.9, 6.5]) ctx.fillRect((x - 0.35) * px, 0, 0.7 * px, h);
  // Líneas de borde continuas y eje discontinuo.
  ctx.fillStyle = '#e9e9e4';
  ctx.fillRect(0.25 * px, 0, 0.15 * px, h);
  ctx.fillRect((ROAD_WIDTH - 0.4) * px, 0, 0.15 * px, h);
  ctx.fillRect((ROAD_WIDTH / 2 - 0.075) * px, 0, 0.15 * px, (4.5 / PERIOD) * h);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  // Desvanecimiento en los extremos y bordes (canal UV 1, sin repetición).
  const a = document.createElement('canvas');
  a.width = 64;
  a.height = 256;
  const actx = a.getContext('2d')!;
  const gy = actx.createLinearGradient(0, 0, 0, 256);
  gy.addColorStop(0, '#000');
  gy.addColorStop(0.18, '#fff');
  gy.addColorStop(0.82, '#fff');
  gy.addColorStop(1, '#000');
  actx.fillStyle = gy;
  actx.fillRect(0, 0, 64, 256);
  const gx = actx.createLinearGradient(0, 0, 64, 0);
  gx.addColorStop(0, 'rgba(0,0,0,1)');
  gx.addColorStop(0.03, 'rgba(0,0,0,0)');
  gx.addColorStop(0.97, 'rgba(0,0,0,0)');
  gx.addColorStop(1, 'rgba(0,0,0,1)');
  actx.globalCompositeOperation = 'source-over';
  actx.fillStyle = gx;
  actx.fillRect(0, 0, 64, 256);
  const alpha = new THREE.CanvasTexture(a);
  alpha.channel = 1;
  return { map, alpha };
}

export function Road() {
  const { geometry, material } = useMemo(() => {
    const g = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_LENGTH, 1, 1);
    // UV0 repetida a lo largo; UV1 normalizada para el desvanecimiento.
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    g.setAttribute('uv1', uv.clone());
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (ROAD_LENGTH / PERIOD));
    const { map, alpha } = createAsphaltTextures();
    const m = new THREE.MeshStandardMaterial({
      name: 'asfalto',
      map,
      alphaMap: alpha,
      transparent: true,
      roughness: 0.92,
      metalness: 0,
      depthWrite: false,
    });
    return { geometry: g, material: m };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.map?.dispose();
      material.alphaMap?.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  // El coche (frontal hacia +Z) circula por el carril derecho: el eje queda a su izquierda (+X).
  return (
    <mesh geometry={geometry} material={material} rotation-x={-Math.PI / 2} position={[1.8, 0.0015, 0]} receiveShadow renderOrder={-1} />
  );
}
