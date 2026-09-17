import { db } from "@/lib/db";
import { addUserAction, restartOnboardingAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

export default async function SettingsPage() {
  const org = await db.organization.findUnique({ where: { id: ORG_ID } });

  return (
    <div className="flex flex-col gap-9">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Settings</h1>
        <p className="text-sm text-ink-400 mt-1.5">Organization and access.</p>
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink-400 mb-3">Organization</h2>
        <div className="rounded-md border border-line bg-panel p-5 text-sm flex flex-col gap-2">
          <Row label="Name" value={org?.name ?? "—"} />
          <Row label="Country" value={org?.country ?? "—"} />
          <Row label="Created" value={org ? new Date(org.createdAt).toLocaleDateString() : "—"} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink-400 mb-3">Add a person</h2>
        <form action={addUserAction} className="rounded-md border border-line bg-panel p-5 flex flex-col gap-3 max-w-md">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-400">Email</label>
            <input
              name="email"
              type="email"
              required
              className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-400">Name</label>
            <input name="name" className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-400">Department</label>
            <input name="department" className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100" />
          </div>
          <button
            type="submit"
            className="self-start text-sm px-4 py-2 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors"
          >
            Add person
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink-400 mb-3">Setup wizard</h2>
        <div className="rounded-md border border-line bg-panel p-5 flex items-center justify-between">
          <p className="text-sm text-ink-400 max-w-sm">
            {org?.onboardingCompletedAt
              ? `Completed on ${new Date(org.onboardingCompletedAt).toLocaleDateString()}.`
              : "Not completed yet."}
          </p>
          <form action={restartOnboardingAction}>
            <button
              type="submit"
              className="text-sm px-4 py-2 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors"
            >
              {org?.onboardingCompletedAt ? "Run again" : "Run setup"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-400">{label}</span>
      <span className="text-ink-100">{value}</span>
    </div>
  );
}
