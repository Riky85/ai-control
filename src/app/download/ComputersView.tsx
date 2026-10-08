import Link from "next/link";
import DesktopDevices from "@/components/DesktopDevices";
import { db } from "@/lib/db";

// Scheda "Computers" dell'area Desktop app: i computer con l'app e lo stato di connessione.
export default async function ComputersView({ orgId }: { orgId: string }) {
  // Sensori di rete angar Edge: vedono anche i dispositivi senza app.
  const [sensors, online] = await Promise.all([
    db.edgeSensor.count({ where: { organizationId: orgId } }),
    db.edgeSensor.count({ where: { organizationId: orgId, lastSeenAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } } }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <DesktopDevices organizationId={orgId} />
      <Link href="/edge/sensors" className="rounded-xl border border-line bg-panel px-5 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 hover:border-ink-400 transition-colors">
        <span className="flex flex-wrap items-center gap-2 text-sm text-ink-100">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-steady" : "bg-ink-400/50"}`} />
          Network sensors (angar Edge)
          <span className="text-ink-400">{sensors ? `${online} of ${sensors} online` : "see AI on phones, servers and devices without the app"}</span>
        </span>
        <span className="eyebrow">{sensors ? "Manage" : "Set up"} [→]</span>
      </Link>
    </div>
  );
}
