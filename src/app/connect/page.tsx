import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import EdgeBox from "@/components/EdgeBox";
import { BankPreview, AccountsPreview, DesktopPreview, GatewayPreview } from "@/components/ConnectPreviews";
import { workplaceStatus } from "@/lib/connectors/workplace";
import { desktopDeviceCounts } from "@/lib/discovery/devices";

export const dynamic = "force-dynamic";

type Key = "bank" | "accounts" | "desktop" | "edge" | "gateway";

// Connect: il punto di partenza. Cinque riquadri grandi (costi, account aziendali,
// app desktop, angar Edge, Gateway) e sopra il "prossimo passo" più utile tra quelli mancanti.
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

  const cards: { key: Key; title: string; text: string; status: string | null; href: string; cta: string; art: React.ReactNode }[] = [
    {
      key: "bank",
      title: "Bank & invoices",
      text: "Every AI you pay for.",
      status: spendCount ? `${spendCount} AI charge${spendCount === 1 ? "" : "s"}` : null,
      href: "/sources",
      cta: spendCount ? "Add more" : "Upload",
      art: <BankPreview />,
    },
    {
      key: "accounts",
      title: "Company accounts",
      text: "Who uses which AI.",
      status: accounts ? workplace.connected.map((l) => l.split(" /")[0]).join(" · ") : null,
      href: "/sources#accounts",
      cta: accounts ? "Manage" : "Connect",
      art: <AccountsPreview />,
    },
    {
      key: "desktop",
      title: "Desktop app",
      text: "AI used on each computer.",
      status: devices.total ? `${devices.online} of ${devices.total} computer${devices.total === 1 ? "" : "s"} online` : null,
      href: "/download",
      cta: devices.total ? "Open" : "Get the app",
      art: <DesktopPreview />,
    },
    {
      key: "edge",
      title: "angar Edge",
      text: "Every AI on your network.",
      status: sensors ? `${sensors} sensor${sensors === 1 ? "" : "s"}` : null,
      href: "/edge/sensors",
      cta: sensors ? "Open" : "Set up",
      art: <EdgeBox width={210} className="-mb-6" />,
    },
    {
      key: "gateway",
      title: "Gateway",
      text: "Your apps call AI through angar.",
      status: gatewayKeys ? `${gatewayKeys} key${gatewayKeys === 1 ? "" : "s"} · ${gatewayToday.toLocaleString("en-GB")} today` : null,
      href: "/gateway",
      cta: gatewayKeys ? "Open" : "Set up",
      art: <GatewayPreview />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Connect" />

      {/* Il prossimo passo è segnato sulla sua scheda ("Start here" + pulsante primario): niente doppione sopra. */}
      {!next && (
        <section className="rounded-xl border border-line bg-panel px-4 py-3 text-sm text-ink-100">
          <span className="text-steady">✓</span> All connected.
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((c) => (
          <section key={c.key} className="overflow-hidden rounded-xl border border-line bg-panel flex flex-col">
            <div className="p-5 flex flex-col gap-1">
              <h2 className="text-sm font-bold text-ink-100 flex items-center gap-2">
                {c.title}
                {c.key === next && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-400">Start here</span>}
              </h2>
              <p className="text-sm text-ink-400">{c.text}</p>
            </div>
            <div className="mt-auto flex items-end justify-center px-6 pt-2 h-[176px] overflow-hidden">{c.art}</div>
            {/* Piede del riquadro: stato e azione */}
            <div className="relative flex items-center gap-3 border-t border-line bg-ink px-5 py-3 text-sm bar-foot">
              <span className="flex-1 min-w-0 truncate text-xs">
                {c.status ? <span className="text-ink-100"><span className="text-steady">✓</span> {c.status}</span> : <span className="text-ink-400">Not connected</span>}
              </span>
              {/* Solo il passo consigliato usa il pulsante primario */}
              <Link href={c.href} className={`btn btn-sm shrink-0 ${c.key === next ? "btn-primary" : "btn-secondary"}`}>{c.cta}</Link>
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
        <span>Also:</span>
        <Link href="/connectors" className="hover:text-ink-100 underline">AI provider keys{keyCount ? ` (${keyCount})` : ""}</Link>
        <Link href="/connectors#import" className="hover:text-ink-100 underline">Import a list</Link>
        <Link href="/connectors#network-logs" className="hover:text-ink-100 underline">Network logs</Link>
      </div>
    </div>
  );
}
