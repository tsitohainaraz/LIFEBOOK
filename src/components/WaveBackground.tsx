import styles from './WaveBackground.module.css';

// Une période de vague sur 1200 px, répétée deux fois pour un défilement sans couture (translateX -50 %).
function wavePath(amp: number, base: number): string {
  const seg = (x: number) => `C ${x + 150} ${base - amp}, ${x + 450} ${base + amp}, ${x + 600} ${base}`;
  return `M 0 ${base} ${seg(0)} ${seg(600)} ${seg(1200)} ${seg(1800)}`;
}

const LINES = [
  { base: 120, amp: 26, cls: 'l1' },
  { base: 150, amp: 34, cls: 'l2' },
  { base: 182, amp: 22, cls: 'l3' },
  { base: 210, amp: 30, cls: 'l4' },
] as const;

/** Fond animé : vagues d'eau lumineuses qui avancent lentement, sur une grille de points. Décoratif. */
export function WaveBackground() {
  return (
    <div className={styles.bg} aria-hidden="true">
      <div className={styles.grid} />
      <div className={styles.glow} />
      <svg className={styles.waves} viewBox="0 0 1200 260" preserveAspectRatio="none">
        <defs>
          <linearGradient id="wave-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6fd3c8" stopOpacity="0.16" />
            <stop offset="1" stopColor="#060806" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="wave-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#c6f432" stopOpacity="0" />
            <stop offset="0.25" stopColor="#c6f432" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#6fd3c8" stopOpacity="0.5" />
            <stop offset="0.75" stopColor="#c6f432" stopOpacity="0.55" />
            <stop offset="1" stopColor="#c6f432" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className={styles.fillSlow}>
          <path d={`${wavePath(28, 150)} L 2400 260 L 0 260 Z`} fill="url(#wave-fill)" />
        </g>
        <g className={styles.fillFast}>
          <path d={`${wavePath(20, 190)} L 2400 260 L 0 260 Z`} fill="url(#wave-fill)" />
        </g>
        {LINES.map((l) => (
          <g key={l.cls} className={styles[l.cls]}>
            <path d={wavePath(l.amp, l.base)} fill="none" stroke="url(#wave-line)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </svg>
    </div>
  );
}
