// Servidor del Configurador 3D: archivos estáticos + API para guardar los
// coches subidos por el usuario (mods de GTA V convertidos a GLB).
// Sin dependencias externas: solo módulos de Node.js.
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { Transform } from 'node:stream';

const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? './dist');
const CUSTOM_DIR = resolve(process.env.CUSTOM_DIR ?? '/srv/configurador/custom');
const DATA_DIR = resolve(process.env.DATA_DIR ?? '/data');
const MODS_DIR = join(DATA_DIR, 'mods');
const MAX_UPLOAD = Number(process.env.MAX_SUBIDA_MB ?? 400) * 1024 * 1024;
const UPLOADS_ENABLED = (process.env.SUBIDAS ?? 'true').toLowerCase() !== 'false';
const KEY = process.env.CLAVE_SUBIDAS ?? '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.hdr': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.glb', '.gltf', '.bin', '.hdr', '.txt', '.wasm']);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
};

const ID_RE = /^mod-[a-f0-9]{16}$/;
const FILES = { 'model.glb': 'model.glb', 'miniatura.jpg': 'miniatura.jpg', original: 'original.bin' };

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

const fail = (res, status, mensaje) => send(res, status, { error: mensaje });

/** Resuelve una ruta dentro de `root` evitando salir de ella. */
function safeJoin(root, rel) {
  const p = normalize(join(root, decodeURIComponent(rel)));
  return p === root || p.startsWith(root + sep) ? p : null;
}

// El worker que abre los .rar (Emscripten) necesita evaluar código; solo él.
const WORKER_CSP = "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self' data: blob:";
const isRarWorker = (file) => /[\\/]rarWorker-[\w-]+\.js$/.test(file);

async function serveFile(req, res, file, cache) {
  let st;
  try {
    st = await stat(file);
    if (st.isDirectory()) return false;
  } catch {
    return false;
  }
  const ext = extname(file).toLowerCase();
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = { ...SECURITY_HEADERS, ...(isRarWorker(file) ? { 'Content-Security-Policy': WORKER_CSP } : {}), 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': cache, ETag: etag, 'Last-Modified': st.mtime.toUTCString(), Vary: 'Accept-Encoding' };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }
  const gzip = COMPRESSIBLE.has(ext) && st.size > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  if (gzip) headers['Content-Encoding'] = 'gzip';
  else headers['Content-Length'] = st.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end(), true;
  const stream = createReadStream(file);
  try {
    if (gzip) await pipeline(stream, createGzip({ level: 6 }), res);
    else await pipeline(stream, res);
  } catch {
    res.destroy();
  }
  return true;
}

// --------------------------------------------------------------------------
// Coches subidos
// --------------------------------------------------------------------------

async function readMeta(id) {
  try {
    return JSON.parse(await readFile(join(MODS_DIR, id, 'mod.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function writeMeta(id, meta) {
  const tmp = join(MODS_DIR, id, `mod.json.${randomBytes(4).toString('hex')}`);
  await writeFile(tmp, JSON.stringify(meta, null, 2));
  await rename(tmp, join(MODS_DIR, id, 'mod.json'));
}

async function listMods() {
  if (!existsSync(MODS_DIR)) return [];
  const ids = (await readdir(MODS_DIR)).filter((d) => ID_RE.test(d));
  const metas = await Promise.all(ids.map(readMeta));
  return metas.filter((m) => m && m.listo).sort((a, b) => b.creado.localeCompare(a.creado));
}

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const num = (v, min, max, def) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : def);

function sanitizeMeta(input, previous = {}) {
  const parts = input.parts && typeof input.parts === 'object' ? input.parts : previous.parts;
  const cleanParts = {};
  for (const [k, list] of Object.entries(parts ?? {})) {
    if (!['paint', 'rims', 'tires', 'glass', 'headlights', 'taillights', 'calipers', 'chrome', 'trim', 'hide'].includes(k)) continue;
    if (Array.isArray(list)) cleanParts[k] = list.slice(0, 50).map((s) => clip(s, 120)).filter(Boolean);
  }
  return {
    nombre: clip(input.nombre ?? previous.nombre ?? 'Coche sin nombre', 80) || 'Coche sin nombre',
    autor: clip(input.autor ?? previous.autor ?? '', 80),
    origen: clip(input.origen ?? previous.origen ?? '', 300),
    licencia: clip(input.licencia ?? previous.licencia ?? '', 120),
    vehiculo: clip(input.vehiculo ?? previous.vehiculo ?? '', 60),
    archivoOriginal: clip(input.archivoOriginal ?? previous.archivoOriginal ?? '', 200),
    longitud: num(input.longitud ?? previous.longitud, 1, 30, 4.7),
    pinturaInicial: clip(input.pinturaInicial ?? previous.pinturaInicial ?? '', 40),
    informe: input.informe && typeof input.informe === 'object' ? JSON.parse(JSON.stringify(input.informe).slice(0, 20000)) : previous.informe,
    parts: Object.keys(cleanParts).length ? cleanParts : undefined,
  };
}

const GTA_PARTS = {
  paint: ['/^gta_pintura_/'],
  tires: ['/^gta_neumatico_/'],
  glass: ['/^gta_cristal_/'],
  headlights: ['/^gta_luz_delantera_/'],
  taillights: ['/^gta_luz_trasera_/'],
  rims: ['/^gta_pieza_/'],
};

const GENERIC_WHEELS = ['gen-turbina', 'gen-aero', 'gen-deportiva', 'gen-multirradio', 'gen-y'];

function catalogFromMods(mods) {
  if (!mods.length) return { version: 1, models: [] };
  return {
    version: 1,
    models: [
      {
        id: 'mis-coches',
        name: 'Mis coches',
        generations: mods.map((m) => ({
          id: m.id,
          label: m.nombre,
          years: 'mod de GTA V',
          file: `${m.id}/model.glb`,
          lengthMeters: m.longitud,
          forward: '-z',
          parts: m.parts ?? GTA_PARTS,
          // Si el mod no traía ruedas se generan neumáticos y se usa una llanta genérica.
          wheels: m.informe?.generatedTires ? GENERIC_WHEELS : ['original', 'original-negro', 'original-grafito', ...GENERIC_WHEELS],
          defaultWheel: m.informe?.generatedTires ? 'gen-turbina' : 'original',
          ...(m.pinturaInicial ? { defaultPaint: m.pinturaInicial } : {}),
          credits: {
            title: m.nombre,
            author: m.autor || 'Autor del mod no indicado',
            source: m.origen || `Mod de GTA V subido por el usuario (${m.archivoOriginal || m.vehiculo})`,
            license: m.licencia || 'Licencia del mod no indicada (solo uso personal)',
            licenseUrl: '',
            modifications: 'Convertido automáticamente de GTA V (.yft/.ytd) a GLB por el configurador.',
          },
          note: 'Coche subido por ti a partir de un mod de GTA V. Las piezas se han identificado automáticamente por los shaders del juego.',
        })),
      },
    ],
  };
}

function authorized(req) {
  if (!KEY) return true;
  const got = Buffer.from(String(req.headers['x-clave'] ?? ''));
  const want = Buffer.from(KEY);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function readJsonBody(req, limit = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 });
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('JSON no válido'), { status: 400 });
  }
}

/** Guarda el cuerpo de la petición en disco con límite de tamaño. */
async function saveBody(req, dest, check) {
  const tmp = `${dest}.${randomBytes(4).toString('hex')}.parcial`;
  let size = 0;
  let head = Buffer.alloc(0);
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (head.length < 16) head = Buffer.concat([head, chunk]).subarray(0, 16);
      if (size > MAX_UPLOAD) return cb(Object.assign(new Error(`El archivo supera el límite de ${MAX_UPLOAD / 1048576} MB`), { status: 413 }));
      cb(null, chunk);
    },
  });
  try {
    await pipeline(req, limiter, createWriteStream(tmp));
    if (check && !check(head)) throw Object.assign(new Error('El contenido no tiene el formato esperado'), { status: 400 });
    await rename(tmp, dest);
    return size;
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

async function handleApi(req, res, path) {
  if (path === '/api/estado' && req.method === 'GET')
    return send(res, 200, { subidas: UPLOADS_ENABLED, requiereClave: !!KEY, limiteMB: MAX_UPLOAD / 1048576 });

  if (path === '/api/mods' && req.method === 'GET') return send(res, 200, await listMods());

  if (!UPLOADS_ENABLED) return fail(res, 403, 'La subida de coches está desactivada en este servidor.');
  if (!authorized(req)) return fail(res, 401, 'Clave de subida incorrecta.');

  if (path === '/api/mods' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const id = `mod-${randomBytes(8).toString('hex')}`;
    await mkdir(join(MODS_DIR, id), { recursive: true });
    await writeMeta(id, { id, creado: new Date().toISOString(), listo: false, ...sanitizeMeta(body) });
    return send(res, 201, { id });
  }

  const m = /^\/api\/mods\/(mod-[a-f0-9]{16})(?:\/(archivo\/[a-z.]+|listo))?$/.exec(path);
  if (!m) return fail(res, 404, 'Ruta no encontrada');
  const [, id, sub] = m;
  const meta = await readMeta(id);
  if (!meta) return fail(res, 404, 'Coche no encontrado');

  if (!sub && req.method === 'PATCH') {
    const body = await readJsonBody(req);
    const next = { ...meta, ...sanitizeMeta(body, meta), id, creado: meta.creado, listo: meta.listo };
    await writeMeta(id, next);
    return send(res, 200, next);
  }
  if (!sub && req.method === 'DELETE') {
    await rm(join(MODS_DIR, id), { recursive: true, force: true });
    return send(res, 200, { ok: true });
  }
  if (sub?.startsWith('archivo/') && req.method === 'PUT') {
    const key = sub.slice('archivo/'.length);
    const file = FILES[key];
    if (!file) return fail(res, 400, 'Archivo no permitido');
    const check =
      key === 'model.glb'
        ? (h) => h.subarray(0, 4).toString('latin1') === 'glTF'
        : key === 'miniatura.jpg'
          ? (h) => h[0] === 0xff && h[1] === 0xd8
          : null;
    const size = await saveBody(req, join(MODS_DIR, id, file), check);
    return send(res, 200, { ok: true, bytes: size });
  }
  if (sub === 'listo' && req.method === 'POST') {
    if (!existsSync(join(MODS_DIR, id, 'model.glb'))) return fail(res, 400, 'Falta el modelo GLB');
    await writeMeta(id, { ...meta, listo: true });
    return send(res, 200, { ok: true });
  }
  return fail(res, 405, 'Método no permitido');
}

// --------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (path === '/healthz') return send(res, 200, 'ok\n');
    if (path.startsWith('/api/')) return await handleApi(req, res, path);
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Método no permitido');

    if (path === '/mods/catalog.json') return send(res, 200, catalogFromMods(await listMods()), { 'Cache-Control': 'no-cache' });
    if (path.startsWith('/mods/')) {
      const [, , id, file] = path.split('/');
      if (!ID_RE.test(id ?? '') || !['model.glb', 'miniatura.jpg'].includes(file ?? '')) return fail(res, 404, 'No encontrado');
      if (await serveFile(req, res, join(MODS_DIR, id, file), 'public, max-age=86400')) return;
      return fail(res, 404, 'No encontrado');
    }
    if (path.startsWith('/custom/')) {
      const f = safeJoin(CUSTOM_DIR, path.slice('/custom/'.length));
      if (f && (await serveFile(req, res, f, 'no-cache'))) return;
      return fail(res, 404, 'No encontrado');
    }
    const f = safeJoin(STATIC_DIR, path === '/' ? 'index.html' : path.slice(1));
    const cache = path.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : /^\/(models|hdri|draco)\//.test(path) && !path.endsWith('catalog.json')
        ? 'public, max-age=604800'
        : 'no-cache';
    if (f && (await serveFile(req, res, f, cache))) return;
    if (/^\/(assets|models|hdri|draco)\//.test(path)) return fail(res, 404, 'No encontrado');
    await serveFile(req, res, join(STATIC_DIR, 'index.html'), 'no-cache');
  } catch (e) {
    if (e.code === 'EACCES' || e.code === 'EROFS')
      e = Object.assign(new Error('El servidor no puede escribir en la carpeta de datos. En Unraid ejecuta una vez: chown -R 99:100 /mnt/user/appdata/configurador-tesla/datos'), { status: 500 });
    if (e.code === 'ENOSPC') e = Object.assign(new Error('No queda espacio en el disco del servidor.'), { status: 507 });
    if (!res.headersSent) fail(res, e.status ?? 500, e.status ? e.message : 'Error interno');
    if (!e.status) console.error(e);
  }
});

async function start() {
  if (UPLOADS_ENABLED) {
    try {
      await mkdir(MODS_DIR, { recursive: true });
      const probe = join(MODS_DIR, `.prueba-${process.pid}`);
      await writeFile(probe, 'ok');
      await rm(probe);
    } catch (e) {
      console.error(
        `AVISO: no se puede escribir en ${DATA_DIR} (${e.code}). Los coches subidos no se podrán guardar. ` +
          'En Unraid ejecuta una vez: chown -R 99:100 /mnt/user/appdata/configurador-tesla/datos',
      );
    }
  }
  server.listen(PORT, () => console.log(`Configurador 3D escuchando en el puerto ${PORT} (datos: ${DATA_DIR})`));
}

for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
start();
