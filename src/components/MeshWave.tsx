import { useEffect, useRef } from 'react';

// Maillage 3D de points reliés (bleu → turquoise → vert) qui ondule lentement, vu en perspective,
// avec une poussière de particules au-dessus. Décoratif ; immobile si « réduire les animations ».
const COLS = 26;
const ROWS = 16;
const FPS = 30;

function color(u: number, alpha: number): string {
  // u = 0 (gauche, bleu) → 0,5 (turquoise) → 1 (droite, vert)
  const stops = [
    [58, 110, 240],
    [42, 205, 210],
    [70, 225, 120],
  ];
  const i = u < 0.5 ? 0 : 1;
  const t = u < 0.5 ? u * 2 : (u - 0.5) * 2;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha.toFixed(3)})`;
}

/** `horizon` : hauteur de la ligne d'horizon (0 = haut, 1 = bas) dans la zone dessinée. */
export function MeshWave({ className, horizon: horizonAt = 0.34 }: { className?: string; horizon?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let W = 0;
    let H = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Redimensionner efface le canevas : on redessine tout de suite.
      if (painted) render(performance.now());
    };
    let painted = false;
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(cv);

    const dust = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.6, r: Math.random() * 1.3 + 0.3, s: Math.random() * 0.4 + 0.1 }));
    const px = new Float32Array(COLS * ROWS);
    const py = new Float32Array(COLS * ROWS);
    const pa = new Float32Array(COLS * ROWS);

    let raf = 0;
    let last = -1e9;
    const draw = (now: number) => {
      raf = reduce ? 0 : requestAnimationFrame(draw);
      if (!reduce && now - last < 1000 / FPS) return;
      last = now;
      render(now);
    };
    const render = (now: number) => {
      painted = true;
      const t = reduce ? 0 : now / 1000;
      ctx.clearRect(0, 0, W, H);
      // Respiration (le relief gonfle puis retombe, ~9 s) et léger balancement de la vue (~23 s) : comme vivant.
      const breath = 1 + 0.28 * Math.sin(t * 0.7);
      const sway = 0.06 * Math.sin(t * 0.27);
      const horizon = H * (horizonAt + 0.015 * Math.sin(t * 0.45));
      const focal = W * 0.9;

      // Projection des points : x de -1 à 1, z de 1 (près) à 5 (loin).
      for (let r = 0; r < ROWS; r++) {
        const z = 1 + (r / (ROWS - 1)) * 4;
        for (let c = 0; c < COLS; c++) {
          const x = (c / (COLS - 1)) * 2.6 - 1.3;
          const y =
            breath * (0.16 * Math.sin(x * 2.2 + t * 0.55 + z * 0.9) + 0.11 * Math.cos(z * 1.7 - t * 0.4 + x * 0.6)) +
            0.025 * Math.sin(t * 1.3 + c * 1.7 + r * 2.3);
          const i = r * COLS + c;
          px[i] = W / 2 + ((x + sway) * focal) / z;
          py[i] = horizon + ((0.95 - y) * H * 0.62) / z;
          pa[i] = Math.max(0, 1 - (z - 1) / 4.4);
        }
      }

      ctx.lineWidth = 0.8;
      ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const i = r * COLS + c;
          const a = pa[i] * 0.62;
          if (a < 0.02) continue;
          ctx.strokeStyle = color(c / (COLS - 1), a);
          ctx.beginPath();
          if (c < COLS - 1) {
            ctx.moveTo(px[i], py[i]);
            ctx.lineTo(px[i + 1], py[i + 1]);
          }
          if (r < ROWS - 1) {
            ctx.moveTo(px[i], py[i]);
            ctx.lineTo(px[i + COLS], py[i + COLS]);
            if (c < COLS - 1 && (r + c) % 2 === 0) {
              ctx.moveTo(px[i], py[i]);
              ctx.lineTo(px[i + COLS + 1], py[i + COLS + 1]);
            }
          }
          ctx.stroke();
        }
      }
      for (let i = 0; i < px.length; i++) {
        const a = pa[i];
        if (a < 0.05) continue;
        // Chaque point scintille doucement à son propre rythme.
        const pulse = 0.75 + 0.25 * Math.sin(t * (0.8 + (i % 7) * 0.15) + i * 1.9);
        ctx.fillStyle = color((i % COLS) / (COLS - 1), (0.35 + a * 0.65) * pulse);
        ctx.beginPath();
        ctx.arc(px[i], py[i], (0.8 + a * 1.7) * (0.85 + 0.3 * pulse), 0, 7);
        ctx.fill();
      }
      for (const d of dust) {
        const y = ((d.y - t * 0.004 * d.s) % 0.6 + 0.6) % 0.6;
        ctx.fillStyle = color(d.x, 0.25 + 0.35 * Math.abs(Math.sin(t * d.s + d.x * 9)));
        ctx.beginPath();
        ctx.arc(d.x * W, horizon * 0.2 + y * H, d.r, 0, 7);
        ctx.fill();
      }
    };
    draw(performance.now());
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [horizonAt]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
