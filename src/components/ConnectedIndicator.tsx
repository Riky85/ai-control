import Link from "next/link";
import { listDesktopDevices } from "@/lib/discovery/devices";

// Indicatore in alto a destra: un'icona "computer" con un pallino verde e il
// numero quando ci sono computer connessi. Rimanda alla lista.
export default async function ConnectedIndicator({ organizationId }: { organizationId: string }) {
  const devices = await listDesktopDevices(organizationId);
  if (devices.length === 0) return null;
  const online = devices.filter((d) => d.online).length;

  return (
    <Link
      href="/computers"
      title={online > 0 ? `${online} computer${online === 1 ? "" : "s"} connected` : `${devices.length} computer${devices.length === 1 ? "" : "s"} · silent`}
      className="relative h-9 px-2.5 inline-flex items-center gap-2 rounded-lg border border-line bg-panel hover:bg-ink-100/[0.04] transition-colors"
    >
      <span className="relative text-ink-100">
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
          <rect x="2" y="3" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6.5 15h5M9 12v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ring-2 ring-panel ${online > 0 ? "bg-steady" : "bg-ink-400/50"} ${online > 0 ? "animate-pulse" : ""}`} />
      </span>
      {online > 0 && <span className="text-sm font-medium tabular text-ink-100">{online}</span>}
    </Link>
  );
}
