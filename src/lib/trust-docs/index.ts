/**
 * Elenco dei documenti del Trust Center (/trust/docs/[slug]). L'informativa ai
 * dipendenti riusa il generatore di /compliance/employee-notice, qui in forma
 * di modello generico (senza i dati di un'azienda).
 */
import { buildEmployeeNotice, NOTICE_LANGS, noticeLang } from "@/lib/employee-notice";
import { USAGE_RETENTION_MONTHS } from "@/lib/trust";
import { buildDpa } from "./dpa";
import { buildDpia } from "./dpia";
import { buildSecurityOverview } from "./security";
import { buildWorksCouncil } from "./works-council";
import type { TrustDoc, TrustDocMeta } from "./types";

export type { TrustDoc, TrustDocMeta, DocBlock, DocVersion } from "./types";
export { DISCLAIMER } from "./types";

const LANG_LABEL: Record<string, string> = { en: "English", it: "Italiano", de: "Deutsch", fr: "Français", es: "Español" };

function employeeNoticeTemplate(v: string): TrustDoc {
  const n = buildEmployeeNotice(
    {
      orgName: "[[Company name]]",
      country: null,
      mode: "department",
      contact: null,
      retentionMonths: USAGE_RETENTION_MONTHS,
      // Modello generico: tutte le fonti; si tolgono quelle non usate.
      sources: { desktop: true, extension: true, microsoft365: true, google: true, edge: true, firewallBytes: false },
      tools: [],
      date: new Date(),
    },
    noticeLang(v),
  );
  return { title: n.title, blocks: n.blocks };
}

export const TRUST_DOCS: TrustDocMeta[] = [
  {
    slug: "dpa",
    title: "Data Processing Agreement",
    summary: "GDPR art. 28 — angar as processor, your company as controller. Data categories, security measures, sub-processors, deletion at termination.",
    kind: "Contract",
    versions: [{ id: "en", lang: "en", label: "English" }],
    template: false,
    build: () => buildDpa(),
  },
  {
    slug: "security",
    title: "Security overview",
    summary: "Technical and organisational measures (GDPR art. 32): encryption, access control, audit log, backups, incident response.",
    kind: "Overview",
    versions: [{ id: "en", lang: "en", label: "English" }],
    template: false,
    build: () => buildSecurityOverview(),
  },
  {
    slug: "dpia",
    title: "DPIA for the desktop app",
    summary: "GDPR art. 35 impact assessment, pre-filled with what the desktop app collects, the risks and the safeguards.",
    kind: "Template",
    versions: [
      { id: "en", lang: "en", label: "English" },
      { id: "it", lang: "it", label: "Italiano" },
    ],
    template: true,
    build: (v) => buildDpia(v),
  },
  {
    slug: "employee-notice",
    title: "Employee notice",
    summary: "GDPR art. 13 notice for staff before installing the desktop app. Signed in? Generate one from your own setup.",
    kind: "Template",
    versions: NOTICE_LANGS.map((l) => ({ id: l.id, lang: l.id, label: l.label })),
    template: true,
    build: (v) => employeeNoticeTemplate(v),
  },
  {
    slug: "works-council",
    title: "Works council and union agreements",
    summary: "Templates for workplace monitoring tools: Italy (art. 4 Statuto dei lavoratori), Germany (§87 BetrVG), France (CSE), Spain (art. 64 ET).",
    kind: "Template",
    versions: [
      { id: "it", lang: "it", label: "Italia — accordo sindacale" },
      { id: "de", lang: "de", label: "Deutschland — Betriebsvereinbarung" },
      { id: "fr", lang: "fr", label: "France — consultation du CSE" },
      { id: "es", lang: "es", label: "España — información a la RLT" },
    ],
    template: true,
    build: (v) => buildWorksCouncil(v),
  },
];

export const trustDocBySlug = (slug: string) => TRUST_DOCS.find((d) => d.slug === slug);

/** Versione richiesta (?v=), o la prima disponibile. */
export function docVersion(meta: TrustDocMeta, v?: string | null) {
  return meta.versions.find((x) => x.id === v) ?? meta.versions[0];
}

export const langLabel = (id: string) => LANG_LABEL[id] ?? id;
