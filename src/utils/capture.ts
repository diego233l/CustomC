export interface CaptureResult {
  blob: Blob | null;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
}
type CaptureFn = (scale: number) => Promise<CaptureResult>;
let fn: CaptureFn | null = null;
export const registerCapture = (f: CaptureFn) => {
  fn = f;
};

/** Captura el lienzo 3D y añade una franja con el resumen de la configuración. */
export async function captureImage(scale: number, caption: string[]): Promise<Blob | null> {
  if (!fn) return null;
  const { canvas } = await fn(scale);
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  if (caption.length) {
    const s = out.width / 1600;
    const pad = 28 * s;
    const lh = 30 * s;
    const h = pad * 2 + lh * caption.length;
    const grad = ctx.createLinearGradient(0, out.height - h * 1.6, 0, out.height);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, out.height - h * 1.6, out.width, h * 1.6);
    ctx.fillStyle = '#fff';
    caption.forEach((line, i) => {
      ctx.font = `${i === 0 ? 600 : 400} ${(i === 0 ? 30 : 20) * s}px system-ui, sans-serif`;
      ctx.fillText(line, pad, out.height - pad - (caption.length - 1 - i) * lh);
    });
  }
  return new Promise((r) => out.toBlob(r, 'image/png'));
}

/** Miniatura JPEG pequeña para las configuraciones guardadas. */
export async function captureThumbnail(): Promise<string | undefined> {
  if (!fn) return undefined;
  const { canvas } = await fn(1);
  const w = 320;
  const h = Math.round((canvas.height / canvas.width) * w);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(canvas, 0, 0, w, h);
  return out.toDataURL('image/jpeg', 0.75);
}
