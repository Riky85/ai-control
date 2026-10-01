/**
 * Registro dei trattamenti (GDPR art. 30) per le AI: una riga per ogni AI che
 * tratta dati personali, compilata in automatico da quello che angar sa già
 * (categoria, dati collegati, fornitore e sue condizioni, owner) e completata a
 * mano dove non si può dedurre. Funzioni pure: le query stanno nella pagina.
 */
import { SERVICE_CATEGORY, PLANS, type Category } from "@/lib/pricing/catalog";
import { vendorRiskFor, planTier, trainsOnYourData } from "@/lib/vendor-risk";
import { classifyAiAct, AI_ACT_TIER_LABEL, type AiActResult } from "@/lib/compliance/ai-act";

export const ROPA_FIELDS = ["purpose", "data", "subjects", "recipients", "transfers", "retention", "security"] as const;
export type RopaField = (typeof ROPA_FIELDS)[number];
export type RopaEdits = Partial<Record<RopaField, string>> & { updatedAt?: string; updatedBy?: string };

export const ROPA_LABEL: Record<RopaField, string> = {
  purpose: "Purpose",
  data: "Categories of data",
  subjects: "Categories of people",
  recipients: "Recipients / processor",
  transfers: "Transfers outside the EEA",
  retention: "Retention",
  security: "Security measures",
};

export const TO_COMPLETE = "To complete";
export const TO_CHECK = "To check";

/** inferred = dedotto; edited = scritto a mano; check = dedotto ma da verificare; todo = da completare. */
export type CellState = "inferred" | "edited" | "check" | "todo";
export interface RopaCell {
  value: string;
  state: CellState;
}

export interface RopaAsset {
  id: string;
  name: string;
  type: string;
  status: string;
  vendor: string | null;
  serviceId: string | null;
  model: string | null;
  department: string | null;
  euAiActTier: string;
  aiActTier: string | null;
  aiActNote: string | null;
  ropa: unknown;
  owner: { name: string | null; email: string } | null;
  usageCount: number;
  data: { name: string; sensitivity: string }[];
  cost: { planId: string | null; monthlyCostEstimate: number | null; basis: string } | null;
}

export interface RopaRow {
  id: string;
  name: string;
  vendor: string | null;
  cells: Record<RopaField, RopaCell>;
  owner: RopaCell;
  aiAct: AiActResult;
  /** Campi ancora "To complete" (owner incluso). */
  todo: number;
}

// Paesi SEE e paesi con decisione di adeguatezza (gli USA solo per le aziende certificate DPF: da verificare).
const EEA = /^(austria|belgium|bulgaria|croatia|cyprus|czechia|czech republic|denmark|estonia|finland|france|germany|greece|hungary|ireland|italy|latvia|lithuania|luxembourg|malta|netherlands|poland|portugal|romania|slovakia|slovenia|spain|sweden|norway|iceland|liechtenstein)$/i;
const ADEQUATE = /^(andorra|argentina|canada|faroe islands|guernsey|israel|isle of man|japan|jersey|new zealand|south korea|republic of korea|switzerland|united kingdom|uk|uruguay)$/i;

const PERSONAL = /\b(pii|personal|customers?|clients?|crm|leads?|contacts?|employees?|staff|hr|payroll|candidates?|cvs?|applicants?|patients?|students?|users?|people|e-?mails?|mailbox\w*|calendars?|tickets?|support|chats?)\b/i;
const PEOPLE_FACING = ["AI_APPLICATION", "AI_FEATURE", "AI_AGENT"];

const PURPOSE: Record<Category, string> = {
  assistant: "General work assistance: drafting, research, analysis",
  search: "Research and information search",
  writing: "Writing, editing and translation",
  meetings: "Meeting transcription and notes",
  media: "Creating images, video or audio",
  coding: "Software development",
  api: "AI features built into company systems",
  local: "AI that runs on the computer",
};

const categoryFor = (a: RopaAsset): Category | null =>
  (a.serviceId ? SERVICE_CATEGORY[a.serviceId] ?? null : null) ?? (a.type === "AI_API" ? "api" : a.type === "AI_DEV_TOOL" ? "coding" : null);

/** Dati collegati che sono (o contengono) dati personali. */
const personalData = (a: RopaAsset) => a.data.filter((d) => d.sensitivity === "PII" || PERSONAL.test(d.name));

/** L'AI tratta dati personali? Dati personali collegati, oppure un'app che le persone usano col proprio account. */
export function processesPersonalData(a: RopaAsset): boolean {
  if (a.status === "UNAPPROVED") return false;
  if (personalData(a).length > 0) return true;
  const cat = categoryFor(a);
  return PEOPLE_FACING.includes(a.type) && cat !== "coding" && cat !== "local";
}

export function readEdits(v: unknown): RopaEdits {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const out: RopaEdits = {};
  for (const k of ROPA_FIELDS) if (typeof o[k] === "string" && (o[k] as string).trim()) out[k] = (o[k] as string).trim();
  if (typeof o.updatedAt === "string") out.updatedAt = o.updatedAt;
  if (typeof o.updatedBy === "string") out.updatedBy = o.updatedBy;
  return out;
}

const cell = (value: string | null | undefined, state: CellState = "inferred"): RopaCell => (value ? { value, state } : { value: TO_COMPLETE, state: "todo" });
const uniq = (xs: string[]) => [...new Set(xs)];

/** Riga del registro: valori scritti a mano sopra a quelli dedotti. */
export function buildRopaRow(a: RopaAsset, opts: { showPeople: boolean }): RopaRow {
  const edits = readEdits(a.ropa);
  const cat = categoryFor(a);
  const personal = personalData(a);
  const names = personal.map((d) => d.name).join(" ");
  const facing = PEOPLE_FACING.includes(a.type);
  const vr = vendorRiskFor(a);
  const plan = a.cost?.planId ? PLANS.find((p) => p.id === a.cost!.planId) : undefined;
  const paid = (a.cost?.monthlyCostEstimate ?? 0) > 0 && a.cost?.basis !== "estimate";
  const tier = planTier({ type: a.type, planBusiness: plan ? plan.business : null, paidByCompany: paid });

  // Finalità: dalla categoria (o dal tipo), con il reparto se noto.
  const base = cat ? PURPOSE[cat] : a.type === "AI_AGENT" ? "Automated tasks run by an AI agent" : a.type === "AI_FEATURE" ? `AI features inside ${a.vendor ?? "a software tool"}` : null;
  const purpose = base ? (a.department ? `${base} (${a.department})` : base) : null;

  // Categorie di dati: i dati collegati, più quelli che ogni app con account tratta.
  const data = uniq([
    ...personal.map((d) => d.name),
    ...(a.type === "AI_APPLICATION" || a.type === "AI_FEATURE" ? ["Account data (name, work email)", "Prompts and uploaded files"] : []),
    ...(cat === "meetings" ? ["Voice recordings and transcripts"] : []),
  ]).join(", ");

  // Categorie di interessati.
  const subjects = uniq([
    ...(facing || a.usageCount > 0 ? ["Employees who use it"] : []),
    ...(/\b(customers?|clients?|crm|leads?|contacts?|tickets?|support)\b/i.test(names) ? ["Customers and prospects"] : []),
    ...(/\b(employees?|staff|hr|payroll|people)\b/i.test(names) ? ["Employees"] : []),
    ...(/\b(candidates?|cvs?|applicants?|recruit\w*)\b/i.test(names) ? ["Job candidates"] : []),
    ...(/\bpatients?\b/i.test(names) ? ["Patients"] : []),
    ...(/\bstudents?\b/i.test(names) ? ["Students"] : []),
    ...(cat === "meetings" || /\b(e-?mails?|mailbox\w*|calendars?)\b/i.test(names) ? ["People in emails and meetings"] : []),
  ]).join(", ");

  // Destinatari: il fornitore come responsabile del trattamento.
  const recipients = cat === "local" ? "None: runs on the computer" : a.vendor ? `${a.vendor} (processor)${vr?.dpaUrl ? ", DPA available" : ""}` : null;

  // Trasferimenti fuori dal SEE e garanzia, dalle condizioni del fornitore.
  let transfers: RopaCell;
  if (cat === "local") transfers = cell("No: runs on the computer");
  else if (!vr) transfers = { value: TO_CHECK, state: "check" };
  else if (EEA.test(vr.hq)) transfers = vr.euResidency === "yes" ? cell(`No: ${vr.hq} vendor, EU hosting`) : { value: `${vr.hq} vendor, hosting to check`, state: "check" };
  else if (ADEQUATE.test(vr.hq)) transfers = cell(`Yes: ${vr.hq}, adequacy decision`);
  else if (vr.euResidency === "yes") transfers = { value: `EU hosting, ${vr.hq} vendor. Safeguard: SCCs in the DPA, to check`, state: "check" };
  else if (vr.euResidency === "enterprise")
    transfers = { value: `${tier === "business" ? "EU hosting on enterprise plans, otherwise" : "Yes:"} ${vr.hq}. Safeguard: DPF or SCCs, to check`, state: "check" };
  else transfers = { value: `Yes: ${vr.hq}. Safeguard: ${/united states/i.test(vr.hq) ? "DPF or SCCs" : "SCCs"}, to check`, state: "check" };

  // Misure di sicurezza: certificazioni del fornitore, DPA, niente addestramento sui dati.
  const security = uniq([
    ...(vr && vr.certifications.length ? [`Vendor ${vr.certifications.slice(0, 3).join(", ")}`] : []),
    ...(vr && trainsOnYourData(vr, tier) === "no" ? ["No training on your data"] : []),
    ...(cat === "local" ? ["Data stays on the computer"] : []),
  ]).join(", ");

  const pick = (k: RopaField, auto: RopaCell): RopaCell => (edits[k] ? { value: edits[k]!, state: "edited" } : auto);
  const cells: Record<RopaField, RopaCell> = {
    purpose: pick("purpose", cell(purpose)),
    data: pick("data", cell(data)),
    subjects: pick("subjects", cell(subjects)),
    recipients: pick("recipients", cell(recipients)),
    transfers: pick("transfers", transfers),
    retention: pick("retention", cell(null)),
    security: pick("security", cell(security)),
  };
  const owner: RopaCell = a.owner ? { value: opts.showPeople ? a.owner.name ?? a.owner.email : "Assigned", state: "inferred" } : { value: TO_COMPLETE, state: "todo" };

  const aiAct = classifyAiAct({
    type: a.type,
    name: a.name,
    vendor: a.vendor,
    serviceId: a.serviceId,
    model: a.model,
    department: a.department,
    category: cat,
    dataNames: a.data.map((d) => d.name),
    euAiActTier: a.euAiActTier,
    override: a.aiActTier,
    overrideNote: a.aiActNote,
  });

  const todo = Object.values(cells).filter((c) => c.state === "todo").length + (owner.state === "todo" ? 1 : 0);
  return { id: a.id, name: a.name, vendor: a.vendor, cells, owner, aiAct, todo };
}

/** CSV del registro (separatore virgola, valori tra virgolette, BOM per Excel). */
export function ropaCsv(rows: RopaRow[]): string {
  // Niente formule: un valore che inizia con = + - @ viene preceduto da un apostrofo.
  const q = (s: string) => `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  const head = ["AI system", ...ROPA_FIELDS.map((k) => ROPA_LABEL[k]), "Owner", "AI Act tier", "AI Act role", "AI Act obligations"];
  const lines = rows.map((r) =>
    [r.name, ...ROPA_FIELDS.map((k) => r.cells[k].value), r.owner.value, AI_ACT_TIER_LABEL[r.aiAct.tier], r.aiAct.role, r.aiAct.obligations.join("; ")].map((v) => q(String(v))).join(",")
  );
  return "﻿" + [head.map(q).join(","), ...lines].join("\r\n") + "\r\n";
}
