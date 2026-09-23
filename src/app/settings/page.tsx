import { db } from "@/lib/db";
import Link from "next/link";
import { addUserAction, restartOnboardingAction } from "@/lib/actions";
import { Panel, PageHeader } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";
const input = "w-full border border-line rounded-lg px-3 py-2 text-sm text-ink-100 bg-panel placeholder:text-ink-400";
const button = "text-xs font-medium px-3 py-2 rounded-md border border-line text-ink-100 hover:border-ink-100 transition-colors";

export default async function SettingsPage() {
  const [org, users, connectors] = await Promise.all([
    db.organization.findUnique({ where: { id: ORG_ID } }),
    db.user.findMany({ where: { organizationId: ORG_ID }, orderBy: { name: "asc" } }),
    db.connector.findMany({ where: { organizationId: ORG_ID, status: "CONNECTED" } }),
  ]);
  const encryptionOn = Boolean(process.env.CREDENTIALS_SECRET);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" subtitle="Your organization, team and connections." />

      <div className="grid grid-cols-3 gap-4 items-start">
        <div className="col-span-2 flex flex-col gap-4">
          <Panel title="Team" subtitle={`${users.length} ${users.length === 1 ? "person" : "people"} — owners of AI systems are picked from here`}>
            <div className="divide-y divide-line -mx-5 border-y border-line mb-4">
              {users.map((u) => (
                <Link key={u.id} href={`/people/${u.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-black/[0.02] transition-colors">
                  <span className="h-7 w-7 rounded-full bg-accent-soft text-accent text-xs font-semibold flex items-center justify-center shrink-0">
                    {(u.name ?? u.email).charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-ink-100 truncate">{u.name ?? u.email}</span>
                    <span className="block text-xs text-ink-400 truncate">{u.email}</span>
                  </span>
                  <span className="text-xs text-ink-400">{u.department ?? ""}</span>
                </Link>
              ))}
              {users.length === 0 && <p className="px-5 py-3 text-sm text-ink-400">No people yet.</p>}
            </div>
            <form action={addUserAction} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <input name="email" type="email" required placeholder="Email" className={input} />
              <input name="name" placeholder="Name" className={input} />
              <input name="department" placeholder="Department" className={input} />
              <button className="text-xs font-medium px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors">Add</button>
            </form>
          </Panel>

          <Panel
            title="Connections"
            subtitle={connectors.length ? `${connectors.length} provider${connectors.length === 1 ? "" : "s"} connected` : "Nothing connected yet"}
            action={<Link href="/connectors" className={button}>Manage</Link>}
          >
            <div className="flex flex-wrap gap-2">
              {connectors.map((c) => (
                <span key={c.id} className="flex items-center gap-2 border border-line rounded-lg pl-1 pr-3 py-1 text-xs text-ink-100">
                  <VendorBadge vendor={c.provider} size={24} />
                  {c.provider.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase())}
                </span>
              ))}
              {connectors.length === 0 && <p className="text-sm text-ink-400">Connect a provider to start discovering your AI.</p>}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Organization">
            <dl className="text-sm flex flex-col gap-2.5">
              <Row label="Name" value={org?.name ?? "—"} />
              <Row label="Country" value={org?.country ?? "—"} />
              <Row label="Created" value={org ? new Date(org.createdAt).toLocaleDateString() : "—"} />
            </dl>
          </Panel>

          <Panel title="Security">
            <dl className="text-sm flex flex-col gap-2.5">
              <Row label="Connector keys" value={encryptionOn ? "Encrypted (AES-256)" : "Encryption not configured"} tone={encryptionOn ? "ok" : "bad"} />
              <Row label="Access" value="Read-only" />
              <Row label="Sign-in" value="Not enabled yet" />
            </dl>
          </Panel>

          <Panel title="Setup wizard" subtitle={org?.onboardingCompletedAt ? `Completed ${new Date(org.onboardingCompletedAt).toLocaleDateString()}` : "Not completed yet"}>
            <form action={restartOnboardingAction}>
              <button className={button}>{org?.onboardingCompletedAt ? "Run again" : "Run setup"}</button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className={tone === "ok" ? "text-steady" : tone === "bad" ? "text-alarm" : "text-ink-100"}>{value}</dd>
    </div>
  );
}
