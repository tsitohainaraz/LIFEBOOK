import { useEffect, useRef } from 'react';

/** Fond de particules vert citron reliées entre elles (en-tête de l'accueil). */
export function Particles({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let raf = 0;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pts = Array.from({ length: 34 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      r: Math.random() * 1.6 + 0.6,
    }));
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        if (!reduce) {
          a.x += a.vx;
          a.y += a.vy;
          if (a.x < 0 || a.x > W) a.vx *= -1;
          if (a.y < 0 || a.y > H) a.vy *= -1;
        }
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 90) {
            ctx.strokeStyle = `rgba(198,244,50,${0.12 * (1 - d / 90)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(198,244,50,.55)';
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, 7);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
