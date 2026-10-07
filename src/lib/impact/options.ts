/**
 * Impact Simulator — voci dei moduli: fornitori, modelli e AI system dall'estate;
 * destinazioni ("to") dal catalogo globale. Puro.
 */
import type { EstateData } from "@/lib/estate/assemble";
import { catalog, modelById, providerNameOf, resolveModel, deploymentOf } from "@/lib/pricing/service";

export interface Opt {
  value: string;
  label: string;
  group?: string;
}

export interface ImpactOptions {
  systems: Opt[];
  /** Modelli usati nell'estate (id del catalogo). */
  estateModels: Opt[];
  /** Fornitori e deployment da cui dipende l'estate. */
  estateProviders: Opt[];
  /** Modelli attivi del catalogo, raggruppati per fornitore. */
  catalogModels: Opt[];
  /** Fornitori di modelli e deployment del catalogo (destinazione del cambio fornitore). */
  catalogTargets: Opt[];
  /** Fornitori che fissano prezzi nell'estate (per il cambio di prezzo). */
  priceProviders: Opt[];
}

const byLabel = (a: Opt, b: Opt) => (a.group ?? "").localeCompare(b.group ?? "") || a.label.localeCompare(b.label) || a.value.localeCompare(b.value);

export function impactOptions(est: EstateData): ImpactOptions {
  const c = catalog();
  const systems = est.rows.map((r) => ({ value: r.id, label: r.name })).sort(byLabel);
  const models = new Map<string, Opt>();
  for (const r of est.rows)
    for (const u of r.uses) {
      const id = u.modelId ?? resolveModel(u.rawModel)?.model.id ?? null;
      const m = id ? modelById(id) : null;
      if (m && !models.has(m.id)) models.set(m.id, { value: m.id, label: m.lifecycle === "active" ? m.name : `${m.name} (${m.lifecycle})`, group: providerNameOf(m.providerId) });
    }
  const providers = new Map<string, Opt>();
  for (const n of est.graph.nodes.values()) {
    if (n.type === "provider" && !n.id.startsWith("name:") && n.id !== "angar") providers.set(n.id, { value: n.id, label: n.label, group: "Providers" });
    if (n.type === "deployment" && deploymentOf(n.id)) providers.set(n.id, { value: n.id, label: n.label, group: "Deployments" });
  }
  const catalogModels = c.models
    .filter((m) => m.providerId !== "angar" && (m.lifecycle === "active" || m.lifecycle === "preview"))
    .map((m) => ({ value: m.id, label: m.lifecycle === "preview" ? `${m.name} (preview)` : m.name, group: providerNameOf(m.providerId) }))
    .sort(byLabel);
  const catalogTargets = [
    ...c.providers.filter((p) => p.kind === "model_provider" && p.id !== "angar").map((p) => ({ value: p.id, label: p.name, group: "Providers" })),
    ...c.deployments.filter((d) => d.id !== "angar-estimate" && !d.id.endsWith("-direct")).map((d) => ({ value: d.id, label: d.name, group: "Deployments" })),
  ].sort(byLabel);
  return {
    systems,
    estateModels: [...models.values()].sort(byLabel),
    estateProviders: [...providers.values()].sort(byLabel),
    catalogModels,
    catalogTargets,
    priceProviders: [...providers.values()].filter((p) => p.group === "Providers").sort(byLabel),
  };
}
