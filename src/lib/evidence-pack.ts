/**
 * Evidence pack AI Act / NIS2: una fotografia verificabile di inventario AI,
 * prontezza AI Act, formazione, policy, controlli di rete, sensori Edge,
 * fornitori ICT, incidenti critici e stato della catena di hash del registro
 * di audit. Tutto da query dirette, niente testo generato. L'impronta
 * (SHA-256 del JSON canonico) permette di dimostrare che il pack consegnato
 * non è stato modificato.
 */
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { readiness, LITERACY_EVIDENCE, TIER_LABEL } from "@/lib/compliance";
import { canonicalJson, verifyAuditChain, type ChainResult } from "@/lib/audit";
import { privacyModeOf, showsPeople, type PrivacyMode } from "@/lib/privacy";
import { ackSummaryForPack } from "@/lib/policy-ack";

const DAY = 86400000;
const SENSOR_ONLINE_MS = 15 * 60 * 1000; // i sensori riportano ogni 5 minuti
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const SOURCE_LABEL: Record<string, string> = {
  MICROSOFT_365: "Microsoft 365",
  GOOGLE_WORKSPACE: "Google Workspace",
  NETWORK: "Scan / network",
  BANK: "Bank statement",
  ACCOUNTING: "Accounting",
  FATTURE_IN_CLOUD: "Invoices",
  bank: "Bank statement",
  invoice: "Invoices",
  check: "Spend check",
  cloud: "Cloud billing",
  AZURE_OPENAI: "Azure Cost Management",
  AWS_BEDROCK: "AWS Cost Explorer",
  GOOGLE_VERTEX: "Google Cloud billing export",
};
const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase());

export interface EvidencePack {
  schema: "angar.evidence-pack/1";
  organisation: { id: string; name: string; country: string | null; employees: number | null; industry: string | null; privacyMode: PrivacyMode };
  generatedAt: string;
  generatedBy: string | null;
  aiInventory: {
    name: string;
    vendor: string | null;
    type: string;
    status: string;
    euAiActTier: string;
    owner: string | null;
    department: string | null;
    firstSeen: string;
    lastSeen: string | null;
    sources: string[];
    dataAccess: { name: string; sensitivity: string }[];
    blockedOnNetwork: boolean;
  }[];
  aiActReadiness: {
    score: number;
    total: number;
    classified: number;
    highRisk: number;
    missingOwners: number;
    checks: { key: string; label: string; detail: string; weight: number; points: number }[];
  };
  aiLiteracy: { date: string; summary: string; recordedBy: string | null }[];
  // Presa visione della policy AI + mini-modulo di literacy (sempre aggregato, mai per persona).
  policyAcknowledgement: Awaited<ReturnType<typeof ackSummaryForPack>>;
  policies: { name: string; description: string; category: string; enabled: boolean; updatedAt: string }[];
  networkControls: { name: string; vendor: string | null; suggestedInstead: string | null }[];
  edgeSensors: { total: number; online: number; lastSeen: string | null; sensors: { name: string; kind: string; online: boolean; lastSeen: string | null; dns: boolean; firewallLogs: boolean; blocking: boolean }[] };
  nis2: {
    ictThirdPartyProviders: { vendor: string; services: string[]; types: string[]; approved: number; notAllowed: number; toReview: number; dataAccess: { name: string; sensitivity: string }[] }[];
    criticalIncidents: { date: string; kind: string; title: string; body: string | null }[];
  };
  auditLog: {
    chain: ChainResult;
    lastEntries: { at: string; actor: string | null; action: string; target: string | null; prevHash: string | null; hash: string | null }[];
  };
}

export async function buildEvidencePack(orgId: string, generatedBy: string | null, now = new Date()): Promise<EvidencePack> {
  const [org, r, activitySources, spendSources, assetsExtra, literacy, policies, sensors, alerts, chain, lastAudit, members] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { id: true, name: true, country: true, employees: true, industry: true, privacyMode: true } }),
    readiness(orgId, now),
    db.aiAssetActivity.groupBy({ by: ["aiAssetId", "source"], where: { aiAsset: { organizationId: orgId, deletedAt: null } } }),
    db.spendRecord.groupBy({ by: ["aiAssetId", "source"], where: { organizationId: orgId, aiAssetId: { not: null } } }),
    db.aiAsset.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        blockOnNetwork: true,
        insteadAssetId: true,
        connector: { select: { provider: true } },
        owner: { select: { department: true } },
        dataAccess: { select: { dataAsset: { select: { name: true, sensitivity: true } } } },
      },
    }),
    db.evidence.findMany({ where: { organizationId: orgId, type: LITERACY_EVIDENCE }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.policy.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } }),
    db.edgeSensor.findMany({ where: { organizationId: orgId }, select: { name: true, kind: true, lastSeenAt: true, dnsEnabled: true, syslogEnabled: true, blockEnabled: true }, orderBy: { name: "asc" } }),
    db.alert.findMany({ where: { organizationId: orgId, severity: "critical", createdAt: { gte: new Date(now.getTime() - 365 * DAY) } }, orderBy: { createdAt: "desc" }, take: 500 }),
    verifyAuditChain(orgId),
    db.auditLog.findMany({ where: { organizationId: orgId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 }),
    db.workspaceMember.findMany({ where: { organizationId: orgId }, select: { email: true } }),
  ]);
  if (!org) throw new Error("Organisation not found");
  const policyAcknowledgement = await ackSummaryForPack(orgId);

  const mode = privacyModeOf(org);
  const people = showsPeople(mode);
  // Le email dei membri del workspace (utenti di angar) restano visibili; quelle dei dipendenti no.
  const memberEmails = new Set(members.map((m) => m.email.toLowerCase()));
  const scrub = (text: string | null) => (text == null || people ? text : text.replace(EMAIL_RE, (e) => (memberEmails.has(e.toLowerCase()) ? e : "[hidden]")));

  const extra = new Map(assetsExtra.map((a) => [a.id, a]));
  const sourcesOf = new Map<string, Set<string>>();
  const add = (id: string | null, s: string) => {
    if (!id) return;
    const set = sourcesOf.get(id) ?? new Set<string>();
    set.add(sourceLabel(s));
    sourcesOf.set(id, set);
  };
  activitySources.forEach((x) => add(x.aiAssetId, x.source));
  spendSources.forEach((x) => add(x.aiAssetId, x.source));
  assetsExtra.forEach((a) => a.connector && add(a.id, a.connector.provider));
  const nameById = new Map(r.assets.map((a) => [a.id, a.name]));

  const inventory = r.assets.map((a) => {
    const x = extra.get(a.id);
    return {
      name: a.name,
      vendor: a.vendor,
      type: a.type,
      status: a.status,
      euAiActTier: TIER_LABEL[a.euAiActTier],
      // Il responsabile di un'AI è un ruolo di governance: con la privacy non individuale resta solo il reparto.
      owner: a.owner ? (people ? a.owner.name ?? a.owner.email : null) : null,
      department: a.department ?? x?.owner?.department ?? null,
      firstSeen: a.firstSeenAt.toISOString(),
      lastSeen: a.lastSeenAt?.toISOString() ?? null,
      sources: [...(sourcesOf.get(a.id) ?? [])].sort(),
      dataAccess: (x?.dataAccess ?? []).map((d) => ({ name: d.dataAsset.name, sensitivity: d.dataAsset.sensitivity })),
      blockedOnNetwork: !!x?.blockOnNetwork,
    };
  });

  // NIS2: i servizi AI come fornitori terzi ICT, raggruppati per fornitore.
  const byVendor = new Map<string, EvidencePack["nis2"]["ictThirdPartyProviders"][number]>();
  for (const a of inventory) {
    const vendor = a.vendor ?? "Unknown vendor";
    const v = byVendor.get(vendor) ?? { vendor, services: [], types: [], approved: 0, notAllowed: 0, toReview: 0, dataAccess: [] };
    v.services.push(a.name);
    if (!v.types.includes(a.type)) v.types.push(a.type);
    if (a.status === "APPROVED") v.approved++;
    else if (a.status === "UNAPPROVED") v.notAllowed++;
    else v.toReview++;
    for (const d of a.dataAccess) if (!v.dataAccess.some((y) => y.name === d.name)) v.dataAccess.push(d);
    byVendor.set(vendor, v);
  }

  const onlineCut = now.getTime() - SENSOR_ONLINE_MS;
  const sensorLast = sensors.reduce<Date | null>((m, s) => (s.lastSeenAt && (!m || s.lastSeenAt > m) ? s.lastSeenAt : m), null);

  return {
    schema: "angar.evidence-pack/1",
    organisation: { id: org.id, name: org.name, country: org.country, employees: org.employees, industry: org.industry, privacyMode: mode },
    generatedAt: now.toISOString(),
    generatedBy,
    aiInventory: inventory,
    aiActReadiness: {
      score: r.score,
      total: r.total,
      classified: r.classified,
      highRisk: r.highRisk,
      missingOwners: r.missingOwners,
      checks: r.checks.map((c) => ({ key: c.key, label: c.label, detail: c.detail, weight: c.weight, points: Math.round(c.weight * c.fraction) })),
    },
    policyAcknowledgement,
    // Le conferme per persona sono già riassunte in policyAcknowledgement.
    aiLiteracy: literacy.filter((e) => (e.payload as { kind?: string } | null)?.kind !== "policy_ack").map((e) => ({ date: e.createdAt.toISOString(), summary: e.summary, recordedBy: ((e.payload as { recordedBy?: string } | null)?.recordedBy as string | undefined) ?? null })),
    policies: policies.map((p) => ({ name: p.name, description: p.description, category: p.category, enabled: p.enabled, updatedAt: p.updatedAt.toISOString() })),
    networkControls: assetsExtra
      .filter((a) => a.blockOnNetwork)
      .map((a) => ({ name: nameById.get(a.id) ?? a.id, vendor: r.assets.find((x) => x.id === a.id)?.vendor ?? null, suggestedInstead: a.insteadAssetId ? nameById.get(a.insteadAssetId) ?? null : null }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    edgeSensors: {
      total: sensors.length,
      online: sensors.filter((s) => s.lastSeenAt && s.lastSeenAt.getTime() >= onlineCut).length,
      lastSeen: sensorLast?.toISOString() ?? null,
      sensors: sensors.map((s) => ({ name: s.name, kind: s.kind, online: !!s.lastSeenAt && s.lastSeenAt.getTime() >= onlineCut, lastSeen: s.lastSeenAt?.toISOString() ?? null, dns: s.dnsEnabled, firewallLogs: s.syslogEnabled, blocking: s.blockEnabled })),
    },
    nis2: {
      ictThirdPartyProviders: [...byVendor.values()].sort((a, b) => b.services.length - a.services.length || a.vendor.localeCompare(b.vendor)),
      criticalIncidents: alerts.map((a) => ({
        date: a.createdAt.toISOString(),
        kind: a.kind,
        // Gli avvisi "policy" nominano chi ha usato l'AI: fuori dalla modalità per persona si toglie.
        title: people ? a.title : scrub(a.title.replace(/\s+—\s+used by .*$/i, ""))!,
        body: people ? a.body : null,
      })),
    },
    auditLog: {
      chain,
      lastEntries: lastAudit.map((e) => ({ at: e.createdAt.toISOString(), actor: e.actorEmail, action: e.action, target: scrub(e.target), prevHash: e.prevHash, hash: e.hash })),
    },
  };
}

/** SHA-256 del JSON canonico (chiavi ordinate) del pack, senza il campo fingerprint. */
export function packFingerprint(pack: EvidencePack): string {
  return createHash("sha256").update(canonicalJson(pack)).digest("hex");
}
