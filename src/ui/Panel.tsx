import { useMemo, useState } from 'react';
import type { Generation, Paint, Wheel } from '../catalog/types';
import { useStore } from '../state/store';
import { ENVIRONMENTS } from '../three/environments';
import { captureImage, captureThumbnail } from '../utils/capture';

const FINISH_LABEL: Record<Paint['finish'], string> = {
  solido: 'Sólido',
  metalizado: 'Metalizado',
  perlado: 'Perlado multicapa',
  mate: 'Mate',
};

export type TabId = 'modelo' | 'pintura' | 'llantas' | 'entorno' | 'mas';
export const TABS: { id: TabId; label: string }[] = [
  { id: 'modelo', label: 'Modelo' },
  { id: 'pintura', label: 'Pintura' },
  { id: 'llantas', label: 'Llantas' },
  { id: 'entorno', label: 'Entorno' },
  { id: 'mas', label: 'Más' },
];

function useCurrent() {
  const loaded = useStore((s) => s.loaded)!;
  const config = useStore((s) => s.config);
  const model = loaded.catalog.models.find((m) => m.id === config.modelId)!;
  const gen = model.generations.find((g) => g.id === config.generationId)!;
  const paints = loaded.catalog.paints.filter((p) => !gen.paints || gen.paints.includes(p.id));
  const wheels = loaded.catalog.wheels.filter((w) => !gen.wheels || gen.wheels.includes(w.id));
  const paint = loaded.catalog.paints.find((p) => p.id === config.paintId);
  const wheel = loaded.catalog.wheels.find((w) => w.id === config.wheelId);
  return { loaded, config, model, gen, paints, wheels, paint, wheel };
}

export function summaryLines(): string[] {
  const s = useStore.getState();
  const l = s.loaded;
  if (!l) return [];
  const c = s.config;
  const model = l.catalog.models.find((m) => m.id === c.modelId);
  const gen = model?.generations.find((g) => g.id === c.generationId);
  const paint = l.catalog.paints.find((p) => p.id === c.paintId);
  const wheel = l.catalog.wheels.find((w) => w.id === c.wheelId);
  const env = ENVIRONMENTS.find((e) => e.id === c.environmentId);
  return [
    `${model?.name ?? ''} · ${gen?.label ?? ''}`,
    `Pintura: ${paint?.name ?? ''} · Llantas: ${wheel?.name ?? ''}${wheel?.inches ? ` ${wheel.inches}″` : ''} · Entorno: ${env?.name ?? ''}`,
    `Modelo 3D: «${gen?.credits.title ?? ''}» de ${gen?.credits.author ?? ''} (${gen?.credits.license ?? ''})`,
  ];
}

function ModelSection() {
  const { loaded, config, model, gen } = useCurrent();
  const update = useStore((s) => s.update);
  return (
    <section className="section">
      <h2>Modelo</h2>
      <div className="model-tabs" role="tablist" aria-label="Modelo">
        {loaded.catalog.models.map((m) => {
          const ok = m.generations.some((g) => g.available !== false);
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={m.id === config.modelId}
              className={m.id === config.modelId ? 'chip active' : 'chip'}
              disabled={!ok}
              title={ok ? m.name : `${m.name}: modelo 3D pendiente`}
              onClick={() => update({ modelId: m.id })}
            >
              {m.name.replace('Tesla ', '')}
            </button>
          );
        })}
      </div>
      <label className="field">
        <span>Generación</span>
        <select value={config.generationId} onChange={(e) => update({ generationId: e.target.value })}>
          {model.generations.map((g: Generation) => (
            <option key={g.id} value={g.id} disabled={g.available === false}>
              {g.label}
              {g.years ? ` (${g.years})` : ''}
              {g.available === false ? ' — pendiente' : ''}
            </option>
          ))}
        </select>
      </label>
      {gen.variants && gen.variants.length > 0 && (
        <div className="segmented" role="radiogroup" aria-label="Variante">
          <button className={!config.variantId ? 'active' : ''} onClick={() => update({ variantId: null })}>
            Estándar
          </button>
          {gen.variants.map((v) => (
            <button key={v.id} className={config.variantId === v.id ? 'active' : ''} onClick={() => update({ variantId: v.id })}>
              {v.label}
            </button>
          ))}
        </div>
      )}
      {gen.note && <p className="note">{gen.note}</p>}
      <p className="credit-line">
        Modelo 3D: «{gen.credits.title}» de{' '}
        <a href={gen.credits.authorUrl ?? gen.credits.source} target="_blank" rel="noreferrer">
          {gen.credits.author}
        </a>{' '}
        ·{' '}
        <a href={gen.credits.licenseUrl} target="_blank" rel="noreferrer">
          {gen.credits.license}
        </a>
      </p>
    </section>
  );
}

function PaintSection() {
  const { config, paints, paint } = useCurrent();
  const update = useStore((s) => s.update);
  return (
    <section className="section">
      <h2>
        Pintura <small>{paint ? `${paint.name} · ${FINISH_LABEL[paint.finish]}` : ''}</small>
      </h2>
      <div className="swatches">
        {paints.map((p) => (
          <button
            key={p.id}
            className={p.id === config.paintId ? 'swatch active' : 'swatch'}
            onClick={() => update({ paintId: p.id })}
            title={`${p.name} (${FINISH_LABEL[p.finish]})`}
            aria-label={`${p.name}, ${FINISH_LABEL[p.finish]}`}
            aria-pressed={p.id === config.paintId}
          >
            <span
              className={`dot finish-${p.finish}`}
              style={{ '--c': p.color, '--f': p.flopColor ?? p.color } as React.CSSProperties}
            />
            <span className="swatch-name">{p.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function WheelPreview({ w }: { w: Wheel }) {
  const n = { aero: 5, 'cinco-dobles': 10, multirradio: 10, turbina: 12, 'y-radios': 15, original: 0 }[w.design];
  const color = w.finish?.color ?? '#9aa0a6';
  return (
    <svg viewBox="-50 -50 100 100" className="wheel-svg" aria-hidden>
      <circle r="48" fill="#111" />
      <circle r="40" fill={w.design === 'aero' ? color : '#222'} stroke={color} strokeWidth="3" />
      {w.design === 'original' ? (
        <text y="6" textAnchor="middle" fontSize="16" fill="#ddd">
          3D
        </text>
      ) : (
        Array.from({ length: n }).map((_, i) => (
          <rect
            key={i}
            x="-3"
            y="-39"
            width="6"
            height="28"
            rx="2"
            fill={w.design === 'aero' ? '#111' : color}
            transform={`rotate(${(i * 360) / n}) ${w.design === 'turbina' ? 'skewX(18)' : ''}`}
          />
        ))
      )}
      <circle r="10" fill={color} />
    </svg>
  );
}

function WheelSection() {
  const { config, wheels, gen } = useCurrent();
  const update = useStore((s) => s.update);
  const allCalipers = useStore((s) => s.loaded!.catalog.caliperColors ?? []);
  const selected = wheels.find((w) => w.id === config.wheelId);
  // Las pinzas solo se pueden colorear si el modelo las tiene separadas o si
  // se usa un diseño de llanta alternativo (que incluye sus propias pinzas).
  const calipers = (gen.parts.calipers?.length ?? 0) > 0 || selected?.design !== 'original' ? allCalipers : [];
  return (
    <section className="section">
      <h2>Llantas</h2>
      <div className="wheels">
        {wheels.map((w) => (
          <button
            key={w.id}
            className={w.id === config.wheelId ? 'wheel-card active' : 'wheel-card'}
            onClick={() => update({ wheelId: w.id })}
            aria-pressed={w.id === config.wheelId}
          >
            <WheelPreview w={w} />
            <span className="wheel-name">
              {w.name}
              {w.inches ? ` ${w.inches}″` : w.design === 'original' && gen.originalWheelInches ? ` ${gen.originalWheelInches}″` : ''}
            </span>
            {w.description && <span className="wheel-desc">{w.description}</span>}
          </button>
        ))}
      </div>
      {calipers.length > 0 && (
        <>
          <h3>Pinzas de freno</h3>
          <div className="segmented wrap">
            <button className={!config.caliperId ? 'active' : ''} onClick={() => update({ caliperId: null })}>
              Originales
            </button>
            {calipers.map((c) => (
              <button key={c.id} className={config.caliperId === c.id ? 'active' : ''} onClick={() => update({ caliperId: c.id })}>
                <span className="mini-dot" style={{ background: c.color }} /> {c.name}
              </button>
            ))}
          </div>
        </>
      )}
      <h3>Cristales y luces</h3>
      <label className="field">
        <span>Tintado de lunas: {Math.round(config.glassTint * 100)} %</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={config.glassTint}
          onChange={(e) => update({ glassTint: Number(e.target.value) })}
        />
      </label>
      <label className="toggle">
        <input type="checkbox" checked={config.lightsOn} onChange={(e) => update({ lightsOn: e.target.checked })} />
        <span>Luces encendidas</span>
      </label>
    </section>
  );
}

function EnvironmentSection() {
  const config = useStore((s) => s.config);
  const update = useStore((s) => s.update);
  return (
    <section className="section">
      <h2>Entorno</h2>
      <div className="env-list">
        {ENVIRONMENTS.map((e) => (
          <button
            key={e.id}
            className={e.id === config.environmentId ? 'env-card active' : 'env-card'}
            onClick={() => update({ environmentId: e.id, ...(e.night ? { lightsOn: true } : {}) })}
            aria-pressed={e.id === config.environmentId}
          >
            <span className="env-name">{e.name}</span>
            <span className="env-desc">{e.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function SaveExportSection() {
  const saved = useStore((s) => s.saved);
  const saveCurrent = useStore((s) => s.saveCurrent);
  const applySaved = useStore((s) => s.applySaved);
  const removeSaved = useStore((s) => s.removeSaved);
  const { model, paint } = useCurrent();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const exportImage = async (scale: number) => {
    setBusy(true);
    try {
      const blob = await captureImage(scale, summaryLines());
      if (blob) {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        download(blob, `${model.id}-${paint?.id ?? 'config'}-${stamp}.png`);
        setMsg('Imagen exportada.');
      } else setMsg('No se pudo generar la imagen.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const thumb = await captureThumbnail();
    saveCurrent(name.trim() || `${model.name} · ${paint?.name ?? ''}`, thumb);
    setName('');
    setMsg('Configuración guardada en este navegador.');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMsg('Enlace copiado al portapapeles.');
    } catch {
      setMsg(window.location.href);
    }
  };

  return (
    <section className="section">
      <h2>Guardar y exportar</h2>
      <div className="row">
        <input
          className="text"
          placeholder="Nombre de la configuración"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button className="btn primary" onClick={save}>
          Guardar
        </button>
      </div>
      <div className="row">
        <button className="btn" disabled={busy} onClick={() => exportImage(1)}>
          Exportar imagen
        </button>
        <button className="btn" disabled={busy} onClick={() => exportImage(2)} title="Doble de resolución">
          Imagen HD (2×)
        </button>
        <button className="btn" onClick={copyLink}>
          Copiar enlace
        </button>
      </div>
      {msg && <p className="note" role="status">{msg}</p>}
      {saved.length > 0 && (
        <ul className="saved">
          {saved.map((s) => (
            <li key={s.id}>
              <button className="saved-main" onClick={() => applySaved(s.id)} title="Cargar configuración">
                {s.thumbnail ? <img src={s.thumbnail} alt="" /> : <span className="thumb-ph" />}
                <span>
                  <strong>{s.name}</strong>
                  <small>{new Date(s.createdAt).toLocaleString('es-ES')}</small>
                </span>
              </button>
              <button className="icon-btn" aria-label={`Eliminar ${s.name}`} onClick={() => removeSaved(s.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AdvancedSection() {
  const quality = useStore((s) => s.quality);
  const autoRotate = useStore((s) => s.autoRotate);
  const inspector = useStore((s) => s.inspector);
  const names = useStore((s) => s.materialNames);
  const highlight = useStore((s) => s.highlightMaterial);
  const set = useStore((s) => s.set);
  const { gen, loaded, model } = useCurrent();
  const origin = loaded.generations.get(`${model.id}/${gen.id}`)?.origin;
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => names.filter((n) => n.toLowerCase().includes(filter.toLowerCase())), [names, filter]);
  return (
    <section className="section">
      <h2>Ajustes</h2>
      <label className="field">
        <span>Calidad gráfica</span>
        <select value={quality} onChange={(e) => set({ quality: e.target.value as typeof quality })}>
          <option value="alta">Alta (reflejos, oclusión ambiental, antialias ×4)</option>
          <option value="media">Media (recomendada en tablet/móvil)</option>
          <option value="baja">Baja (sin posprocesado)</option>
        </select>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={autoRotate} onChange={(e) => set({ autoRotate: e.target.checked })} />
        <span>Giro automático de cámara</span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={inspector} onChange={(e) => set({ inspector: e.target.checked, highlightMaterial: null })} />
        <span>Inspector de materiales (para añadir modelos)</span>
      </label>
      {inspector && (
        <div className="inspector">
          <p className="note">
            Toca un material para resaltarlo en magenta. Copia su nombre en <code>parts</code> del catálogo.
          </p>
          <input className="text" placeholder="Filtrar…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul>
            {shown.map((n) => (
              <li key={n}>
                <button
                  className={highlight === n ? 'active' : ''}
                  onClick={() => set({ highlightMaterial: highlight === n ? null : n })}
                >
                  {n || '(sin nombre)'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h3>Créditos</h3>
      <ul className="credits">
        {loaded.catalog.models.flatMap((m) =>
          m.generations
            .filter((g) => g.available !== false)
            .map((g) => (
              <li key={`${m.id}/${g.id}`}>
                {m.name} {g.label}: «
                <a href={g.credits.source} target="_blank" rel="noreferrer">
                  {g.credits.title}
                </a>
                » de {g.credits.author}, licencia{' '}
                <a href={g.credits.licenseUrl} target="_blank" rel="noreferrer">
                  {g.credits.license}
                </a>
                .{g.credits.modifications ? ` Cambios: ${g.credits.modifications}` : ''}
              </li>
            )),
        )}
        {ENVIRONMENTS.map((e) => (
          <li key={e.id}>Entorno «{e.name}»: {e.credit}</li>
        ))}
      </ul>
      <p className="note">
        Proyecto no oficial, sin relación con Tesla, Inc. «Tesla», «Model S», «Model 3», «Model X» y «Model Y» son marcas
        de sus titulares. Los diseños de llanta alternativos son genéricos y no reproducen llantas oficiales.
        {origin === 'personalizado' ? ' Este modelo procede de la carpeta personalizada.' : ''}
      </p>
      {loaded.warnings.length > 0 && <p className="note warn">{loaded.warnings.join(' · ')}</p>}
    </section>
  );
}

export function PanelContent({ tab }: { tab: TabId | 'all' }) {
  const show = (t: TabId) => tab === 'all' || tab === t;
  return (
    <>
      {show('modelo') && <ModelSection />}
      {show('pintura') && <PaintSection />}
      {show('llantas') && <WheelSection />}
      {show('entorno') && <EnvironmentSection />}
      {show('mas') && <SaveExportSection />}
      {show('mas') && <AdvancedSection />}
    </>
  );
}
