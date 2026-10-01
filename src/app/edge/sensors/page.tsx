import Link from "next/link";
import { currentSession } from "@/lib/auth";
import { featureEnabled } from "@/lib/plan-gate";
import { LockedNote } from "@/components/LockedFeature";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/alerts";
import { privacyModeOf, PRIVACY_MODES } from "@/lib/privacy";
import { EDGE_IMAGE } from "@/lib/edge/install-script";
import { CAND_PREFIX } from "@/lib/edge/config";
import { fmtAgo, fmtDate } from "@/lib/format";
import { PageHeader, Table, td, Tabs, Notice, StatCard } from "@/components/ui";
import { toggleSensorAction, renameSensorAction, deleteSensorAction, setUploadAlertAction, replaceDeviceAction, returnDeviceAction } from "@/lib/edge-actions";
import { MODEL_LABEL } from "@/lib/edge/device-id";
import { AddSensor, RotateToken, ConfirmSubmit } from "./SensorClient";

export const dynamic = "force-dynamic";

const ONLINE_MS = 15 * 60 * 1000;
const VIEWS = ["sensors", "ai", "invisible", "local", "uploads", "new"] as const;
type View = (typeof VIEWS)[number];

type Ev = { serviceId: string; serviceName: string; kind: string; client: string; clientLabel: string | null; hits: number; bytesUp: bigint; blocked: number; day: string };
type Stats = { dnsQueries?: number; aiQueries?: number; clients?: number; blocked?: number; logLines?: number; reportedAt?: string; localModels?: { ip: string; port: number; runtime: string; models: string[] }[] };

const mbStr = (b: number) => (b <= 0 ? "—" : b < 100_000 ? "<0.1" : (b / 1_000_000).toFixed(b < 10_000_000 ? 1 : 0));
const n = (x: number) => x.toLocaleString("en-GB");
const dayStr = (d: string) => (d === new Date().toISOString().slice(0, 10) ? "Today" : fmtDate(`${d}T12:00:00Z`));

// Sensori di rete angar Edge: stato, impostazioni e ciò che hanno visto negli ultimi 30 giorni.
export default async function EdgeSensorsPage({ searchParams }: { searchParams: { view?: string; error?: string; notice?: string } }) {
  const s = currentSession()!;
  const orgId = s.orgId;
  const view: View = (VIEWS as readonly string[]).includes(searchParams.view ?? "") ? (searchParams.view as View) : "sensors";
  const canEdit = s.role === "ADMIN" || s.role === "OWNER";
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const [org, sensors, events] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { privacyMode: true, uploadAlertMb: true } }),
    db.edgeSensor.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" }, include: { device: { select: { serial: true, model: true } } } }),
    db.edgeEvent.findMany({
      where: { organizationId: orgId, day: { gte: from } },
      select: { serviceId: true, serviceName: true, kind: true, client: true, clientLabel: true, hits: true, bytesUp: true, blocked: true, day: true },
      orderBy: { updatedAt: "desc" },
      take: 20_000,
    }),
  ]);
  const mode = privacyModeOf(org);
  const people = mode === "individual";
  const anonymous = mode === "anonymous";
  const now = Date.now();
  // Sensore di un dispositivo angar reso: resta con la sua storia ma è sempre offline.
  const isDevice = (x: { kind: string }) => x.kind === "device" || x.kind === "hardware";
  const returned = (x: { kind: string; device: unknown }) => isDevice(x) && !x.device;
  const isOnline = (x: (typeof sensors)[number]) => !returned(x) && !!x.lastSeenAt && now - x.lastSeenAt.getTime() < ONLINE_MS;
  const online = sensors.filter(isOnline).length;
  const base = appUrl();

  // Link all'inventario per le AI viste.
  const catIds = [...new Set(events.filter((e) => !e.serviceId.includes(":")).map((e) => e.serviceId))];
  const candExt = [...new Set(events.filter((e) => e.serviceId.startsWith("cand:")).map((e) => CAND_PREFIX + e.serviceId.slice(5)))];
  const assets = catIds.length || candExt.length
    ? await db.aiAsset.findMany({
        where: { organizationId: orgId, deletedAt: null, OR: [{ serviceId: { in: catIds } }, { externalId: { in: candExt } }] },
        select: { id: true, serviceId: true, externalId: true, status: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const assetFor = new Map<string, { id: string; status: string }>();
  for (const a of assets) {
    const k = a.serviceId && catIds.includes(a.serviceId) ? a.serviceId : a.externalId?.startsWith(CAND_PREFIX) ? "cand:" + a.externalId.slice(CAND_PREFIX.length) : null;
    if (k && !assetFor.has(k)) assetFor.set(k, a);
  }

  // Aggregazioni.
  const web = events.filter((e) => e.kind !== "local-model" && !e.serviceId.startsWith("cand:"));
  const byService = group(web, (e) => e.serviceId);
  const api = events.filter((e) => e.kind === "api" && e.hits > e.blocked);
  const local = events.filter((e) => e.kind === "local-model");
  const uploads = group(events.filter((e) => e.bytesUp > BigInt(0)), (e) => (people ? `${e.serviceId}|${e.client}` : e.serviceId))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 20);
  const cands = group(events.filter((e) => e.serviceId.startsWith("cand:")), (e) => e.serviceId);
  const clientsAll = new Set(events.filter((e) => e.client !== "*").map((e) => e.client));
  const blockedAll = events.reduce((t, e) => t + e.blocked, 0);

  const tabs = [
    { key: "sensors", label: "Sensors", count: sensors.length },
    { key: "ai", label: "AI on your network", count: byService.length },
    { key: "invisible", label: "Invisible AI", count: group(api, (e) => e.serviceId).length },
    { key: "local", label: "Local models", count: group(local, (e) => `${e.serviceId}|${e.client}`).length },
    { key: "uploads", label: "Large uploads", count: uploads.length },
    { key: "new", label: "New AI to review", count: cands.length },
  ].map((t) => ({ ...t, href: `/edge/sensors?view=${t.key}` }));

  const aiName = (sid: string, name: string) => {
    const a = assetFor.get(sid);
    return a ? <Link href={`/assets/${a.id}`} className="font-medium text-ink-100 hover:underline">{name}</Link> : <span className="font-medium text-ink-100">{name}</span>;
  };
  const clientCell = (e: { client: string; clientLabel: string | null }) =>
    e.client === "*" ? "—" : e.clientLabel ? <><span className="text-ink-100">{e.clientLabel}</span> <span className="text-ink-400 text-xs">{e.client}</span></> : <span className="text-ink-100">{e.client}</span>;
  const privacyNote = !people && (
    <p className="text-xs text-ink-400">
      Privacy mode: {PRIVACY_MODES.find((p) => p.id === mode)?.label.toLowerCase()} — {anonymous ? "no devices are recorded, only company totals." : "device names and IPs are hidden, only counts."}{" "}
      <Link href="/settings?tab=privacy" className="underline hover:text-ink-100">Change</Link>
    </p>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Connect", href: "/connect" }, { label: "angar Edge", href: "/edge" }]}
        title="Sensors"
        subtitle="Network sensors that see every AI your company reaches — from DNS, firewall or cloud logs. Never content or URLs."
        action={<Link href="/edge" className="btn btn-secondary btn-sm">About angar Edge</Link>}
      />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {!(await featureEnabled(orgId, "edgeSensors")) && <Notice><span className="inline-flex flex-wrap items-center gap-x-2">New software and cloud-log sensors need Growth; angar devices work on any plan. <LockedNote feature="edgeSensors" /></span></Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Sensors online" value={`${online}/${sensors.length}`} hint={sensors.length ? "Reporting in the last 15 min" : "Add your first sensor below"} tone={sensors.length && online < sensors.length ? "signal" : undefined} />
        <StatCard label="AI seen · 30 days" value={String(byService.length)} hint={cands.length ? `+ ${cands.length} new to review` : "From the catalog"} href="/edge/sensors?view=ai" />
        <StatCard label="Devices using AI" value={anonymous ? "—" : String(clientsAll.size)} hint={anonymous ? "Hidden in anonymous mode" : "Distinct IPs, 30 days"} />
        <StatCard label="Blocked attempts" value={n(blockedAll)} hint="AI blocked on the network, 30 days" />
      </div>

      <Tabs items={tabs} active={view} />

      {view === "sensors" && (
        <>
          <Table columns={["Sensor", "Status", "Last report", { label: "Settings", className: "w-[330px]" }, { label: "", className: "w-[1%]" }]} empty={sensors.length ? false : "No sensors yet. Add one below — it takes a few minutes."}>
            {sensors.map((x) => {
              const st = (x.stats ?? {}) as Stats;
              const on = isOnline(x);
              const cloud = x.kind === "cloud";
              const dev = isDevice(x);
              const gone = returned(x);
              const fields: { f: string; label: string; v: boolean }[] = cloud
                ? []
                : [
                    { f: "dnsEnabled", label: "DNS", v: x.dnsEnabled },
                    { f: "syslogEnabled", label: "Syslog", v: x.syslogEnabled },
                    { f: "blockEnabled", label: "Block", v: x.blockEnabled },
                    { f: "scanLan", label: "LAN scan", v: x.scanLan },
                  ];
              return (
                <tr key={x.id} className="align-top">
                  <td className={td}>
                    <div className="font-medium text-ink-100">{x.name}</div>
                    <div className="text-xs text-ink-400">
                      {cloud ? "Cloud logs" : dev ? "angar device" : "Software"} ·{" "}
                      {dev ? (x.device ? <><span className="font-mono">{x.device.serial}</span> · {MODEL_LABEL[x.device.model] ?? x.device.model}</> : "returned") : x.tokenHint}
                    </div>
                  </td>
                  <td className={td}>
                    <div className="flex items-center gap-2 text-ink-100">
                      <span className={`h-2 w-2 rounded-full ${on ? "bg-steady" : x.lastSeenAt && !gone ? "bg-signal" : "bg-ink-400/50"}`} />
                      {gone ? "Device returned" : on ? "Online" : x.lastSeenAt ? `Last seen ${fmtAgo(x.lastSeenAt)}` : dev ? "Waiting — plug it in" : "Waiting for first contact"}
                    </div>
                    <div className="text-xs text-ink-400">{[x.version && `v${x.version}`, x.os, x.hostIp].filter(Boolean).join(" · ") || "—"}</div>
                  </td>
                  <td className={`${td} text-ink-400`}>
                    {st.reportedAt ? (
                      <>
                        <div className="text-ink-100 tabular">{n(st.aiQueries ?? 0)} AI {cloud ? "log lines" : "queries"}</div>
                        <div className="text-xs tabular">
                          {cloud ? `${n(st.logLines ?? 0)} lines read` : `${n(st.clients ?? 0)} devices · ${n(st.blocked ?? 0)} blocked`} · {fmtAgo(st.reportedAt)}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={td}>
                    {cloud ? (
                      <span className="text-xs text-ink-400">Log push · {base}/api/edge/logs</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {fields.map((t) => (
                          <form key={t.f} action={toggleSensorAction}>
                            <input type="hidden" name="sensorId" value={x.id} />
                            <input type="hidden" name="field" value={t.f} />
                            <input type="hidden" name="value" value={t.v ? "off" : "on"} />
                            <button
                              disabled={!canEdit}
                              title={canEdit ? `Turn ${t.label} ${t.v ? "off" : "on"}` : "Only admins can change this"}
                              className={`text-xs rounded-full border px-2.5 py-1 transition-colors disabled:cursor-default ${t.v ? "border-steady/50 text-steady" : "border-line text-ink-400 hover:text-ink-100"}`}
                            >
                              {t.label} {t.v ? "on" : "off"}
                            </button>
                          </form>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className={td}>
                    {canEdit && (
                      <details>
                        <summary className="btn btn-ghost btn-sm list-none cursor-pointer select-none">⋯</summary>
                        <div className="mt-2 w-72 max-w-[80vw] rounded-xl border border-line bg-ink p-3 flex flex-col gap-2">
                          <form action={renameSensorAction} className="flex gap-2">
                            <input type="hidden" name="sensorId" value={x.id} />
                            <input name="name" defaultValue={x.name} maxLength={60} className="field flex-1 min-w-0" aria-label="Sensor name" />
                            <button className="btn btn-secondary btn-sm">Rename</button>
                          </form>
                          {dev && (
                            <form action={replaceDeviceAction} className="flex flex-col gap-1">
                              <input type="hidden" name="sensorId" value={x.id} />
                              <div className="flex gap-2">
                                <input name="serial" placeholder="New serial AE-…" maxLength={20} required className="field flex-1 min-w-0 font-mono uppercase" aria-label="Serial of the replacement device" />
                                <button className="btn btn-secondary btn-sm whitespace-nowrap">{x.device ? "Replace device" : "Link device"}</button>
                              </div>
                              <span className="text-[11px] text-ink-400">{x.device ? "From the replacement box's label. Same sensor and history; the old box stops." : "Links a new box to this sensor, keeping its history."}</span>
                            </form>
                          )}
                          <div className="flex items-center justify-between">
                            {dev ? (
                              x.device ? (
                                <form action={returnDeviceAction}>
                                  <input type="hidden" name="sensorId" value={x.id} />
                                  <ConfirmSubmit label="Return device" className="btn btn-ghost btn-sm" message={`Unlink ${x.device.serial} to send it back? ${x.name} keeps its history but stops receiving data.`} />
                                </form>
                              ) : (
                                <span />
                              )
                            ) : (
                              <RotateToken sensorId={x.id} name={x.name} kind={x.kind} appUrl={base} edgeImage={EDGE_IMAGE} />
                            )}
                            <form action={deleteSensorAction}>
                              <input type="hidden" name="sensorId" value={x.id} />
                              <ConfirmSubmit label="Delete" message={`Delete ${x.name}? It stops working and its history is removed.${x.device ? " The device is marked for return." : ""}`} />
                            </form>
                          </div>
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
            <AddSensor appUrl={base} edgeImage={EDGE_IMAGE} canEdit={canEdit} />
            <section className="rounded-xl border border-line bg-panel p-5">
              <h2 className="-mx-5 -mt-5 mb-4 bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm font-semibold text-ink-100 bar-head">Upload alert</h2>
              <p className="text-sm text-ink-400 mb-3">Alert when a device sends more than this to an AI that isn&apos;t approved, in one day. 0 turns it off.</p>
              <form action={setUploadAlertAction} className="flex items-center gap-2">
                <input name="uploadAlertMb" type="number" min={0} max={100000} step={1} defaultValue={org?.uploadAlertMb ?? 100} className="field w-24 tabular" disabled={!canEdit} aria-label="Upload alert threshold in MB" />
                <span className="text-sm text-ink-400">MB / day</span>
                <button className="btn btn-secondary btn-sm" disabled={!canEdit}>Save</button>
              </form>
              <p className="text-xs text-ink-400 mt-2">Needs firewall or cloud logs — DNS can&apos;t see bytes.</p>
            </section>
          </div>
        </>
      )}

      {view === "ai" && (
        <>
          <Table columns={["AI", { label: "Devices", className: "text-right" }, { label: "Requests", className: "text-right" }, { label: "MB sent", className: "text-right" }, { label: "Blocked", className: "text-right" }, "Last seen"]} empty={byService.length ? false : "Nothing yet. Once a sensor reports, every AI reached from your network shows up here."}>
            {byService.sort((a, b) => b.hits - a.hits).map((g) => (
              <tr key={g.key}>
                <td className={td}>
                  {aiName(g.key, g.name)}
                  <div className="text-xs text-ink-400">{g.kind === "api" ? "API" : "Web / app"}{assetFor.get(g.key)?.status === "UNAPPROVED" ? " · not allowed" : ""}</div>
                </td>
                <td className={`${td} text-right tabular text-ink-100`}>{anonymous ? "—" : g.clients}</td>
                <td className={`${td} text-right tabular text-ink-100`}>{n(g.hits)}</td>
                <td className={`${td} text-right tabular text-ink-400`}>{mbStr(g.bytes)}</td>
                <td className={`${td} text-right tabular ${g.blocked ? "text-alarm" : "text-ink-400"}`}>{g.blocked ? n(g.blocked) : "—"}</td>
                <td className={`${td} text-ink-400`}>{dayStr(g.last)}</td>
              </tr>
            ))}
          </Table>
          {privacyNote}
        </>
      )}

      {view === "invisible" && (
        <>
          <Notice>
            Calls to AI <span className="font-medium">APIs</span> don&apos;t come from people in a browser — they come from scripts, automations and AI agents, sometimes paid with a personal API key outside company billing. Find out who runs them.
          </Notice>
          {people ? (
            <Table columns={["API", "Device", { label: "Requests", className: "text-right" }, { label: "MB sent", className: "text-right" }, "Last seen"]} empty={api.length ? false : "No API calls seen in the last 30 days."}>
              {group(api, (e) => `${e.serviceId}|${e.client}`)
                .sort((a, b) => b.hits - a.hits)
                .slice(0, 100)
                .map((g) => (
                  <tr key={g.key}>
                    <td className={td}>{aiName(g.first.serviceId, g.name)}</td>
                    <td className={td}>{clientCell(g.first)}</td>
                    <td className={`${td} text-right tabular text-ink-100`}>{n(g.hits)}</td>
                    <td className={`${td} text-right tabular text-ink-400`}>{mbStr(g.bytes)}</td>
                    <td className={`${td} text-ink-400`}>{dayStr(g.last)}</td>
                  </tr>
                ))}
            </Table>
          ) : (
            <Table columns={["API", { label: "Devices", className: "text-right" }, { label: "Requests", className: "text-right" }, "Last seen"]} empty={api.length ? false : "No API calls seen in the last 30 days."}>
              {group(api, (e) => e.serviceId)
                .sort((a, b) => b.hits - a.hits)
                .map((g) => (
                  <tr key={g.key}>
                    <td className={td}>{aiName(g.key, g.name)}</td>
                    <td className={`${td} text-right tabular text-ink-100`}>{anonymous ? "—" : g.clients}</td>
                    <td className={`${td} text-right tabular text-ink-100`}>{n(g.hits)}</td>
                    <td className={`${td} text-ink-400`}>{dayStr(g.last)}</td>
                  </tr>
                ))}
            </Table>
          )}
          {privacyNote}
        </>
      )}

      {view === "local" && <LocalModels local={local} sensors={sensors.map((x) => ({ name: x.name, stats: (x.stats ?? {}) as Stats }))} people={people} clientCell={clientCell} />}

      {view === "uploads" && (
        <>
          <Table columns={["AI", ...(people ? ["Device"] : []), { label: "MB sent", className: "text-right" }, { label: "Requests", className: "text-right" }, "Status", "Last seen"]} empty={uploads.length ? false : "No uploads seen. Bytes sent come from firewall or cloud logs (e.g. Fortinet sentbyte, Zscaler reqsize) — DNS can't see them."}>
            {uploads.map((g) => {
              const st = assetFor.get(g.first.serviceId)?.status;
              return (
                <tr key={g.key}>
                  <td className={td}>{aiName(g.first.serviceId, g.name)}</td>
                  {people && <td className={td}>{clientCell(g.first)}</td>}
                  <td className={`${td} text-right tabular text-ink-100 font-medium`}>{mbStr(g.bytes)}</td>
                  <td className={`${td} text-right tabular text-ink-400`}>{n(g.hits)}</td>
                  <td className={td}>
                    <span className={st === "APPROVED" ? "text-steady" : st === "UNAPPROVED" ? "text-alarm" : "text-signal"}>{st === "APPROVED" ? "Approved" : st === "UNAPPROVED" ? "Not allowed" : "Not reviewed"}</span>
                  </td>
                  <td className={`${td} text-ink-400`}>{dayStr(g.last)}</td>
                </tr>
              );
            })}
          </Table>
          <p className="text-xs text-ink-400">Top 20 over the last 30 days. Alert threshold: {org?.uploadAlertMb ? `${org.uploadAlertMb} MB/day to AI that isn't approved` : "off"} — <Link href="/edge/sensors" className="underline hover:text-ink-100">change</Link>.</p>
        </>
      )}

      {view === "new" && (
        <>
          <Table columns={["Domain", { label: "Devices", className: "text-right" }, { label: "Requests", className: "text-right" }, "Last seen", { label: "", className: "w-[1%]" }]} empty={cands.length ? false : "No unknown AI seen. Domains that look like AI but aren't in the catalog show up here."}>
            {cands.sort((a, b) => b.hits - a.hits).map((g) => {
              const a = assetFor.get(g.key);
              return (
                <tr key={g.key}>
                  <td className={`${td} font-medium text-ink-100`}>{g.name}</td>
                  <td className={`${td} text-right tabular text-ink-100`}>{anonymous ? "—" : g.clients}</td>
                  <td className={`${td} text-right tabular text-ink-100`}>{n(g.hits)}</td>
                  <td className={`${td} text-ink-400`}>{dayStr(g.last)}</td>
                  <td className={td}>
                    <Link href={a ? `/assets/${a.id}` : "/review"} className="btn btn-secondary btn-sm whitespace-nowrap">Review</Link>
                  </td>
                </tr>
              );
            })}
          </Table>
          <p className="text-xs text-ink-400">Looks like AI (name or firewall category) but isn&apos;t in the angar catalog yet. Approve it, block it or dismiss it from its page.</p>
        </>
      )}
    </div>
  );
}

function LocalModels({
  local,
  sensors,
  people,
  clientCell,
}: {
  local: Ev[];
  sensors: { name: string; stats: Stats }[];
  people: boolean;
  clientCell: (e: { client: string; clientLabel: string | null }) => React.ReactNode;
}) {
  // Nomi dei modelli dall'ultima scansione LAN di ciascun sensore.
  const models = new Map<string, string[]>();
  for (const s of sensors) for (const m of s.stats.localModels ?? []) models.set(`local:${m.runtime}|${m.ip}`, m.models);
  const rows = group(local, (e) => `${e.serviceId}|${e.client}`).sort((a, b) => (a.last < b.last ? 1 : -1));
  return (
    <>
      <Table columns={["Runtime", ...(people ? ["Server"] : []), "Models", "Last seen"]} empty={rows.length ? false : "No local model servers found. Turn on “LAN scan” on a sensor to look for Ollama and LM Studio (every 6 hours)."}>
        {rows.map((g) => (
          <tr key={g.key}>
            <td className={`${td} font-medium text-ink-100`}>{g.name}</td>
            {people && <td className={td}>{clientCell(g.first)}</td>}
            <td className={`${td} text-ink-400`}>{(models.get(g.key) ?? []).slice(0, 6).join(", ") || "—"}</td>
            <td className={`${td} text-ink-400`}>{dayStr(g.last)}</td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-ink-400">Local models run on your own machines, outside any provider&apos;s controls — check who uses them and with what data.</p>
    </>
  );
}

type Group = { key: string; name: string; kind: string; first: Ev; hits: number; bytes: number; blocked: number; clients: number; last: string };

function group(list: Ev[], keyOf: (e: Ev) => string): Group[] {
  const map = new Map<string, Group & { set: Set<string> }>();
  for (const e of list) {
    const k = keyOf(e);
    const g = map.get(k) ?? { key: k, name: e.serviceName, kind: e.kind, first: e, hits: 0, bytes: 0, blocked: 0, clients: 0, last: e.day, set: new Set<string>() };
    g.hits += e.hits;
    g.bytes += Number(e.bytesUp);
    g.blocked += e.blocked;
    if (e.client !== "*") g.set.add(e.client);
    if (e.day > g.last) g.last = e.day;
    if (!g.first.clientLabel && e.clientLabel) g.first = e;
    map.set(k, g);
  }
  return [...map.values()].map(({ set, ...g }) => ({ ...g, clients: set.size }));
}
