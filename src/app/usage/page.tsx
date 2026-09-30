import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { PageHeader, StatCard, Table, Tabs, td } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import { VendorBadge } from "@/components/VendorIcon";
import { fmtDate, fmtDateTime, fmtEur } from "@/lib/format";
import { Notice } from "@/components/ui";
import { cleanupRows, seatStats, idleSeats as idleSeatsOf, SEAT_WINDOW_DAYS } from "@/lib/seats";
import { isPseudonym } from "@/lib/discovery/pseudonym";
import { currentSession } from "@/lib/auth";
import { askAllInactiveAction, markSeatRemovedAction } from "@/lib/seat-actions";
import PrivacyNotice from "@/components/PrivacyNotice";
import SeatRemoveButton from "@/components/SeatRemoveButton";
import { groupByDepartment, maskCount, orgPrivacyMode, showsPeople, MIN_GROUP } from "@/lib/privacy";

export const dynamic = "force-dynamic";

const DAY = 86400000;
const fmtMinutes = (m: number) => (m < 1 ? "—" : m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`);
const PERSON_EVENTS = ["desktop.active", "extension.active", "signin", "copilot.active"];
const COUNTED = ["desktop.active", "extension.active"];

const SOURCE_LABEL = (e: string) =>
  e === "desktop.active" ? "Desktop app" : e === "extension.active" ? "Browser extension" : e === "signin" ? "Microsoft 365" : e === "copilot.active" ? "Copilot report" : e.startsWith("oauth.") ? "Google Workspace" : e;

// Chi usa quale AI e quanto: dai dati dell'estensione, di Microsoft 365 e di
// Google Workspace. Da qui si vedono i posti pagati che nessuno usa.
export default async function UsagePage({ searchParams }: { searchParams: { view?: string; q?: string; ai?: string; asked?: string; error?: string } }) {
  const orgId = currentOrgId();
  const mode = await orgPrivacyMode(orgId);
  const individual = showsPeople(mode);
  // Le viste per persona esistono solo in modalità "individual"; per reparto solo in "department".
  const views = individual ? ["ai", "people", "log", "cleanup"] : mode === "department" ? ["ai", "departments", "cleanup"] : ["ai", "cleanup"];
  const view = views.includes(searchParams.view ?? "") ? searchParams.view! : "ai";
  const cleanup = individual ? await cleanupRows(orgId) : [];
  const toRemove = cleanup.filter((c) => c.state === "release" || c.state === "no_reply");
  const since = new Date(Date.now() - SEAT_WINDOW_DAYS * DAY);
  const [events, assets, users] = await Promise.all([
    db.aiAssetActivity.findMany({
      where: {
        occurredAt: { gte: since },
        aiAsset: { organizationId: orgId, deletedAt: null },
        OR: [{ eventType: { in: PERSON_EVENTS } }, { eventType: { startsWith: "oauth." } }],
      },
      select: { id: true, aiAssetId: true, eventType: true, actorRef: true, occurredAt: true, payload: true, aiAsset: { select: { id: true, name: true, vendor: true } } },
      orderBy: { occurredAt: "desc" },
      take: 5000,
    }),
    db.aiAsset.findMany({ where: { organizationId: orgId, deletedAt: null, status: { not: "UNAPPROVED" } }, include: { cost: true } }),
    db.user.findMany({ where: { organizationId: orgId }, select: { email: true, name: true, department: true } }),
  ]);
  // Posti attivi dalla stessa fonte di Savings e avvisi di rinnovo (AiAssetUsage, 30 giorni), aggregati in SQL.
  const seatsByAsset = await seatStats(assets.map((a) => a.id));
  const who = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  // Uno pseudonimo (privacy per reparto / solo totali) non è mai un nome.
  const nameOf = (email: string) => (isPseudonym(email) ? "Anonymous person" : who.get(email.toLowerCase())?.name ?? email);
  const hitsOf = (p: unknown) => Math.max(1, Math.min(Number((p as { hits?: number } | null)?.hits) || 1, 100000));
  const minutesOf = (p: unknown) => Math.max(0, Math.min(Number((p as { minutes?: number } | null)?.minutes) || 0, 24 * 60));
  const visitsOf = (e: { eventType: string; payload: unknown }) => (COUNTED.includes(e.eventType) ? hitsOf(e.payload) : 1);

  // Persona × AI
  type Row = { email: string; assetId: string; name: string; vendor: string | null; visits: number; minutes: number; days: Set<string>; last: Date; sources: Set<string> };
  const pair = new Map<string, Row>();
  for (const e of events) {
    const email = (e.actorRef ?? "").toLowerCase();
    // Persona = email o pseudonimo (fuori da "per persona" il database ha solo pseudonimi).
    if (!email.includes("@") && !isPseudonym(email)) continue;
    const k = `${email}|${e.aiAssetId}`;
    const r = pair.get(k) ?? { email, assetId: e.aiAssetId, name: e.aiAsset.name, vendor: e.aiAsset.vendor, visits: 0, minutes: 0, days: new Set(), last: e.occurredAt, sources: new Set() };
    r.visits += visitsOf(e);
    r.minutes += minutesOf(e.payload);
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
      const st = seatsByAsset.get(a.id);
      // Persone attive: dai posti (AiAssetUsage) se noti, altrimenti da chi compare nelle attività.
      const active = st?.known ? st.active : rows.length;
      const seats = a.cost?.seats ?? null;
      const monthly = a.cost?.monthlyCostEstimate ?? null;
      const idle = idleSeatsOf(seats, st?.active ?? 0, st?.known ?? 0);
      const save = idle && monthly && seats ? (monthly / seats) * idle : 0;
      return { a, active, seats, visits: rows.reduce((t, r) => t + r.visits, 0), minutes: rows.reduce((t, r) => t + r.minutes, 0), idle, save };
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
  const count = (n: number) => (individual ? String(n) : maskCount(n));

  // Per reparto (k-anonimato: gruppi di almeno MIN_GROUP persone).
  const departments =
    mode === "department"
      ? groupByDepartment(pairs, (p) => p.email, (p) => who.get(p.email)?.department).map((g) => {
          const perAi = new Map<string, Set<string>>();
          for (const p of g.rows) perAi.set(p.name, (perAi.get(p.name) ?? new Set()).add(p.email));
          return {
            ...g,
            visits: g.rows.reduce((t, r) => t + r.visits, 0),
            minutes: g.rows.reduce((t, r) => t + r.minutes, 0),
            top: [...perAi.entries()].map(([name, set]) => [name, set.size] as const).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
          };
        })
      : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Usage"
        subtitle="Last 30 days."
        action={
          <Tabs
            active={view === "ai" ? "ai" : ""}
            items={[
              { key: "ai", label: "By AI", href: "/usage" },
              { key: "people", label: "People", href: "/people" },
            ]}
          />
        }
      />
      <PrivacyNotice mode={mode} what="Usage" />

      {!hasData && (
        <div className="rounded-xl border border-accent/50 bg-panel p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <p className="flex-1 text-sm text-ink-400"><b className="text-ink-100">No usage data yet.</b> Install the desktop app to see who uses which AI.</p>
          <Link href="/download" className="btn btn-primary">Get the desktop app</Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="People using AI" value={count(people.size)} hint={`${new Set(pairs.map((p) => p.assetId)).size} AI used`} tone="accent" href={individual ? "/usage?view=people" : mode === "department" ? "/usage?view=departments" : "/usage"} />
        <StatCard label="Paid seats not used" value={String(idleSeats)} hint={idleSeats ? "Nobody used them in 30 days" : "Every paid seat is used"} tone={idleSeats ? "signal" : undefined} href={individual && idleSeats ? "/usage?view=cleanup" : "/usage"} />
        <StatCard label="Could save" value={canSave >= 1 ? `${fmtEur(canSave)}/mo` : "—"} hint={canSave >= 1 ? `${fmtEur(canSave * 12)} a year` : "Nothing found"} href="/savings?kind=seats" />
      </div>

      {view !== "ai" && (
        <Link href="/usage" className="text-sm text-ink-400 hover:text-ink-100 w-fit">← Back to usage by AI</Link>
      )}
      {view === "ai" && toRemove.length > 0 && (
        <Link href="/usage?view=cleanup" className="rounded-xl bg-signal/10 px-4 py-3 text-sm text-ink-100 hover:bg-signal/15 transition-colors">
          {toRemove.length} seat{toRemove.length === 1 ? " is" : "s are"} ready to remove →
        </Link>
      )}

      {view === "cleanup" && !individual && (
        <Notice>
          Seat clean-up needs per-person data — an admin can enable it in <Link href="/settings?tab=privacy" className="underline">Settings → Employee privacy</Link> (see the <Link href="/compliance/employee-notice" className="underline">employee notice</Link>).
        </Notice>
      )}

      {view === "departments" && (
        <>
          <Table columns={["Department", { label: "People using AI", className: "text-right" }, { label: "Visits", className: "text-right" }, { label: "Time", className: "text-right" }, "Most used AI"]} empty={departments.length === 0 && "No usage yet."}>
            {departments.map((d) =>
              d.suppressed ? (
                <tr key="suppressed">
                  <td className={`${td} text-ink-400`} colSpan={5}>Fewer than {MIN_GROUP} people used AI — nothing can be shown by department.</td>
                </tr>
              ) : (
                <tr key={d.department}>
                  <td className={`${td} font-medium ${d.merged ? "text-ink-400" : "text-ink-100"}`}>{d.department}</td>
                  <td className={`${td} text-right tabular text-ink-100`}>{d.people}</td>
                  <td className={`${td} text-right tabular text-ink-400`}>{d.visits || "—"}</td>
                  <td className={`${td} text-right tabular text-ink-400`}>{fmtMinutes(d.minutes)}</td>
                  <td className={`${td} text-ink-400`}>{d.top.slice(0, 4).map(([n, c]) => `${n} (${maskCount(c)})`).join(", ") || "—"}</td>
                </tr>
              ),
            )}
          </Table>
          <p className="text-xs text-ink-400">Groups under {MIN_GROUP} people are merged.</p>
        </>
      )}

      {view === "cleanup" && individual && (
        <div className="flex flex-col gap-4">
          {searchParams.asked && <Notice tone="success">Asked {searchParams.asked} {searchParams.asked === "1" ? "person" : "people"} by email. Their answers appear here.</Notice>}
          {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}
          <section className="rounded-xl border border-line bg-panel p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <p className="flex-1 text-sm text-ink-400"><b className="text-ink-100">Free unused seats.</b> angar asks inactive people by email if they still need it.</p>
            {currentSession()?.role !== "VIEWER" && (
              <form action={askAllInactiveAction}>
                <button className="btn btn-primary">Ask inactive people now</button>
              </form>
            )}
          </section>
          <Table
            columns={["AI", "Person", "Asked", "Answer", { label: "Saves", className: "text-right" }, ""]}
            empty={cleanup.length === 0 && "Nobody has been asked yet."}
          >
            {cleanup.map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  <Link href={`/assets/${c.assetId}?tab=people`} className="flex items-center gap-2 text-ink-100 hover:underline">
                    <VendorBadge vendor={c.vendor ?? ""} name={c.assetName} size={24} />
                    {c.assetName}
                  </Link>
                </td>
                <td className={`${td} text-ink-100`}>{c.email}</td>
                <td className={`${td} text-ink-400 tabular`}>{fmtDate(c.sentAt)}</td>
                <td className={td}>
                  <span
                    className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                      c.state === "keep" ? "text-steady bg-steady/10" : c.state === "release" || c.state === "no_reply" ? "text-signal bg-signal/10" : c.state === "removed" ? "text-ink-400 bg-ink-400/10" : "text-ink-400 bg-ink-400/10"
                    }`}
                  >
                    {c.state === "keep" ? "Still needs it" : c.state === "release" ? "Doesn't need it" : c.state === "no_reply" ? "No answer in 7 days" : c.state === "removed" ? "Removed" : "Waiting"}
                  </span>
                </td>
                <td className={`${td} text-right tabular text-ink-100`}>{c.perSeatEur && c.state !== "keep" ? `${fmtEur(c.perSeatEur)}/mo` : "—"}</td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  {(c.state === "release" || c.state === "no_reply") && <SeatRemoveButton assetId={c.assetId} email={c.email} back="cleanup" />}
                  {(c.state === "release" || c.state === "no_reply") && (
                    <form action={markSeatRemovedAction} className="inline-block ml-2">
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn btn-secondary btn-sm" title="Remove the seat in the provider's admin page first, then mark it here">Mark removed</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {view === "ai" && (
        <Table columns={["AI", { label: "Active people", className: "text-right" }, { label: "Paid seats", className: "text-right" }, { label: "Unused seats", className: "text-right" }, { label: "Could save", className: "text-right" }, ""]} empty={byAi.length === 0 && "No usage yet."}>
          {byAi.map(({ a, active, seats, idle, save }) => (
            <tr key={a.id} className="hover:bg-ink-100/[0.02] transition-colors">
              <td className={td}>
                <Link href={`/assets/${a.id}?tab=people`} className="flex items-center gap-3 group">
                  <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={30} />
                  <span className="font-medium text-ink-100 group-hover:underline">{a.name}</span>
                </Link>
              </td>
              <td className={`${td} text-right tabular text-ink-100`}>{count(active)}</td>
              <td className={`${td} text-right tabular text-ink-400`}>{seats ?? "—"}</td>
              <td className={`${td} text-right tabular ${idle ? "text-signal font-medium" : "text-ink-400"}`}>{seats ? idle : "—"}</td>
              <td className={`${td} text-right tabular ${save >= 1 ? "font-medium text-accent" : "text-ink-400"}`}>{save >= 1 ? `${fmtEur(save)}/mo` : "—"}</td>
              <td className={`${td} text-right whitespace-nowrap`}>
                {idle > 0 && <Link href={individual ? "/usage?view=cleanup" : `/assets/${a.id}?tab=people`} className="btn btn-secondary btn-sm">Clean up</Link>}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {view === "people" && (
        <>
          <FilterBar search={{ placeholder: "Search a person or AI" }} filters={aiOptions.length > 1 ? [{ param: "ai", label: "AI", options: aiOptions }] : []} />
          <Table columns={["Person", "AI", { label: "Visits", className: "text-right" }, { label: "Time", className: "text-right" }, { label: "Active days", className: "text-right" }, "Last used", "Seen by"]} empty={pairs.length === 0 && "No usage yet."}>
            {pairs
              .filter((p) => match(p.email, p.name))
              .sort((x, y) => y.last.getTime() - x.last.getTime())
              .map((p) => (
                <tr key={p.email + p.assetId}>
                  <td className={td}>
                    <span className="block text-ink-100">{nameOf(p.email)}</span>
                    {nameOf(p.email) !== p.email && !isPseudonym(p.email) && <span className="block text-xs text-ink-400">{p.email}</span>}
                  </td>
                  <td className={td}>
                    <Link href={`/assets/${p.assetId}`} className="flex items-center gap-2 text-ink-100 hover:underline">
                      <VendorBadge vendor={p.vendor ?? ""} name={p.name} size={24} />
                      {p.name}
                    </Link>
                  </td>
                  <td className={`${td} text-right tabular text-ink-100`}>{p.visits}</td>
                  <td className={`${td} text-right tabular text-ink-400`}>{fmtMinutes(p.minutes)}</td>
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
          <Table columns={["When", "Person", "AI", { label: "Visits", className: "text-right" }, { label: "Time", className: "text-right" }, "Source"]} empty={events.length === 0 && "No connections recorded yet."}>
            {events
              .filter((e) => ((e.actorRef ?? "").includes("@") || isPseudonym(e.actorRef)) && match((e.actorRef ?? "").toLowerCase(), e.aiAsset.name))
              .slice(0, 300)
              .map((e) => (
                <tr key={e.id}>
                  <td className={`${td} tabular text-ink-400 whitespace-nowrap`}>{fmtDateTime(e.occurredAt)}</td>
                  <td className={`${td} text-ink-100`}>{nameOf(e.actorRef ?? "")}</td>
                  <td className={`${td} text-ink-100`}>{e.aiAsset.name}</td>
                  <td className={`${td} text-right tabular text-ink-400`}>{visitsOf(e)}</td>
                  <td className={`${td} text-right tabular text-ink-400`}>{fmtMinutes(minutesOf(e.payload))}</td>
                  <td className={`${td} text-xs text-ink-400`}>{SOURCE_LABEL(e.eventType)}</td>
                </tr>
              ))}
          </Table>
        </>
      )}

      {view === "ai" && (individual || mode === "department") && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-400">
          {individual && <Link href="/usage?view=people" className="hover:text-ink-100 hover:underline">Usage per person</Link>}
          {individual && <Link href="/usage?view=log" className="hover:text-ink-100 hover:underline">Connection log</Link>}
          {individual && <Link href="/usage?view=cleanup" className="hover:text-ink-100 hover:underline">Seat clean-up</Link>}
          {mode === "department" && <Link href="/usage?view=departments" className="hover:text-ink-100 hover:underline">By department</Link>}
        </div>
      )}
    </div>
  );
}
