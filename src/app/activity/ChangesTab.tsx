import { fmtDateTime } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";
import { VendorBadge } from "@/components/VendorIcon";
import { StatCard, Table, td } from "@/components/ui";
import { EmptyState, Insight } from "@/components/insight";
import FilterBar from "@/components/FilterBar";

const FIELD_LABEL: Record<string, string> = { model: "Model", vendor: "Vendor", status: "Status" };
const STATUS_KEYS = ["APPROVED", "UNREVIEWED", "UNAPPROVED", "UNKNOWN"];

// Cosa è cambiato tra un sync e l'altro (modello, vendor, stato): scheda "Changes" di Activity.
export default async function ChangesTab({ q: rawQ, field }: { q?: string; field?: string }) {
  const q = rawQ?.trim();
  const changes = await db.assetChange.findMany({
    where: {
      aiAsset: { organizationId: currentOrgId(), ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
      ...(field && FIELD_LABEL[field] ? { field } : {}),
    },
    include: { aiAsset: true },
    orderBy: { detectedAt: "desc" },
    take: 200,
  });

  // Riepilogo degli ultimi 30 giorni (indipendente da ricerca e filtro).
  const recent = await db.assetChange.findMany({
    where: { aiAsset: { organizationId: currentOrgId() }, detectedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    select: { field: true, newValue: true, aiAssetId: true, aiAsset: { select: { name: true } } },
    orderBy: { detectedAt: "desc" },
    take: 5000,
  });
  const byField = (f: string) => recent.filter((c) => c.field === f);
  const models = byField("model");
  const statuses = byField("status");
  const vendors = byField("vendor");
  const nowUnapproved = statuses.filter((c) => c.newValue === "UNAPPROVED");
  const anyChange = recent.length > 0 || changes.length > 0 || Boolean(q || field);

  // I valori di stato si mostrano come pillole, gli altri come testo.
  const value = (f: string, v: string | null, strong = false) =>
    v == null ? <span className="text-ink-400">—</span> : f === "status" && STATUS_KEYS.includes(v) ? <Badge>{v}</Badge> : <span className={strong ? "font-medium text-ink-100" : "text-ink-400"}>{v}</span>;

  if (!anyChange)
    return <EmptyState title="No changes yet" text="When a synced model, vendor or status differs from what was on record, it shows up here." href="/connect" cta="Connect a source" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Changes, 30 days" value={String(recent.length)} hint={`${new Set(recent.map((c) => c.aiAssetId)).size} AI affected`} />
        <StatCard label="Model changes" value={String(models.length)} hint="New model behind an AI" href="/activity?tab=changes&field=model" />
        <StatCard label="Vendor changes" value={String(vendors.length)} hint="Provider behind an AI changed" href="/activity?tab=changes&field=vendor" />
        <StatCard label="Status changes" value={String(statuses.length)} hint={nowUnapproved.length ? `${nowUnapproved.length} now not allowed` : "Allowed, not allowed, to review"} tone={nowUnapproved.length ? "signal" : undefined} href="/activity?tab=changes&field=status" />
      </div>
      {models.length > 0 ? (
        <Insight tone="signal" href={`/assets/${models[0].aiAssetId}`} cta={`Open ${models[0].aiAsset.name}`}>
          {new Set(models.map((c) => c.aiAssetId)).size} AI switched model this month — latest <b className="font-medium">{models[0].aiAsset.name}</b> to {models[0].newValue ?? "an unknown model"}. Check the risk class still fits.
        </Insight>
      ) : recent.length === 0 ? (
        <Insight tone="steady">Nothing changed in the last 30 days — your AI look stable.</Insight>
      ) : null}
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
