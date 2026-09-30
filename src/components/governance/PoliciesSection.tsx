import { Pill, Section, NextStep, Chevron } from "./parts";
import { createPolicyAction, addPolicyFromLibraryAction, togglePolicyAction, deletePolicyAction } from "@/lib/actions";

/**
 * Governance → Policies: le policy dell'azienda in un'unica lista (categoria
 * come pillola), interruttore attiva/disattiva, aggiunta dalla libreria o
 * scritta a mano. Nessuna query: riceve le righe dalla pagina.
 */

export const CATEGORY_LABEL: Record<string, string> = {
  data_access: "Data access",
  approval: "Approval",
  environment: "Environment",
  vendor: "Vendor",
  other: "Other",
};
const ORDER = ["environment", "approval", "data_access", "vendor", "other"];

export interface PolicyRow {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
}
export interface TemplateRow {
  name: string;
  description: string;
  category: string;
}

export default function PoliciesSection({ policies, templates, canEdit, libraryTotal }: { policies: PolicyRow[]; templates: TemplateRow[]; canEdit: boolean; libraryTotal: number }) {
  const active = policies.filter((p) => p.enabled).length;
  const rows = [...policies].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || Number(b.enabled) - Number(a.enabled));
  const next =
    active === 0
      ? { label: canEdit ? "Add a policy from the library below" : "No policy active yet" }
      : active === 1
        ? { label: canEdit && templates.length ? "Add a second policy — one alone covers little" : "One policy active" }
        : null;

  return (
    <Section
      id="policies"
      title="Policies"
      meta={
        policies.length ? (
          <>
            <b className="font-medium text-ink-100 tabular">{active}</b> active{policies.length > active ? ` · ${policies.length - active} off` : ""}
            {libraryTotal ? ` · ${libraryTotal - templates.length} of ${libraryTotal} from the library` : ""}
          </>
        ) : (
          "No policies yet"
        )
      }
      footer={next ? <NextStep label={next.label} /> : <NextStep done label="Policies are sent to employees with the AI policy" />}
    >
      {rows.length > 0 && (
        <ul className="divide-y divide-line">
          {rows.map((p) => (
            <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-sm font-medium truncate ${p.enabled ? "text-ink-100" : "text-ink-400"}`}>{p.name}</span>
                  <span className="hidden sm:inline-flex">
                    <Pill>{CATEGORY_LABEL[p.category] ?? p.category}</Pill>
                  </span>
                </div>
                <p className="text-xs text-ink-400 mt-0.5 line-clamp-1" title={p.description}>
                  {p.description}
                </p>
              </div>
              {!canEdit ? (
                <Pill tone={p.enabled ? "steady" : "muted"}>{p.enabled ? "On" : "Off"}</Pill>
              ) : (
                <div className="flex items-center gap-1 shrink-0">
                  <form action={togglePolicyAction}>
                    <input type="hidden" name="policyId" value={p.id} />
                    <input type="hidden" name="enabled" value={String(p.enabled)} />
                    <button
                      type="submit"
                      role="switch"
                      aria-checked={p.enabled}
                      title={p.enabled ? "Enabled — click to turn off" : "Disabled — click to turn on"}
                      className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-ink-400 hover:text-ink-100"
                    >
                      <span className={`relative inline-block h-4 w-7 rounded-full transition-colors ${p.enabled ? "bg-steady/70" : "bg-ink-400/30"}`} aria-hidden>
                        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-panel shadow transition-all ${p.enabled ? "left-3.5" : "left-0.5"}`} />
                      </span>
                      <span className="hidden sm:inline w-[3.25rem] text-left">{p.enabled ? "Enabled" : "Disabled"}</span>
                    </button>
                  </form>
                  <form action={deletePolicyAction}>
                    <input type="hidden" name="policyId" value={p.id} />
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Remove
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="border-t border-line px-5 py-3 flex flex-col gap-3">
          {templates.length > 0 && (
            <details className="group" open={policies.length === 0}>
              <summary className="cursor-pointer list-none text-sm font-medium text-ink-100 inline-flex items-center gap-1.5 select-none">
                <Chevron /> Add from the library <span className="text-ink-400 font-normal tabular">· {templates.length}</span>
              </summary>
              <ul className="mt-3 rounded-xl border border-line divide-y divide-line">
                {templates.map((t) => (
                  <li key={t.name} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-ink-100 truncate">{t.name}</span>
                        <span className="hidden sm:inline-flex">
                          <Pill>{CATEGORY_LABEL[t.category] ?? t.category}</Pill>
                        </span>
                      </div>
                      <p className="text-xs text-ink-400 mt-0.5 line-clamp-1" title={t.description}>
                        {t.description}
                      </p>
                    </div>
                    <form action={addPolicyFromLibraryAction} className="shrink-0">
                      <input type="hidden" name="name" value={t.name} />
                      <input type="hidden" name="description" value={t.description} />
                      <input type="hidden" name="category" value={t.category} />
                      <button type="submit" className="btn btn-secondary btn-sm">
                        Add
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-medium text-ink-100 inline-flex items-center gap-1.5 select-none">
              <Chevron /> Write a custom policy
            </summary>
            <form action={createPolicyAction} className="mt-3 rounded-xl border border-line p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-400">Name</label>
                <input name="name" required placeholder="e.g. Agents cannot create discounts above 20%" className="field" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-400">Description</label>
                <textarea name="description" required rows={2} className="field" />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-ink-400">Category</label>
                  <select name="category" className="field">
                    <option value="data_access">Data access</option>
                    <option value="approval">Approval</option>
                    <option value="environment">Environment</option>
                    <option value="vendor">Vendor</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-secondary">
                  Add policy
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </Section>
  );
}
