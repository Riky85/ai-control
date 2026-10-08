import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import type { DataSensitivity } from "@prisma/client";
import { BlockHead, EmptyState, PageHeader, StatCard } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import FilterBar from "@/components/FilterBar";

export const dynamic = "force-dynamic";

const SENSITIVITY_LABEL: Record<DataSensitivity, string> = {
  PUBLIC: "Public",
  INTERNAL: "Internal",
  CONFIDENTIAL: "Confidential",
  PII: "Personal data",
  SOURCE_CODE: "Source code",
  FINANCIAL: "Financial",
};

const SENSITIVE_TIERS = ["PII", "FINANCIAL", "SOURCE_CODE", "CONFIDENTIAL"];

export default async function DataRegistryPage({ searchParams }: { searchParams: { q?: string; sensitivity?: string } }) {
  const q = searchParams.q?.trim();
  // Valori non validi nel filtro vengono ignorati invece di far esplodere Prisma
  const sensitivity =
    searchParams.sensitivity && Object.prototype.hasOwnProperty.call(SENSITIVITY_LABEL, searchParams.sensitivity)
      ? (searchParams.sensitivity as DataSensitivity)
      : undefined;
  // Riepilogo su tutte le categorie (indipendente da ricerca e filtro).
  const everything = await db.dataAsset.findMany({
    where: { organizationId: currentOrgId() },
    select: { sensitivity: true, accessedBy: { where: { aiAsset: { deletedAt: null } }, select: { aiAsset: { select: { id: true, name: true, status: true } } } } },
  });
  const sensitive = everything.filter((d) => SENSITIVE_TIERS.includes(d.sensitivity));
  const reached = sensitive.filter((d) => d.accessedBy.length > 0);
  const aiOnSensitive = new Map<string, { id: string; name: string; status: string }>();
  for (const d of sensitive) for (const a of d.accessedBy) aiOnSensitive.set(a.aiAsset.id, a.aiAsset);
  const notApproved = [...aiOnSensitive.values()].filter((a) => a.status !== "APPROVED");
  const onPii = new Set(everything.filter((d) => d.sensitivity === "PII").flatMap((d) => d.accessedBy.map((a) => a.aiAsset.id)));
  const notApprovedPii = notApproved.filter((a) => onPii.has(a.id));
  const toReview = notApproved.some((a) => a.status === "UNKNOWN" || a.status === "UNREVIEWED");
  const fixHref = notApproved.length === 1 || !toReview ? `/estate/${notApproved[0]?.id}` : "/review";

  const dataAssets = await db.dataAsset.findMany({
    where: {
      organizationId: currentOrgId(),
      ...(sensitivity ? { sensitivity } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      // Come nel riepilogo: le AI eliminate non contano (e il loro link non porterebbe da nessuna parte).
      accessedBy: { where: { aiAsset: { deletedAt: null } }, include: { aiAsset: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader subtitle="Data AI can reach"
        title="Data exposure"
        action={<ExportMenu />}
      />

      {everything.length === 0 ? (
        <EmptyState text="No data categories yet." action={<Link href="/connect" className="btn btn-primary">Connect a source</Link>} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard label="Data categories" value={String(everything.length)} hint={`${sensitive.length} sensitive`} />
            <StatCard label="Sensitive data reached" value={`${reached.length}/${sensitive.length}`} hint={reached.length ? "Reached by at least one AI" : "No AI reaches it"} tone={reached.length ? "warn" : undefined} />
            <StatCard label="AI on sensitive data" value={String(aiOnSensitive.size)} hint="Personal, financial, code, confidential" />
            <StatCard label="Without approval" value={String(notApproved.length)} hint={notApproved.length ? (notApprovedPii.length ? `${notApprovedPii.length} on personal data` : "Reach sensitive data") : "All approved"} tone={notApproved.length ? "alarm" : undefined} href={notApproved.length ? fixHref : undefined} />
          </div>
        </>
      )}

      {everything.length > 0 && (
        <>
          <FilterBar
            search={{ placeholder: "Search data…" }}
            filters={[{ param: "sensitivity", label: "Sensitivity", options: Object.entries(SENSITIVITY_LABEL).map(([value, label]) => ({ value, label })) }]}
            right={`${dataAssets.length} data categor${dataAssets.length === 1 ? "y" : "ies"}`}
          />
          <div className="rounded-xl border border-line bg-panel animate-rise">
            <BlockHead title="Data and the AI that reach it" />
            <div className="divide-y divide-line">
            {dataAssets.map((d) => (
              <div key={d.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      SENSITIVE_TIERS.includes(d.sensitivity) ? "bg-alarm" : "bg-ink-400"
                    }`}
                  />
                  <span className="text-sm font-medium text-ink-100">{d.name}</span>
                  <span className="eyebrow">{SENSITIVITY_LABEL[d.sensitivity] ?? d.sensitivity}</span>
                </div>
                {d.accessedBy.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {d.accessedBy.map((a) => (
                      <Link
                        key={a.id}
                        href={`/estate/${a.aiAssetId}`}
                        title={a.aiAsset.status === "APPROVED" ? "Approved" : "Not approved"}
                        className={`rounded-[2px] border px-1.5 py-0.5 font-mono uppercase text-[10px] tracking-[0.05em] hover:text-ink-100 transition-colors ${
                          a.aiAsset.status !== "APPROVED" && SENSITIVE_TIERS.includes(d.sensitivity) ? "text-alarm border-alarm/40" : "text-ink-400 border-line"
                        }`}
                      >
                        {a.aiAsset.name}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-400 mt-1.5">No AI declared on it.</p>
                )}
              </div>
            ))}
            {dataAssets.length === 0 && everything.length > 0 && (
              <div className="px-5 py-8 text-center text-sm text-ink-400">No data matches these filters.</div>
            )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
