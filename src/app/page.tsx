import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import { VendorBadge } from "@/components/VendorIcon";
import BarChart from "@/components/BarChart";
import EstateGraph from "@/components/EstateGraph";
import CsvDropzone from "@/components/CsvDropzone";
import { StatCard, Panel, PageHeader } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import { computeSavings, monthlyOf } from "@/lib/savings";
import { uploadSpendAction } from "@/lib/spend-actions";
import { fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

const SENSITIVE = ["PII", "FINANCIAL", "SOURCE_CODE"];
const PROVIDER_LABEL: Record<string, string> = {
  ANTHROPIC: "Anthropic", OPENAI: "OpenAI", GITHUB: "GitHub", GOOGLE_GEMINI: "Google Gemini", MISTRAL: "Mistral AI", GROQ: "Groq",
  COHERE: "Cohere", DEEPSEEK: "DeepSeek", XAI: "xAI", TOGETHER: "Together AI", OPENROUTER: "OpenRouter", HUGGINGFACE: "Hugging Face",
};

// La home risponde a tre domande: che AI usiamo, quanto spendiamo, dove
// possiamo risparmiare. Tutto calcolato da solo dalle fonti collegate.
export default async function OverviewPage({ searchParams }: { searchParams: { connected?: string; imported?: string; spend?: string } }) {
  const orgId = currentOrgId();
  const [org, { items: savings, totalMonthly: canSave, assets }, full, spendRecords, broken, network, toReview] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    computeSavings(orgId),
    db.aiAsset.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 }, dataAccess: { include: { dataAsset: true } } },
    }),
    db.spendRecord.findMany({ where: { organizationId: orgId, date: { gte: new Date(Date.now() - 200 * 86400000) } }, select: { date: true, amountEur: true } }),
    db.connector.findMany({ where: { organizationId: orgId, status: "ERROR", credentialsEncrypted: { not: null }, provider: { notIn: ["MICROSOFT_365", "GOOGLE_WORKSPACE", "NETWORK"] } } }),
    db.connector.findUnique({ where: { organizationId_provider: { organizationId: orgId, provider: "NETWORK" } } }),
    db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } } }),
  ]);

  const costed = assets.map((a) => ({ a, m: monthlyOf(a) })).filter((x) => x.m && x.m.eur > 0);
  const spend = costed.reduce((s, x) => s + x.m!.eur, 0);
  const estimated = costed.filter((x) => x.m!.estimated).length;
  const unpaid = assets.filter((a) => !monthlyOf(a)).length;
  const byAi = costed.sort((x, y) => y.m!.eur - x.m!.eur).slice(0, 8).map((x) => ({ label: x.a.name, value: Math.round(x.m!.eur), href: `/assets/${x.a.id}` }));

  // Spesa per mese dagli addebiti reali (ultimi 6 mesi).
  const months: { key: string; label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString("en-GB", { month: "short" }), value: 0 });
  }
  for (const r of spendRecords) {
    const m = months.find((x) => x.key === r.date.toISOString().slice(0, 7));
    if (m) m.value += r.amountEur;
  }

  type Action = { tone: "alarm" | "signal" | "accent" | "steady"; title: string; detail: string; href: string; cta: string };
  const actions: Action[] = [
    ...broken.map((cn) => ({
      tone: "alarm" as const,
      title: `${PROVIDER_LABEL[cn.provider] ?? cn.provider} stopped syncing`,
      detail: /401|403|rejected|invalid|revoked/i.test(cn.lastSyncError ?? "") ? "The key was rejected — it may have been revoked. Paste a new one." : "The last sync failed.",
      href: `/connectors#${cn.provider}`,
      cta: "Fix",
    })),
    ...(savings[0] ? [{ tone: "accent" as const, title: savings[0].title, detail: `Saves about ${fmtEur(savings[0].monthlyEur)} a month.`, href: "/savings", cta: "See how" }] : []),
    ...(toReview ? [{ tone: "signal" as const, title: `${toReview} AI found by the scan`, detail: "Allowed or not? One click each.", href: "/review", cta: "Review" }] : []),
    ...(spendRecords.length === 0 ? [{ tone: "signal" as const, title: "Add a bank statement", detail: "angar finds every AI you pay for, with real costs and seats.", href: "/sources", cta: "Add" }] : []),
    ...(!network ? [{ tone: "steady" as const, title: "Find AI nobody told you about", detail: "Scan computers or a network log — 1 minute.", href: "/discover", cta: "Scan" }] : []),
  ].slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" subtitle={`${org?.name ?? ""} — your AI at a glance.`} action={assets.length ? <ExportMenu dataset="assets" /> : undefined} />

      {(searchParams.connected || searchParams.imported || searchParams.spend) && (
        <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-100">
          {searchParams.spend ? (
            <><b>{searchParams.spend} AI service{searchParams.spend === "1" ? "" : "s"} found in your statement.</b> Costs, plans and seats are filled in — see what you could save below.</>
          ) : searchParams.connected ? (
            <><b>Connected.</b> What angar found is now in your estate, with you as owner.</>
          ) : (
            <><b>{searchParams.imported} AI systems imported</b>, with you as owner.</>
          )}
        </div>
      )}

      {assets.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel p-10 flex flex-col items-center text-center gap-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink-100">Which AI does your company pay for?</h2>
            <p className="text-sm text-ink-400 mt-1.5 max-w-xl">
              Drop a bank or card statement (or your e-invoices). In a few seconds angar lists every AI subscription, what it really costs and where you can save. Nothing to type.
            </p>
          </div>
          <form action={uploadSpendAction} className="w-full max-w-xl flex flex-col gap-3">
            <input type="hidden" name="back" value="/" />
            <CsvDropzone accept=".csv,.txt,.tsv,.xlsx,.xls,.ods,.xml,.p7m,.zip" multiple label="Drop your bank statement or invoices here" />
            <button className="btn btn-primary">Show my AI spend</button>
          </form>
          <div className="flex items-center gap-4 text-sm text-ink-400">
            <a href="/api/spend/sample" className="underline hover:text-ink-100">Download a sample statement</a>
            <span>·</span>
            <Link href="/sources" className="underline hover:text-ink-100">Other ways: company accounts, API keys, network scan</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-line bg-panel px-6 py-5 flex items-center gap-6">
            <p className="flex-1 text-lg leading-relaxed text-ink-100">
              You use <b>{assets.length} AI tool{assets.length === 1 ? "" : "s"}</b>
              {spend > 0 && <> and spend <b>{fmtEur(spend)} a month</b></>}
              {canSave > 0 ? (
                <>. angar found <b className="text-accent">{fmtEur(canSave)} a month</b> you could save.</>
              ) : (
                "."
              )}
            </p>
            {canSave > 0 ? <Link href="/savings" className="btn btn-primary">See savings</Link> : <Link href="/sources" className="btn btn-secondary">Add a source</Link>}
          </div>

          <div className="grid grid-cols-4 gap-4">
            <StatCard label="AI in use" value={String(assets.length)} hint={`${new Set(assets.map((a) => a.vendor).filter(Boolean)).size} providers`} href="/assets" tone="accent" />
            <StatCard label="Monthly spend" value={spend ? fmtEur(spend) : "—"} hint={spend ? (estimated ? `${estimated} estimated from list prices` : "From your bills") : "Add a bank statement"} href={spend ? "/savings" : "/sources"} />
            <StatCard label="You could save" value={canSave ? `${fmtEur(canSave)}/mo` : "—"} hint={canSave ? `${savings.length} suggestion${savings.length === 1 ? "" : "s"}` : "Nothing found yet"} href="/savings" />
            <StatCard label="Not paid by the company" value={String(unpaid)} hint={unpaid ? "Free or personal accounts" : "Everything is on the books"} href="/assets" tone={unpaid ? "signal" : undefined} />
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <div className="col-span-2">
              <Panel title="Where the money goes" subtitle="Monthly cost per AI">
                {byAi.length ? <BarChart rows={byAi} formatValue={(v) => fmtEur(v)} /> : <p className="text-sm text-ink-400">Add a bank statement or a provider key to see costs.</p>}
              </Panel>
            </div>
            <Panel title="What to do next" subtitle="Most useful first">
              <div className="divide-y divide-line -mx-5 border-t border-line">
                {actions.map((a) => (
                  <Link key={a.title} href={a.href} className="flex items-start gap-3 px-5 py-3 hover:bg-ink-100/[0.02] transition-colors">
                    <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${{ alarm: "bg-alarm", signal: "bg-signal", accent: "bg-accent", steady: "bg-steady" }[a.tone]}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-ink-100">{a.title}</span>
                      <span className="block text-xs text-ink-400">{a.detail}</span>
                    </span>
                    <span className="text-xs text-ink-400 shrink-0 mt-0.5">{a.cta} →</span>
                  </Link>
                ))}
                {actions.length === 0 && <p className="px-5 py-4 text-sm text-ink-400">All clear. angar keeps watching.</p>}
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <Panel title="Spend by month" subtitle="AI charges on your statements">
              <MonthBars months={months} />
            </Panel>
            <div className="col-span-2">
              <Panel title="Top savings" subtitle="Calculated automatically" action={<Link href="/savings" className="btn btn-secondary btn-sm">All savings</Link>}>
                <div className="divide-y divide-line -mx-5 border-t border-line">
                  {savings.slice(0, 4).map((s) => (
                    <Link key={s.key} href={s.href} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-100/[0.02] transition-colors">
                      <VendorBadge vendor={s.assets[0]?.vendor ?? ""} name={s.assets[0]?.name} size={28} />
                      <span className="flex-1 min-w-0 text-sm text-ink-100 truncate">{s.title}</span>
                      <span className="text-sm font-semibold text-ink-100 tabular">{fmtEur(s.monthlyEur)}<span className="text-xs font-normal text-ink-400">/mo</span></span>
                    </Link>
                  ))}
                  {savings.length === 0 && <p className="px-5 py-4 text-sm text-ink-400">No savings found yet — they appear as soon as angar sees what you pay.</p>}
                </div>
              </Panel>
            </div>
          </div>

          <Panel title="AI estate map" subtitle="Which provider powers each AI, and which data it touches">
            <div className="max-w-4xl mx-auto">
              <EstateGraph
                systems={full.map((a) => ({
                  id: a.id,
                  name: a.name,
                  vendor: a.vendor,
                  risky: ["HIGH", "CRITICAL"].includes(a.riskAssessments[0]?.level ?? ""),
                  data: a.dataAccess.map((d) => ({ name: d.dataAsset.name, sensitive: SENSITIVE.includes(d.dataAsset.sensitivity) })),
                }))}
              />
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function MonthBars({ months }: { months: { key: string; label: string; value: number }[] }) {
  const max = Math.max(...months.map((m) => m.value), 1);
  if (months.every((m) => m.value === 0)) return <p className="text-sm text-ink-400">Appears when a bank statement or invoices are added.</p>;
  return (
    <div className="flex items-end gap-3 h-40 pt-4">
      {months.map((m) => (
        <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end" title={`${m.label}: ${fmtEur(m.value)}`}>
          <span className="text-[11px] text-ink-400 tabular">{m.value ? fmtEur(m.value) : ""}</span>
          <div className="w-full max-w-[36px] rounded-t-md bg-accent origin-bottom animate-rise" style={{ height: `${Math.max((m.value / max) * 100, m.value ? 4 : 0)}%` }} />
          <span className="text-xs text-ink-400">{m.label}</span>
        </div>
      ))}
    </div>
  );
}
