import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { AssetLimitNotice } from "@/components/PlanBanner";
import { db } from "@/lib/db";
import CsvDropzone from "@/components/CsvDropzone";
import { PageHeader, StatCard } from "@/components/ui";
import { redirect } from "next/navigation";
import { computeSavingsCached, monthlyOf, loadAssets } from "@/lib/savings";
import type { AiFilterParams } from "@/lib/ai-filters";
import { uploadSpendAction } from "@/lib/spend-actions";
import { fmtEur } from "@/lib/format";
import { currentSession } from "@/lib/auth";
import { computeScoreCached, scoreHistory, scoreActions } from "@/lib/engine/score";
import MarketChangesBlock from "@/components/market/MarketChangesBlock";
import { loadOpportunitiesCached } from "@/lib/opportunities";
import NextActions from "@/components/overview/NextActions";
import AiTable from "@/components/AiTable";
import ImportCheckOffer from "@/components/check/ImportCheckOffer";
import { loadDemoDataAction } from "@/lib/test-data-actions";

export const dynamic = "force-dynamic";

// "Welcome, Riccardo" / "Good morning, Riccardo" a seconda dell'ora di Roma.
function greeting(name?: string | null) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(new Date()));
  const part = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : "Welcome to angar";
}

// Home: quattro numeri (Score, spesa, risparmi, AI), le prossime azioni e le AI che costano di più,
// con la stessa grafica di Opportunities e AI Estate. L'elenco delle AI è in AI Estate (/estate): i vecchi link "/?view=graph", "/?q=…#your-ai" vanno lì.
export default async function OverviewPage({ searchParams }: { searchParams: { connected?: string; imported?: string; spend?: string; view?: string } & AiFilterParams }) {
  if (searchParams.view === "graph") redirect("/estate/graph");
  const moved = new URLSearchParams();
  for (const k of ["q", "status", "paid", "category"] as const) if (searchParams[k]) moved.set(k, searchParams[k]!);
  if (moved.toString()) redirect(`/estate?${moved}`);
  const orgId = currentOrgId();
  const session = currentSession();
  // Tutto in parallelo; risparmi e computer collegati sono condivisi con il layout (React cache).
  const [org, { assets, items }, all, broken, toReview, spendCount] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    computeSavingsCached(orgId),
    loadAssets(orgId, { includeRejected: true }),
    db.connector.count({ where: { organizationId: orgId, status: "ERROR", credentialsEncrypted: { not: null }, provider: { notIn: ["NETWORK"] } } }),
    db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } } }),
    db.spendRecord.count({ where: { organizationId: orgId } }),
  ]);

  // Angar Score: solo se c'è almeno un'AI (altrimenti non c'è niente da valutare). Sulla home
  // basta il numero: il dettaglio delle 5 dimensioni è su /score.
  let score: { value: number; level: string; levelLabel: string; delta: number | null; potential: number | null } | null = null;
  if (all.length > 0) {
    const [sc, history] = await Promise.all([computeScoreCached(orgId), scoreHistory(orgId, 30)]);
    const plan = scoreActions(sc.facts, sc);
    score = {
      value: sc.score,
      level: sc.level,
      levelLabel: sc.levelLabel,
      // Solo fotografie dello stesso metodo: le vecchie (assi diversi) non sono confrontabili.
      delta: history.length && history[0].day !== history[history.length - 1].day ? Math.round((sc.score - history[0].score) * 10) / 10 : null,
      potential: plan.potential,
    };
  }

  // Come /spend e lo Score: i server MCP non sono AI a pagamento, fuori dalla spesa.
  const costed = assets.filter((a) => a.type !== "MCP_SERVER").map((a) => monthlyOf(a)).filter((m): m is NonNullable<typeof m> => !!m && m.eur > 0);
  const spend = costed.reduce((s, m) => s + m.eur, 0);
  const estimatedEur = costed.filter((m) => m.estimated).reduce((t, m) => t + m.eur, 0);
  // Opportunità (stesso totale del motore dei risparmi) e metriche dell'estate.
  const opp = assets.length ? await loadOpportunitiesCached(orgId) : null;
  const em = opp?.estate?.metrics ?? null;
  // Le prime 5 opportunità aperte (anche quelle già pianificate, con l'interruttore acceso) e le 6 AI che costano di più (stesse righe delle pagine dedicate).
  const next = (opp?.list ?? []).filter((o) => o.status === "new" || o.status === "accepted" || o.status === "in_progress").slice(0, 5);
  const topAi = [...assets].sort((a, b) => (monthlyOf(b)?.eur ?? -1) - (monthlyOf(a)?.eur ?? -1)).slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={greeting(session?.name)} subtitle={org?.name ?? "Your AI at a glance"} action={
          assets.length ? (
            <div className="flex items-center gap-2">
              {spendCount > 0 && <Link href="/report" className="btn btn-ghost btn-sm">Monthly report</Link>}
              {score && <Link href="/opportunities?view=score" className="btn btn-primary btn-sm btn-go">Improve my score</Link>}
            </div>
          ) : undefined
        } />
      <AssetLimitNotice orgId={orgId} />

      {(searchParams.connected || searchParams.imported || searchParams.spend) && (
        <div className="rounded-xl border border-line bg-panel dark:bg-ink px-4 py-3 text-sm text-ink-100">
          {searchParams.spend ? (
            <><b>{searchParams.spend} AI system{searchParams.spend === "1" ? "" : "s"} found.</b></>
          ) : searchParams.connected ? (
            <><b>Connected.</b></>
          ) : (
            <><b>{searchParams.imported} AI systems imported.</b></>
          )}
        </div>
      )}
      {broken > 0 && (
        <Link href="/sources" className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">
          {broken} source{broken === 1 ? " stopped" : "s stopped"} syncing →
        </Link>
      )}

      {assets.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel p-6 sm:p-10 flex flex-col items-center text-center gap-5">
          <div>
            <h2 className="text-[22px] font-semibold tracking-[-0.01em] text-ink-100">Which AI do you pay for?</h2>
          </div>
          <form action={uploadSpendAction} className="w-full max-w-xl flex flex-col gap-3">
            <input type="hidden" name="back" value="/" />
            <CsvDropzone accept=".csv,.txt,.tsv,.xlsx,.xls,.ods,.xml,.xsig,.p7m,.zip,.pdf" multiple label="Drop a bank statement or invoices" />
            <button className="btn btn-primary">Show my AI spend</button>
          </form>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-ink-400">
            <a href="/api/spend/sample" className="underline hover:text-ink-100">Download a sample statement</a>
            <span>·</span>
            <Link href="/connect" className="underline hover:text-ink-100">Other sources</Link>
            {/* Dati di esempio: stessa azione di Onboarding e Settings (solo il proprietario). */}
            {session?.role === "OWNER" && (
              <>
                <span>·</span>
                <form action={loadDemoDataAction}>
                  <button className="underline hover:text-ink-100">Load demo data</button>
                </form>
              </>
            )}
          </div>
          {/* AI Spend Check fatto prima di registrarsi: si importa con un clic (solo se non ci sono ancora costi). */}
          {spendCount === 0 && session?.role !== "VIEWER" && <ImportCheckOffer className="max-w-xl" />}
        </div>
      ) : (
        <>
          {/* Stessa grammatica di Opportunities e AI Estate: quattro numeri, poi due elenchi. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              label="Angar Score"
              value={score ? `${score.value}/100` : "—"}
              hint={score ? [score.levelLabel, score.delta ? `${score.delta > 0 ? "+" : ""}${score.delta} this month` : null, score.potential && score.potential > score.value ? `up to ${Math.round(score.potential)}` : null].filter(Boolean).join(" · ") : undefined}
              tone={score?.level === "weak" ? "warn" : undefined}
              href="/score"
            />
            <StatCard label="Monthly AI spend" value={spend ? fmtEur(spend) : "—"} hint={spend ? (estimatedEur >= 1 ? `${fmtEur(estimatedEur)} estimated` : `${fmtEur(spend * 12)} a year`) : "Add a bank statement"} href={spend ? "/spend" : "/sources"} />
            <StatCard label="Potential savings" value={opp && opp.summary.totalMonthly >= 1 ? `${fmtEur(opp.summary.totalMonthly)}/mo` : "—"} hint={opp?.summary.open ? `${opp.summary.open} opportunit${opp.summary.open === 1 ? "y" : "ies"}` : undefined} href="/opportunities" />
            <StatCard label="AI systems" value={String(em?.systems ?? assets.length)} hint={toReview ? `${toReview} to review` : "All reviewed"} tone={toReview ? "warn" : undefined} href={toReview ? "/review" : "/estate"} />
          </div>

          <NextActions list={next} total={opp?.summary.open ?? next.length} canEdit={session?.role !== "VIEWER"} />

          <AiTable
            title="Your AI"
            note={`Top ${topAi.length} by cost`}
            action={<Link href="/estate" className="eyebrow hover:!text-ink-100 transition-colors">All {all.length} AI [→]</Link>}
            assets={topAi}
            savings={items}
          />

          <MarketChangesBlock orgId={orgId} />
        </>
      )}
    </div>
  );
}
