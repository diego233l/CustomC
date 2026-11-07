import { useProgress } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { genKey, loadCatalog } from './catalog/loadCatalog';
import { useStore, type CameraViewId } from './state/store';
import { SceneContent } from './three/Scene';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { PanelContent, TABS, type TabId } from './ui/Panel';

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
        <ViewBar />
      </main>
      <aside className="panel" aria-label="Opciones de configuración">
        {mobile ? (
          <>
            <div className="tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="panel-scroll">
              <PanelContent tab={tab} />
            </div>
          </>
        ) : (
          <div className="panel-scroll">
            <PanelContent tab="all" />
          </div>
        )}
      </aside>
    </div>
  );
}
