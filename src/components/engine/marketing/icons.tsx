// Icone a linea sottile per la pagina pubblica dell'Engine (16×16, currentColor).
type P = { className?: string };

const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconBank = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M2 6.2 8 2.8l6 3.4M3 13.2h10M4 7.5v4.2M6.7 7.5v4.2M9.3 7.5v4.2M12 7.5v4.2" />
  </svg>
);

export const IconAccounts = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="6" cy="5.5" r="2.2" />
    <path d="M2 13c.4-2.2 2-3.4 4-3.4s3.6 1.2 4 3.4" />
    <path d="M10.6 3.6a2.2 2.2 0 0 1 0 3.9M11.8 9.8c1.2.4 2 1.5 2.2 3.2" />
  </svg>
);

export const IconDesktop = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="2.5" y="3" width="11" height="7.5" rx="1.2" />
    <path d="M1.5 13h13" />
  </svg>
);

export const IconNetwork = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M8 1.8 13 3.8v3.6c0 3-2.1 5.4-5 6.8-2.9-1.4-5-3.8-5-6.8V3.8L8 1.8Z" />
    <path d="M5.8 8h4.4M8 5.8v4.4" />
  </svg>
);

export const IconGauge = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M3.2 12.2a5.6 5.6 0 1 1 9.6 0" />
    <path d="M8 8.6 10.4 6" />
  </svg>
);

export const IconTag = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M2.5 2.5h5l6 6-5 5-6-6v-5Z" />
    <circle cx="5.4" cy="5.4" r="1" />
  </svg>
);

export const IconTrend = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M2 12 6 8l2.5 2.5L14 5" />
    <path d="M10.5 5H14v3.5" />
  </svg>
);

export const IconAutopilot = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="8" cy="8" r="5.8" />
    <path d="m5.6 8.2 1.7 1.7 3.2-3.6" />
  </svg>
);

export const IconLayers = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M8 2 14 5 8 8 2 5l6-3Z" />
    <path d="m2 8 6 3 6-3M2 11l6 3 6-3" />
  </svg>
);

export const IconReceipt = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M3.5 2h9v12l-1.8-1.2L9 14l-1-1.2L7 14l-1.7-1.2L3.5 14V2Z" />
    <path d="M6 5.5h4M6 8h4" />
  </svg>
);

export const IconEu = ({ className }: P) => (
  <svg {...base} className={className}>
    <rect x="3" y="7" width="10" height="7" rx="1.2" />
    <path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" />
  </svg>
);
