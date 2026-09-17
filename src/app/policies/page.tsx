import { db } from "@/lib/db";
import { POLICY_LIBRARY } from "@/lib/policy-library";
import { createPolicyAction, addPolicyFromLibraryAction, togglePolicyAction, deletePolicyAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const CATEGORY_LABEL: Record<string, string> = {
  data_access: "Data access",
  approval: "Approval",
  environment: "Environment",
  vendor: "Vendor",
  other: "Other",
};

export default async function PoliciesPage() {
  const policies = await db.policy.findMany({
    where: { organizationId: ORG_ID },
    orderBy: { createdAt: "desc" },
  });
  const activeNames = new Set(policies.map((p) => p.name));
  const availableTemplates = POLICY_LIBRARY.filter((t) => !activeNames.has(t.name));

  return (
    <div className="flex flex-col gap-9">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Policies</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          What your organization expects from every AI asset. Read here as
          governance intent — not yet enforced automatically at runtime.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink-400 mb-3">Active policies</h2>
        <div className="rounded-md border border-line bg-panel shadow-card divide-y divide-line">
          {policies.length === 0 && (
            <div className="p-5 text-sm text-ink-400">
              No policies yet. Add one from the library below, or write a custom one.
            </div>
          )}
          {policies.map((p) => (
            <div key={p.id} className="px-5 py-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink-100">{p.name}</span>
                  <span className="text-xs text-ink-400 border border-line rounded px-1.5 py-0.5">
                    {CATEGORY_LABEL[p.category] ?? p.category}
                  </span>
                </div>
                <p className="text-sm text-ink-400 mt-1">{p.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <form action={togglePolicyAction}>
                  <input type="hidden" name="policyId" value={p.id} />
                  <input type="hidden" name="enabled" value={String(p.enabled)} />
                  <button
                    type="submit"
                    className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                      p.enabled
                        ? "border-line text-ink-100 hover:border-ink-400"
                        : "border-line text-ink-400 hover:text-ink-100"
                    }`}
                  >
                    {p.enabled ? "Enabled" : "Disabled"}
                  </button>
                </form>
                <form action={deletePolicyAction}>
                  <input type="hidden" name="policyId" value={p.id} />
                  <button type="submit" className="text-xs text-ink-400 hover:text-alarm transition-colors">
                    Remove
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>

      {availableTemplates.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-ink-400 mb-3">Policy library</h2>
          <div className="rounded-md border border-line bg-panel shadow-card divide-y divide-line">
            {availableTemplates.map((t) => (
              <div key={t.name} className="px-5 py-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-100">{t.name}</span>
                    <span className="text-xs text-ink-400 border border-line rounded px-1.5 py-0.5">
                      {CATEGORY_LABEL[t.category]}
                    </span>
                  </div>
                  <p className="text-sm text-ink-400 mt-1">{t.description}</p>
                </div>
                <form action={addPolicyFromLibraryAction} className="shrink-0">
                  <input type="hidden" name="name" value={t.name} />
                  <input type="hidden" name="description" value={t.description} />
                  <input type="hidden" name="category" value={t.category} />
                  <button
                    type="submit"
                    className="text-xs px-2.5 py-1 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors"
                  >
                    Add
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-ink-400 mb-3">Write a custom policy</h2>
        <form action={createPolicyAction} className="rounded-md border border-line bg-panel shadow-card p-5 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-400">Name</label>
            <input
              name="name"
              required
              placeholder="e.g. Agents cannot create discounts above 20%"
              className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink-400">Description</label>
            <textarea
              name="description"
              required
              rows={2}
              className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100"
            />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-ink-400">Category</label>
              <select name="category" className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100">
                <option value="data_access">Data access</option>
                <option value="approval">Approval</option>
                <option value="environment">Environment</option>
                <option value="vendor">Vendor</option>
                <option value="other">Other</option>
              </select>
            </div>
            <button
              type="submit"
              className="text-sm px-4 py-2 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors"
            >
              Add policy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
