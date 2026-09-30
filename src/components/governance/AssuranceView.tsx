import Link from "next/link";
import { db } from "@/lib/db";
import StatusDot from "@/components/StatusDot";
import { Pill, Section, StackBar, type Tone } from "./parts";

/** Governance → Assurance checks (?tab=assurance): esito dei controlli per ogni AI. */

const LEVEL_LABEL: Record<string, string> = {
  ASSURED: "Assured",
  NEEDS_REVIEW: "Needs review",
  RESTRICTED: "Restricted",
  BLOCKED: "Blocked",
};
const LEVEL_TONE: Record<string, Tone> = { ASSURED: "steady", NEEDS_REVIEW: "signal", RESTRICTED: "accent", BLOCKED: "alarm" };

interface CheckRow {
  key: string;
  label: string;
  status: "PASSED" | "WARNING" | "FAILED";
  detail: string;
}

export default async function AssuranceView({ orgId }: { orgId: string }) {
  const assets = await db.aiAsset.findMany({
    where: { organizationId: orgId, deletedAt: null },
    include: { assuranceReports: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const withReport = assets.flatMap((a) => (a.assuranceReports[0] ? [{ asset: a, report: a.assuranceReports[0] }] : []));
  const passed = withReport.reduce((t, x) => t + x.report.passedCount, 0);
  const warning = withReport.reduce((t, x) => t + x.report.warningCount, 0);
  const failed = withReport.reduce((t, x) => t + x.report.failedCount, 0);
  const groups = (["BLOCKED", "RESTRICTED", "NEEDS_REVIEW", "ASSURED"] as const).map((level) => ({ level, items: withReport.filter((x) => x.report.level === level) }));

  return (
    <div className="flex flex-col gap-4">
      <Link href="/governance" className="text-sm text-ink-400 hover:text-ink-100 w-fit">
        ← Back to governance
      </Link>
      <Section id="assurance" title="Assurance checks" meta={`${passed + warning + failed} checks across ${withReport.length} AI`}>
        <div className="px-5 pb-5">
          <StackBar
            label="Assurance checks"
            parts={[
              { key: "p", label: "Passed", value: passed, bar: "bg-steady/60", dot: "bg-steady" },
              { key: "w", label: "Warnings", value: warning, bar: "bg-signal/60", dot: "bg-signal" },
              { key: "f", label: "Failed", value: failed, bar: "bg-alarm/60", dot: "bg-alarm" },
            ]}
          />
        </div>
      </Section>

      {groups.map(({ level, items }) =>
        items.length > 0 ? (
          <Section key={level} title={<span className="flex items-center gap-2">{LEVEL_LABEL[level]} <Pill tone={LEVEL_TONE[level]}>{items.length}</Pill></span>}>
            <ul className="divide-y divide-line border-t border-line">
              {items.map(({ asset, report }) => {
                const open = (report.checks as unknown as CheckRow[]).filter((c) => c.status !== "PASSED");
                return (
                  <li key={asset.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/assets/${asset.id}`} className="font-medium text-sm text-ink-100 hover:underline truncate">
                        {asset.name}
                      </Link>
                      <span className="text-xs text-ink-400 tabular shrink-0">{report.score}%</span>
                    </div>
                    {open.length > 0 && (
                      <ul className="mt-1.5 text-xs flex flex-col gap-1">
                        {open.map((c) => (
                          <li key={c.key} className="flex items-start gap-2">
                            <StatusDot status={c.status} size={13} />
                            <span className="text-ink-100">{c.label}</span>
                            <span className="text-ink-400">— {c.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null,
      )}

      {withReport.length === 0 && <div className="rounded-2xl border border-dashed border-line bg-panel p-8 text-center text-sm text-ink-400">No assurance reports yet.</div>}
    </div>
  );
}
