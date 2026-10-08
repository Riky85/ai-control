import Logo from "@/components/Logo";
import { IconAccounts, IconAutopilot, IconBank, IconDesktop, IconGauge, IconNetwork, IconTag, IconTrend } from "./icons";

type Node = { title: string; caption: string; Icon: (p: { className?: string }) => JSX.Element; href?: string };

const SOURCES: Node[] = [
  { title: "Bank & invoices", caption: "Statements, e-invoices", Icon: IconBank },
  { title: "Company accounts", caption: "Microsoft 365, Google", Icon: IconAccounts },
  { title: "Desktop app", caption: "Real usage, each person", Icon: IconDesktop },
  { title: "Network · Edge", caption: "AI traffic at the gateway", Icon: IconNetwork },
];

const OUTPUTS: Node[] = [
  { title: "Angar Score", caption: "AI spend efficiency, 5 dimensions", Icon: IconGauge, href: "#engine-score" },
  { title: "AI Price Index", caption: "Your price vs the market", Icon: IconTag, href: "#engine-price" },
  { title: "Forecast", caption: "12 months, plus anomalies", Icon: IconTrend, href: "#engine-forecast" },
  { title: "Autopilot", caption: "Savings, proven on bills", Icon: IconAutopilot, href: "#engine-autopilot" },
];

// Centri verticali dei quattro nodi (ogni nodo occupa 1/4 dell'altezza, senza gap).
const Y = [12.5, 37.5, 62.5, 87.5];

/**
 * Schema "come funziona": fonti → angar Engine → risultati.
 * Desktop: tre colonne con connettori SVG curvi. Mobile: impilato con linee verticali.
 */
export default function FlowDiagram({ aiServices, pricedPlans }: { aiServices: number; pricedPlans: number }) {
  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_64px_minmax(0,0.95fr)_64px_minmax(0,1fr)] lg:items-stretch">
      <Column label="Sources" nodes={SOURCES} />

      <Connector side="in" />
      <VLine />

      {/* Motore centrale */}
      <div className="flex items-center lg:py-6">
        <div className="relative w-full rounded-2xl border border-line bg-panel overflow-hidden">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
          <div className="flex items-center gap-3 px-5 pt-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100/[0.05] text-ink-100">
              <Logo size={16} />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink-100">angar Engine</div>
              <div className="text-[11px] text-ink-400">One model of your AI estate</div>
            </div>
          </div>
          <dl className="mt-4 divide-y divide-line border-t border-line text-xs">
            <Step k="Recognise" v={`${aiServices} AI services, ${pricedPlans} plans`} />
            <Step k="Match" v="Seats to people and real use" />
            <Step k="Benchmark" v="Against the network, anonymously" />
          </dl>
        </div>
      </div>

      <VLine />
      <Connector side="out" />

      <Column label="Results" nodes={OUTPUTS} accent />
    </div>
  );
}

function Step({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 py-2.5">
      <dt className="text-ink-400">{k}</dt>
      <dd className="text-ink-100 text-right">{v}</dd>
    </div>
  );
}

function Column({ label, nodes, accent }: { label: string; nodes: Node[]; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-400 mb-2 lg:hidden">{label}</div>
      <ul className="grid grid-cols-2 gap-2 lg:flex lg:flex-col lg:gap-0 lg:flex-1">
        {nodes.map(({ title, caption, Icon, href }) => {
          const inner = (
            <>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${accent ? "bg-accent/10 text-accent" : "bg-ink-100/[0.05] text-ink-400"}`}>
                <Icon />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-100 leading-snug">{title}</span>
                <span className="block text-[11px] text-ink-400 leading-snug mt-0.5">{caption}</span>
              </span>
            </>
          );
          const cls = "flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3 h-full rounded-xl border border-line bg-panel px-3 py-2.5";
          return (
            <li key={title} className="lg:flex-1 lg:py-1.5 min-w-0">
              {href ? (
                <a href={href} className={`${cls} transition-colors hover:border-ink-400`}>
                  {inner}
                </a>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Connettori curvi (solo desktop): quattro nodi → centro, o centro → quattro nodi. */
function Connector({ side }: { side: "in" | "out" }) {
  const paths = Y.map((y) => (side === "in" ? `M0,${y} C55,${y} 45,50 100,50` : `M0,50 C55,50 45,${y} 100,${y}`));
  return (
    <div className="relative hidden lg:block" aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {paths.map((d) => (
          <path key={d} d={d} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={1} className={side === "in" ? "stroke-[rgb(var(--c-edge))]" : "stroke-accent/50"} />
        ))}
      </svg>
      {Y.map((y) => (
        <span key={y} className={`absolute h-1.5 w-1.5 -translate-y-1/2 rounded-full ${side === "in" ? "left-0 -translate-x-1/2 bg-[rgb(var(--c-edge))]" : "right-0 translate-x-1/2 bg-accent/70"}`} style={{ top: `${y}%` }} />
      ))}
      <span className={`absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ring-2 ring-panel ${side === "in" ? "right-0 translate-x-1/2 bg-ink-400" : "left-0 -translate-x-1/2 bg-accent"}`} />
    </div>
  );
}

/** Linea verticale tra i blocchi (solo mobile). */
function VLine() {
  return (
    <div className="flex justify-center py-1 lg:hidden" aria-hidden>
      <span className="h-8 w-px bg-[rgb(var(--c-edge))]" />
    </div>
  );
}
