import { fmtEur } from "@/lib/format";
import { HOSTING } from "@/lib/trust";
import { REDACT_KINDS, REDACT_LABEL } from "@/lib/gateway/detect";
import type { GwPolicyView } from "@/lib/gateway/data";
import { saveGatewayPolicyAction, saveGatewayUpstreamAction, saveTeamCapAction, toggleGatewayRuleAction } from "@/lib/gateway-actions";
import ConnectSnippets from "./ConnectSnippets";

const card = "rounded-xl border border-line bg-panel animate-rise";
const head = "bar-head rounded-t-xl border-b border-line px-5 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1";

function Switch({ field, on, disabled, label }: { field: string; on: boolean; disabled?: boolean; label: string }) {
  return (
    <form action={toggleGatewayRuleAction} className="flex items-center gap-2 shrink-0">
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <button
        type="submit"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-steady" : "bg-ink-400/40"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
      <span className="text-sm text-ink-400 w-16">{on ? "Enabled" : "Disabled"}</span>
    </form>
  );
}

function Rule({ title, text, help, control, children, id }: { title: string; text: React.ReactNode; help?: string; control?: React.ReactNode; children?: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="px-5 py-4 scroll-mt-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0" title={help}>
          <div className="text-sm font-bold text-ink-100">{title}</div>
          <div className="text-sm text-ink-400 mt-0.5">{text}</div>
        </div>
        {control}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Policies: regole nell'ordine in cui il proxy le controlla, provider a valle, come collegarsi. */
export default function PoliciesTab({ view, canEdit, openaiUrl, anthropicUrl, endpointHost }: { view: GwPolicyView; canEdit: boolean; openaiUrl: string; anthropicUrl: string; endpointHost: string }) {
  const p = view.policy;
  const ro = !canEdit;
  const euOn = p.euOnly || view.forcedEuOnly !== null;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,430px)] gap-4 items-start">
      <section className={card}>
        <div className={head}>
          <h2 className="text-sm font-bold text-ink-100">Rules</h2>
          <span className="text-xs text-ink-400">{ro ? "View only" : ""}</span>
        </div>
        <div className="divide-y divide-line">
          <Rule
            title="EU-only providers"
            text={
              view.forcedEuOnly
                ? `On for the whole ${view.forcedEuOnly === "deployment" ? "deployment" : "workspace"}.`
                : "Non-EU endpoints are blocked."
            }
            help="Send requests only to provider endpoints hosted in the EU. Others are blocked."
            control={<Switch field="euOnly" on={euOn} disabled={ro || view.forcedEuOnly !== null} label="EU-only providers" />}
          >
            {euOn && !view.upstreams.some((u) => u.euHosted) && <p className="text-xs text-alarm">No EU endpoint set: every request is blocked.</p>}
          </Rule>

          <Rule title="Allowed models" text="Other models are blocked." help="A name also allows its dated versions." control={<Switch field="modelsRestricted" on={p.modelsRestricted} disabled={ro} label="Allowed models" />}>
            <form action={saveGatewayPolicyAction} className="flex flex-col gap-2">
              <input type="hidden" name="section" value="models" />
              {p.allowedModels.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {p.allowedModels.map((m) => (
                    <span key={m} className="font-mono text-xs rounded-md border border-line px-2 py-0.5 text-ink-100">
                      {m}
                    </span>
                  ))}
                </div>
              )}
              {canEdit && (
                <div className="flex gap-2 max-w-xl">
                  <input name="models" defaultValue={p.allowedModels.join(", ")} placeholder="gpt-4o-mini, claude-sonnet-4-5, mistral-large" className="field flex-1 min-w-0 font-mono text-xs" />
                  <button className="btn btn-secondary btn-sm">Save models</button>
                </div>
              )}
            </form>
          </Rule>

          <Rule title="Block health data" text="Diagnoses, records, medication." help="English, Italian, German, French, Spanish." control={<Switch field="blockHealth" on={p.blockHealth} disabled={ro} label="Block health data" />} />

          <Rule id="caps" title="Monthly caps" text="A team stops at its cap." help="Caps reset on the 1st; a key can also have its own cap.">
            <div className="flex flex-col gap-3">
              {view.teams.length === 0 && <p className="text-sm text-ink-400">No teams yet.</p>}
              {view.teams.map((team) => {
                const cap = p.teamCaps[team] ?? null;
                const spent = view.teamSpend[team] ?? 0;
                const used = cap ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
                return (
                  <form key={team} action={saveTeamCapAction} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <input type="hidden" name="team" value={team} />
                    <div className="min-w-[180px] flex-1">
                      <div className="text-sm text-ink-100">{team}</div>
                      {cap ? (
                        <>
                          <div className="mt-1.5 h-1.5 max-w-sm rounded-full bg-ink-100/[0.08] overflow-hidden">
                            <div className={`h-full rounded-full ${used >= 100 ? "bg-alarm" : "bg-ink-400"}`} style={{ width: `${used}%` }} />
                          </div>
                          <div className="text-xs text-ink-400 mt-1">
                            {fmtEur(spent)} of {fmtEur(cap)} used
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-ink-400 mt-0.5">{fmtEur(spent)} this month · no cap</div>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-ink-400">€</span>
                        <input name="cap" inputMode="decimal" defaultValue={cap ?? ""} placeholder="No cap" className="field w-28 tabular" aria-label={`Monthly cap for ${team}`} />
                        <button className="btn btn-secondary btn-sm">Save</button>
                      </div>
                    )}
                  </form>
                );
              })}
            </div>
          </Rule>

          <Rule title="Redact sensitive values" text="Masked before leaving the company." help="The provider sees [IBAN], [EMAIL] and so on." control={<Switch field="redact" on={p.redact} disabled={ro} label="Redact sensitive values" />}>
            <form action={saveGatewayPolicyAction} className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <input type="hidden" name="section" value="redact" />
              {REDACT_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-sm text-ink-100">
                  <input type="checkbox" name={`kind_${k}`} defaultChecked={p.redactKinds.includes(k)} disabled={ro} className="accent-accent" />
                  {REDACT_LABEL[k]}
                </label>
              ))}
              {canEdit && <button className="btn btn-secondary btn-sm">Save</button>}
            </form>
          </Rule>

          <Rule title="Rate limit" text="Requests a minute, each key." help="Above it the gateway answers 429.">
            <form action={saveGatewayPolicyAction} className="flex items-center gap-2">
              <input type="hidden" name="section" value="rate" />
              <input name="rpm" type="number" min={1} max={100000} defaultValue={p.rpmLimit} disabled={ro} className="field w-28 tabular" aria-label="Requests a minute" />
              <span className="text-sm text-ink-400">a minute</span>
              {canEdit && <button className="btn btn-secondary btn-sm">Save</button>}
            </form>
          </Rule>

          <Rule title="Store prompt text" text="Never." help="Only metadata is logged: time, key, model, tokens, cost, result and redaction counts." control={<span className="text-sm text-ink-400 shrink-0">Off, always</span>} />
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <section id="connect" className={`${card} scroll-mt-6`}>
          <div className={head}>
            <h2 className="text-sm font-bold text-ink-100">How to connect</h2>
            <span className="text-xs text-ink-400">Two lines</span>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <p className="text-sm text-ink-400">Keep your SDK, change the base URL.</p>
            <ConnectSnippets openaiUrl={openaiUrl} anthropicUrl={anthropicUrl} />
            <dl className="text-sm divide-y divide-line">
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-ink-400 shrink-0">Works with</dt>
                <dd className="text-ink-100 text-right">OpenAI and Anthropic SDKs, Azure OpenAI and Mistral endpoints</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-ink-400 shrink-0">Endpoint</dt>
                <dd className="text-ink-100 text-right break-all">{endpointHost}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-ink-400 shrink-0">Gateway region</dt>
                <dd className="text-ink-100 text-right">{HOSTING.country}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-ink-400 shrink-0">Supported</dt>
                <dd className="text-ink-100 text-right font-mono text-xs">chat/completions · embeddings · models · messages</dd>
              </div>
            </dl>
          </div>
        </section>

        <section id="providers" className={`${card} scroll-mt-6`}>
          <div className={head}>
            <h2 className="text-sm font-bold text-ink-100">Provider keys</h2>
            <span className="text-xs text-ink-400">Encrypted, never shown again</span>
          </div>
          <div className="divide-y divide-line">
            {view.upstreams.map((u) => (
              <form key={u.provider} action={saveGatewayUpstreamAction} className="p-5 flex flex-col gap-3">
                <input type="hidden" name="provider" value={u.provider} />
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm font-bold text-ink-100">{u.provider === "openai" ? "OpenAI" : "Anthropic"}</div>
                  <div className="text-xs text-ink-400">
                    {u.keyLast4 ? (
                      <>
                        Key <span className="font-mono">…{u.keyLast4}</span>
                        {u.fromConnector ? " from AI provider keys" : ""}
                      </>
                    ) : (
                      <span className="text-alarm">No key yet</span>
                    )}
                    {u.baseUrl ? (u.euHosted ? " · EU endpoint" : " · custom endpoint") : " · US endpoint"}
                  </div>
                </div>
                {canEdit && (
                  <>
                    <input name="apiKey" type="password" autoComplete="off" placeholder={u.keyLast4 ? "Paste a new key to replace it" : u.provider === "openai" ? "sk-…" : "sk-ant-…"} className="field w-full font-mono text-xs" />
                    <input name="baseUrl" type="url" defaultValue={u.baseUrl ?? ""} placeholder={u.provider === "openai" ? "Optional: https://<resource>.openai.azure.com/openai/v1" : "Optional: an Anthropic-compatible EU endpoint"} className="field w-full font-mono text-xs" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-sm text-ink-100">
                        <input type="checkbox" name="euHosted" defaultChecked={u.euHosted} className="accent-accent" />
                        This endpoint is hosted in the EU
                      </label>
                      <div className="flex gap-2">
                        {u.keyLast4 && !u.fromConnector && (
                          <button name="clearKey" value="1" className="btn btn-ghost btn-sm">
                            Remove key
                          </button>
                        )}
                        <button className="btn btn-secondary btn-sm">Save</button>
                      </div>
                    </div>
                  </>
                )}
              </form>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
