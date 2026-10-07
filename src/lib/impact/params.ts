/**
 * Impact Simulator — lo scenario nell'URL (?s=replace-model&from=…&to=…), così un risultato
 * si condivide e si salva nei preferiti. Puro: lo usano la pagina, i link e i test.
 */
import type { PriceComponent, Scenario, ScenarioKind } from "./types";

export const SCENARIOS: { kind: ScenarioKind; label: string; hint: string }[] = [
  { kind: "replace-model", label: "Replace a model", hint: "Move one AI system, or every use of a model, to another model" },
  { kind: "replace-provider", label: "Replace a provider", hint: "Move from one provider to another provider or deployment" },
  { kind: "remove-system", label: "Remove an AI system", hint: "Turn an AI system off and see what stops" },
  { kind: "price-change", label: "Price change", hint: "A provider raises or cuts prices" },
  { kind: "deprecation", label: "Model retirement", hint: "A model is retired on a date" },
  { kind: "outage", label: "Provider outage", hint: "A provider is down: what is exposed" },
  { kind: "eu-only", label: "EU-only", hint: "Every AI system must keep data in the EU" },
  { kind: "budget", label: "Budget target", hint: "Reduce AI spend by an amount a year" },
  { kind: "consolidate", label: "Consolidate tools", hint: "Merge one tool into another" },
];

export const isKind = (s: string | null | undefined): s is ScenarioKind => SCENARIOS.some((x) => x.kind === s);

type Search = Record<string, string | string[] | undefined>;
const one = (sp: Search, k: string) => {
  const v = sp[k];
  const s = (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  return s.slice(0, 200);
};
const num = (s: string) => {
  const n = Number(s.replace(/[€,\s%]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const COMPONENTS: PriceComponent[] = ["all", "input", "output", "seat"];

/** Scenario dall'URL; null se mancano dati obbligatori (la pagina mostra solo il modulo). */
export function parseScenario(sp: Search): { kind: ScenarioKind | null; scenario: Scenario | null } {
  const s = one(sp, "s");
  if (!isKind(s)) return { kind: null, scenario: null };
  const from = one(sp, "from");
  const to = one(sp, "to");
  const system = one(sp, "system") || undefined;
  switch (s) {
    case "replace-model":
    case "replace-provider":
      return { kind: s, scenario: from && to ? { s, from, to, ...(system ? { system } : {}) } : null };
    case "remove-system":
      return { kind: s, scenario: system ? { s, system } : null };
    case "price-change": {
      const provider = one(sp, "provider");
      const pct = num(one(sp, "pct"));
      const c = one(sp, "component") as PriceComponent;
      const model = one(sp, "model") || undefined;
      if (!provider || pct == null || pct < -100 || pct > 1000) return { kind: s, scenario: null };
      return { kind: s, scenario: { s, provider, pct, component: COMPONENTS.includes(c) ? c : "all", ...(model ? { model } : {}) } };
    }
    case "deprecation": {
      const model = one(sp, "model");
      const date = one(sp, "date");
      return { kind: s, scenario: model ? { s, model, ...(/^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}) } : null };
    }
    case "outage": {
      const provider = one(sp, "provider");
      return { kind: s, scenario: provider ? { s, provider } : null };
    }
    case "eu-only":
      return { kind: s, scenario: { s } };
    case "budget": {
      const target = num(one(sp, "target"));
      return { kind: s, scenario: target != null && target > 0 ? { s, target } : null };
    }
    case "consolidate":
      return { kind: s, scenario: from && to && from !== to ? { s, from, to } : null };
  }
}

/** Query string stabile (stesso scenario → stesso URL). */
export function scenarioQuery(sc: Scenario): string {
  const p: [string, string][] = [["s", sc.s]];
  const add = (k: string, v: string | number | undefined) => {
    if (v !== undefined && v !== "") p.push([k, String(v)]);
  };
  switch (sc.s) {
    case "replace-model":
    case "replace-provider":
      add("from", sc.from);
      add("to", sc.to);
      add("system", sc.system);
      break;
    case "remove-system":
      add("system", sc.system);
      break;
    case "price-change":
      add("provider", sc.provider);
      add("pct", sc.pct);
      add("component", sc.component);
      add("model", sc.model);
      break;
    case "deprecation":
      add("model", sc.model);
      add("date", sc.date);
      break;
    case "outage":
      add("provider", sc.provider);
      break;
    case "budget":
      add("target", sc.target);
      break;
    case "consolidate":
      add("from", sc.from);
      add("to", sc.to);
      break;
  }
  return p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

export const impactHref = (sc: Scenario) => `/impact?${scenarioQuery(sc)}`;

/** Link "What happens if I change this?" per un nodo del grafo (vista Graph, pagina dell'AI system). */
export function impactHrefForNode(type: string, id: string): string | null {
  if (type === "system") return `/impact?s=remove-system&system=${encodeURIComponent(id)}`;
  // Modello: il modulo si apre con "da" già scelto; la destinazione la sceglie la persona.
  if (type === "model" && !id.startsWith("raw:")) return `/impact?s=replace-model&from=${encodeURIComponent(id)}`;
  if (type === "provider" && !id.startsWith("name:")) return `/impact?s=outage&provider=${encodeURIComponent(id)}`;
  if (type === "deployment") return `/impact?s=outage&provider=${encodeURIComponent(id)}`;
  return null;
}
