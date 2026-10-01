/**
 * angar Gateway — dati per le pagine (/gateway). Solo lettura, solo metadati.
 * Restituisce oggetti serializzabili (date come stringhe ISO) per i componenti client.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/alerts";
import { euOnlyDeployment } from "@/lib/eu-only";
import { policyFromRow, type OrgPolicy } from "./policy";
import { monthStartRome } from "./store";
import { isRedactKind, type RedactKind } from "./detect";
import type { GatewayProvider } from "./usage";

export interface GwRequestRow {
  id: string;
  at: string;
  keyName: string;
  keyLast4: string;
  team: string;
  provider: string;
  endpoint: string;
  model: string | null;
  stream: boolean;
  inputTokens: number;
  outputTokens: number;
  costEur: number;
  latencyMs: number;
  overheadMs: number | null;
  status: number;
  result: string;
  reason: string | null;
  redactions: Partial<Record<RedactKind, number>> | null;
}

const toRow = (r: Prisma.GatewayRequestGetPayload<{}>): GwRequestRow => ({
  id: r.id,
  at: r.createdAt.toISOString(),
  keyName: r.keyName,
  keyLast4: r.keyLast4,
  team: r.team,
  provider: r.provider,
  endpoint: r.endpoint,
  model: r.model,
  stream: r.stream,
  inputTokens: r.inputTokens,
  outputTokens: r.outputTokens,
  costEur: r.costEur,
  latencyMs: r.latencyMs,
  overheadMs: r.overheadMs,
  status: r.status,
  result: r.result,
  reason: r.reason,
  redactions: r.redactions && typeof r.redactions === "object" ? (Object.fromEntries(Object.entries(r.redactions as Record<string, number>).filter(([k]) => isRedactKind(k))) as GwRequestRow["redactions"]) : null,
});

export const gatewayEndpoint = (provider: GatewayProvider) => `${appUrl()}/api/gateway/${provider}/v1`;

function dayStartRome(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  const guess = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  const romeHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(guess));
  return new Date(guess.getTime() - romeHour * 3_600_000);
}

export interface TeamSpend {
  team: string;
  eur: number;
  keys: number;
  capEur: number | null;
}

export interface GwOverview {
  requestsToday: number;
  requestsYesterday: number;
  spendMonthEur: number;
  capsTotalEur: number;
  redactedMonth: number;
  redactedKinds: RedactKind[];
  blockedMonth: number;
  blockedReasons: string[];
  teams: TeamSpend[];
  live: GwRequestRow[];
}

export async function gatewayOverview(orgId: string, now = new Date()): Promise<GwOverview> {
  const today = dayStartRome(now);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const month = monthStartRome(now);
  const where = { organizationId: orgId };
  const [requestsToday, requestsYesterday, spend, blocked, byTeam, keys, live, policyRow, redacted] = await Promise.all([
    db.gatewayRequest.count({ where: { ...where, createdAt: { gte: today } } }),
    db.gatewayRequest.count({ where: { ...where, createdAt: { gte: yesterday, lt: today } } }),
    db.gatewayRequest.aggregate({ where: { ...where, createdAt: { gte: month } }, _sum: { costEur: true } }),
    db.gatewayRequest.groupBy({ by: ["reason"], where: { ...where, createdAt: { gte: month }, result: "blocked" }, _count: { _all: true } }),
    db.gatewayRequest.groupBy({ by: ["team"], where: { ...where, createdAt: { gte: month } }, _sum: { costEur: true } }),
    db.gatewayKey.groupBy({ by: ["team"], where: { ...where, revokedAt: null }, _count: { _all: true } }),
    db.gatewayRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
    db.gatewayPolicy.findUnique({ where }),
    // Somma dei valori redatti per tipo: jsonb_each_text sul campo redactions.
    db.$queryRaw<{ kind: string; n: bigint }[]>`SELECT r.key AS kind, SUM(r.value::int)::bigint AS n FROM "GatewayRequest" g, jsonb_each_text(g.redactions) r WHERE g."organizationId" = ${orgId} AND g."createdAt" >= ${month} AND g.redactions IS NOT NULL GROUP BY r.key`,
  ]);
  const policy = policyFromRow(policyRow);
  const teamNames = new Set<string>([...byTeam.map((t) => t.team), ...keys.map((k) => k.team), ...Object.keys(policy.teamCaps)]);
  const teams: TeamSpend[] = Array.from(teamNames)
    .map((team) => ({
      team,
      eur: byTeam.find((t) => t.team === team)?._sum.costEur ?? 0,
      keys: keys.find((k) => k.team === team)?._count._all ?? 0,
      capEur: policy.teamCaps[team] ?? null,
    }))
    .sort((a, b) => b.eur - a.eur || a.team.localeCompare(b.team));
  const kinds = redacted.filter((r) => isRedactKind(r.kind)).sort((a, b) => Number(b.n) - Number(a.n));
  return {
    requestsToday,
    requestsYesterday,
    spendMonthEur: spend._sum.costEur ?? 0,
    capsTotalEur: Object.values(policy.teamCaps).reduce((s, n) => s + n, 0),
    redactedMonth: kinds.reduce((s, r) => s + Number(r.n), 0),
    redactedKinds: kinds.map((r) => r.kind as RedactKind),
    blockedMonth: blocked.reduce((s, b) => s + b._count._all, 0),
    blockedReasons: blocked.sort((a, b) => b._count._all - a._count._all).map((b) => b.reason ?? "other"),
    teams,
    live: live.map(toRow),
  };
}

export const LOGS_PAGE = 50;

export async function gatewayLogs(orgId: string, page: number, result?: string) {
  const where: Prisma.GatewayRequestWhereInput = { organizationId: orgId, ...(result && ["allowed", "redacted", "blocked", "error"].includes(result) ? { result } : {}) };
  const [rows, total] = await Promise.all([
    db.gatewayRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * LOGS_PAGE, take: LOGS_PAGE }),
    db.gatewayRequest.count({ where }),
  ]);
  return { rows: rows.map(toRow), total, pages: Math.max(1, Math.ceil(total / LOGS_PAGE)) };
}

export interface GwKeyRow {
  id: string;
  name: string;
  team: string;
  last4: string;
  provider: string;
  monthlyCapEur: number | null;
  allowedModels: string[];
  redactOverride: boolean | null;
  blockHealthOverride: boolean | null;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  spendMonthEur: number;
}

export async function gatewayKeys(orgId: string): Promise<GwKeyRow[]> {
  const [keys, spend] = await Promise.all([
    db.gatewayKey.findMany({ where: { organizationId: orgId, OR: [{ revokedAt: null }, { revokedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }] }, orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }] }),
    db.gatewayRequest.groupBy({ by: ["keyId"], where: { organizationId: orgId, createdAt: { gte: monthStartRome() } }, _sum: { costEur: true } }),
  ]);
  return keys.map((k) => ({
    id: k.id,
    name: k.name,
    team: k.team,
    last4: k.last4,
    provider: k.provider,
    monthlyCapEur: k.monthlyCapEur,
    allowedModels: k.allowedModels,
    redactOverride: k.redactOverride,
    blockHealthOverride: k.blockHealthOverride,
    createdBy: k.createdBy,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    spendMonthEur: spend.find((s) => s.keyId === k.id)?._sum.costEur ?? 0,
  }));
}

export interface GwUpstreamView {
  provider: GatewayProvider;
  keyLast4: string | null;
  /** La chiave viene dal connettore "AI provider keys" (chiave normale, non admin). */
  fromConnector: boolean;
  baseUrl: string | null;
  euHosted: boolean;
}

export interface GwPolicyView {
  policy: OrgPolicy;
  forcedEuOnly: "deployment" | "workspace" | null;
  upstreams: GwUpstreamView[];
  teams: string[];
  teamSpend: Record<string, number>;
}

export async function gatewayPolicyView(orgId: string): Promise<GwPolicyView> {
  const [row, org, ups, connectors, keyTeams, spend] = await Promise.all([
    db.gatewayPolicy.findUnique({ where: { organizationId: orgId } }),
    db.organization.findUnique({ where: { id: orgId }, select: { euOnly: true } }),
    db.gatewayUpstream.findMany({ where: { organizationId: orgId } }),
    db.connector.findMany({ where: { organizationId: orgId, provider: { in: ["OPENAI", "ANTHROPIC"] } }, select: { provider: true, credentialsEncrypted: true } }),
    db.gatewayKey.findMany({ where: { organizationId: orgId, revokedAt: null }, select: { team: true }, distinct: ["team"] }),
    db.gatewayRequest.groupBy({ by: ["team"], where: { organizationId: orgId, createdAt: { gte: monthStartRome() } }, _sum: { costEur: true } }),
  ]);
  const { decryptJson } = await import("@/lib/crypto");
  const policy = policyFromRow(row);
  const upstreams = (["openai", "anthropic"] as GatewayProvider[]).map((provider) => {
    const u = ups.find((x) => x.provider === provider);
    const conn = decryptJson<{ apiKey?: string }>(connectors.find((c) => c.provider === (provider === "openai" ? "OPENAI" : "ANTHROPIC"))?.credentialsEncrypted)?.apiKey;
    const connUsable = Boolean(conn && !conn.startsWith("sk-admin-") && !conn.startsWith("sk-ant-admin"));
    return {
      provider,
      keyLast4: u?.keyLast4 ?? (connUsable ? conn!.slice(-4) : null),
      fromConnector: !u?.keyLast4 && connUsable,
      baseUrl: u?.baseUrl ?? null,
      euHosted: u?.euHosted ?? false,
    };
  });
  const teams = Array.from(new Set([...keyTeams.map((k) => k.team), ...Object.keys(policy.teamCaps)].filter(Boolean))).sort();
  return {
    policy,
    forcedEuOnly: euOnlyDeployment() ? "deployment" : org?.euOnly ? "workspace" : null,
    upstreams,
    teams,
    teamSpend: Object.fromEntries(spend.map((s) => [s.team, s._sum.costEur ?? 0])),
  };
}

export async function gatewayCounts(orgId: string) {
  const [keys, policy] = await Promise.all([db.gatewayKey.count({ where: { organizationId: orgId, revokedAt: null } }), db.gatewayPolicy.findUnique({ where: { organizationId: orgId } })]);
  const p = policyFromRow(policy);
  const rules = [p.euOnly, p.redact, p.blockHealth, p.modelsRestricted, Object.keys(p.teamCaps).length > 0].filter(Boolean).length;
  return { keys, rules };
}
