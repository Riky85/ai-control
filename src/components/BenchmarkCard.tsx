import Link from "next/link";
import { getBenchmark, scopeLabel, type Benchmark } from "@/lib/benchmark";
import { fmtEur } from "@/lib/format";

const per = (n: number) => `${fmtEur(n, { decimals: n < 100 })}`;

/**
 * Benchmark anonimo (spesa AI per dipendente al mese vs aziende simili).
 * "compact" per la home, "section" per il report.
 */
export default async function BenchmarkCard({ orgId, variant = "compact" }: { orgId: string; variant?: "compact" | "section" }) {
  const b = await getBenchmark(orgId);
  if (variant === "section") return <Section b={b} />;
  return (
    <section className="rounded-xl border border-line bg-panel px-5 py-4 flex items-center gap-6 animate-rise">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-100">
          <Sentence b={b} />
        </div>
        <div className="text-xs text-ink-400 mt-0.5">AI spend per employee per month · anonymous, aggregated across angar customers</div>
      </div>
      {b.peers && b.yours !== null && <RangeBar b={b} className="w-64 shrink-0" />}
    </section>
  );
}

function Sentence({ b }: { b: Benchmark }) {
  if (!b.employeesSet)
    return (
      <>
        Benchmark unlocks when 5+ similar companies use angar.{" "}
        <Link href="/settings" className="underline hover:text-accent">Add number of employees</Link> to compare your AI spend per employee.
      </>
    );
  const you = b.yours !== null ? per(b.yours) : "—";
  if (!b.peers)
    return (
      <>
        Benchmark unlocks when {b.minCompanies}+ similar companies use angar — you: <b className="tabular">{you}</b> per employee/month
      </>
    );
  const diff = b.yours !== null && b.peers.median > 0 ? Math.round(((b.yours - b.peers.median) / b.peers.median) * 100) : null;
  return (
    <>
      You spend <b className="tabular">{you}</b> per employee/month — median for {scopeLabel(b)} is <b className="tabular">{per(b.peers.median)}</b>
      {diff !== null && Math.abs(diff) >= 5 && (
        <span className={`ml-1.5 text-xs font-medium rounded-full px-1.5 py-0.5 tabular ${diff > 0 ? "text-signal bg-signal/10" : "text-steady bg-steady/10"}`}>
          {diff > 0 ? `${diff}% above` : `${Math.abs(diff)}% below`}
        </span>
      )}
    </>
  );
}

/** Barra orizzontale: fascia p25–p75, tacca sulla mediana, punto per "tu". */
function RangeBar({ b, className = "" }: { b: Benchmark; className?: string }) {
  const p = b.peers!;
  const you = b.yours ?? 0;
  const max = Math.max(p.p75 * 1.5, you * 1.1, 1);
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  return (
    <div className={className}>
      <div className="relative h-2 rounded-full bg-ink">
        <div className="absolute inset-y-0 rounded-full bg-ink-400/30" style={{ left: pos(p.p25), width: `calc(${pos(p.p75)} - ${pos(p.p25)})` }} />
        <div className="absolute -top-1 h-4 w-0.5 bg-ink-100" style={{ left: pos(p.median) }} title={`Median ${per(p.median)}`} />
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-panel" style={{ left: pos(you) }} title={`You ${per(you)}`} />
      </div>
      <div className="flex justify-between text-[11px] text-ink-400 mt-1.5 tabular">
        <span>€0</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-accent" />you</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-0.5 bg-ink-100" />median</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-ink-400/30" />middle 50%</span>
        </span>
        <span>{per(max)}</span>
      </div>
    </div>
  );
}

function Section({ b }: { b: Benchmark }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5 animate-rise">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink-100">Benchmark vs similar companies</h2>
        <p className="text-sm text-ink-400 mt-0.5">AI spend per employee per month — anonymous, aggregated across angar customers. Shown only when {b.minCompanies}+ comparable companies exist.</p>
      </div>
      {b.peers && b.yours !== null ? (
        <div className="grid grid-cols-[1fr_320px] gap-8 items-center">
          <div className="grid grid-cols-3 gap-4">
            <Figure label="You" value={per(b.yours)} accent />
            <Figure label="Median" value={per(b.peers.median)} />
            <Figure label="Middle 50%" value={`${per(b.peers.p25)}–${per(b.peers.p75)}`} />
            <p className="col-span-3 text-xs text-ink-400">Compared with {b.peers.count} {scopeLabel(b)}.</p>
          </div>
          <RangeBar b={b} />
        </div>
      ) : (
        <p className="text-sm text-ink-100">
          <Sentence b={b} />
        </p>
      )}
    </div>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`font-display text-xl font-semibold tabular mt-1 ${accent ? "text-accent" : "text-ink-100"}`}>{value}</div>
    </div>
  );
}
