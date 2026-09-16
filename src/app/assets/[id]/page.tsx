import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({ params }: { params: { id: string } }) {
  const asset = await db.aiAsset.findUnique({
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
  });

  if (!asset) notFound();

  const risk = asset.riskAssessments[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{asset.name}</h1>
          <p className="text-sm text-muted mt-1">
            {asset.vendor ?? "Unknown vendor"} · {asset.type.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge>{asset.status}</Badge>
          {risk && <Badge>{risk.level}</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <section className="col-span-2 flex flex-col gap-6">
          <div className="rounded-lg border border-border bg-panel p-5">
            <h2 className="text-sm font-medium text-muted mb-3">Connected systems</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              {asset.connectedSystems.map((s) => (
                <span key={s.id} className="px-2 py-1 rounded border border-border text-xs text-muted">
                  {s.system}
                  {s.detail && ` · ${s.detail}`}
                </span>
              ))}
              {asset.connectedSystems.length === 0 && (
                <span className="text-sm text-muted">Nessun sistema collegato rilevato.</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-panel p-5">
            <h2 className="text-sm font-medium text-muted mb-3">Data access</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              {asset.dataAccess.map((d) => (
                <span
                  key={d.id}
                  className={`px-2 py-1 rounded border text-xs ${
                    ["PII", "FINANCIAL", "SOURCE_CODE"].includes(d.dataAsset.sensitivity)
                      ? "border-danger/40 text-danger"
                      : "border-border text-muted"
                  }`}
                >
                  {d.dataAsset.name}
                </span>
              ))}
              {asset.dataAccess.length === 0 && (
                <span className="text-sm text-muted">Nessun accesso a dati dichiarato.</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-panel p-5">
            <h2 className="text-sm font-medium text-muted mb-3">AI Asset Graph</h2>
            <div className="text-sm font-mono leading-7 text-muted">
              {asset.usages.slice(0, 3).map((u) => (
                <div key={u.id} className="text-white">
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

          <div className="rounded-lg border border-border bg-panel p-5">
            <h2 className="text-sm font-medium text-muted mb-3">Recent activity</h2>
            <div className="divide-y divide-border text-sm">
              {asset.activities.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2">
                  <div className="text-muted">
                    <span className="mono text-xs mr-2">
                      {new Date(a.occurredAt).toLocaleString()}
                    </span>
                    {a.eventType} {a.actorRef && `— ${a.actorRef}`}
                  </div>
                  <span className="text-xs text-muted">{a.source}</span>
                </div>
              ))}
              {asset.activities.length === 0 && (
                <div className="py-2 text-muted">Nessuna attività registrata finora.</div>
              )}
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <div className="rounded-lg border border-border bg-panel p-5 text-sm">
            <h2 className="text-xs font-medium text-muted mb-3">Profile</h2>
            <dl className="flex flex-col gap-2">
              <Row label="Owner" value={asset.owner?.name ?? "Unowned"} />
              <Row label="Department" value={asset.department ?? "—"} />
              <Row label="Model" value={asset.model ?? "—"} />
              <Row label="Connector" value={asset.connector?.provider ?? "Manual"} />
              <Row label="First seen" value={new Date(asset.firstSeenAt).toLocaleDateString()} />
              <Row
                label="Last seen"
                value={asset.lastSeenAt ? new Date(asset.lastSeenAt).toLocaleDateString() : "—"}
              />
            </dl>
          </div>

          {risk && (
            <div className="rounded-lg border border-border bg-panel p-5 text-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-medium text-muted">Risk</h2>
                <Badge>{risk.level}</Badge>
              </div>
              <div className="text-2xl font-semibold mono mb-3">{risk.score}/100</div>
              <div className="text-xs text-muted mb-1">Why</div>
              <ul className="text-sm mb-3 list-disc list-inside">
                {(risk.reasons as string[]).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              {(risk.mitigations as string[]).length > 0 && (
                <>
                  <div className="text-xs text-muted mb-1">Mitigations</div>
                  <ul className="text-sm list-disc list-inside text-success">
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
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
