import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import Badge from "@/components/Badge";
import FlowSteps from "@/components/FlowSteps";
import { VendorBadge } from "@/components/VendorIcon";
import { reviewAssetAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

const INPUT = "w-full border border-line rounded-lg px-3 py-2.5 text-sm text-ink-100 bg-panel placeholder:text-ink-400 focus:outline-none focus:border-ink-400";
const SENSITIVE = ["PII", "FINANCIAL", "SOURCE_CODE"];
const LEVEL_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// Coda di revisione: lista a sinistra, pannello di decisione a destra.
export default async function ReviewPage({ searchParams }: { searchParams: { id?: string; skip?: string; reviewed?: string; from?: string } }) {
  const orgId = currentOrgId();
  const skipped = (searchParams.skip ?? "").split(",").filter(Boolean);
  const [pending, users, reviewedCount] = await Promise.all([
    db.aiAsset.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } },
      include: {
        owner: true,
        cost: true,
        riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
        dataAccess: { include: { dataAsset: true } },
      },
    }),
    db.user.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } }),
    db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null, status: { in: ["APPROVED", "UNAPPROVED"] } } }),
  ]);
  // Prima i più rischiosi, poi i più recenti.
  const queue = pending.sort(
    (a, b) =>
      (LEVEL_RANK[a.riskAssessments[0]?.level ?? "LOW"] ?? 4) - (LEVEL_RANK[b.riskAssessments[0]?.level ?? "LOW"] ?? 4) ||
      b.firstSeenAt.getTime() - a.firstSeenAt.getTime()
  );
  const open = queue.filter((a) => !skipped.includes(a.id));
  const current = queue.find((a) => a.id === searchParams.id) ?? open[0] ?? null;
  const risk = current?.riskAssessments[0];
  const nextSkip = current ? [...skipped, current.id].join(",") : "";

  if (!current) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-8 py-4">
        <FlowSteps current={3} />
        <div className="rounded-xl border border-line bg-panel p-10 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-steady/10 text-steady flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h1 className="text-xl font-semibold text-ink-100 mt-4">{queue.length === 0 ? "All caught up" : "You've been through the list"}</h1>
          <p className="text-sm text-ink-400 mt-1">
            {queue.length === 0
              ? `${reviewedCount} AI system${reviewedCount === 1 ? "" : "s"} reviewed. New ones will appear here as angar finds them.`
              : `${queue.length} left for later.`}
          </p>
          <div className="flex justify-center gap-3 mt-6">
            {queue.length > 0 && <Link href="/review" className="btn btn-secondary">Review the ones I skipped</Link>}
            <Link href="/" className="btn btn-primary">See your AI estate</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          {searchParams.from && <div className="mb-4"><FlowSteps current={2} /></div>}
          <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink-100">Review</h1>
          <p className="text-sm text-ink-400 mt-1">
            {open.length} AI system{open.length === 1 ? "" : "s"} to review — decide once, angar keeps watching afterwards.
          </p>
        </div>
        {searchParams.reviewed && <span className="text-sm text-steady">✓ {searchParams.reviewed} reviewed</span>}
      </div>

      <div className="grid grid-cols-[320px_1fr] gap-4 items-start">
        <ul className="rounded-xl border border-line bg-panel divide-y divide-line overflow-hidden">
          {queue.map((a) => {
            const lvl = a.riskAssessments[0]?.level;
            const active = a.id === current.id;
            return (
              <li key={a.id}>
                <Link
                  href={`/review?id=${a.id}${searchParams.skip ? `&skip=${searchParams.skip}` : ""}`}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${active ? "bg-accent-soft/60" : "hover:bg-black/[0.02]"} ${skipped.includes(a.id) ? "opacity-50" : ""}`}
                >
                  <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={30} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ink-100 truncate">{a.name}</span>
                    <span className="block text-xs text-ink-400 truncate">{a.vendor ?? "Unknown vendor"}</span>
                  </span>
                  {lvl && <span className={`h-2 w-2 rounded-full shrink-0 ${lvl === "HIGH" || lvl === "CRITICAL" ? "bg-alarm" : lvl === "MEDIUM" ? "bg-signal" : "bg-steady"}`} />}
                </Link>
              </li>
            );
          })}
        </ul>

        <section className="rounded-xl border border-line bg-panel p-6 flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <VendorBadge vendor={current.vendor ?? ""} name={current.name} size={48} />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-ink-100">{current.name}</h2>
              <p className="text-sm text-ink-400">
                {[current.vendor ?? "Unknown vendor", current.type.replace(/_/g, " ").toLowerCase(), current.model].filter(Boolean).join(" · ")}
              </p>
            </div>
            {risk && <Badge>{risk.level}</Badge>}
            <Link href={`/assets/${current.id}`} className="btn btn-secondary btn-sm">Open passport</Link>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-ink-100 mb-2">Why it matters</h3>
              <ul className="flex flex-col gap-1.5 text-sm text-ink-400">
                {((risk?.reasons as string[] | undefined) ?? []).slice(0, 4).map((r, i) => (
                  <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-alarm shrink-0" />{r}</li>
                ))}
                {!risk && <li>Not assessed yet.</li>}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium text-ink-100 mb-2">Data it touches</h3>
              <div className="flex flex-wrap gap-1.5">
                {current.dataAccess.map((d) => (
                  <span key={d.id} className={`text-xs rounded-full px-2.5 py-1 ${SENSITIVE.includes(d.dataAsset.sensitivity) ? "bg-alarm/10 text-alarm" : "bg-ink text-ink-400"}`}>
                    {d.dataAsset.name}
                  </span>
                ))}
                {current.dataAccess.length === 0 && <span className="text-sm text-ink-400">None declared</span>}
              </div>
            </div>
          </div>

          <form action={reviewAssetAction} className="flex flex-col gap-4 pt-6 border-t border-line">
            <input type="hidden" name="assetId" value={current.id} />
            <input type="hidden" name="skip" value={searchParams.skip ?? ""} />
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5 text-sm text-ink-100">
                Who is responsible?
                <select name="ownerId" defaultValue={current.ownerId ?? ""} className={INPUT}>
                  <option value="">Choose a person…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                  ))}
                </select>
                <input name="newOwnerEmail" type="email" placeholder="…or type a new email" className={INPUT} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-ink-100">
                What does it cost per month?
                <span className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">€</span>
                  <input name="monthlyCost" type="number" step="0.01" min="0" defaultValue={current.cost?.monthlyCostEstimate ?? ""} placeholder="Leave empty if unknown" className={`${INPUT} pl-7`} />
                </span>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button name="decision" value="approve" className="btn btn-primary">Approve</button>
              <button name="decision" value="reject" className="btn btn-secondary">Reject</button>
              <Link href={`/review?skip=${nextSkip}`} className="ml-auto text-sm text-ink-400 hover:text-ink-100">Decide later →</Link>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
