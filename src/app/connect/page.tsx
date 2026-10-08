import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { BlockFoot, BlockHead, PageHeader } from "@/components/ui";
import { workplaceStatus } from "@/lib/connectors/workplace";
import { desktopDeviceCounts } from "@/lib/discovery/devices";

export const dynamic = "force-dynamic";

type Key = "bank" | "accounts" | "desktop" | "edge" | "gateway";

// Connect: il punto di partenza. Un elenco di cinque fonti (costi, account aziendali,
// app desktop, angar Edge, Gateway) con il "prossimo passo" più utile segnato.
export default async function ConnectPage() {
  const orgId = currentOrgId();
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [spendCount, workplace, keyCount, devices, sensors, gatewayKeys, gatewayToday] = await Promise.all([
    db.spendRecord.count({ where: { organizationId: orgId } }),
    workplaceStatus(orgId),
    db.connector.count({
      where: {
        organizationId: orgId,
        status: "CONNECTED",
        credentialsEncrypted: { not: null },
        provider: { notIn: ["MICROSOFT_365", "GOOGLE_WORKSPACE", "NETWORK", "FATTURE_IN_CLOUD", "BANK", "ACCOUNTING", "JIRA", "SERVICENOW", "OKTA", "CLOUDFLARE_GATEWAY", "CISCO_UMBRELLA"] },
      },
    }),
    desktopDeviceCounts(orgId),
    // I sensori "import" sono i log di rete importati, non box o software angar Edge.
    db.edgeSensor.count({ where: { organizationId: orgId, kind: { not: "import" } } }),
    db.gatewayKey.count({ where: { organizationId: orgId, revokedAt: null } }),
    db.gatewayRequest.count({ where: { organizationId: orgId, createdAt: { gte: since } } }),
  ]);
  const accounts = workplace.connected.length;

  // Ordine di priorità: prima i costi, poi l'uso (app o account), poi la rete.
  const next: Key | null = !spendCount ? "bank" : !accounts && !devices.total ? "desktop" : !accounts ? "accounts" : !sensors ? "edge" : null;

  const cards: { key: Key; title: string; text: string; status: string | null; href: string; cta: string }[] = [
    {
      key: "bank",
      title: "Bank & invoices",
      text: "Every AI you pay for.",
      status: spendCount ? `${spendCount} AI charge${spendCount === 1 ? "" : "s"}` : null,
      href: "/sources",
      cta: spendCount ? "Add more" : "Upload",
    },
    {
      key: "accounts",
      title: "Company accounts",
      text: "Who uses which AI.",
      status: accounts ? workplace.connected.map((l) => l.split(" /")[0]).join(" · ") : null,
      href: "/sources#accounts",
      cta: accounts ? "Manage" : "Connect",
    },
    {
      key: "desktop",
      title: "Desktop app",
      text: "AI used on each computer.",
      status: devices.total ? `${devices.online} of ${devices.total} computer${devices.total === 1 ? "" : "s"} online` : null,
      href: "/download",
      cta: devices.total ? "Open" : "Get the app",
    },
    {
      key: "edge",
      title: "angar Edge",
      text: "Every AI on your network.",
      status: sensors ? `${sensors} sensor${sensors === 1 ? "" : "s"}` : null,
      href: "/edge/sensors",
      cta: sensors ? "Open" : "Set up",
    },
    {
      key: "gateway",
      title: "Gateway",
      text: "Your apps call AI through angar.",
      status: gatewayKeys ? `${gatewayKeys} key${gatewayKeys === 1 ? "" : "s"} · ${gatewayToday.toLocaleString("en-GB")} today` : null,
      href: "/gateway",
      cta: gatewayKeys ? "Open" : "Set up",
    },
  ];

  const done = cards.filter((c) => c.status).length;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader subtitle="Where angar gets its data" title="Connect" />

      {/* Un solo elenco: ogni fonte con stato e azione; solo il passo consigliato usa il pulsante primario. */}
      <div className="rounded-xl border border-line bg-panel animate-rise">
        <BlockHead title="Sources" note={next ? `${done} of ${cards.length} connected` : "All connected"} />
        <div className="divide-y divide-line">
          {cards.map((c) => (
            <div key={c.key} className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-ink-100">
                  {c.title}
                  {c.key === next && <span className="rounded-[2px] border px-1.5 py-0.5 font-mono uppercase text-[10px] tracking-[0.05em] border-accent/45 text-accent">Start here</span>}
                </div>
                <div className="text-sm text-ink-400">{c.text}</div>
              </div>
              <span className="sm:w-64 min-w-0 truncate text-xs">
                {c.status ? <span className="text-ink-100"><span className="text-steady">✓</span> {c.status}</span> : <span className="eyebrow">Not connected</span>}
              </span>
              <Link href={c.href} className={`btn btn-sm shrink-0 ${c.key === next ? "btn-primary" : "btn-secondary"}`}>{c.cta}</Link>
            </div>
          ))}
        </div>
        <BlockFoot>
          <span className="text-xs text-ink-400">Also:</span>
          <Link href="/connectors" className="text-xs text-ink-400 hover:text-ink-100 underline">AI provider keys{keyCount ? ` (${keyCount})` : ""}</Link>
          <Link href="/connectors#import" className="text-xs text-ink-400 hover:text-ink-100 underline">Import a list</Link>
          <Link href="/connectors#network-logs" className="text-xs text-ink-400 hover:text-ink-100 underline">Network logs</Link>
          <Link href="/connect/other" className="text-xs text-ink-400 hover:text-ink-100 underline">Browser extension &amp; one-off scan</Link>
        </BlockFoot>
      </div>
    </div>
  );
}
