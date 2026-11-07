/** Cliente de la API del servidor para los coches subidos. */
export interface ServerStatus {
  subidas: boolean;
  requiereClave: boolean;
  limiteMB: number;
}

export interface ModMeta {
  id: string;
  nombre: string;
  autor?: string;
  origen?: string;
  licencia?: string;
  vehiculo?: string;
  destino?: string;
  archivoOriginal?: string;
  longitud: number;
  creado: string;
  informe?: Record<string, unknown>;
}

const KEY_STORAGE = 'configurador-tesla.clave-subidas';
export const getKey = () => {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
};
export const setKey = (k: string) => {
  try {
    localStorage.setItem(KEY_STORAGE, k);
  } catch {
    /* sin almacenamiento */
  }
};

const api = (p: string) => new URL(`api/${p}`, document.baseURI).href;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(api(path), { ...init, headers: { 'X-Clave': getKey(), ...(init.headers ?? {}) } });
  const type = res.headers.get('content-type') ?? '';
  const body = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `Error ${res.status}`);
  return body as T;
}

export async function getStatus(): Promise<ServerStatus | null> {
  try {
    const res = await fetch(api('estado'));
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    return (await res.json()) as ServerStatus;
  } catch {
    return null;
  }
}

export const listMods = () => call<ModMeta[]>('mods');
export const createMod = (meta: Partial<ModMeta> & Record<string, unknown>) =>
  call<{ id: string }>('mods', { method: 'POST', body: JSON.stringify(meta), headers: { 'Content-Type': 'application/json' } });
export const updateMod = (id: string, meta: Partial<ModMeta>) =>
  call<ModMeta>(`mods/${id}`, { method: 'PATCH', body: JSON.stringify(meta), headers: { 'Content-Type': 'application/json' } });
export const deleteMod = (id: string) => call(`mods/${id}`, { method: 'DELETE' });
export const finishMod = (id: string) => call(`mods/${id}/listo`, { method: 'POST' });

/** Sube un archivo con progreso (XHR permite conocer el avance de la subida). */
export function uploadFile(id: string, name: 'model.glb' | 'miniatura.jpg' | 'original', data: Blob | ArrayBuffer, onProgress?: (f: number) => void) {
  return new Promise<void>((resolveP, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', api(`mods/${id}/archivo/${name}`));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Clave', getKey());
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolveP();
      else {
        let msg = `Error ${xhr.status}`;
        try {
          msg = JSON.parse(xhr.responseText).error ?? msg;
        } catch {
          /* texto plano */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Error de red durante la subida'));
    xhr.send(data);
  });
}
