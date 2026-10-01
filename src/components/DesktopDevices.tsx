import { listDesktopDevices } from "@/lib/discovery/devices";
import { fmtAgo } from "@/lib/format";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { displayableRef } from "@/lib/discovery/pseudonym";

const OS_LABEL: Record<string, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };

// Elenco dei computer con l'app desktop: conferma visibile che è installata,
// collegata e sta inviando dati.
export default async function DesktopDevices({ organizationId, compact = false }: { organizationId: string; compact?: boolean }) {
  const devices = await listDesktopDevices(organizationId);
  if (devices.length === 0) {
    if (compact) return null;
    return (
      <div className="rounded-xl border border-dashed border-line bg-panel p-6 text-center">
        <p className="text-sm text-ink-400">No computer has the app yet. Download it above and open it — this computer will show up here within a couple of minutes.</p>
      </div>
    );
  }
  const online = devices.filter((d) => d.online).length;
  // Privacy per reparto / solo totali: niente nomi di persone o di computer, solo conteggi.
  if (!showsPeople(await orgPrivacyMode(organizationId))) {
    const count = (xs: (string | null)[]) => [...xs.reduce((m, x) => m.set(x ?? "Unknown", (m.get(x ?? "Unknown") ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
    const os = count(devices.map((d) => (d.os ? OS_LABEL[d.os] ?? d.os : null)));
    const versions = count(devices.map((d) => (d.appVersion ? `v${d.appVersion}` : null)));
    return (
      <section className="rounded-xl border border-line bg-panel p-5 animate-rise">
        <div className="-mx-5 -mt-5 flex items-center justify-between gap-4 bg-ink border-b border-line rounded-t-xl px-5 py-3 bar-head">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink-100">Connected computers</h2>
            <p className="text-xs text-ink-400">Totals only — names of people and computers are hidden by the employee privacy mode.</p>
          </div>
          <span className={`shrink-0 text-sm font-medium rounded-full px-2.5 py-1 tabular ${online > 0 ? "text-steady bg-steady/10" : "text-ink-400 bg-ink-400/10"}`}>
            {online} of {devices.length} connected
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-ink-400 mb-1">Operating system</dt>
            {os.map(([k, n]) => <dd key={k} className="flex justify-between text-ink-100"><span>{k}</span><span className="tabular text-ink-400">{n}</span></dd>)}
          </div>
          <div>
            <dt className="text-xs text-ink-400 mb-1">App version</dt>
            {versions.map(([k, n]) => <dd key={k} className="flex justify-between text-ink-100"><span>{k}</span><span className="tabular text-ink-400">{n}</span></dd>)}
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-panel overflow-hidden animate-rise">
      <div className="bg-ink border-b border-line px-5 py-3 flex items-center justify-between gap-4 bar-head">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink-100">Connected computers</h2>
          <p className="text-xs text-ink-400">People sending AI usage to angar right now.</p>
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
      <div className="divide-y divide-line">
        {devices.map((d) => (
          <div key={d.host + (d.email ?? "")} className="flex items-center gap-4 px-5 py-3">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${d.online ? "bg-steady" : "bg-ink-400/40"}`} title={d.online ? "Connected" : "Silent"} />
            <div className="flex-1 min-w-0">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-ink-100 truncate">{displayableRef(d.email) ?? d.host}</span>
                {d.legacy && (
                  <span className="shrink-0 text-[11px] font-medium rounded-full px-1.5 py-px text-ink-400 bg-ink-400/10" title="Set up with the old company-wide token, which isn't tied to one person. Reinstall from the company link to give this computer its own token.">
                    legacy
                  </span>
                )}
              </span>
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
