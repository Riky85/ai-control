/**
 * Grafo dell'AI estate — lettura dal database e domande al grafo:
 * "cosa dipende da OpenAI / dal modello X / da questi dati / da questa applicazione",
 * insiemi d'impatto con spesa reale e stimata separate (servizio prezzi), concentrazione,
 * e la valutazione (Replaceability, Exit readiness) di ogni AI system.
 *
 * La logica sta in graph-core.ts / assess.ts / assemble.ts (pure); qui solo il caricamento.
 */
import * as React from "react";
import { db } from "@/lib/db";
import { serviceOf } from "@/lib/savings";
import { actualVsEstimated, catalog, deploymentOf, modelById, productsForService } from "@/lib/pricing/service";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { impactOf, dependentsOf, dependenciesOf, nodeKey, LIVE, type EstateInput, type ImpactSet, type NodeType } from "./graph-core";
import { ownIds, type SystemRow } from "./assess";
import { assembleEstate, type EstateData } from "./assemble";

export * from "./graph-core";
export type { EstateData, PendingEdge } from "./assemble";

const ACTIVE_SUB = { effectiveUntil: null };
const evidenceText = (e: unknown): string | null => (e && typeof e === "object" && "text" in e ? String((e as { text: unknown }).text) : null);

export async function loadEstate(orgId: string, now = new Date()): Promise<EstateData> {
  const [org, policy, upstreams, assets, deps, processes, applications, privacy] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { euOnly: true } }),
    db.gatewayPolicy.findUnique({ where: { organizationId: orgId }, select: { euOnly: true } }),
    db.gatewayUpstream.findMany({ where: { organizationId: orgId, credentialsEncrypted: { not: null } }, select: { provider: true } }),
    db.aiAsset.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { not: "UNAPPROVED" } },
      include: {
        cost: true,
        owner: { select: { id: true, name: true, email: true } },
        usages: { select: { id: true } },
        subscriptions: { where: ACTIVE_SUB, orderBy: [{ origin: "desc" }, { updatedAt: "desc" }], take: 1, include: { seatLines: true } },
        modelUses: true,
        profile: true,
        evaluations: true,
      },
      orderBy: { name: "asc" },
    }),
    db.dependency.findMany({ where: { organizationId: orgId } }),
    db.businessProcess.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } }),
    db.application.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } }),
    orgPrivacyMode(orgId),
  ]);
  const people = showsPeople(privacy);
  const dataIds = [...new Set(deps.filter((d) => d.toType === "data").map((d) => d.toId))];
  const personIds = [...new Set(deps.filter((d) => d.toType === "person").map((d) => d.toId))];
  const [data, persons] = await Promise.all([
    dataIds.length ? db.dataAsset.findMany({ where: { organizationId: orgId, id: { in: dataIds } } }) : [],
    personIds.length ? db.user.findMany({ where: { organizationId: orgId, id: { in: personIds } }, select: { id: true, name: true, email: true } }) : [],
  ]);

  const orgEuOnly = org?.euOnly === true || policy?.euOnly === true;
  const rows: SystemRow[] = [];
  const input: EstateInput = {
    systems: [],
    modelUses: [],
    deps: deps.map((d) => ({ id: d.id, fromType: d.fromType, fromId: d.fromId, toType: d.toType, toId: d.toId, relation: d.relation, source: d.source, origin: d.origin, confidence: d.confidence, status: d.status, evidence: evidenceText(d.evidence) })),
    processes: processes.map((p) => ({ id: p.id, name: p.name, criticality: p.criticality })),
    applications: applications.map((a) => ({ id: a.id, name: a.name, vendor: a.vendor, kind: a.kind })),
    data: data.map((d) => ({ id: d.id, name: d.name, sensitivity: d.sensitivity })),
    persons: persons.map((p) => ({ id: p.id, label: people ? p.name ?? p.email : "Owner" })),
    providerNames: Object.fromEntries(catalog().providers.map((p) => [p.id, p.name])),
    products: Object.fromEntries(catalog().products.map((p) => [p.id, { name: p.name, providerId: p.providerId }])),
  };

  for (const a of assets) {
    const sub = a.subscriptions[0] ?? null;
    const live = a.modelUses.filter((u) => LIVE(u.status));
    const gatewayEur = live.filter((u) => u.origin === "gateway").reduce((t, u) => t + (u.spendEur30d ?? 0), 0);
    const svc = serviceOf(a);
    const ave = actualVsEstimated({
      id: a.id,
      name: a.name,
      type: a.type,
      serviceId: svc,
      model: a.model,
      cost: a.cost,
      users: a.usages.length,
      subscription: sub ? { actualMonthly: sub.actualMonthly, currency: sub.currency, source: sub.source, billingCycle: sub.billingCycle, seatLines: sub.seatLines.map((l) => ({ seatTypeId: l.seatTypeId, label: l.label, paidSeats: l.paidSeats })), origin: sub.origin, contractMonthly: sub.contractMonthly } : null,
      gatewayEstimateEur: gatewayEur > 0 ? gatewayEur : null,
    }, now);
    const cost = { actualEur: ave.actual?.eur ?? null, estimatedEur: ave.estimated?.eur ?? null, actualSource: ave.actual?.source ?? null, estimatedBasis: ave.estimated?.basis ?? null };
    input.systems.push({ id: a.id, name: a.name, vendor: a.vendor, type: a.type, cost });
    for (const u of a.modelUses) {
      const m = u.modelId ? modelById(u.modelId) : null;
      const dep = u.deploymentId ? deploymentOf(u.deploymentId) : null;
      input.modelUses.push({ id: u.id, aiAssetId: a.id, rawModel: u.rawModel, modelId: u.modelId, modelName: m?.name ?? null, providerId: u.providerId ?? m?.providerId ?? null, deploymentId: u.deploymentId, deploymentName: dep?.name ?? null, deploymentHostId: dep?.hostProviderId ?? null, share: u.share, source: u.source, origin: u.origin, confidence: u.confidence, status: u.status, evidence: evidenceText(u.evidence) });
    }
    const seatProduct = sub?.productId ?? (a.type !== "AI_API" && svc ? productsForService(svc).find((p) => p.kind === "seat")?.id ?? null : null);
    const renewal = sub?.renewalDate ?? a.cost?.contractEnd ?? null;
    const cycle = sub?.billingCycle ?? (a.cost?.annualBilling ? "annual" : null);
    rows.push({
      id: a.id,
      name: a.name,
      type: a.type,
      vendor: a.vendor,
      serviceId: svc,
      users: a.usages.length,
      paidSeats: sub?.seatLines.reduce((t, l) => t + l.paidSeats, 0) || a.cost?.seats || null,
      cost,
      uses: live.map((u) => ({ modelId: u.modelId, rawModel: u.rawModel, deploymentId: u.deploymentId, region: u.region, share: u.share, inputTokens30d: u.inputTokens30d, outputTokens30d: u.outputTokens30d, spendEur30d: u.spendEur30d, spendKind: u.origin === "cloud_billing" ? "actual" : u.origin === "gateway" ? "estimated" : null, endpoints: u.endpoints, maxPromptTokens: u.maxPromptTokens, match: u.match, origin: u.origin })),
      seatProductId: seatProduct,
      profile: a.profile ? { requiredCapabilities: a.profile.requiredCapabilities, notRequired: a.profile.notRequired, minContextTokens: a.profile.minContextTokens, providerSpecific: a.profile.providerSpecific, euResidencyRequired: a.profile.euResidencyRequired, dataExport: a.profile.dataExport } : null,
      contract: sub || renewal || cycle ? { billingCycle: cycle, renewalDate: renewal, source: sub?.source ?? null } : null,
      evaluations: a.evaluations.map((e) => ({ candidateType: e.candidateType, candidateId: e.candidateId, tasks: e.tasks, passRate: e.passRate, passed: e.passed, evaluatedAt: e.evaluatedAt })),
    });
  }

  const estateUse = new Map<string, number>();
  for (const r of rows) for (const id of ownIds(r)) estateUse.set(id, (estateUse.get(id) ?? 0) + 1);
  return assembleEstate({
    input,
    rows,
    ctx: { orgEuOnly, gatewayUpstreams: upstreams.map((u) => u.provider), estateUse, now },
    applications: applications.map((a) => ({ id: a.id, name: a.name, vendor: a.vendor, kind: a.kind, source: a.source })),
  });
}

/** Una lettura per richiesta (React cache): pagina e componenti condividono il grafo. */
export const loadEstateCached = (React as { cache?: typeof React.cache }).cache ? React.cache(loadEstate) : loadEstate;

/** "Cosa dipende da X?" — X come tipo + id ("provider", "openai"). */
export async function whatDependsOn(orgId: string, type: NodeType, id: string): Promise<ImpactSet | null> {
  const e = await loadEstateCached(orgId);
  return impactOf(e.graph, nodeKey(type, id));
}

/** "Da cosa dipende X?" */
export async function whatItDependsOn(orgId: string, type: NodeType, id: string) {
  const e = await loadEstateCached(orgId);
  return [...dependenciesOf(e.graph, nodeKey(type, id))].map((k) => e.graph.nodes.get(k)!).filter(Boolean);
}

export { dependentsOf };
