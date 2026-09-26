import { fmtDateTime } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";
import ExportMenu from "@/components/ExportMenu";
import { VendorBadge } from "@/components/VendorIcon";
import { PageHeader, Table, td } from "@/components/ui";
import FilterBar from "@/components/FilterBar";

export const dynamic = "force-dynamic";

const FIELD_LABEL: Record<string, string> = { model: "Model", vendor: "Vendor", status: "Status" };
const STATUS_KEYS = ["APPROVED", "UNREVIEWED", "UNAPPROVED", "UNKNOWN"];

export default async function ChangesPage({ searchParams }: { searchParams: { q?: string; field?: string } }) {
  const q = searchParams.q?.trim();
  const changes = await db.assetChange.findMany({
    where: {
      aiAsset: { organizationId: currentOrgId(), ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
      ...(searchParams.field ? { field: searchParams.field } : {}),
    },
    include: { aiAsset: true },
    orderBy: { detectedAt: "desc" },
    take: 200,
  });

  // I valori di stato si mostrano come pillole, gli altri come testo.
  const value = (field: string, v: string | null, strong = false) =>
    v == null ? <span className="text-ink-400">—</span> : field === "status" && STATUS_KEYS.includes(v) ? <Badge>{v}</Badge> : <span className={strong ? "font-medium text-ink-100" : "text-ink-400"}>{v}</span>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Changes"
        subtitle="What changed between syncs — model, vendor and status, before and after."
        action={<ExportMenu dataset="changes" />}
      />
      <FilterBar
        search={{ placeholder: "Search AI…" }}
        filters={[{ param: "field", label: "Change", options: Object.entries(FIELD_LABEL).map(([value, label]) => ({ value, label })) }]}
        right={`${changes.length} change${changes.length === 1 ? "" : "s"}`}
      />
      <Table columns={["System", "Change", "Before", "After", "Detected"]} empty={changes.length === 0 && "No changes detected yet — they appear the moment a synced value differs from what was on record."}>
        {changes.map((c) => (
          <tr key={c.id}>
            <td className={td}>
              <Link href={`/assets/${c.aiAssetId}`} className="flex items-center gap-3 group">
                <VendorBadge vendor={c.aiAsset.vendor ?? ""} name={c.aiAsset.name} size={32} />
                <span>
                  <span className="block font-medium text-ink-100 group-hover:underline">{c.aiAsset.name}</span>
                  <span className="block text-xs text-ink-400">{c.aiAsset.vendor ?? "Vendor unknown"}</span>
                </span>
              </Link>
            </td>
            <td className={`${td} text-ink-100`}>{FIELD_LABEL[c.field] ?? c.field}</td>
            <td className={td}>{value(c.field, c.oldValue)}</td>
            <td className={td}>{value(c.field, c.newValue, true)}</td>
            <td className={`${td} text-ink-400 tabular`}>{fmtDateTime(c.detectedAt)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
