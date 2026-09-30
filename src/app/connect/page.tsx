import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import EdgeBox from "@/components/EdgeBox";
import { BankPreview, AccountsPreview, DesktopPreview } from "@/components/ConnectPreviews";
import { workplaceStatus } from "@/lib/connectors/workplace";
import { desktopDeviceCounts } from "@/lib/discovery/devices";

export const dynamic = "force-dynamic";

type Key = "bank" | "accounts" | "desktop" | "edge";

// Connect: il punto di partenza. Quattro riquadri grandi (costi, account aziendali,
// app desktop, angar Edge) e sopra il "prossimo passo" più utile tra quelli mancanti.
export default async function ConnectPage() {
  const orgId = currentOrgId();
  const [spendCount, workplace, keyCount, devices, sensors] = await Promise.all([
    db.spendRecord.count({ where: { organizationId: orgId } }),
    workplaceStatus(orgId),
    db.connector.count({
      where: {
        organizationId: orgId,
        status: "CONNECTED",
        credentialsEncrypted: { not: null },
        provider: { notIn: ["MICROSOFT_365", "GOOGLE_WORKSPACE", "NETWORK", "FATTURE_IN_CLOUD", "BANK", "ACCOUNTING", "JIRA", "SERVICENOW"] },
      },
    }),
    desktopDeviceCounts(orgId),
    db.edgeSensor.count({ where: { organizationId: orgId } }),
  ]);
  const accounts = workplace.connected.length;

  // Ordine di priorità: prima i costi, poi l'uso (app o account), poi la rete.
  const next: Key | null = !spendCount ? "bank" : !accounts && !devices.total ? "desktop" : !accounts ? "accounts" : !sensors ? "edge" : null;

  const cards: { key: Key; title: string; text: string; status: string | null; href: string; cta: string; art: React.ReactNode }[] = [
    {
      key: "bank",
      title: "Bank & invoices",
      text: "Upload a statement or invoices to see every AI you pay for.",
      status: spendCount ? `${spendCount} AI charge${spendCount === 1 ? "" : "s"}` : null,
      href: "/sources",
      cta: spendCount ? "Add more" : "Upload",
      art: <BankPreview />,
    },
    {
      key: "accounts",
      title: "Company accounts",
      text: "Microsoft 365 or Google Workspace — who uses which AI.",
      status: accounts ? workplace.connected.map((l) => l.split(" /")[0]).join(" · ") : null,
      href: "/sources#accounts",
      cta: accounts ? "Manage" : "Connect",
      art: <AccountsPreview />,
    },
    {
      key: "desktop",
      title: "Desktop app",
      text: "See which AI is used on each computer, and for how long.",
      status: devices.total ? `${devices.online} of ${devices.total} computer${devices.total === 1 ? "" : "s"} online` : null,
      href: "/download",
      cta: devices.total ? "Open" : "Get the app",
      art: <DesktopPreview />,
    },
    {
      key: "edge",
      title: "angar Edge",
      text: "A small box that sees every AI on your whole network.",
      status: sensors ? `${sensors} sensor${sensors === 1 ? "" : "s"}` : null,
      href: "/edge/sensors",
      cta: sensors ? "Open" : "Set up",
      art: <EdgeBox width={210} className="-mb-6" />,
    },
  ];
  const rec = cards.find((c) => c.key === next);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Connect" subtitle="Connect once — angar keeps everything up to date." />

      {rec ? (
        <section className="relative overflow-hidden rounded-xl border border-accent/30 bg-panel flex flex-wrap sm:flex-nowrap items-center gap-3 pl-4 pr-3 py-3">
          <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />
          <span className="relative text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2 py-0.5 shrink-0">Next best step</span>
          <span className="relative flex-1 min-w-0 text-sm text-ink-100 truncate">{rec.title}</span>
          <Link href={rec.href} className="relative btn btn-primary btn-sm shrink-0">{rec.cta}</Link>
        </section>
      ) : (
        <section className="rounded-xl border border-steady/30 bg-steady/[0.06] px-4 py-3 text-sm text-steady">✓ All connected — angar keeps everything up to date.</section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((c) => {
          const recommended = c.key === next;
          return (
            <section key={c.key} className={`relative overflow-hidden rounded-2xl border bg-panel flex flex-col ${recommended ? "border-accent/60" : "border-line"}`}>
              <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
              <div className="relative p-5 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-ink-100">{c.title}</h2>
                  {recommended && <span className="text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2 py-0.5">Recommended</span>}
                  {c.status && <span className="text-xs text-steady">✓ {c.status}</span>}
                </div>
                <p className="text-sm text-ink-400 -mt-1.5">{c.text}</p>
                <Link href={c.href} className={`btn btn-sm self-start ${recommended ? "btn-primary" : "btn-secondary"}`}>{c.cta}</Link>
              </div>
              <div className="relative mt-auto flex items-end justify-center px-6 pt-4 h-[176px] overflow-hidden">{c.art}</div>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
        <span>Also:</span>
        <Link href="/connectors" className="hover:text-ink-100 underline">AI provider keys{keyCount ? ` (${keyCount})` : ""}</Link>
        <Link href="/connectors#import" className="hover:text-ink-100 underline">Import a list</Link>
      </div>
    </div>
  );
}
