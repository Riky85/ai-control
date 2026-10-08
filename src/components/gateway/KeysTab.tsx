import { fmtEur, fmtAgo, fmtDate } from "@/lib/format";
import type { GwKeyRow } from "@/lib/gateway/data";
import { revokeGatewayKeyAction, updateGatewayKeyAction } from "@/lib/gateway-actions";
import KeyCreate from "./KeyCreate";
import { keyHint } from "./shared";

const PROVIDER: Record<string, string> = { any: "OpenAI, Anthropic", openai: "OpenAI", anthropic: "Anthropic" };
const tri = (v: boolean | null) => (v === null ? "" : v ? "on" : "off");

/** Keys: crea (si vede una volta), team, tetto, modelli, override; revoca. */
export default function KeysTab({ keys, teams, canEdit }: { keys: GwKeyRow[]; teams: string[]; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <section id="new-key" className="rounded-xl border border-line bg-panel animate-rise scroll-mt-6">
          <div className="bar-head rounded-t-xl border-b border-line px-5 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <h2 className="text-sm font-bold text-ink-100">Create a key</h2>
            <span className="eyebrow">One key for each app makes the logs and caps clearer</span>
          </div>
          <div className="p-5">
            <KeyCreate teams={teams} />
          </div>
        </section>
      )}

      <div className="rounded-xl border border-line bg-panel animate-rise">
        <div className="bar-head rounded-t-xl border-b border-line px-5 py-3 flex items-center justify-between gap-4">
          <h2 className="text-sm font-bold text-ink-100">Keys</h2>
          <span className="eyebrow">{keys.filter((k) => !k.revokedAt).length} active</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bar-thead text-left font-mono uppercase text-[11px] tracking-[0.04em] text-ink-400 bg-ink border-b border-line">
                <th className="px-5 py-2.5 font-normal">App / key</th>
                <th className="px-5 py-2.5 font-normal">Team</th>
                <th className="px-5 py-2.5 font-normal hidden md:table-cell">Provider</th>
                <th className="px-5 py-2.5 font-normal text-right">This month</th>
                <th className="px-5 py-2.5 font-normal hidden lg:table-cell">Models</th>
                <th className="px-5 py-2.5 font-normal hidden md:table-cell">Last used</th>
                <th className="px-5 py-2.5 font-normal" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {keys.map((k) => (
                <tr key={k.id} className={k.revokedAt ? "opacity-60" : ""}>
                  <td className="px-5 py-3 align-top">
                    <div className="font-medium text-ink-100">{k.name}</div>
                    <div className="font-mono text-[11px] text-ink-400 mt-0.5">{keyHint(k.last4)}</div>
                  </td>
                  <td className="px-5 py-3 align-top text-ink-100">{k.team || <span className="text-ink-400">—</span>}</td>
                  <td className="px-5 py-3 align-top text-ink-400 hidden md:table-cell">{PROVIDER[k.provider] ?? k.provider}</td>
                  <td className="px-5 py-3 align-top text-right tabular">
                    <div className="text-ink-100">{fmtEur(k.spendMonthEur)}</div>
                    {k.monthlyCapEur && <div className="text-xs text-ink-400">of {fmtEur(k.monthlyCapEur)} cap</div>}
                  </td>
                  <td className="px-5 py-3 align-top hidden lg:table-cell">
                    {k.allowedModels.length ? (
                      <div className="flex flex-wrap gap-1">
                        {k.allowedModels.map((m) => (
                          <span key={m} className="font-mono text-[10px] rounded-[2px] border border-line px-1.5 py-0.5 text-ink-100">
                            {m}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-ink-400">Workspace rules</span>
                    )}
                  </td>
                  <td className="px-5 py-3 align-top text-ink-400 whitespace-nowrap hidden md:table-cell">{k.revokedAt ? `Revoked ${fmtDate(k.revokedAt)}` : k.lastUsedAt ? fmtAgo(k.lastUsedAt) : "Never"}</td>
                  <td className="px-5 py-3 align-top text-right">
                    {canEdit && !k.revokedAt && (
                      <details className="relative inline-block text-left">
                        <summary className="btn btn-secondary btn-sm list-none cursor-pointer">Edit</summary>
                        <div className="absolute right-0 z-20 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-panel p-4 flex flex-col gap-3">
                          <form action={updateGatewayKeyAction} className="flex flex-col gap-2.5">
                            <input type="hidden" name="id" value={k.id} />
                            <label className="flex flex-col gap-1 text-xs text-ink-400">
                              Name
                              <input name="name" defaultValue={k.name} maxLength={60} className="field" />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-ink-400">
                              Team
                              <input name="team" defaultValue={k.team} maxLength={40} className="field" />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-ink-400">
                              Monthly cap €
                              <input name="cap" defaultValue={k.monthlyCapEur ?? ""} inputMode="decimal" placeholder="None" className="field tabular" />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-ink-400">
                              Allowed models (empty = workspace rules)
                              <input name="models" defaultValue={k.allowedModels.join(", ")} className="field font-mono text-xs" />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="flex flex-col gap-1 text-xs text-ink-400">
                                Redaction
                                <select name="redact" defaultValue={tri(k.redactOverride)} className="field">
                                  <option value="">Workspace rule</option>
                                  <option value="on">Always on</option>
                                  <option value="off">Off for this key</option>
                                </select>
                              </label>
                              <label className="flex flex-col gap-1 text-xs text-ink-400">
                                Health data
                                <select name="health" defaultValue={tri(k.blockHealthOverride)} className="field">
                                  <option value="">Workspace rule</option>
                                  <option value="on">Block</option>
                                  <option value="off">Allow for this key</option>
                                </select>
                              </label>
                            </div>
                            <button className="btn btn-secondary btn-sm self-start">Save</button>
                          </form>
                          <form action={revokeGatewayKeyAction} className="border-t border-line pt-3 flex items-center justify-between gap-2">
                            <input type="hidden" name="id" value={k.id} />
                            <span className="text-xs text-ink-400">Apps using it stop working at once.</span>
                            <button className="btn btn-danger btn-sm">Revoke</button>
                          </form>
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-ink-400">
                    No keys yet.{canEdit ? " Create one above, then use it in place of the provider key." : " An admin can create one."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
