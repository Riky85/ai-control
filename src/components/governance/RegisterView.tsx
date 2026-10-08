import Link from "next/link";
import { Table, td } from "@/components/ui";
import { Pill, type Tone } from "./parts";
import { saveRopaAction } from "@/lib/compliance-actions";
import { ROPA_FIELDS, ROPA_LABEL, TO_CHECK, type RopaCell, type RopaRow } from "@/lib/compliance/ropa";
import { AI_ACT_TIERS, AI_ACT_TIER_LABEL, type AiActTier } from "@/lib/compliance/ai-act";

/**
 * Registro AI Act & GDPR art. 30: tabella a schermo, modulo per completare una
 * riga e versione per la stampa. Solo dati serializzabili, nessuna query
 * (si può provare con dati finti).
 */

export const TIER_TONE: Record<AiActTier, Tone> = { prohibited: "alarm", high: "alarm", limited: "signal", gpai: "muted", minimal: "steady" };

export function TierPill({ tier, title }: { tier: AiActTier; title?: string }) {
  return (
    <Pill tone={TIER_TONE[tier]} title={title}>
      {AI_ACT_TIER_LABEL[tier]}
    </Pill>
  );
}

/** Una cella del registro: "To complete" come pillola, "da verificare" con un punto giallo. */
function Cell({ c }: { c: RopaCell }) {
  if (c.state === "todo") return <Pill tone="signal">To complete</Pill>;
  return (
    <span className="flex gap-1.5" title={c.state === "edited" ? "Completed by hand" : c.state === "check" ? "Inferred, to check" : "Inferred by angar"}>
      {c.state === "check" && <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-signal" aria-label="To check" />}
      <span className={c.state === "check" ? "text-ink-400" : "text-ink-100"}>{c.value}</span>
    </span>
  );
}

const W = "min-w-[11rem] max-w-[16rem] align-top text-xs leading-5";

export function RegisterTable({ rows, canEdit, tiers }: { rows: RopaRow[]; canEdit: boolean; tiers: Record<AiActTier, number> }) {
  const toComplete = rows.filter((r) => r.todo > 0).length;
  return (
    <div className="print:hidden">
      <Table
        title="Record of processing"
        note={
          <span className="flex flex-wrap items-center gap-1.5">
            {AI_ACT_TIERS.filter((t) => tiers[t] > 0).map((t) => (
              <Pill key={t} tone={TIER_TONE[t]}>
                {AI_ACT_TIER_LABEL[t]} {tiers[t]}
              </Pill>
            ))}
            <span className="ml-1">{toComplete ? `${toComplete} of ${rows.length} to complete` : `${rows.length} AI, complete`}</span>
          </span>
        }
        columns={["AI", ...ROPA_FIELDS.map((k) => ROPA_LABEL[k]), "Owner", "AI Act", ...(canEdit ? [{ label: "", className: "w-0" }] : [])]}
        empty={rows.length === 0 ? "No AI that processes personal data yet." : false}
      >
        {rows.map((r) => (
          <tr key={r.id} id={`row-${r.id}`} className="scroll-mt-6">
            <td className={`${td} align-top min-w-[9rem]`}>
              <Link href={`/assets/${r.id}?tab=risk`} className="font-medium text-ink-100 hover:underline">
                {r.name}
              </Link>
              {r.vendor && <div className="text-xs text-ink-400">{r.vendor}</div>}
            </td>
            {ROPA_FIELDS.map((k) => (
              <td key={k} className={`${td} ${W}`}>
                <Cell c={r.cells[k]} />
              </td>
            ))}
            <td className={`${td} align-top text-xs leading-5 whitespace-nowrap`}>
              {r.owner.state === "todo" ? (
                <Link href={`/assets/${r.id}`} className="hover:opacity-80">
                  <Pill tone="signal">To complete</Pill>
                </Link>
              ) : (
                <span className="text-ink-100">{r.owner.value}</span>
              )}
            </td>
            <td className={`${td} align-top`}>
              <TierPill tier={r.aiAct.tier} title={[...r.aiAct.reasons, ...r.aiAct.obligations].join("\n")} />
              {r.aiAct.source === "manual" && <div className="eyebrow mt-1">Set by hand</div>}
            </td>
            {canEdit && (
              <td className={`${td} align-top text-right`}>
                <Link href={`/governance/register?edit=${r.id}#edit`} className="btn btn-ghost btn-sm">
                  Edit
                </Link>
              </td>
            )}
          </tr>
        ))}
      </Table>
    </div>
  );
}

/** Modulo per completare una riga: i campi vuoti tornano al valore dedotto. */
export function RegisterEdit({ row }: { row: RopaRow }) {
  return (
    <section id="edit" className="print:hidden rounded-xl border border-line bg-panel animate-rise scroll-mt-6">
      <div className="px-5 py-3 bg-ink border-b border-line rounded-t-xl bar-head flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink-100">Complete {row.name}</h2>
        <Link href={`/governance/register#row-${row.id}`} className="eyebrow hover:!text-ink-100 transition-colors">
          Cancel
        </Link>
      </div>
      <form action={saveRopaAction} className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <input type="hidden" name="assetId" value={row.id} />
        {ROPA_FIELDS.map((k) => {
          const c = row.cells[k];
          // Valore dedotto precompilato; se rimandato invariato non diventa una modifica a mano.
          const auto = c.state === "inferred" || c.state === "check" ? c.value : "";
          const value = c.state === "todo" || c.value === TO_CHECK ? "" : c.value;
          return (
            <label key={k} className="flex flex-col gap-1.5 text-xs text-ink-400">
              {ROPA_LABEL[k]}
              <input type="hidden" name={`${k}__auto`} value={auto} />
              <textarea name={k} rows={2} maxLength={500} defaultValue={value} placeholder={PLACEHOLDER[k]} className="field w-full resize-y" />
            </label>
          );
        })}
        <div className="md:col-span-2 flex items-center justify-end gap-2">
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    </section>
  );
}

const PLACEHOLDER: Record<(typeof ROPA_FIELDS)[number], string> = {
  purpose: "Why the company uses it",
  data: "e.g. Customer names, emails, support tickets",
  subjects: "e.g. Employees, customers",
  recipients: "Vendor and its role",
  transfers: "e.g. United States, SCCs in the vendor DPA",
  retention: "e.g. Chats deleted after 30 days",
  security: "e.g. SSO, business plan, no training on data",
};

/** Versione per la stampa: un record art. 30 dopo l'altro, testo nero su bianco. */
export function RegisterPrint({ rows, orgName, generated }: { rows: RopaRow[]; orgName: string; generated: string }) {
  return (
    <section className="hidden print:block text-black">
      <h1 className="text-lg font-semibold">Record of processing activities (GDPR Art. 30): AI systems</h1>
      <p className="text-xs mb-4">
        {orgName} · controller · generated {generated} by angar · guidance, not legal advice
      </p>
      {rows.map((r) => (
        <article key={r.id} className="border-t border-black/20 py-3 break-inside-avoid">
          <h2 className="text-sm font-bold">
            {r.name}
            {r.vendor ? ` · ${r.vendor}` : ""}
          </h2>
          <dl className="grid grid-cols-[11rem_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-xs mt-1">
            {ROPA_FIELDS.map((k) => (
              <div key={k} className="contents">
                <dt className="text-black/60">{ROPA_LABEL[k]}</dt>
                <dd>{r.cells[k].value}</dd>
              </div>
            ))}
            <dt className="text-black/60">Owner</dt>
            <dd>{r.owner.value}</dd>
            <dt className="text-black/60">AI Act</dt>
            <dd>
              {AI_ACT_TIER_LABEL[r.aiAct.tier]} · {r.aiAct.role} · {r.aiAct.obligations.join("; ")}
            </dd>
          </dl>
        </article>
      ))}
      {rows.length === 0 && <p className="text-xs">No AI that processes personal data.</p>}
    </section>
  );
}
