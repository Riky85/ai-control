import Link from "next/link";
import { desktopDeviceCounts } from "@/lib/discovery/devices";

// Indicatore in alto a destra, stessa misura del pulsante documentazione
// (36×36), così non copre le azioni della pagina: icona computer con un
// badge verde col numero dei computer connessi. Sempre presente: grigio se
// nessuno è connesso (e porta al download dell'app).
export default async function ConnectedIndicator({ organizationId }: { organizationId: string }) {
  // Stesso conteggio del layout (React cache): una sola query per richiesta.
  const { total, online } = await desktopDeviceCounts(organizationId);
  const title =
    online > 0 ? `${online} computer${online === 1 ? "" : "s"} connected` : total ? `${total} computer${total === 1 ? "" : "s"} · not sending right now` : "No computer connected yet — get the app";

  return (
    <span className="relative group/conn">
      <Link href={total ? "/download?view=computers" : "/download"} aria-label={title} className="btn btn-secondary btn-icon relative">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden className={online > 0 ? "text-ink-100" : "text-ink-400"}>
          <rect x="2" y="3" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6.5 15h5M9 12v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        {online > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-steady text-white text-[10px] font-semibold leading-[18px] text-center tabular ring-2 ring-panel">{online}</span>
        ) : total > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-ink-400/60 ring-2 ring-panel" />
        ) : null}
      </Link>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-md bg-ink-100 px-2 py-1 text-xs text-panel opacity-0 translate-y-[-2px] transition-all group-hover/conn:opacity-100 group-hover/conn:translate-y-0 z-50"
      >
        {title}
      </span>
    </span>
  );
}
