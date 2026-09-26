import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { PageHeader, StatCard, Table, Tabs, td } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import { VendorBadge } from "@/components/VendorIcon";
import { fmtDate, fmtDateTime, fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

const DAY = 86400000;
const PERSON_EVENTS = ["extension.active", "signin", "copilot.active"];

const SOURCE_LABEL = (e: string) =>
  e === "extension.active" ? "Browser extension" : e === "signin" ? "Microsoft 365" : e === "copilot.active" ? "Copilot report" : e.startsWith("oauth.") ? "Google Workspace" : e;

// Chi usa quale AI e quanto: dai dati dell'estensione, di Microsoft 365 e di
// Google Workspace. Da qui si vedono i posti pagati che nessuno usa.
export default async function UsagePage({ searchParams }: { searchParams: { view?: string; q?: string; ai?: string } }) {
  const orgId = currentOrgId();
  const view = ["ai", "people", "log"].includes(searchParams.view ?? "") ? searchParams.view! : "ai";
  const since = new Date(Date.now() - 30 * DAY);
  const [events, assets, users] = await Promise.all([
    db.aiAssetActivity.findMany({
      where: {
        occurredAt: { gte: since },
        aiAsset: { organizationId: orgId, deletedAt: null },
        OR: [{ eventType: { in: PERSON_EVENTS } }, { eventType: { startsWith: "oauth." } }],
      },
      include: { aiAsset: { select: { id: true, name: true, vendor: true } } },
      orderBy: { occurredAt: "desc" },
      take: 5000,
    }),
    db.aiAsset.findMany({ where: { organizationId: orgId, deletedAt: null, status: { not: "UNAPPROVED" } }, include: { cost: true } }),
    db.user.findMany({ where: { organizationId: orgId }, select: { email: true, name: true, department: true } }),
  ]);
  const who = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const nameOf = (email: string) => who.get(email.toLowerCase())?.name ?? email;
  const hitsOf = (p: unknown) => Math.max(1, Math.min(Number((p as { hits?: number } | null)?.hits) || 1, 100000));

  // Persona × AI
  type Row = { email: string; assetId: string; name: string; vendor: string | null; visits: number; days: Set<string>; last: Date; sources: Set<string> };
  const pair = new Map<string, Row>();
  for (const e of events) {
    const email = (e.actorRef ?? "").toLowerCase();
    if (!email.includes("@")) continue;
    const k = `${email}|${e.aiAssetId}`;
    const r = pair.get(k) ?? { email, assetId: e.aiAssetId, name: e.aiAsset.name, vendor: e.aiAsset.vendor, visits: 0, days: new Set(), last: e.occurredAt, sources: new Set() };
    r.visits += e.eventType === "extension.active" ? hitsOf(e.payload) : 1;
    r.days.add(e.occurredAt.toISOString().slice(0, 10));
    if (e.occurredAt > r.last) r.last = e.occurredAt;
    r.sources.add(SOURCE_LABEL(e.eventType));
    pair.set(k, r);
  }
  const pairs = [...pair.values()];

  // Per AI: persone attive vs posti pagati
  const byAi = assets
    .map((a) => {
      const rows = pairs.filter((p) => p.assetId === a.id);
      const active = rows.length;
      const seats = a.cost?.seats ?? null;
      const monthly = a.cost?.monthlyCostEstimate ?? null;
      const idle = seats && active > 0 && seats > active ? seats - active : 0;
      const save = idle && monthly && seats ? (monthly / seats) * idle : 0;
      return { a, active, seats, visits: rows.reduce((t, r) => t + r.visits, 0), idle, save };
    })
    .filter((x) => x.active > 0 || x.seats)
    .sort((x, y) => y.save - x.save || y.active - x.active);

  const people = new Set(pairs.map((p) => p.email));
  const idleSeats = byAi.reduce((t, x) => t + x.idle, 0);
  const canSave = byAi.reduce((t, x) => t + x.save, 0);
  const q = searchParams.q?.toLowerCase().trim();
  const match = (email: string, ai: string) => (!q || email.includes(q) || nameOf(email).toLowerCase().includes(q) || ai.toLowerCase().includes(q)) && (!searchParams.ai || searchParams.ai === ai);
  const aiOptions = [...new Set(pairs.map((p) => p.name))].sort().map((n) => ({ value: n, label: n, count: pairs.filter((p) => p.name === n).length }));
  const hasData = events.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Usage" subtitle="Who uses which AI and how often, in the last 30 days — and which paid seats nobody uses." />

      {!hasData && (
        <div className="rounded-xl border border-accent/50 bg-panel p-6 flex items-center gap-6">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-ink-100">No usage data yet</h2>
            <p className="text-sm text-ink-400 mt-1">Install the angar browser extension (one minute) or connect Microsoft 365 / Google Workspace. Usage appears here within 30 minutes.</p>
          </div>
          <Link href="/discover#extension" className="btn btn-primary">Set up the extension</Link>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="People using AI" value={String(people.size)} hint="Last 30 days" tone="accent" href="/usage?view=people" />
        <StatCard label="AI used" value={String(new Set(pairs.map((p) => p.assetId)).size)} hint={`${events.length} connections recorded`} href="/usage?view=ai" />
        <StatCard label="Paid seats not used" value={String(idleSeats)} hint={idleSeats ? "Nobody used them in 30 days" : "Every paid seat is used"} tone={idleSeats ? "signal" : undefined} href="/usage?view=ai" />
        <StatCard label="Could save" value={canSave >= 1 ? `${fmtEur(canSave)}/mo` : "—"} hint={canSave >= 1 ? `${fmtEur(canSave * 12)} a year` : "Nothing found"} href="/savings?kind=seats" />
      </div>

      <Tabs
        active={view}
        items={[
          { key: "ai", label: "By AI", href: "/usage?view=ai" },
          { key: "people", label: "By person", href: "/usage?view=people", count: people.size },
          { key: "log", label: "Connection log", href: "/usage?view=log" },
        ]}
      />

      {view === "ai" && (
        <Table columns={["AI", { label: "Active people", className: "text-right" }, { label: "Paid seats", className: "text-right" }, { label: "Visits", className: "text-right" }, { label: "Unused seats", className: "text-right" }, { label: "Could save", className: "text-right" }]} empty={byAi.length === 0 && "No usage yet."}>
          {byAi.map(({ a, active, seats, visits, idle, save }) => (
            <tr key={a.id} className="hover:bg-ink-100/[0.02] transition-colors">
              <td className={td}>
                <Link href={`/assets/${a.id}?tab=people`} className="flex items-center gap-3 group">
                  <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={30} />
                  <span className="font-medium text-ink-100 group-hover:underline">{a.name}</span>
                </Link>
              </td>
              <td className={`${td} text-right tabular text-ink-100`}>{active}</td>
              <td className={`${td} text-right tabular text-ink-400`}>{seats ?? "—"}</td>
              <td className={`${td} text-right tabular text-ink-400`}>{visits || "—"}</td>
              <td className={`${td} text-right tabular ${idle ? "text-signal font-medium" : "text-ink-400"}`}>{seats ? idle : "—"}</td>
              <td className={`${td} text-right tabular`}>{save >= 1 ? <Link href={`/assets/${a.id}?tab=people`} className="font-medium text-accent hover:underline">{fmtEur(save)}/mo</Link> : <span className="text-ink-400">—</span>}</td>
            </tr>
          ))}
        </Table>
      )}

      {view === "people" && (
        <>
          <FilterBar search={{ placeholder: "Search a person or AI" }} filters={aiOptions.length > 1 ? [{ param: "ai", label: "AI", options: aiOptions }] : []} />
          <Table columns={["Person", "AI", { label: "Visits", className: "text-right" }, { label: "Active days", className: "text-right" }, "Last used", "Seen by"]} empty={pairs.length === 0 && "No usage yet."}>
            {pairs
              .filter((p) => match(p.email, p.name))
              .sort((x, y) => y.last.getTime() - x.last.getTime())
              .map((p) => (
                <tr key={p.email + p.assetId}>
                  <td className={td}>
                    <span className="block text-ink-100">{nameOf(p.email)}</span>
                    {nameOf(p.email) !== p.email && <span className="block text-xs text-ink-400">{p.email}</span>}
                  </td>
                  <td className={td}>
                    <Link href={`/assets/${p.assetId}`} className="flex items-center gap-2 text-ink-100 hover:underline">
                      <VendorBadge vendor={p.vendor ?? ""} name={p.name} size={24} />
                      {p.name}
                    </Link>
                  </td>
                  <td className={`${td} text-right tabular text-ink-100`}>{p.visits}</td>
                  <td className={`${td} text-right tabular text-ink-400`}>{p.days.size} / 30</td>
                  <td className={`${td} text-ink-400 tabular`}>{fmtDate(p.last)}</td>
                  <td className={`${td} text-xs text-ink-400`}>{[...p.sources].join(", ")}</td>
                </tr>
              ))}
          </Table>
        </>
      )}

      {view === "log" && (
        <>
          <FilterBar search={{ placeholder: "Search a person or AI" }} filters={aiOptions.length > 1 ? [{ param: "ai", label: "AI", options: aiOptions }] : []} />
          <Table columns={["When", "Person", "AI", { label: "Visits", className: "text-right" }, "Source"]} empty={events.length === 0 && "No connections recorded yet."}>
            {events
              .filter((e) => (e.actorRef ?? "").includes("@") && match((e.actorRef ?? "").toLowerCase(), e.aiAsset.name))
              .slice(0, 300)
              .map((e) => (
                <tr key={e.id}>
                  <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDateTime(e.occurredAt)}</td>
                  <td className={`${td} text-ink-100`}>{nameOf(e.actorRef ?? "")}</td>
                  <td className={`${td} text-ink-100`}>{e.aiAsset.name}</td>
                  <td className={`${td} text-right tabular text-ink-400`}>{e.eventType === "extension.active" ? hitsOf(e.payload) : 1}</td>
                  <td className={`${td} text-xs text-ink-400`}>{SOURCE_LABEL(e.eventType)}</td>
                </tr>
              ))}
          </Table>
        </>
      )}
    </div>
  );
}
