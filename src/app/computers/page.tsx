import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import DesktopDevices from "@/components/DesktopDevices";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Elenco dei computer con l'app desktop, con lo stato di connessione.
export default async function ComputersPage() {
  const orgId = currentOrgId();
  // Sensori di rete angar Edge: vedono anche i dispositivi senza app.
  const [sensors, online] = await Promise.all([
    db.edgeSensor.count({ where: { organizationId: orgId } }),
    db.edgeSensor.count({ where: { organizationId: orgId, lastSeenAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } } }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "Sources", href: "/sources" }]}
        title="Connected computers"
        subtitle="Every computer running the angar desktop app, and whether it's sending data right now."
        action={<Link href="/download" className="btn btn-primary">Get the app</Link>}
      />
      <DesktopDevices organizationId={orgId} />
      <Link href="/edge/sensors" className="rounded-xl border border-line bg-panel px-5 py-3 flex items-center justify-between gap-4 hover:border-ink-400 transition-colors">
        <span className="flex items-center gap-2 text-sm text-ink-100">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-steady" : "bg-ink-400/50"}`} />
          Network sensors (angar Edge)
          <span className="text-ink-400">{sensors ? `${online} of ${sensors} online` : "see AI on phones, servers and devices without the app"}</span>
        </span>
        <span className="text-sm text-ink-400">{sensors ? "Manage" : "Set up"} →</span>
      </Link>
    </div>
  );
}
