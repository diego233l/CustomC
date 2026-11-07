import { useMemo, useState } from 'react';
import type { Paint, Wheel, WheelDesign, WheelFinish } from '../catalog/types';
import { Icon } from './icons';
import { useStore } from '../state/store';
import { ENVIRONMENTS } from '../three/environments';
import { captureImage, captureThumbnail } from '../utils/capture';
import { GarageSection } from './GarageSection';

const FINISH_LABEL: Record<Paint['finish'], string> = {
  solido: 'Sólido',
  metalizado: 'Metalizado',
  perlado: 'Perlado multicapa',
  mate: 'Mate',
};

export type TabId = 'garaje' | 'pintura' | 'llantas' | 'suspension' | 'entorno' | 'mas';
export const TABS: { id: TabId; label: string; icon: () => React.JSX.Element }[] = [
  { id: 'garaje', label: 'Garaje', icon: Icon.garaje },
  { id: 'pintura', label: 'Pintura', icon: Icon.pintura },
  { id: 'llantas', label: 'Llantas', icon: Icon.llanta },
  { id: 'suspension', label: 'Suspensión', icon: Icon.suspension },
  { id: 'entorno', label: 'Entorno', icon: Icon.entorno },
  { id: 'mas', label: 'Más', icon: Icon.mas },
];

function useCurrent() {
  const loaded = useStore((s) => s.loaded)!;
  const config = useStore((s) => s.config);
  const model = loaded.catalog.models.find((m) => m.id === config.modelId)!;
  const gen = model.generations.find((g) => g.id === config.generationId)!;
  const paints = loaded.catalog.paints.filter((p) => !gen.paints || gen.paints.includes(p.id));
  const wheels = loaded.catalog.wheels.filter(
    (w) => (!gen.wheels || gen.wheels.includes(w.id)) && !(gen.noOriginalWheels && w.design === 'original'),
  );
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
    `Pintura: ${paint?.name ?? ''} · Llantas: ${wheel?.name ?? ''} ${l.catalog.wheelFinishes.find((f) => f.id === c.wheelFinishId)?.name.toLowerCase() ?? ''}${c.rimDelta ? ` (${c.rimDelta > 0 ? '+' : ''}${c.rimDelta}″)` : ''}${c.rideHeight ? ` · Suspensión ${c.rideHeight > 0 ? '+' : ''}${c.rideHeight} cm` : ''} · Entorno: ${env?.name ?? ''}`,
    `Modelo 3D: «${gen?.credits.title ?? ''}» de ${gen?.credits.author ?? ''} (${gen?.credits.license ?? ''})`,
  ];
}

const FINISH_ORDER: Paint['finish'][] = ['metalizado', 'perlado', 'solido', 'mate'];
const FINISH_GROUP: Record<Paint['finish'], string> = {
  metalizado: 'Metalizados',
  perlado: 'Perlados multicapa',
  solido: 'Sólidos',
  mate: 'Mates (vinilo)',
};

function PaintSection() {
  const { config, paints, paint } = useCurrent();
  const update = useStore((s) => s.update);
  return (
    <section className="section">
      <h2>
        Pintura <small>{paint ? `${paint.name} · ${FINISH_LABEL[paint.finish]}` : ''}</small>
      </h2>
      {FINISH_ORDER.map((f) => {
        const list = paints.filter((p) => p.finish === f);
        if (!list.length) return null;
        return (
          <div key={f} className="paint-group">
            <h3>{FINISH_GROUP[f]}</h3>
            <div className="swatches">
              {list.map((p) => (
                <button
                  key={p.id}
                  className={p.id === config.paintId ? 'swatch active' : 'swatch'}
                  onClick={() => update({ paintId: p.id })}
                  title={`${p.name} (${FINISH_LABEL[p.finish]})`}
                  aria-label={`${p.name}, ${FINISH_LABEL[p.finish]}`}
                  aria-pressed={p.id === config.paintId}
                >
                  <span className={`dot finish-${p.finish}`} style={{ '--c': p.color, '--f': p.flopColor ?? p.color } as React.CSSProperties} />
                  <span className="swatch-name">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <h3>Cristales y luces</h3>
      <label className="field">
        <span>
          Tintado de lunas <b>{Math.round(config.glassTint * 100)} %</b>
        </span>
        <input type="range" min={0} max={1} step={0.05} value={config.glassTint} onChange={(e) => update({ glassTint: Number(e.target.value) })} />
      </label>
      <label className="toggle">
        <input type="checkbox" checked={config.lightsOn} onChange={(e) => update({ lightsOn: e.target.checked })} />
        <span>Luces encendidas</span>
      </label>
    </section>
  );
}

/** Miniatura SVG aproximada de cada diseño de llanta. */
function WheelPreview({ design, finish }: { design: WheelDesign; finish?: WheelFinish }) {
  const c = finish && finish.id !== 'original' ? finish.color : '#a9aeb3';
  const dark = finish?.accent ?? '#1a1b1d';
  const spoke = (a: number, w1: number, w2: number, r1 = 12, r2 = 40, curve = 0) => {
    const p = (r: number, ang: number) => `${Math.cos(ang) * r},${Math.sin(ang) * r}`;
    const A = (a * Math.PI) / 180;
    return (
      <path
        key={`${a}-${curve}`}
        d={`M${p(r1, A - w1 / r1)} Q${p((r1 + r2) / 2, A + curve * 0.5)} ${p(r2, A - w2 / r2 + curve)} L${p(r2, A + w2 / r2 + curve)} Q${p((r1 + r2) / 2, A + curve * 0.5)} ${p(r1, A + w1 / r1)}Z`}
        fill={c}
      />
    );
  };
  const n = (k: number) => Array.from({ length: k }, (_, i) => (i * 360) / k);
  let body: React.ReactNode = null;
  switch (design) {
    case 'aero':
    case 'disco':
      body = (
        <>
          <circle r="40" fill={c} />
          {n(design === 'aero' ? 5 : 10).map((a) => (
            <path key={a} d={`M${Math.cos((a * Math.PI) / 180) * 30},${Math.sin((a * Math.PI) / 180) * 30} A30 30 0 0 1 ${Math.cos(((a + (design === 'aero' ? 34 : 12)) * Math.PI) / 180) * 30},${Math.sin(((a + (design === 'aero' ? 34 : 12)) * Math.PI) / 180) * 30}`} stroke={dark} strokeWidth={design === 'aero' ? 8 : 4} fill="none" />
          ))}
        </>
      );
      break;
    case 'cinco-dobles':
      body = n(5).flatMap((a) => [spoke(a - 7, 3, 3), spoke(a + 7, 3, 3)]);
      break;
    case 'multirradio':
      body = n(10).map((a) => spoke(a, 3, 2.2));
      break;
    case 'turbina':
      body = n(12).map((a) => spoke(a, 2.6, 4, 12, 40, 0.35));
      break;
    case 'y-radios':
      body = n(5).flatMap((a) => [spoke(a, 4, 3, 12, 24), spoke(a - 9, 2, 2.5, 22, 40), spoke(a + 9, 2, 2.5, 22, 40)]);
      break;
    case 'seis-radios':
      body = n(6).map((a) => spoke(a, 5, 6));
      break;
    case 'concava':
      body = n(5).map((a) => spoke(a, 6, 4));
      break;
    case 'estrella':
      body = n(7).map((a) => spoke(a, 2, 1.6));
      break;
    case 'radios-finos':
      body = n(20).map((a) => spoke(a, 1, 0.8));
      break;
    case 'malla':
      body = n(10).flatMap((a) => [spoke(a, 1.4, 1.2, 12, 40, 0.3), spoke(a, 1.4, 1.2, 12, 40, -0.3)]);
      break;
    default:
      body = (
        <text y="5" textAnchor="middle" fontSize="13" fill="#ddd" fontWeight="600">
          ORIG.
        </text>
      );
  }
  return (
    <svg viewBox="-50 -50 100 100" className="wheel-svg" aria-hidden>
      <circle r="49" fill="#0b0b0c" />
      <circle r="41.5" fill={dark} stroke={c} strokeWidth="2.5" />
      {body}
      {design !== 'original' && <circle r="11" fill={c} stroke={dark} strokeWidth="1.5" />}
    </svg>
  );
}

function WheelSection() {
  const { config, wheels, gen, loaded } = useCurrent();
  const update = useStore((s) => s.update);
  const finishes = loaded.catalog.wheelFinishes;
  const wheel = wheels.find((w) => w.id === config.wheelId);
  const finish = finishes.find((f) => f.id === config.wheelFinishId);
  const allCalipers = loaded.catalog.caliperColors ?? [];
  // Las pinzas solo se pueden colorear si el modelo las tiene separadas o si
  // se usa un diseño de llanta alternativo (que incluye sus propias pinzas).
  const calipers = (gen.parts.calipers?.length ?? 0) > 0 || wheel?.design !== 'original' ? allCalipers : [];
  const baseInches = gen.originalWheelInches ?? 19;
  const available = finishes.filter((f) => f.id !== 'original' || wheel?.design === 'original');
  return (
    <section className="section">
      <h2>
        Llantas <small>{wheel ? `${wheel.name} · ${finish?.name ?? ''}` : ''}</small>
      </h2>
      <div className="wheels">
        {wheels.map((w: Wheel) => (
          <button
            key={w.id}
            className={w.id === config.wheelId ? 'wheel-card active' : 'wheel-card'}
            onClick={() => update({ wheelId: w.id })}
            aria-pressed={w.id === config.wheelId}
            title={w.description}
          >
            <WheelPreview design={w.design} finish={w.id === config.wheelId ? finish : finishes.find((f) => f.id === w.defaultFinish)} />
            <span className="wheel-name">{w.name}</span>
          </button>
        ))}
      </div>

      <h3>Acabado</h3>
      <div className="finishes">
        {available.map((f) => (
          <button
            key={f.id}
            className={f.id === config.wheelFinishId ? 'finish active' : 'finish'}
            onClick={() => update({ wheelFinishId: f.id })}
            title={f.name}
            aria-pressed={f.id === config.wheelFinishId}
          >
            <span
              className="finish-dot"
              style={{
                background:
                  f.id === 'original'
                    ? 'conic-gradient(#888, #ddd, #555, #bbb, #888)'
                    : `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${f.color} ${f.metalness > 0.5 ? 45 : 70}%, white), ${f.color} 55%, ${f.accent ?? `color-mix(in srgb, ${f.color} 60%, black)`})`,
              }}
            />
            <span>{f.name}</span>
          </button>
        ))}
      </div>

      <h3>Diámetro</h3>
      <div className="size-row">
        <span className="size-value">
          {baseInches + config.rimDelta}″
          <small>{config.rimDelta === 0 ? 'de serie' : `${config.rimDelta > 0 ? '+' : ''}${config.rimDelta}″`}</small>
        </span>
        <input
          type="range"
          min={-3}
          max={4}
          step={1}
          value={config.rimDelta}
          aria-label="Diámetro de llanta"
          onChange={(e) => update({ rimDelta: Number(e.target.value) })}
        />
      </div>
      <p className="note">
        Al aumentar la llanta, el neumático reduce su perfil y conserva el diámetro exterior, como en un cambio real de
        medida.
      </p>

      {calipers.length > 0 && (
        <>
          <h3>Pinzas de freno</h3>
          <div className="segmented wrap">
            <button className={!config.caliperId ? 'active' : ''} onClick={() => update({ caliperId: null })}>
              De serie
            </button>
            {calipers.map((c) => (
              <button key={c.id} className={config.caliperId === c.id ? 'active' : ''} onClick={() => update({ caliperId: c.id })}>
                <span className="mini-dot" style={{ background: c.color }} /> {c.name}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const RIDE_PRESETS = [
  { cm: 3, label: 'Elevada', sub: '+3 cm' },
  { cm: 0, label: 'De serie', sub: '0 cm' },
  { cm: -3, label: 'Deportiva', sub: '−3 cm' },
  { cm: -5, label: 'Rebajada', sub: '−5 cm' },
  { cm: -7, label: 'Muy rebajada', sub: '−7 cm' },
];

function SuspensionSection() {
  const config = useStore((s) => s.config);
  const update = useStore((s) => s.update);
  const fmt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} cm`;
  return (
    <section className="section">
      <h2>
        Suspensión <small>{config.rideHeight === 0 ? 'altura de serie' : fmt(config.rideHeight)}</small>
      </h2>
      <div className="presets">
        {RIDE_PRESETS.map((p) => (
          <button key={p.cm} className={config.rideHeight === p.cm ? 'preset active' : 'preset'} onClick={() => update({ rideHeight: p.cm })}>
            <strong>{p.label}</strong>
            <span>{p.sub}</span>
          </button>
        ))}
      </div>
      <label className="field">
        <span>
          Altura libre <b>{fmt(config.rideHeight)}</b>
        </span>
        <input type="range" min={-8} max={5} step={0.5} value={config.rideHeight} onChange={(e) => update({ rideHeight: Number(e.target.value) })} />
      </label>
      <p className="note">
        Sube o baja la carrocería respecto a las ruedas. Combínalo con llantas más grandes para un aspecto deportivo; usa
        la vista lateral para comparar el hueco del paso de rueda.
      </p>
      <div className="row">
        <button className="btn" onClick={() => useStore.getState().setView('lateral')}>
          Ver de lado
        </button>
        <button className="btn" onClick={() => useStore.getState().setView('llanta')}>
          Ver la rueda
        </button>
      </div>
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
  const loaded = useStore((s) => s.loaded)!;
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
                {/^https?:/.test(g.credits.source) ? (
                  <a href={g.credits.source} target="_blank" rel="noreferrer">
                    {g.credits.title}
                  </a>
                ) : (
                  g.credits.title
                )}
                » de {g.credits.author}, licencia{' '}
                {g.credits.licenseUrl ? (
                  <a href={g.credits.licenseUrl} target="_blank" rel="noreferrer">
                    {g.credits.license}
                  </a>
                ) : (
                  g.credits.license
                )}
                .{g.credits.modifications ? ` Cambios: ${g.credits.modifications}` : ''}
              </li>
            )),
        )}
        {ENVIRONMENTS.map((e) => (
          <li key={e.id}>Entorno «{e.name}»: {e.credit}</li>
        ))}
      </ul>
      <p className="note">
        Herramienta para uso personal. Los coches son mods subidos por ti y pertenecen a sus autores; las marcas y
        modelos que representen son de sus titulares. Los diseños de llanta alternativos son genéricos.
      </p>
      {loaded.warnings.length > 0 && <p className="note warn">{loaded.warnings.join(' · ')}</p>}
    </section>
  );
}

function NoCar() {
  return (
    <section className="section">
      <h2>Sin coche</h2>
      <p className="note">Sube un coche en el Garaje para pintarlo, cambiarle las llantas o ajustar la suspensión.</p>
    </section>
  );
}

export function PanelContent({ tab }: { tab: TabId }) {
  const hasCar = useStore((s) => !!s.config.modelId);
  return (
    <>
      {tab === 'garaje' && <GarageSection />}
      {tab === 'pintura' && (hasCar ? <PaintSection /> : <NoCar />)}
      {tab === 'llantas' && (hasCar ? <WheelSection /> : <NoCar />)}
      {tab === 'suspension' && (hasCar ? <SuspensionSection /> : <NoCar />)}
      {tab === 'entorno' && <EnvironmentSection />}
      {tab === 'mas' && hasCar && <SaveExportSection />}
      {tab === 'mas' && <AdvancedSection />}
    </>
  );
}
