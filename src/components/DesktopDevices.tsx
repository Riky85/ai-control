import { listDesktopDevices } from "@/lib/discovery/devices";
import { fmtAgo } from "@/lib/format";

const OS_LABEL: Record<string, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };

// Elenco dei computer con l'app desktop: conferma visibile che è installata,
// collegata e sta inviando dati.
export default async function DesktopDevices({ organizationId, compact = false }: { organizationId: string; compact?: boolean }) {
  const devices = await listDesktopDevices(organizationId);
  if (devices.length === 0) {
    if (compact) return null;
    return (
      <div className="rounded-xl border border-dashed border-line p-6 text-center">
        <p className="text-sm text-ink-400">No computer has the app yet. Download it above and open it — this computer will show up here within a couple of minutes.</p>
      </div>
    );
  }
  const online = devices.filter((d) => d.online).length;

  return (
    <section className={`rounded-xl border bg-panel overflow-hidden ${online > 0 ? "border-steady/40" : "border-line"}`}>
      <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink-100">Connected computers</h2>
          <p className="text-sm text-ink-400">People sending AI usage to angar right now.</p>
        </div>
        {online > 0 ? (
          <span className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-steady bg-steady/10 rounded-full px-2.5 py-1">
            <span className="h-2 w-2 rounded-full bg-steady animate-pulse" />
            {online} connected
          </span>
        ) : (
          <span className="shrink-0 text-sm tabular text-ink-400">{devices.length} installed · waiting</span>
        )}
      </div>
      <div className="divide-y divide-line border-t border-line">
        {devices.map((d) => (
          <div key={d.host + (d.email ?? "")} className="flex items-center gap-4 px-5 py-3">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${d.online ? "bg-steady" : "bg-ink-400/40"}`} title={d.online ? "Connected" : "Silent"} />
            <div className="flex-1 min-w-0">
              <span className="block text-sm text-ink-100 truncate">{d.email ?? d.host}</span>
              <span className="block text-xs text-ink-400 truncate">
                {d.host}
                {d.os && OS_LABEL[d.os] ? ` · ${OS_LABEL[d.os]}` : ""}
                {d.appVersion ? ` · v${d.appVersion}` : ""}
              </span>
            </div>
            <span className="text-sm tabular text-ink-400 shrink-0 w-24 text-right">{d.aiCount} {d.aiCount === 1 ? "AI" : "AI"}</span>
            <span className={`text-sm tabular shrink-0 w-28 text-right ${d.online ? "text-steady" : "text-ink-400"}`}>{fmtAgo(d.lastSeenAt)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
