import { CameraControls, ContactShadows, MeshReflectorMaterial, useEnvironment } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GroundedSkybox } from 'three/examples/jsm/objects/GroundedSkybox.js';
import type { ResolvedGeneration } from '../catalog/types';
import { useStore, type CameraViewId } from '../state/store';
import { registerCapture } from '../utils/capture';
import { Car, type CarBounds } from './Car';
import { getEnvironment, type EnvironmentPreset } from './environments';
import { Road } from './Road';

const DEFAULT_BOUNDS: CarBounds = { length: 4.8, width: 2, height: 1.45, wheelbase: 2.9, frontWheel: null };

function EnvironmentLayer({ preset }: { preset: EnvironmentPreset }) {
  const envMap = useEnvironment({ files: preset.file });
  return preset.backgroundFile ? (
    <Suspense fallback={<EnvironmentApply preset={preset} envMap={envMap} bgMap={envMap} />}>
      <EnvironmentWithBackground preset={preset} envMap={envMap} />
    </Suspense>
  ) : (
    <EnvironmentApply preset={preset} envMap={envMap} bgMap={envMap} />
  );
}

function EnvironmentWithBackground({ preset, envMap }: { preset: EnvironmentPreset; envMap: THREE.Texture }) {
  const bgMap = useEnvironment({ files: preset.backgroundFile! });
  return <EnvironmentApply preset={preset} envMap={envMap} bgMap={bgMap} />;
}

function EnvironmentApply({ preset, envMap, bgMap }: { preset: EnvironmentPreset; envMap: THREE.Texture; bgMap: THREE.Texture }) {
  const scene = useThree((s) => s.scene);
  const skybox = useMemo(() => {
    if (!preset.ground) return null;
    const sky = new GroundedSkybox(bgMap, preset.ground.height, preset.ground.radius, 128);
    sky.position.y = preset.ground.height - 0.005;
    sky.rotation.y = preset.rotationY;
    sky.name = 'cielo-proyectado';
    return sky;
  }, [bgMap, preset]);

  useLayoutEffect(() => {
    scene.environment = envMap;
    scene.environmentIntensity = preset.environmentIntensity * preset.exposure;
    scene.environmentRotation.set(0, preset.rotationY, 0);
    if (preset.studio) {
      scene.background = new THREE.Color(preset.studio.background);
      // La niebla funde el suelo del estudio con el fondo (efecto ciclorama).
      scene.fog = new THREE.Fog(preset.studio.background, 7, 22);
    } else {
      scene.background = null;
      scene.fog = null;
    }
    return () => {
      scene.environment = null;
      scene.fog = null;
    };
  }, [scene, envMap, preset]);

  useEffect(() => () => skybox?.geometry.dispose(), [skybox]);

  return skybox ? <primitive object={skybox} /> : null;
}

function Ground({ preset, bounds }: { preset: EnvironmentPreset; bounds: CarBounds }) {
  const quality = useStore((s) => s.quality);
  const configKey = useStore((s) => `${s.config.modelId}|${s.config.generationId}|${s.config.variantId}|${s.config.wheelId}`);
  const span = Math.max(bounds.length, 4) * 1.6;
  return (
    <>
      {preset.studio ? (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
          <circleGeometry args={[60, 96]} />
          {quality === 'alta' ? (
            <MeshReflectorMaterial
              color={preset.studio.floor}
              envMapIntensity={0.5}
              roughness={0.55}
              metalness={0.1}
              blur={[400, 120]}
              mixBlur={1.2}
              mixStrength={0.8}
              resolution={1024}
              mirror={0.5}
              depthScale={0.6}
              minDepthThreshold={0.6}
              maxDepthThreshold={1.2}
            />
          ) : (
            <meshStandardMaterial color={preset.studio.floor} roughness={0.6} metalness={0} envMapIntensity={0.5} />
          )}
        </mesh>
      ) : (
        <>
        {preset.road && <Road />}
        <mesh rotation-x={-Math.PI / 2} position-y={0.002} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <shadowMaterial transparent opacity={preset.shadowOpacity * 0.55} />
        </mesh>
        </>
      )}
      <ContactShadows
        key={quality === 'alta' ? 'cs' : configKey}
        position={[0, 0.004, 0]}
        scale={[span, span]}
        resolution={quality === 'baja' ? 512 : 1024}
        opacity={preset.shadowOpacity}
        blur={2.2}
        far={1.2}
        frames={quality === 'alta' ? Infinity : 1}
        color="#000000"
      />
    </>
  );
}

function SunLight({ preset }: { preset: EnvironmentPreset }) {
  const quality = useStore((s) => s.quality);
  const ref = useRef<THREE.DirectionalLight>(null);
  const pos = useMemo(() => new THREE.Vector3(...preset.sunDirection).normalize().multiplyScalar(14), [preset]);
  // La luz debe seguir la rotación aplicada al HDRI.
  pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), -preset.rotationY);
  const mapSize = quality === 'alta' ? 4096 : quality === 'media' ? 2048 : 1024;
  return (
    <directionalLight
      ref={ref}
      position={pos}
      intensity={preset.sunIntensity * preset.exposure}
      color={preset.sunColor ?? '#ffffff'}
      castShadow
      shadow-mapSize={[mapSize, mapSize]}
      shadow-bias={-0.0002}
      shadow-normalBias={0.02}
      shadow-radius={4}
      shadow-camera-left={-4}
      shadow-camera-right={4}
      shadow-camera-top={4}
      shadow-camera-bottom={-4}
      shadow-camera-near={1}
      shadow-camera-far={40}
    />
  );
}

export function viewPose(view: CameraViewId, b: CarBounds, aspect: number) {
  const L = b.length;
  const H = b.height;
  const k = Math.max(1, 1.5 / Math.max(aspect, 0.3));
  const target = new THREE.Vector3(0, H * 0.42, 0);
  let pos: THREE.Vector3;
  switch (view) {
    case 'frontal':
      pos = new THREE.Vector3(0, H * 0.65, L * 1.2 * k);
      break;
    case 'lateral':
      pos = new THREE.Vector3(L * 1.25 * k, H * 0.55, 0);
      break;
    case 'trasera':
      pos = new THREE.Vector3(0, H * 0.85, -L * 1.2 * k);
      break;
    case 'tres-cuartos-trasero':
      pos = new THREE.Vector3(-L * 0.78 * k, H * 0.95, -L * 0.9 * k);
      break;
    case 'superior':
      pos = new THREE.Vector3(0.001, L * 1.55 * k, 0.15);
      target.set(0, 0, 0);
      break;
    case 'llanta': {
      const w = b.frontWheel ?? new THREE.Vector3(-b.width / 2, 0.36, b.wheelbase / 2);
      target.copy(w);
      const side = Math.sign(w.x) || -1;
      pos = new THREE.Vector3(w.x + side * 1.5, w.y + 0.25, w.z + 0.75);
      break;
    }
    case 'tres-cuartos-delantero':
    default:
      pos = new THREE.Vector3(-L * 0.72 * k, H * 0.8, L * 0.8 * k);
  }
  return { pos, target };
}

function CameraRig({ bounds }: { bounds: CarBounds }) {
  const ref = useRef<CameraControls>(null);
  const view = useStore((s) => s.view);
  const viewNonce = useStore((s) => s.viewNonce);
  const autoRotate = useStore((s) => s.autoRotate);
  const env = useStore((s) => s.config.environmentId);
  const size = useThree((s) => s.size);
  const interacting = useRef(false);
  const first = useRef(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const { pos, target } = viewPose(view, bounds, size.width / size.height);
    c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, !first.current);
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, viewNonce, bounds]);

  useFrame((_, dt) => {
    if (autoRotate && ref.current && !interacting.current) ref.current.azimuthAngle += dt * 0.18;
  });

  const ground = getEnvironment(env).ground;
  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={1.4}
      maxDistance={ground ? Math.min(14, ground.radius * 0.4) : 16}
      maxPolarAngle={Math.PI / 2 - 0.04}
      smoothTime={0.45}
      onStart={() => (interacting.current = true)}
      onEnd={() => (interacting.current = false)}
    />
  );
}

function CaptureBridge() {
  const gl = useThree((s) => s.gl);
  const setDpr = useThree((s) => s.setDpr);
  const viewport = useThree((s) => s.viewport);
  useEffect(
    () =>
      registerCapture(async (scale: number) => {
        const original = viewport.dpr;
        const frames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        if (scale !== 1) {
          setDpr(Math.min(original * scale, 4));
          await frames();
          await frames();
        } else await frames();
        const canvas = gl.domElement;
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
        if (scale !== 1) setDpr(original);
        return { blob, width: canvas.width, height: canvas.height, canvas };
      }),
    [gl, setDpr, viewport.dpr],
  );
  return null;
}

function Effects() {
  const quality = useStore((s) => s.quality);
  const lightsOn = useStore((s) => s.config.lightsOn);
  if (quality === 'baja') return null;
  return (
    <EffectComposer multisampling={quality === 'alta' ? 4 : 0} enableNormalPass={false}>
      <N8AO aoRadius={0.6} distanceFalloff={0.6} intensity={2.2} quality={quality === 'alta' ? 'high' : 'performance'} />
      <Bloom mipmapBlur intensity={lightsOn ? 0.6 : 0.15} luminanceThreshold={1.1} luminanceSmoothing={0.2} />
      {quality === 'alta' ? <></> : <SMAA />}
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}

function RendererSettings() {
  const gl = useThree((s) => s.gl);
  const quality = useStore((s) => s.quality);
  useEffect(() => {
    // Con posprocesado el mapeo tonal lo aplica el efecto ToneMapping.
    gl.toneMapping = quality === 'baja' ? THREE.NeutralToneMapping : THREE.NoToneMapping;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
  }, [gl, quality]);
  return null;
}

export function SceneContent({ gen }: { gen: ResolvedGeneration | null }) {
  const envId = useStore((s) => s.config.environmentId);
  const preset = getEnvironment(envId);
  const [bounds, setBounds] = useState<CarBounds>(DEFAULT_BOUNDS);
  const onBounds = useCallback((b: CarBounds) => setBounds(b), []);

  return (
    <>
      <RendererSettings />
      <Suspense fallback={null}>
        <EnvironmentLayer preset={preset} />
      </Suspense>
      <SunLight preset={preset} />
      <Suspense fallback={null}>{gen && <Car key={gen.url} gen={gen} onBounds={onBounds} />}</Suspense>
      <Ground preset={preset} bounds={bounds} />
      <CameraRig bounds={bounds} />
      <CaptureBridge />
      <Effects />
    </>
  );
}
