import { db } from "@/lib/db";
import Link from "next/link";
import {
  updateOrganizationAction,
  addUserAction,
  addPolicyFromLibraryAction,
  completeOnboardingAction,
} from "@/lib/actions";
import { POLICY_LIBRARY } from "@/lib/policy-library";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";
const STEPS = ["Welcome", "Organization", "Connect a source", "Add people", "Turn on policies"];

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { step?: string };
}) {
  const step = Math.min(Math.max(parseInt(searchParams.step ?? "1", 10) || 1, 1), STEPS.length);

  const [org, people, activePolicies] = await Promise.all([
    db.organization.findUnique({ where: { id: ORG_ID } }),
    db.user.findMany({ where: { organizationId: ORG_ID }, orderBy: { name: "asc" } }),
    db.policy.findMany({ where: { organizationId: ORG_ID } }),
  ]);
  const activeNames = new Set(activePolicies.map((p) => p.name));

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "active" : "pending";
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div
                className={`h-1.5 flex-1 rounded-full ${
                  state === "pending" ? "bg-line" : "bg-ink-100"
                }`}
              />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-ink-400 -mt-6">
        Step {step} of {STEPS.length} — {STEPS[step - 1]}
      </p>

      {step === 1 && (
        <div className="rounded-lg border border-line bg-panel shadow-card p-8 flex flex-col gap-4">
          <h1 className="font-display text-2xl font-semibold text-ink-100">Welcome to AI Control</h1>
          <p className="text-sm text-ink-400">
            This walks you through the four things worth setting up before the
            inventory means anything: your organization's name, a real
            connector, the people who'll own what gets found, and a couple of
            starting policies. Takes a few minutes — you can leave and come
            back any time from Settings.
          </p>
          <Link
            href="/onboarding?step=2"
            className="self-start text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors"
          >
            Get started
          </Link>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-lg border border-line bg-panel shadow-card p-8 flex flex-col gap-4">
          <h1 className="font-display text-xl font-semibold text-ink-100">Your organization</h1>
          <p className="text-sm text-ink-400">
            This is what shows up on evidence exports and audit trails.
          </p>
          <form action={updateOrganizationAction} className="flex flex-col gap-3 max-w-sm">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-ink-400">Organization name</label>
              <input
                name="name"
                defaultValue={org?.name}
                required
                className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-ink-400">Country</label>
              <input
                name="country"
                defaultValue={org?.country ?? ""}
                placeholder="e.g. Italy"
                className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100"
              />
            </div>
            <button
              type="submit"
              className="self-start text-sm px-4 py-2 rounded-md border border-line text-ink-100 hover:border-ink-100 transition-colors"
            >
              Save
            </button>
          </form>
          <div className="flex justify-between pt-2">
            <Link href="/onboarding?step=1" className="text-xs text-ink-400 hover:text-ink-100">
              ← Back
            </Link>
            <Link
              href="/onboarding?step=3"
              className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors"
            >
              Continue
            </Link>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="rounded-lg border border-line bg-panel shadow-card p-8 flex flex-col gap-4">
          <h1 className="font-display text-xl font-semibold text-ink-100">Connect a source</h1>
          <p className="text-sm text-ink-400">
            Nothing shows up until a connector actually syncs. GitHub is the
            one you can realistically test on yourself — it needs a free
            GitHub organization, not just a personal account. The full
            step-by-step is on the Connectors page.
          </p>
          <div className="flex flex-col gap-2">
            {[
              { name: "GitHub", note: "Testable on a free org you create yourself" },
              { name: "Microsoft 365 / Entra ID", note: "Needs an Entra tenant with admin rights" },
              { name: "Anthropic (Claude)", note: "Needs a Claude Enterprise/Team org" },
              { name: "OpenAI (ChatGPT)", note: "Needs a ChatGPT Enterprise/Edu org" },
            ].map((c) => (
              <div key={c.name} className="border border-line rounded-md px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-ink-100">{c.name}</span>
                <span className="text-xs text-ink-400">{c.note}</span>
              </div>
            ))}
          </div>
          <Link href="/connectors" className="text-sm text-ink-100 hover:underline">
            Open Connections for setup instructions →
          </Link>
          <div className="flex justify-between pt-2">
            <Link href="/onboarding?step=2" className="text-xs text-ink-400 hover:text-ink-100">
              ← Back
            </Link>
            <Link
              href="/onboarding?step=4"
              className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors"
            >
              I'll do this later — continue
            </Link>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="rounded-lg border border-line bg-panel shadow-card p-8 flex flex-col gap-4">
          <h1 className="font-display text-xl font-semibold text-ink-100">Add the people who'll own things</h1>
          <p className="text-sm text-ink-400">
            Assets show up unowned until someone is assigned. You don't need
            everyone yet — just the people likely to own what gets found first.
          </p>
          <form action={addUserAction} className="flex gap-2 items-end flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-ink-400">Email</label>
              <input name="email" type="email" required className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100 w-56" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-ink-400">Name</label>
              <input name="name" className="bg-ink border border-line rounded px-3 py-2 text-sm text-ink-100 w-40" />
            </div>
            <button type="submit" className="text-sm px-3 py-2 rounded-md border border-line text-ink-100 hover:border-ink-100 transition-colors">
              Add
            </button>
          </form>
          {people.length > 0 && (
            <ul className="text-sm text-ink-100 flex flex-col gap-1">
              {people.map((p) => (
                <li key={p.id} className="text-ink-400">
                  <span className="text-ink-100">{p.name ?? p.email}</span> — {p.email}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between pt-2">
            <Link href="/onboarding?step=3" className="text-xs text-ink-400 hover:text-ink-100">
              ← Back
            </Link>
            <Link
              href="/onboarding?step=5"
              className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors"
            >
              Continue
            </Link>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="rounded-lg border border-line bg-panel shadow-card p-8 flex flex-col gap-4">
          <h1 className="font-display text-xl font-semibold text-ink-100">Turn on a couple of policies</h1>
          <p className="text-sm text-ink-400">
            These are read as governance intent, not enforced automatically
            yet — but they're what the Approvals queue and asset detail pages
            check against. Add as many as make sense; you can add the rest later
            from Policies.
          </p>
          <div className="flex flex-col gap-2">
            {POLICY_LIBRARY.map((t) => {
              const added = activeNames.has(t.name);
              return (
                <div key={t.name} className="border border-line rounded-md px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-ink-100">{t.name}</div>
                    <div className="text-xs text-ink-400">{t.description}</div>
                  </div>
                  {added ? (
                    <span className="text-xs text-steady shrink-0">Added</span>
                  ) : (
                    <form action={addPolicyFromLibraryAction} className="shrink-0">
                      <input type="hidden" name="name" value={t.name} />
                      <input type="hidden" name="description" value={t.description} />
                      <input type="hidden" name="category" value={t.category} />
                      <button type="submit" className="text-xs px-2.5 py-1 rounded-md border border-line text-ink-100 hover:border-ink-100 transition-colors">
                        Add
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between pt-2">
            <Link href="/onboarding?step=4" className="text-xs text-ink-400 hover:text-ink-100">
              ← Back
            </Link>
            <form action={completeOnboardingAction}>
              <button
                type="submit"
                className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-accent-dark transition-colors"
              >
                Finish setup
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
