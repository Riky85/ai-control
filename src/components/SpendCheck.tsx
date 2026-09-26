"use client";

import { useState, useTransition } from "react";
import { checkSpendAction, type CheckResult } from "@/lib/check-actions";
import { VendorBadge } from "@/components/VendorIcon";

const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");

export default function SpendCheck({ signedIn }: { signedIn: boolean }) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [names, setNames] = useState<string>("");
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-10">
      <div className="text-center max-w-2xl mx-auto">
        <div className="text-xs font-medium text-accent uppercase tracking-wide">Free AI Spend Check</div>
        <h1 className="font-display text-[40px] leading-[1.1] font-semibold tracking-tight text-ink-100 mt-3">How much does your company really spend on AI?</h1>
        <p className="text-base text-ink-400 mt-3">
          Drop a bank or card statement. In a few seconds you see every AI subscription, the plan and seats you pay for, and where you overpay. No account needed — the file is read in memory and never stored.
        </p>
      </div>

      <form
        className="max-w-xl w-full mx-auto rounded-xl border border-line bg-panel p-5 flex flex-col gap-3"
        action={(fd) => start(async () => setResult(await checkSpendAction(fd)))}
      >
        <label className="relative flex items-center gap-3 rounded-lg border border-dashed border-line bg-ink px-4 py-5 cursor-pointer hover:border-ink-400 transition-colors">
          <svg width="20" height="20" viewBox="0 0 18 18" fill="none" className="text-ink-400 shrink-0">
            <path d="M9 12V3M5.5 6.5L9 3l3.5 3.5M3 12.5v1A1.5 1.5 0 004.5 15h9a1.5 1.5 0 001.5-1.5v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm truncate">{names ? <span className="text-ink-100 font-medium">{names}</span> : <span className="text-ink-400">Drop CSV / Excel statements or e-invoices (XML, zip)</span>}</span>
          <input
            name="file"
            type="file"
            multiple
            required
            accept=".csv,.txt,.tsv,.xlsx,.xls,.ods,.xml,.p7m,.zip"
            onChange={(e) => {
              const f = e.target.files;
              setNames(!f?.length ? "" : f.length === 1 ? f[0].name : `${f.length} files`);
            }}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        <button disabled={pending} className="btn btn-primary disabled:opacity-60">{pending ? "Reading…" : "Check my AI spend"}</button>
        <div className="flex items-center justify-between text-xs text-ink-400">
          <span>Only AI lines are looked at. Nothing is saved.</span>
          <a href="/api/spend/sample" className="underline hover:text-ink-100">Try a sample statement</a>
        </div>
      </form>

      {result && !result.ok && <div className="max-w-xl mx-auto rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{result.error}</div>}

      {result?.ok && (
        <div className="flex flex-col gap-6 animate-rise">
          <div className="grid grid-cols-3 gap-4">
            <Big label="AI services you pay for" value={String(result.report.lines.length)} />
            <Big label="AI spend" value={`${eur(result.report.spend)}/mo`} hint={`${eur(result.report.spend * 12)} a year`} />
            <Big label="You could save" value={`${eur(result.report.save)}/mo`} hint={`${eur(result.report.save * 12)} a year`} accent />
          </div>

          <div className="rounded-xl border border-line bg-panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400 bg-ink border-b border-line">
                  <th className="px-5 py-2.5 font-medium">AI</th>
                  <th className="px-5 py-2.5 font-medium">Category</th>
                  <th className="px-5 py-2.5 font-medium">Looks like</th>
                  <th className="px-5 py-2.5 font-medium text-right">Per month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.report.lines.map((l) => (
                  <tr key={l.service}>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <VendorBadge vendor={l.vendor} name={l.name} size={30} />
                        <span className="font-medium text-ink-100">{l.name}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-400">{l.category}</td>
                    <td className="px-5 py-3 text-ink-400">{l.plan ? `${l.seats && l.seats > 1 ? `${l.seats} × ` : ""}${l.plan}` : "Usage-based"}</td>
                    <td className="px-5 py-3 text-right tabular font-medium text-ink-100">{eur(l.monthlyEur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.report.savings.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-ink-100">Where you could save</h2>
              {result.report.savings.map((s) => (
                <div key={s.title} className="rounded-xl border border-line bg-panel p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-ink-100">{s.title}</div>
                    <div className="text-sm text-ink-400">{s.detail}</div>
                  </div>
                  <div className="text-right font-semibold text-ink-100 tabular">{eur(s.monthlyEur)}<span className="text-xs text-ink-400 font-normal">/mo</span></div>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-line bg-ink p-6 flex items-center gap-6">
            <div className="flex-1">
              <div className="text-base font-semibold text-ink-100">{signedIn ? "Save this to your workspace" : "Keep it up to date automatically"}</div>
              <div className="text-sm text-ink-400 mt-0.5">
                angar also finds AI used without being paid for, checks seats against real users and alerts you when prices or models change.
              </div>
            </div>
            <a href={signedIn ? "/sources" : "/signup"} className="btn btn-primary">{signedIn ? "Add to my workspace" : "Create a free account"}</a>
          </div>
          <p className="text-xs text-ink-400 text-center">Plans and seats are inferred from list prices; check before changing anything.</p>
        </div>
      )}
    </div>
  );
}

function Big({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <div className="text-sm text-ink-400">{label}</div>
      <div className={`font-display text-[30px] font-semibold tracking-tight tabular mt-3 ${accent ? "text-accent" : "text-ink-100"}`}>{value}</div>
      {hint && <div className="text-xs text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}
