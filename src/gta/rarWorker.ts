/// <reference lib="webworker" />
// Extrae un .rar en un Web Worker. La librería (Emscripten) genera código
// en tiempo de ejecución, por lo que este script se sirve con su propia
// política de seguridad; la página principal mantiene la CSP estricta.
import { createExtractorFromData } from 'node-unrar-js';
import wasmUrl from 'node-unrar-js/esm/js/unrar.wasm?url';

const WANTED = /\.(yft|ytd|ydr|zip|oiv|rar)$/i;

self.onmessage = async (e: MessageEvent<ArrayBuffer>) => {
  try {
    const wasmBinary = await (await fetch(wasmUrl)).arrayBuffer();
    const ex = await createExtractorFromData({ wasmBinary, data: e.data });
    const { files } = ex.extract({ files: (h) => WANTED.test(h.name) });
    const out: { name: string; data: Uint8Array }[] = [];
    for (const f of files) if (f.extraction && !f.fileHeader.flags.directory) out.push({ name: f.fileHeader.name, data: f.extraction });
    (self as unknown as Worker).postMessage({ files: out }, out.map((f) => f.data.buffer as ArrayBuffer));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ error: /password|encrypt/i.test(msg) ? 'El .rar está protegido con contraseña.' : `No se pudo abrir el .rar: ${msg}` });
  }
};
