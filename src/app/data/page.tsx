import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const SENSITIVITY_LABEL: Record<string, string> = {
  PUBLIC: "Public",
  INTERNAL: "Internal",
  CONFIDENTIAL: "Confidential",
  PII: "Personal data",
  SOURCE_CODE: "Source code",
  FINANCIAL: "Financial",
};

const SENSITIVE_TIERS = ["PII", "FINANCIAL", "SOURCE_CODE", "CONFIDENTIAL"];

export default async function DataRegistryPage() {
  const dataAssets = await db.dataAsset.findMany({
    where: { organizationId: ORG_ID },
    orderBy: { name: "asc" },
    include: {
      accessedBy: { include: { aiAsset: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Data registry</h1>
        <p className="text-sm text-ink-400 mt-1.5 max-w-lg">
          Every category of data your AI assets have been observed touching,
          and which assets reach each one.
        </p>
      </div>

      <div className="rounded-md border border-line bg-panel divide-y divide-line">
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
