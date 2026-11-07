import { useCallback, useEffect, useRef, useState } from 'react';
import type { VehicleCandidate } from '../gta/archive';
import { useStore } from '../state/store';
import { captureThumbnail } from '../utils/capture';
import {
  createMod,
  deleteMod,
  finishMod,
  getKey,
  getStatus,
  listMods,
  setKey,
  updateMod,
  uploadFile,
  type ModMeta,
  type ServerStatus,
} from '../utils/modsApi';

const MODEL_ID = 'mis-coches';

export const DESTINOS: { id: string; label: string }[] = [
  { id: 'model-s', label: 'Sustituir al Tesla Model S' },
  { id: 'model-3', label: 'Sustituir al Tesla Model 3' },
  { id: 'model-x', label: 'Sustituir al Tesla Model X' },
  { id: 'model-y', label: 'Sustituir al Tesla Model Y' },
  { id: 'mis-coches', label: 'Guardar en «Mis coches»' },
];

/** Adivina el modelo a partir de los nombres del archivo y del vehículo. */
export function guessTarget(text: string): string {
  const t = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  if (/\bmodel ?x\b|\bmodelx\b|p90d|p100d|\bmx\b/.test(t)) return 'model-x';
  if (/\bmodel ?y\b|\bmodely\b/.test(t)) return 'model-y';
  if (/\bmodel ?3\b|\bmodel3\b|highland/.test(t)) return 'model-3';
  if (/\bmodel ?s\b|\bmodels\b|plaid/.test(t)) return 'model-s';
  return 'mis-coches';
}
const ACCEPT = '.rar,.zip,.oiv,.rpf,.yft,.ytd';

const pretty = (id: string) =>
  id
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

async function dataUrlToBlob(url: string) {
  return (await fetch(url)).blob();
}

export function ModsSection() {
  const [status, setStatus] = useState<ServerStatus | null | undefined>(undefined);
  const [mods, setMods] = useState<ModMeta[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [candidates, setCandidates] = useState<VehicleCandidate[]>([]);
  const [chosen, setChosen] = useState('');
  const [name, setName] = useState('');
  const [author, setAuthor] = useState('');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('mis-coches');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKeyState] = useState(getKey());
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reloadCatalog = useStore((s) => s.reloadCatalog);
  const config = useStore((s) => s.config);

  const refresh = useCallback(async () => {
    try {
      setMods(await listMods());
    } catch {
      setMods([]);
    }
  }, []);

  useEffect(() => {
    getStatus().then((s) => {
      setStatus(s);
      if (s) refresh();
    });
  }, [refresh]);

  const pick = async (list: File[]) => {
    setError(null);
    setCandidates([]);
    setFiles(list);
    if (!list.length) return;
    setBusy(true);
    setProgress('Abriendo archivo…');
    try {
      const { inspectUpload } = await import('../gta/importMod');
      const found = await inspectUpload(list);
      setCandidates(found);
      setChosen(found[0].id);
      setName(pretty(found[0].id));
      setTarget(guessTarget(`${list.map((f) => f.name).join(' ')} ${found[0].id}`));
      setProgress(null);
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  const convertAndSave = async () => {
    const cand = candidates.find((c) => c.id === chosen);
    if (!cand) return;
    setBusy(true);
    setError(null);
    let id: string | null = null;
    try {
      const { convertVehicle } = await import('../gta/importMod');
      const result = await convertVehicle(cand, candidates, setProgress);
      setProgress('Guardando en el servidor…');
      const originalName = files.length === 1 ? files[0].name : `${cand.id} (${files.length} archivos)`;
      ({ id } = await createMod({
        nombre: name.trim() || pretty(cand.id),
        autor: author.trim(),
        origen: source.trim(),
        vehiculo: cand.id,
        destino: target,
        archivoOriginal: originalName,
        longitud: result.report.lengthMeters,
        informe: result.report as unknown as Record<string, unknown>,
      }));
      await uploadFile(id, 'model.glb', result.glb, (f) => setProgress(`Subiendo modelo ${Math.round(f * 100)} % (${mb(result.glb.byteLength)})…`));
      // Se conserva el archivo original para poder reconvertirlo en el futuro.
      const total = files.reduce((a, f) => a + f.size, 0);
      if (files.length === 1 && status && total < status.limiteMB * 1048576)
        await uploadFile(id, 'original', files[0], (f) => setProgress(`Guardando original ${Math.round(f * 100)} %…`));
      await finishMod(id);
      setProgress('Cargando el coche en el configurador…');
      await reloadCatalog({ modelId: target, generationId: id });
      await refresh();
      setFiles([]);
      setCandidates([]);
      if (inputRef.current) inputRef.current.value = '';
      const missing = result.report.missingTextures.length;
      setProgress(
        `Listo: ${result.report.triangles.toLocaleString('es-ES')} triángulos, ${result.report.textures} texturas` +
          (missing ? ` (faltan ${missing} texturas del juego o de otros archivos).` : '.'),
      );
      // Miniatura para la lista, cuando el coche ya se ha dibujado.
      const savedId = id;
      void (async () => {
        const start = Date.now();
        while (!(useStore.getState().carReady ?? '').includes(savedId) && Date.now() - start < 120000)
          await new Promise((r) => setTimeout(r, 500));
        await new Promise((r) => setTimeout(r, 2500)); // sombras y transición de cámara
        const thumb = await captureThumbnail();
        if (thumb) await uploadFile(savedId, 'miniatura.jpg', await dataUrlToBlob(thumb)).catch(() => undefined);
        refresh();
      })();
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
      if (id) await deleteMod(id).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: ModMeta) => {
    if (!confirm(`¿Eliminar «${m.nombre}» del servidor? No se puede deshacer.`)) return;
    try {
      await deleteMod(m.id);
      await reloadCatalog(config.generationId === m.id ? { modelId: '', generationId: '' } : undefined);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const reassign = async (m: ModMeta, destino: string) => {
    try {
      await updateMod(m.id, { destino });
      await reloadCatalog({ modelId: destino, generationId: m.id });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const rename = async (m: ModMeta) => {
    const nombre = prompt('Nuevo nombre', m.nombre);
    if (!nombre || nombre === m.nombre) return;
    try {
      await updateMod(m.id, { nombre });
      await reloadCatalog();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (status === undefined) return <section className="section"><h2>Mis coches</h2><p className="note">Comprobando el servidor…</p></section>;
  if (status === null)
    return (
      <section className="section">
        <h2>Mis coches</h2>
        <p className="note">
          La subida de coches necesita el servidor del contenedor Docker (no está disponible en el modo de desarrollo
          estático).
        </p>
      </section>
    );

  return (
    <section className="section">
      <h2>
        Mis coches <small>mods de GTA V</small>
      </h2>
      {mods.length > 0 && (
        <ul className="saved mods">
          {mods.map((m) => (
            <li key={m.id}>
              <button
                className={config.generationId === m.id ? 'saved-main active' : 'saved-main'}
                onClick={() => useStore.getState().update({ modelId: m.destino ?? MODEL_ID, generationId: m.id })}
                title="Ver en el configurador"
              >
                <img src={`mods/${m.id}/miniatura.jpg`} alt="" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
                <span>
                  <strong>{m.nombre}</strong>
                  <small>
                    {DESTINOS.find((d) => d.id === (m.destino ?? MODEL_ID))?.label.replace('Sustituir al ', 'Sustituye al ').replace('Guardar en «Mis coches»', 'En «Mis coches»')} · {m.vehiculo}
                  </small>
                </span>
              </button>
              <select
                className="icon-select"
                aria-label={`Destino de ${m.nombre}`}
                title="Cambiar a qué modelo sustituye"
                value={m.destino ?? MODEL_ID}
                onChange={(e) => reassign(m, e.target.value)}
              >
                {DESTINOS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              <button className="icon-btn" aria-label={`Renombrar ${m.nombre}`} title="Renombrar" onClick={() => rename(m)}>
                ✎
              </button>
              <button className="icon-btn" aria-label={`Eliminar ${m.nombre}`} title="Eliminar" onClick={() => remove(m)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {!status.subidas ? (
        <p className="note">La subida de coches está desactivada en este servidor.</p>
      ) : (
        <>
          <h3>Subir un coche</h3>
          {status.requiereClave && (
            <label className="field">
              <span>Clave de subida</span>
              <input
                className="text"
                type="password"
                value={key}
                autoComplete="off"
                onChange={(e) => {
                  setKeyState(e.target.value);
                  setKey(e.target.value);
                }}
              />
            </label>
          )}
          <div
            className={dragging ? 'dropzone over' : 'dropzone'}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) pick([...e.dataTransfer.files]);
            }}
            onClick={() => !busy && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          >
            <strong>{files.length ? files.map((f) => f.name).join(', ') : 'Arrastra aquí el mod o pulsa para elegirlo'}</strong>
            <span>.rar, .zip, .oiv, .rpf o los archivos .yft y .ytd (versión de PC del juego)</span>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => pick([...(e.target.files ?? [])])}
            />
          </div>

          {candidates.length > 0 && (
            <>
              {candidates.length > 1 && (
                <label className="field">
                  <span>Vehículo del paquete</span>
                  <select
                    value={chosen}
                    onChange={(e) => {
                      setChosen(e.target.value);
                      setName(pretty(e.target.value));
                    }}
                  >
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} ({c.textures.length} diccionarios de texturas)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                <span>Usar como</span>
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {DESTINOS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Nombre</span>
                <input className="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="field">
                <span>Autor del mod (opcional)</span>
                <input className="text" value={author} maxLength={80} onChange={(e) => setAuthor(e.target.value)} />
              </label>
              <label className="field">
                <span>Enlace o procedencia (opcional)</span>
                <input className="text" value={source} maxLength={300} onChange={(e) => setSource(e.target.value)} />
              </label>
              <div className="row">
                <button className="btn primary" disabled={busy} onClick={convertAndSave}>
                  Convertir y guardar
                </button>
              </div>
            </>
          )}
        </>
      )}
      {progress && (
        <p className="note" role="status">
          {busy && <span className="spinner" aria-hidden />} {progress}
        </p>
      )}
      {error && <p className="note warn" role="alert">{error}</p>}
      <p className="note">
        La conversión se hace en tu navegador y el coche se guarda en el servidor (carpeta <code>datos</code>), visible
        desde cualquier dispositivo de la red. Las piezas (carrocería, neumáticos, cristales y luces) se detectan por los
        shaders del juego. Usa solo mods que tengas derecho a utilizar; quedan para uso privado en tu servidor.
      </p>
    </section>
  );
}
