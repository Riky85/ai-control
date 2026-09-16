import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import RiskGauge from "@/components/RiskGauge";
import { setAssetOwnerAction, setAssetStatusAction } from "@/lib/actions";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({ params }: { params: { id: string } }) {
  const [asset, orgUsers] = await Promise.all([
    db.aiAsset.findUnique({
      where: { id: params.id },
      include: {
        owner: true,
        connector: true,
        connectedSystems: true,
        dataAccess: { include: { dataAsset: true } },
        usages: { include: { user: true }, take: 20 },
        riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
        activities: { orderBy: { occurredAt: "desc" }, take: 15 },
        relationsFrom: { include: { targetAsset: true } },
        relationsTo: { include: { sourceAsset: true } },
      },
    }),
    db.user.findMany({ where: { organizationId: "demo-org" }, orderBy: { name: "asc" } }),
  ]);

  if (!asset) notFound();

  const risk = asset.riskAssessments[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-100">{asset.name}</h1>
          <p className="text-sm text-ink-400 mt-1.5">
            {asset.vendor ?? "Vendor unknown"} — {asset.type.replace(/_/g, " ").toLowerCase()}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge>{asset.status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <section className="col-span-2 flex flex-col gap-6">
          <div className="rounded-md border border-line bg-panel p-5">
            <h2 className="text-sm font-medium text-ink-400 mb-3">Connected systems</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              {asset.connectedSystems.map((s) => (
                <span key={s.id} className="px-2 py-1 rounded border border-line text-xs text-ink-400">
                  {s.system}
                  {s.detail && ` — ${s.detail}`}
                </span>
              ))}
              {asset.connectedSystems.length === 0 && (
                <span className="text-sm text-ink-400">No connected systems detected.</span>
              )}
            </div>
          </div>

          <div className="rounded-md border border-line bg-panel p-5">
            <h2 className="text-sm font-medium text-ink-400 mb-3">Data access</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              {asset.dataAccess.map((d) => (
                <span
                  key={d.id}
                  className={`px-2 py-1 rounded border text-xs ${
                    ["PII", "FINANCIAL", "SOURCE_CODE"].includes(d.dataAsset.sensitivity)
                      ? "border-alarm/40 text-alarm"
                      : "border-line text-ink-400"
                  }`}
                >
                  {d.dataAsset.name}
                </span>
              ))}
              {asset.dataAccess.length === 0 && (
                <span className="text-sm text-ink-400">No declared data access.</span>
              )}
            </div>
          </div>

          <div className="rounded-md border border-line bg-panel p-5">
            <h2 className="text-sm font-medium text-ink-400 mb-3">Asset graph</h2>
            <div className="text-sm leading-7 text-ink-400">
              {asset.usages.slice(0, 3).map((u) => (
                <div key={u.id} className="text-ink-100">
                  {u.user?.name ?? u.externalUserRef ?? "Unknown user"}
                </div>
              ))}
              <div className="pl-4">↓ {asset.name}</div>
              {asset.connectedSystems.map((s) => (
                <div key={s.id} className="pl-8">
                  ↓ {s.system}
                  {s.detail && ` (${s.detail})`}
                </div>
              ))}
              {asset.relationsFrom.map((r) => (
                <div key={r.id} className="pl-8">
                  ↓ {r.relationType} → {r.targetAsset.name}
                </div>
              ))}
              {asset.dataAccess.map((d) => (
                <div key={d.id} className="pl-12">
                  ↓ {d.dataAsset.name}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-line bg-panel p-5">
            <h2 className="text-sm font-medium text-ink-400 mb-3">Recent activity</h2>
            <div className="divide-y divide-line text-sm">
              {asset.activities.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2">
                  <div className="text-ink-400">
                    <span className="tabular text-xs mr-2">
                      {new Date(a.occurredAt).toLocaleString()}
                    </span>
                    {a.eventType} {a.actorRef && `— ${a.actorRef}`}
                  </div>
                  <span className="text-xs text-ink-400">{a.source}</span>
                </div>
              ))}
              {asset.activities.length === 0 && (
                <div className="py-2 text-ink-400">No activity recorded yet.</div>
              )}
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <div className="rounded-md border border-line bg-panel p-5 text-sm">
            <h2 className="text-xs font-medium text-ink-400 mb-3">Profile</h2>
            <dl className="flex flex-col gap-2 mb-4">
              <Row label="Department" value={asset.department ?? "—"} />
              <Row label="Model" value={asset.model ?? "—"} />
              <Row label="Connector" value={asset.connector?.provider ?? "Manual"} />
              <Row label="First seen" value={new Date(asset.firstSeenAt).toLocaleDateString()} />
              <Row
                label="Last seen"
                value={asset.lastSeenAt ? new Date(asset.lastSeenAt).toLocaleDateString() : "—"}
              />
            </dl>

            <div className="border-t border-line pt-3 flex flex-col gap-3">
              <form action={setAssetOwnerAction} className="flex flex-col gap-1">
                <input type="hidden" name="assetId" value={asset.id} />
                <label className="text-xs text-ink-400">Owner</label>
                <div className="flex gap-2">
                  <select
                    name="ownerId"
                    defaultValue={asset.ownerId ?? ""}
                    className="flex-1 bg-ink border border-line rounded px-2 py-1.5 text-sm text-ink-100"
                  >
                    <option value="">No owner on record</option>
                    {orgUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name ?? u.email}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="text-xs px-2.5 rounded border border-line text-ink-100 hover:border-accent hover:text-accent transition-colors"
                  >
                    Save
                  </button>
                </div>
              </form>

              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-400">Status</span>
                <div className="flex gap-2">
                  {(["APPROVED", "UNAPPROVED", "UNREVIEWED"] as const).map((s) => (
                    <form key={s} action={setAssetStatusAction}>
                      <input type="hidden" name="assetId" value={asset.id} />
                      <input type="hidden" name="status" value={s} />
                      <button
                        type="submit"
                        disabled={asset.status === s}
                        className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                          asset.status === s
                            ? "border-accent text-accent cursor-default"
                            : "border-line text-ink-400 hover:text-ink-100 hover:border-ink-400"
                        }`}
                      >
                        {s === "APPROVED" ? "Approve" : s === "UNAPPROVED" ? "Reject" : "Unreviewed"}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {risk && (
            <div className="rounded-md border border-line bg-panel p-5 text-sm">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xs font-medium text-ink-400">Risk</h2>
                <Badge>{risk.level}</Badge>
              </div>
              <div className="flex justify-center py-2">
                <RiskGauge score={risk.score} level={risk.level} />
              </div>
              <div className="text-xs text-ink-400 mb-1 mt-2">Why</div>
              <ul className="text-sm mb-3 list-disc list-inside text-ink-100">
                {(risk.reasons as string[]).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              {(risk.mitigations as string[]).length > 0 && (
                <>
                  <div className="text-xs text-ink-400 mb-1">Mitigations</div>
                  <ul className="text-sm list-disc list-inside text-steady">
                    {(risk.mitigations as string[]).map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-400">{label}</dt>
      <dd className="text-ink-100 text-right">{value}</dd>
    </div>
  );
}
