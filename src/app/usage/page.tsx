import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { EmptyState, PageHeader, Table, td, Notice } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import { VendorBadge } from "@/components/VendorIcon";
import { fmtDate, fmtDateTime, fmtEur } from "@/lib/format";
import { cleanupRows, seatStats, idleSeats as idleSeatsOf, SEAT_WINDOW_DAYS } from "@/lib/seats";
import { isPseudonym } from "@/lib/discovery/pseudonym";
import { currentSession } from "@/lib/auth";
import { askAllInactiveAction, markSeatRemovedAction } from "@/lib/seat-actions";
import PrivacyNotice from "@/components/PrivacyNotice";
import SeatRemoveButton from "@/components/SeatRemoveButton";
import { dailySeries, pctChange } from "@/components/insight";
import { groupByDepartment, maskCount, orgPrivacyMode, showsPeople } from "@/lib/privacy";
import UsageChart from "@/components/usage/UsageChart";
import { UsageSummary, ByAiList, RankList, ViewNav, type AiUsageRow, type RankRow } from "@/components/usage/cards";
import { Pill, Section, StackBar, type Tone } from "@/components/governance/parts";
import type { CleanupRow } from "@/lib/seats";
import RightsizeCard, { loadRightsizeCard } from "@/components/engine/RightsizeCard";

export const dynamic = "force-dynamic";

const DAY = 86400000;
const fmtMinutes = (m: number) => (m < 1 ? "—" : m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`);
const PERSON_EVENTS = ["desktop.active", "extension.active", "signin", "copilot.active"];
const COUNTED = ["desktop.active", "extension.active"];

const SOURCE_LABEL = (e: string) =>
  e === "desktop.active" ? "Desktop app" : e === "extension.active" ? "Browser extension" : e === "signin" ? "Microsoft 365" : e === "copilot.active" ? "Copilot report" : e.startsWith("oauth.") ? "Google Workspace" : e;

const STATE: Record<CleanupRow["state"], { label: string; tone: Tone }> = {
  waiting: { label: "Waiting", tone: "muted" },
  keep: { label: "Still needs it", tone: "steady" },
  release: { label: "Doesn't need it", tone: "signal" },
  no_reply: { label: "No answer in 7 days", tone: "signal" },
  removed: { label: "Removed", tone: "muted" },
};

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
  // Piano giusto per ogni persona: solo nella vista By AI.
  const rightsize = view === "ai" ? await loadRightsizeCard(orgId) : null;
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
      return { a, active, seats, measured: (st?.known ?? 0) > 0, visits: rows.reduce((t, r) => t + r.visits, 0), minutes: rows.reduce((t, r) => t + r.minutes, 0), idle, save };
    })
    .filter((x) => x.active > 0 || x.seats)
    .sort((x, y) => y.save - x.save || y.active - x.active);

  const people = new Set(pairs.map((p) => p.email));
  const idleSeats = byAi.reduce((t, x) => t + x.idle, 0);
  const canSave = byAi.reduce((t, x) => t + x.save, 0);
  // Posti misurabili (si sa chi li usa): pagati e usati, coerenti con i posti non usati.
  const measured = byAi.filter((x) => x.seats && x.measured);
  const seatsPaid = measured.reduce((t, x) => t + (x.seats ?? 0), 0);
  const seatsUsed = seatsPaid - measured.reduce((t, x) => t + x.idle, 0);
  const aiInUse = new Set([...pairs.map((p) => p.assetId), ...byAi.filter((x) => x.active > 0).map((x) => x.a.id)]).size;
  const q = searchParams.q?.toLowerCase().trim();
  const match = (email: string, ai: string) => (!q || email.includes(q) || nameOf(email).toLowerCase().includes(q) || ai.toLowerCase().includes(q)) && (!searchParams.ai || searchParams.ai === ai);
  const aiOptions = [...new Set(pairs.map((p) => p.name))].sort().map((n) => ({ value: n, label: n, count: pairs.filter((p) => p.name === n).length }));
  const hasData = events.length > 0;
  // Andamento: visite al giorno (solo totali, nessun nome) e confronto con la settimana prima.
  const trend = dailySeries(events, SEAT_WINDOW_DAYS, (e) => e.occurredAt, visitsOf);
  const lastWeek = trend.values.slice(-7).reduce((t, v) => t + v, 0);
  const weekBefore = trend.values.slice(-14, -7).reduce((t, v) => t + v, 0);
  const weekChange = pctChange(lastWeek, weekBefore);
  const count = (n: number) => (individual ? String(n) : maskCount(n));
  const cleanupHref = (assetId: string) => (individual ? "/usage?view=cleanup" : `/estate/${assetId}?tab=people`);

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

  // Anteprima "per persona" (solo in modalità individuale) e "per reparto" (solo gruppi mostrabili).
  const personRows: RankRow[] = individual
    ? [...people]
        .map((email) => {
          const mine = pairs.filter((p) => p.email === email);
          const days = new Set(mine.flatMap((p) => [...p.days]));
          const visits = mine.reduce((t, p) => t + p.visits, 0);
          const last = mine.reduce((d, p) => (p.last > d ? p.last : d), mine[0].last);
          return { email, ais: mine.length, days: days.size, visits, last };
        })
        .sort((a, b) => b.visits - a.visits || b.days - a.days)
        .slice(0, 5)
        .map((p) => ({
          key: p.email,
          label: nameOf(p.email),
          sub: `${p.ais} AI · ${p.visits.toLocaleString("en-GB")} visits`,
          bar: p.days,
          barMax: SEAT_WINDOW_DAYS,
          barLabel: `${p.days}/${SEAT_WINDOW_DAYS} days`,
          right: `Last ${fmtDate(p.last)}`,
        }))
    : [];
  const shownDepts = departments.filter((d) => !d.suppressed);
  const maxDeptVisits = Math.max(1, ...shownDepts.map((d) => d.visits));
  const deptRows: RankRow[] = shownDepts.slice(0, 5).map((d) => ({
    key: d.department,
    label: d.department,
    sub: `${d.people} people${d.top[0] ? ` · mostly ${d.top[0][0]}` : ""}`,
    bar: d.visits,
    barMax: maxDeptVisits,
    barLabel: d.visits.toLocaleString("en-GB"),
    right: fmtMinutes(d.minutes),
  }));

  const aiRows: AiUsageRow[] = byAi.map((x) => ({
    id: x.a.id,
    name: x.a.name,
    vendor: x.a.vendor,
    people: count(x.active),
    visits: x.visits,
    seats: x.seats,
    measured: x.measured,
    idle: x.idle,
    save: x.save,
    cleanupHref: cleanupHref(x.a.id),
  }));

  const navItems = [
    { key: "ai", label: "Overview", href: "/usage" },
    ...(individual
      ? [
          { key: "people", label: "By person", href: "/usage?view=people" },
          { key: "log", label: "Connection log", href: "/usage?view=log" },
        ]
      : mode === "department"
        ? [{ key: "departments", label: "By department", href: "/usage?view=departments" }]
        : []),
    { key: "cleanup", label: "Seat clean-up", href: "/usage?view=cleanup", count: toRemove.length || undefined },
  ];

  const stateCount = (s: CleanupRow["state"]) => cleanup.filter((c) => c.state === s).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Usage"
        subtitle="Who uses which AI, last 30 days"
        action={
          // Una sola riga di schede (sotto): la rubrica delle persone è una pagina a parte, non una scheda.
          <Link href="/people" className="btn btn-ghost btn-sm">
            People directory
          </Link>
        }
      />
      <PrivacyNotice mode={mode} what="Usage" />

      {!hasData && (
        <EmptyState
          text="No usage data yet. The desktop app shows which AI people use."
          action={
            <Link href="/download" className={`btn ${view === "cleanup" ? "btn-secondary" : "btn-primary"}`}>
              Get the desktop app
            </Link>
          }
        />
      )}

      <UsageSummary
        d={{
          people: count(people.size),
          peopleHref: individual ? "/usage?view=people" : mode === "department" ? "/usage?view=departments" : "/usage",
          aiInUse,
          seatsPaid: seatsPaid || null,
          seatsUsed: seatsPaid ? seatsUsed : null,
          unusedSeats: idleSeats,
          seatsHref: individual && idleSeats ? "/usage?view=cleanup" : "/usage#by-ai",
          unusedEur: canSave,
        }}
      />

      <ViewNav items={navItems} active={view} />

      {view === "ai" && (
        <>
          {hasData && <UsageChart values={trend.values} labels={trend.labels} unit="visits" weekChange={weekChange} />}
          <ByAiList rows={aiRows} />
          {rightsize && <RightsizeCard {...rightsize} />}

          {individual && hasData && <RankList id="by-person" title="By person" rows={personRows} href="/usage?view=people" cta="Everyone" empty="No usage yet." />}
          {mode === "department" && hasData && (
            <RankList
              id="by-department"
              title="By department"
              rows={deptRows}
              href="/usage?view=departments"
              cta="All departments"
              empty="Too few people to show."
            />
          )}
        </>
      )}

      {view === "cleanup" && !individual && (
        <Notice>
          Needs person-level data.{" "}
          <Link href="/settings?tab=privacy" className="underline">
            Enable it
          </Link>
        </Notice>
      )}

      {view === "departments" && (
        <>
          <Table
            columns={["Department", { label: "People", className: "text-right" }, { label: "Visits", className: "text-right" }, { label: "Time", className: "text-right" }, "Most used AI"]}
            empty={departments.length === 0 && "No usage yet."}
          >
            {departments.map((d) =>
              d.suppressed ? (
                <tr key="suppressed">
                  <td className={`${td} text-ink-400`} colSpan={5}>
                    Too few people to show.
                  </td>
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
        </>
      )}

      {view === "cleanup" && individual && (
        <div className="flex flex-col gap-6">
          {searchParams.asked && (
            <Notice tone="success">
              Asked {searchParams.asked} {searchParams.asked === "1" ? "person" : "people"}.
            </Notice>
          )}
          {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}
          <Section
            id="cleanup"
            title="Free unused seats"
            action={
              currentSession()?.role !== "VIEWER" && (
                <form action={askAllInactiveAction}>
                  <button className="btn btn-primary btn-sm" title="angar emails inactive people to ask if they still need it">Ask inactive people</button>
                </form>
              )
            }
          >
            {cleanup.length > 0 && (
              <div className="px-5 py-4">
                <StackBar
                  label="Seat requests"
                  parts={[
                    { key: "rm", label: "Ready to remove", value: toRemove.length, bar: "bg-signal/60", dot: "bg-signal" },
                    { key: "wait", label: "Waiting", value: stateCount("waiting"), bar: "bg-ink-400/40", dot: "bg-ink-400" },
                    { key: "keep", label: "Still needed", value: stateCount("keep"), bar: "bg-steady/60", dot: "bg-steady" },
                    { key: "done", label: "Removed", value: stateCount("removed"), bar: "bg-ink-100/30", dot: "bg-ink-100/60" },
                  ]}
                />
              </div>
            )}
          </Section>
          <Table columns={["AI", "Person", "Asked", "Answer", { label: "Saves", className: "text-right" }, ""]} empty={cleanup.length === 0 && "Nobody asked yet."}>
            {cleanup.map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  <Link href={`/estate/${c.assetId}?tab=people`} className="flex items-center gap-2 text-ink-100 hover:underline">
                    <VendorBadge vendor={c.vendor ?? ""} name={c.assetName} size={24} />
                    {c.assetName}
                  </Link>
                </td>
                <td className={`${td} text-ink-100`}>{c.email}</td>
                <td className={`${td} text-ink-400 tabular`}>{fmtDate(c.sentAt)}</td>
                <td className={td}>
                  <Pill tone={STATE[c.state].tone}>{STATE[c.state].label}</Pill>
                </td>
                <td className={`${td} text-right tabular text-ink-100`}>{c.perSeatEur && c.state !== "keep" ? `${fmtEur(c.perSeatEur)} a month` : "—"}</td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  {(c.state === "release" || c.state === "no_reply") && <SeatRemoveButton assetId={c.assetId} email={c.email} back="cleanup" />}
                  {(c.state === "release" || c.state === "no_reply") && (
                    <form action={markSeatRemovedAction} className="inline-block ml-2">
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn btn-secondary btn-sm" title="Remove the seat in the provider's admin page first, then mark it here">
                        Mark removed
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {view === "people" && (
        <>
          <FilterBar search={{ placeholder: "Search a person or AI" }} filters={aiOptions.length > 1 ? [{ param: "ai", label: "AI", options: aiOptions }] : []} />
          <Table
            columns={["Person", "AI", { label: "Visits", className: "text-right" }, { label: "Time", className: "text-right" }, { label: "Active days", className: "text-right" }, "Last used"]}
            empty={pairs.length === 0 && "No usage yet."}
          >
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
                    <Link href={`/estate/${p.assetId}`} className="flex items-center gap-2 text-ink-100 hover:underline">
                      <VendorBadge vendor={p.vendor ?? ""} name={p.name} size={24} />
                      {p.name}
                    </Link>
                  </td>
                  <td className={`${td} text-right tabular text-ink-100`}>{p.visits}</td>
                  <td className={`${td} text-right tabular text-ink-400`}>{fmtMinutes(p.minutes)}</td>
                  <td className={`${td} text-right tabular text-ink-400`}>
                    <span className="inline-flex items-center gap-2 justify-end">
                      <span className="relative h-1.5 w-12 rounded-full bg-ink-100/[0.06] overflow-hidden" aria-hidden>
                        <span className="absolute inset-y-0 left-0 rounded-full bg-ink-100/30" style={{ width: `${Math.min(100, (p.days.size / SEAT_WINDOW_DAYS) * 100)}%` }} />
                      </span>
                      {p.days.size} / 30
                    </span>
                  </td>
                  <td className={`${td} text-ink-400 tabular`}>{fmtDate(p.last)}</td>
                </tr>
              ))}
          </Table>
        </>
      )}

      {view === "log" && (
        <>
          <FilterBar search={{ placeholder: "Search a person or AI" }} filters={aiOptions.length > 1 ? [{ param: "ai", label: "AI", options: aiOptions }] : []} />
          <Table columns={["When", "Person", "AI", { label: "Visits", className: "text-right" }, { label: "Time", className: "text-right" }, "Source"]} empty={events.length === 0 && "Nothing yet."}>
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
    </div>
  );
}
