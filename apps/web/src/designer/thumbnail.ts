import type { EngineAnalysis } from '@ericmotors/physics';

/**
 * Vorschaubilder werden im Browser erzeugt (kein Server-Rendering, Free Plan) und als kleines WebP
 * hochgeladen. Browser ohne WebP-Encoder liefern null; dann gibt es eben kein Bild.
 */
const W = 640;
const H = 360;

function toWebp(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b && b.type === 'image/webp' ? b : null), 'image/webp', 0.82),
  );
}

/** Schnappschuss der 3D-Ansicht (Canvas mit preserveDrawingBuffer), zentriert auf 16:9 zugeschnitten. */
export async function captureViewer(container: Element | null): Promise<Blob | null> {
  const source = container?.querySelector('canvas');
  if (!source) return null;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  // Studiohintergrund wie in der 3D-Ansicht (das Canvas selbst ist transparent).
  const css = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, token('--stage-top', '#fbfbfc'));
  bg.addColorStop(0.62, token('--stage-mid', '#eceef1'));
  bg.addColorStop(1, token('--stage-bottom', '#d9dce1'));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const scale = Math.max(W / source.width, H / source.height);
  const sw = W / scale;
  const sh = H / scale;
  ctx.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, 0, 0, W, H);
  return toWebp(out);
}

/** Motor-Vorschau: Drehmoment- und Leistungskurve auf dunklem Grund. */
export async function engineThumbnail(
  analysis: EngineAnalysis,
  title: string,
  subtitle: string,
): Promise<Blob | null> {
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#111a2e';
  ctx.fillRect(0, 0, W, H);
  const pts = analysis.curve.points;
  const x0 = pts[0]!.speed;
  const x1 = pts.at(-1)!.speed;
  const plot = { left: 32, right: W - 32, top: 110, bottom: H - 36 };
  const line = (values: number[], color: string) => {
    const max = Math.max(...values) * 1.08;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = plot.left + ((p.speed - x0) / (x1 - x0)) * (plot.right - plot.left);
      const y = plot.bottom - (values[i]! / max) * (plot.bottom - plot.top);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  ctx.strokeStyle = '#26324d';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = plot.top + (i / 4) * (plot.bottom - plot.top);
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
  }
  line(
    pts.map((p) => p.torque),
    '#3987e5',
  );
  line(
    pts.map((p) => p.power),
    '#fb923c',
  );
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillText(title.slice(0, 32), 32, 56);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 22px system-ui, sans-serif';
  ctx.fillText(subtitle, 32, 88);
  return toWebp(out);
}
