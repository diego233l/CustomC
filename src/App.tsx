import { useProgress } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { genKey, loadCatalog } from './catalog/loadCatalog';
import { useStore, type CameraViewId } from './state/store';
import { SceneContent } from './three/Scene';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Icon } from './ui/icons';
import { PanelContent, summaryLines, TABS, type TabId } from './ui/Panel';
import { captureImage } from './utils/capture';

const VIEWS: { id: CameraViewId; label: string }[] = [
  { id: 'tres-cuartos-delantero', label: '3/4 delantera' },
  { id: 'frontal', label: 'Frontal' },
  { id: 'lateral', label: 'Lateral' },
  { id: 'tres-cuartos-trasero', label: '3/4 trasera' },
  { id: 'trasera', label: 'Trasera' },
  { id: 'superior', label: 'Cenital' },
  { id: 'llanta', label: 'Llanta' },
];

// Modo de depuración (?debug&manual): render fotograma a fotograma desde la consola.
const MANUAL = new URLSearchParams(window.location.search).has('manual');
function ManualFrames() {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__frames = async (n: number) => {
      for (let i = 0; i < n; i++) {
        advance(performance.now());
        await new Promise((r) => setTimeout(r, 0));
      }
    };
  }, [advance]);
  return null;
}

function useIsMobile() {
  const q = '(max-width: 899px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return m;
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="bar">
        <div style={{ width: `${Math.round(progress)}%` }} />
      </div>
      <span>Cargando modelo 3D… {Math.round(progress)} %</span>
    </div>
  );
}

function Toolbar() {
  const autoRotate = useStore((s) => s.autoRotate);
  const set = useStore((s) => s.set);
  const setView = useStore((s) => s.setView);
  const [busy, setBusy] = useState(false);
  const fullscreen = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => undefined);
  };
  const shot = async () => {
    setBusy(true);
    try {
      const blob = await captureImage(2, summaryLines());
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `configuracion-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="toolbar" role="toolbar" aria-label="Herramientas de la vista">
      <button className={autoRotate ? 'active' : ''} onClick={() => set({ autoRotate: !autoRotate })} title="Giro automático" aria-pressed={autoRotate}>
        <Icon.giro />
      </button>
      <button onClick={() => setView('tres-cuartos-delantero')} title="Vista inicial">
        <Icon.centrar />
      </button>
      <button onClick={shot} disabled={busy} title="Exportar imagen en alta resolución">
        <Icon.camara />
      </button>
      <button onClick={fullscreen} title="Pantalla completa">
        <Icon.pantalla />
      </button>
    </div>
  );
}

function Summary() {
  const loaded = useStore((s) => s.loaded)!;
  const c = useStore((s) => s.config);
  const paint = loaded.catalog.paints.find((p) => p.id === c.paintId);
  const wheel = loaded.catalog.wheels.find((w) => w.id === c.wheelId);
  const finish = loaded.catalog.wheelFinishes.find((f) => f.id === c.wheelFinishId);
  return (
    <div className="summary" aria-live="polite">
      <span className="chip-s">
        <i style={{ background: paint?.color }} /> {paint?.name}
      </span>
      <span className="chip-s">
        <i style={{ background: finish && finish.id !== 'original' ? finish.color : '#9aa0a6' }} /> {wheel?.name}
        {c.rimDelta ? ` ${c.rimDelta > 0 ? '+' : ''}${c.rimDelta}″` : ''}
      </span>
      {c.rideHeight !== 0 && <span className="chip-s">Suspensión {c.rideHeight > 0 ? '+' : ''}{c.rideHeight} cm</span>}
    </div>
  );
}

function ViewBar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  return (
    <nav className="viewbar" aria-label="Vistas de cámara">
      {VIEWS.map((v) => (
        <button key={v.id} className={v.id === view ? 'active' : ''} onClick={() => setView(v.id)}>
          {v.label}
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const config = useStore((s) => s.config);
  const quality = useStore((s) => s.quality);
  const setLoaded = useStore((s) => s.setLoaded);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('modelo');
  const mobile = useIsMobile();

  useEffect(() => {
    loadCatalog().then(setLoaded, (e: Error) => setError(e.message));
  }, [setLoaded]);

  if (error) return <div className="fatal">Error: {error}</div>;
  if (!loaded) return <div className="fatal">Cargando catálogo…</div>;

  const gen = loaded.generations.get(genKey(config.modelId, config.generationId)) ?? null;
  const model = loaded.catalog.models.find((m) => m.id === config.modelId);
  const dpr: [number, number] = quality === 'alta' ? [1, 2] : quality === 'media' ? [1, 1.5] : [0.75, 1];

  return (
    <div className={mobile ? 'app mobile' : 'app'}>
      <main className="stage">
        <header className="brand">
          <h1>Configurador 3D</h1>
          <p>
            {model?.name} · {model?.generations.find((g) => g.id === config.generationId)?.label}
          </p>
        </header>
        <ErrorBoundary key={gen?.url}>
          <Canvas
            shadows
            dpr={dpr}
            frameloop={MANUAL ? 'never' : 'always'}
            camera={{ fov: 32, near: 0.1, far: 400, position: [-4, 1.4, 4.5] }}
            gl={{ antialias: quality === 'baja', preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
          >
            <SceneContent gen={gen} />
            {MANUAL && <ManualFrames />}
          </Canvas>
        </ErrorBoundary>
        <LoadingOverlay />
        <Toolbar />
        <Summary />
        <ViewBar />
      </main>
      <aside className="panel" aria-label="Opciones de configuración">
        <nav className={mobile ? 'tabs' : 'rail'} role="tablist" aria-label="Secciones">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
              title={t.label}
            >
              <t.icon />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="panel-scroll" role="tabpanel">
          <PanelContent tab={tab} />
        </div>
      </aside>
    </div>
  );
}
