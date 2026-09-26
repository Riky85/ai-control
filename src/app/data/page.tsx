import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import FilterBar from "@/components/FilterBar";

export const dynamic = "force-dynamic";


const SENSITIVITY_LABEL: Record<string, string> = {
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
  const dataAssets = await db.dataAsset.findMany({
    where: {
      organizationId: currentOrgId(),
      ...(searchParams.sensitivity ? { sensitivity: searchParams.sensitivity as any } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      accessedBy: { include: { aiAsset: true } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Data Exposure"
        subtitle="Which data your AI touches, and which AI reaches each one."
        action={<ExportMenu />}
      />

      <FilterBar
        search={{ placeholder: "Search data…" }}
        filters={[{ param: "sensitivity", label: "Sensitivity", options: Object.entries(SENSITIVITY_LABEL).map(([value, label]) => ({ value, label })) }]}
        right={`${dataAssets.length} data categor${dataAssets.length === 1 ? "y" : "ies"}`}
      />
      <div className="rounded-xl border border-line bg-panel shadow-card divide-y divide-line">
        {dataAssets.map((d) => (
          <div key={d.id} className="px-5 py-4">
            <div className="flex items-center gap-2">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  SENSITIVE_TIERS.includes(d.sensitivity) ? "bg-alarm" : "bg-ink-400"
                }`}
              />
              <span className="text-sm font-medium text-ink-100">{d.name}</span>
              <span className="text-xs text-ink-400">{SENSITIVITY_LABEL[d.sensitivity] ?? d.sensitivity}</span>
            </div>
            {d.accessedBy.length > 0 ? (
              <div className="flex flex-wrap gap-2 mt-2">
                {d.accessedBy.map((a) => (
                  <span key={a.id} className="text-xs text-ink-400 border border-line rounded px-2 py-0.5">
                    {a.aiAsset.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-400 mt-1.5">No AI asset currently declared as accessing this.</p>
            )}
          </div>
        ))}
        {dataAssets.length === 0 && (
          <div className="px-5 py-6 text-sm text-ink-400">
            No data categories on record yet.
          </div>
        )}
      </div>
    </div>
  );
}
