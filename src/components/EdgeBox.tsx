import { LOGO_PATHS } from "./Logo";

/**
 * Render del dispositivo angar Edge: scatola in alluminio scuro vista in
 * isometria, logo angar inciso sul coperchio, striscia di stato arancione sul
 * fronte, porte di rete sul fianco. SVG puro, nessuna immagine esterna.
 */
const W = 230; // larghezza (x)
const D = 150; // profondità (y)
const H = 44; // altezza (z)
const C = 0.866; // cos 30°
const OX = 140;
const OY = 64;

// Isometria: (x, y, z) → schermo.
const P = (x: number, y: number, z: number) => [OX + (x - y) * C, OY + (x + y) * 0.5 - z] as const;
const poly = (pts: (readonly [number, number])[]) => pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");

// Matrici che portano un disegno piano sulle facce (coordinate locali, y verso il basso).
const TOP = `matrix(${C} 0.5 ${-C} 0.5 ${OX} ${OY - H})`; // locale (x, y) sul coperchio
const FRONT = `matrix(${C} 0.5 0 1 ${OX - D * C} ${OY + D * 0.5 - H})`; // faccia y = D: locale (x, t)
const SIDE = `matrix(${-C} 0.5 0 1 ${OX + W * C} ${OY + W * 0.5 - H})`; // faccia x = W: locale (s, t)

export default function EdgeBox({ width = 350, className = "" }: { width?: number; className?: string }) {
  const id = "edgebox";
  return (
    <svg width={width} height={(width * 290) / 350} viewBox="0 0 350 290" fill="none" className={className} role="img" aria-label="angar Edge device">
      <defs>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3A3E43" />
          <stop offset="1" stopColor="#24272B" />
        </linearGradient>
        <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#23262A" />
          <stop offset="1" stopColor="#17191C" />
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1B1D20" />
          <stop offset="1" stopColor="#111315" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={`${id}-glow`} x="-50%" y="-200%" width="200%" height="500%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* Ombra a terra */}
      <polygon points={poly([P(-6, -6, 0), P(W + 10, -6, 0), P(W + 10, D + 10, 0), P(-6, D + 10, 0)])} fill="#000" opacity="0.45" filter={`url(#${id}-shadow)`} transform="translate(0 10)" />

      {/* Fianco destro (x = W) con le porte */}
      <polygon points={poly([P(W, 0, 0), P(W, D, 0), P(W, D, H), P(W, 0, H)])} fill={`url(#${id}-side)`} />
      <g transform={SIDE}>
        {/* due porte RJ45 */}
        {[28, 62].map((s) => (
          <g key={s}>
            <rect x={s} y={14} width={24} height={17} rx={2} fill="#0B0C0E" stroke="#34373C" strokeWidth={1} />
            <rect x={s + 6} y={26} width={12} height={5} fill="#0B0C0E" />
            <rect x={s + 3} y={16} width={3} height={3} rx={0.6} fill={s === 28 ? "#1F9254" : "#FF7323"} />
          </g>
        ))}
        {/* USB-C e alimentazione */}
        <rect x={100} y={19} width={16} height={7} rx={3.5} fill="#0B0C0E" stroke="#34373C" strokeWidth={1} />
        <circle cx={128} cy={22.5} r={4.5} fill="#0B0C0E" stroke="#34373C" strokeWidth={1} />
      </g>

      {/* Fronte (y = D) con la striscia di stato */}
      <polygon points={poly([P(0, D, 0), P(W, D, 0), P(W, D, H), P(0, D, H)])} fill={`url(#${id}-front)`} />
      <g transform={FRONT}>
        <rect x={26} y={H / 2 - 1.6} width={W - 52} height={3.2} rx={1.6} fill="#FF7323" opacity={0.55} filter={`url(#${id}-glow)`} />
        <rect x={26} y={H / 2 - 1} width={W - 52} height={2} rx={1} fill="#FF8A45" />
        <circle cx={W - 14} cy={H / 2} r={2.2} fill="#1F9254" />
      </g>

      {/* Coperchio */}
      <polygon points={poly([P(0, 0, H), P(W, 0, H), P(W, D, H), P(0, D, H)])} fill={`url(#${id}-top)`} />
      {/* bordo luminoso sugli spigoli frontali, effetto alluminio */}
      <polyline points={poly([P(0, D, H), P(W, D, H), P(W, 0, H)])} stroke="#5A5F66" strokeWidth={1.1} opacity={0.8} />
      <polyline points={poly([P(W, D, H), P(W, D, 0)])} stroke="#3F4348" strokeWidth={1} />
      <g transform={TOP}>
        {/* incavo leggero sul coperchio */}
        <rect x={14} y={12} width={W - 28} height={D - 24} rx={10} fill="none" stroke="#2C2F33" strokeWidth={1.2} />
        {/* logo angar inciso */}
        <g transform={`translate(${W / 2 - 30} ${D / 2 - 31}) scale(0.142) translate(-35 -8)`} fill="#5B6067">
          {LOGO_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <text x={W / 2} y={D / 2 + 42} textAnchor="middle" fontSize={11} letterSpacing={3} fill="#5B6067" fontFamily="var(--font-brand), sans-serif" fontWeight={600}>
          ANGAR EDGE
        </text>
      </g>
    </svg>
  );
}
