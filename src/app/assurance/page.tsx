import { db } from "@/lib/db";
import Link from "next/link";
import StatusDot from "@/components/StatusDot";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const LEVEL_LABEL: Record<string, string> = {
  ASSURED: "Assured",
  NEEDS_REVIEW: "Needs review",
  RESTRICTED: "Restricted",
  BLOCKED: "Blocked",
};
const LEVEL_COLOR: Record<string, string> = {
  ASSURED: "text-steady",
  NEEDS_REVIEW: "text-signal",
  RESTRICTED: "text-alarm",
  BLOCKED: "text-alarm",
};


interface CheckRow {
  key: string;
  label: string;
  status: "PASSED" | "WARNING" | "FAILED";
  detail: string;
}

export default async function AssurancePage() {
  const assets = await db.aiAsset.findMany({
    where: { organizationId: ORG_ID, deletedAt: null },
    include: { assuranceReports: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const withReport = assets
    .map((a) => ({ asset: a, report: a.assuranceReports[0] }))
    .filter((x) => x.report);

  const totalChecks = withReport.reduce((sum, x) => sum + x.report!.passedCount + x.report!.warningCount + x.report!.failedCount, 0);
  const totalPassed = withReport.reduce((sum, x) => sum + x.report!.passedCount, 0);
  const totalWarning = withReport.reduce((sum, x) => sum + x.report!.warningCount, 0);
  const totalFailed = withReport.reduce((sum, x) => sum + x.report!.failedCount, 0);

  const blockedItems = withReport.filter((x) => x.report!.level === "BLOCKED");
  const restrictedItems = withReport.filter((x) => x.report!.level === "RESTRICTED");
  const reviewItems = withReport.filter((x) => x.report!.level === "NEEDS_REVIEW");
  const assuredItems = withReport.filter((x) => x.report!.level === "ASSURED");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Assurance</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          Every check is a fact read from the database — never a guess. {totalChecks} checks across{" "}
          {withReport.length} asset{withReport.length === 1 ? "" : "s"}.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-panel shadow-card grid grid-cols-3 divide-x divide-line">
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-steady" />
            <span className="text-xs text-ink-400">Passed</span>
          </div>
          <div className="tabular font-display text-2xl font-semibold text-ink-100">{totalPassed}</div>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" />
            <span className="text-xs text-ink-400">Warnings</span>
          </div>
          <div className="tabular font-display text-2xl font-semibold text-ink-100">{totalWarning}</div>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-alarm" />
            <span className="text-xs text-ink-400">Failed</span>
          </div>
          <div className={`tabular font-display text-2xl font-semibold ${totalFailed > 0 ? "text-alarm" : "text-ink-100"}`}>
            {totalFailed}
          </div>
        </div>
      </div>

      {([
        ["Blocked", blockedItems],
        ["Restricted", restrictedItems],
        ["Needs review", reviewItems],
        ["Assured", assuredItems],
      ] as [string, typeof withReport][]).map(([title, items]) =>
        items.length > 0 ? (
          <div key={title}>
            <h2 className="text-sm font-medium text-ink-400 mb-3">
              {title} ({items.length})
            </h2>
            <div className="flex flex-col gap-3">
              {items.map(({ asset, report }) => (
                <div key={asset.id} className="rounded-md border border-line bg-panel shadow-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Link href={`/assets/${asset.id}`} className="font-medium text-sm text-ink-100 hover:underline">
                      {asset.name}
                    </Link>
                    <span className={`text-xs font-medium ${LEVEL_COLOR[report!.level]}`}>
                      {LEVEL_LABEL[report!.level]} · {report!.score}%
                    </span>
                  </div>
                  <ul className="text-xs flex flex-col gap-1.5">
                    {(report!.checks as unknown as CheckRow[])
                      .filter((c) => c.status !== "PASSED")
                      .map((c) => (
                        <li key={c.key} className="flex items-start gap-2">
                          <StatusDot status={c.status} size={13} />
                          <span className="text-ink-100">{c.label}</span>
                          <span className="text-ink-400">— {c.detail}</span>
                        </li>
                      ))}
                    {(report!.checks as unknown as CheckRow[]).every((c) => c.status === "PASSED") && (
                      <li className="text-ink-400">All checks passed.</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}

      {withReport.length === 0 && (
        <div className="rounded-md border border-line bg-panel shadow-card p-5 text-sm text-ink-400">
          No assurance reports yet — they're generated automatically after the first connector sync.
        </div>
      )}
    </div>
  );
}
