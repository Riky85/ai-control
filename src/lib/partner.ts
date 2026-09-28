/**
 * Console partner (commercialisti, MSP): i numeri chiave di ogni workspace
 * cliente di cui l'utente è membro. Mai workspace di altri.
 */
import { db } from "@/lib/db";
import { computeSavings, monthlyOf } from "@/lib/savings";
import { EDGE, planById, partnerPrice } from "@/lib/plans";
import { privacyModeOf, type PrivacyMode } from "@/lib/privacy";
import type { Plan } from "@prisma/client";

const ONLINE_MS = 70 * 60 * 1000;

export interface PartnerClient {
  id: string;
  name: string;
  plan: string;
  role: string;
  current: boolean;
  aiCount: number;
  monthlySpend: number;
  canSave: number;
  toReview: number;
  computersOnline: number;
  unreadAlerts: number;
  // angar Edge
  edgeSensors: number;
  edgeOnline: number;
  edgeAiQueries7d: number;
  edgeBlocked7d: number;
  edgeDevices: number;
  privacyMode: PrivacyMode;
  /** Gestito dal partner corrente (managedByPartnerId === workspace corrente). */
  managedByMe: boolean;
  /** Gestito da un altro partner. */
  managedByOther: boolean;
}

/** Filtro unico: solo workspace in cui l'utente è membro attivo (più quello corrente). */
function memberWhere(email: string, currentOrgId: string) {
  return {
    OR: [{ members: { some: { email, status: "active" } } }, { id: currentOrgId, members: { some: { email } } }],
  };
}

const edgeOnlineSince = () => new Date(Date.now() - EDGE.onlineMinutes * 60 * 1000);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function partnerClients(email: string, currentOrgId: string): Promise<PartnerClient[]> {
  // Solo membri attivi (più il workspace corrente, a cui la sessione dà già accesso).
  const orgs = await db.organization.findMany({
    where: memberWhere(email, currentOrgId),
    select: {
      id: true,
      name: true,
      plan: true,
      privacyMode: true,
      managedByPartnerId: true,
      edgeDevices: true,
      members: { where: { email }, select: { role: true } },
    },
  });
  const since = new Date(Date.now() - ONLINE_MS);
  const ids = orgs.map((o) => o.id);
  const edgeSince = edgeOnlineSince();
  // Sensori ed eventi Edge: una query aggregata per tutti i clienti, non una per cliente.
  const [sensorsAll, sensorsOnline, events] = await Promise.all([
    db.edgeSensor.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: ids } },
      _count: { _all: true },
    }),
    db.edgeSensor.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: ids }, lastSeenAt: { gte: edgeSince } },
      _count: { _all: true },
    }),
    db.edgeEvent.groupBy({
      by: ["organizationId"],
      where: {
        organizationId: { in: ids },
        day: { gte: dayKey(new Date(Date.now() - 6 * 86400_000)) },
      },
      _sum: { hits: true, blocked: true },
    }),
  ]);
  const countOf = (rows: { organizationId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.organizationId === id)?._count._all ?? 0;
  const rows = await Promise.all(
    orgs.map(async (o) => {
      // computeSavings carica già le AI (stesso filtro di loadAssets): niente doppia query.
      const [{ totalMonthly, assets }, toReview, computersOnline, unreadAlerts] = await Promise.all([
        computeSavings(o.id),
        db.aiAsset.count({
          where: {
            organizationId: o.id,
            deletedAt: null,
            status: { in: ["UNKNOWN", "UNREVIEWED"] },
          },
        }),
        db.desktopDevice.count({
          where: { organizationId: o.id, lastSeenAt: { gte: since } },
        }),
        db.alert.count({ where: { organizationId: o.id, readAt: null } }),
      ]);
      const ev = events.find((e) => e.organizationId === o.id);
      const monthlySpend = assets.reduce((t, a) => t + (monthlyOf(a)?.eur ?? 0), 0);
      return {
        id: o.id,
        name: o.name,
        plan: o.plan,
        role: o.members[0]?.role ?? "VIEWER",
        current: o.id === currentOrgId,
        aiCount: assets.length,
        monthlySpend,
        canSave: totalMonthly,
        toReview,
        computersOnline,
        unreadAlerts,
        edgeSensors: countOf(sensorsAll, o.id),
        edgeOnline: countOf(sensorsOnline, o.id),
        edgeAiQueries7d: ev?._sum.hits ?? 0,
        edgeBlocked7d: ev?._sum.blocked ?? 0,
        edgeDevices: o.edgeDevices,
        privacyMode: privacyModeOf(o),
        managedByMe: o.managedByPartnerId === currentOrgId && o.id !== currentOrgId,
        managedByOther: !!o.managedByPartnerId && o.managedByPartnerId !== currentOrgId,
      } satisfies PartnerClient;
    })
  );
  return rows.sort((a, b) => b.canSave - a.canSave || b.monthlySpend - a.monthlySpend || a.name.localeCompare(b.name));
}

// ── Flotta Edge ─────────────────────────────────────────────────────────
export interface FleetSensor {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  kind: string;
  online: boolean;
  version: string | null;
  lastSeenAt: Date | null;
  blockEnabled: boolean;
  /** Dispositivo angar collegato (solo sensori "device"). */
  device: { serial: string; model: string } | null;
}

/** Tutti i sensori Edge nei workspace cliente dell'utente (stesso filtro di partnerClients). */
export async function partnerFleet(email: string, currentOrgId: string): Promise<FleetSensor[]> {
  const since = edgeOnlineSince();
  const sensors = await db.edgeSensor.findMany({
    where: { organization: memberWhere(email, currentOrgId) },
    select: {
      id: true,
      name: true,
      kind: true,
      version: true,
      lastSeenAt: true,
      blockEnabled: true,
      organization: { select: { id: true, name: true } },
      device: { select: { serial: true, model: true } },
    },
    orderBy: [{ lastSeenAt: { sort: "desc", nulls: "last" } }],
    take: 500,
  });
  return sensors
    .map((x) => ({
      id: x.id,
      clientId: x.organization.id,
      clientName: x.organization.name,
      name: x.name,
      kind: x.kind,
      // Un sensore "device" senza box (reso) non riceve più dati: offline.
      online: !!x.lastSeenAt && x.lastSeenAt >= since && !(x.kind === "device" && !x.device),
      version: x.version,
      lastSeenAt: x.lastSeenAt,
      blockEnabled: x.blockEnabled,
      device: x.device,
    }))
    .sort((a, b) => Number(a.online) - Number(b.online) || a.clientName.localeCompare(b.clientName) || a.name.localeCompare(b.name));
}

// ── Economia partner (stima) ────────────────────────────────────────────
export interface PartnerEconomicsRow {
  clientId: string;
  clientName: string;
  plan: string;
  planList: number | null; // €/mese a listino, null = Enterprise su richiesta
  edgeDevices: number;
  list: number; // quanto paga il cliente a listino
  cost: number; // quanto paga il partner (sconto partner)
  margin: number;
}

/**
 * Stima del ricavo ricorrente mensile per i clienti gestiti: il cliente paga
 * a listino, il partner compra con lo sconto partner; la differenza è il
 * margine. Software Edge incluso da Growth: nessun costo aggiuntivo.
 */
export function partnerEconomics(clients: PartnerClient[]): {
  rows: PartnerEconomicsRow[];
  total: { list: number; cost: number; margin: number };
} {
  const rows = clients
    .filter((c) => c.managedByMe)
    .map((c) => {
      const planList = planById(c.plan as Plan).price;
      const list = (planList ?? 0) + c.edgeDevices * EDGE.pricePerDevice;
      const cost = partnerPrice(planList ?? 0) + c.edgeDevices * partnerPrice(EDGE.pricePerDevice);
      return {
        clientId: c.id,
        clientName: c.name,
        plan: c.plan,
        planList,
        edgeDevices: c.edgeDevices,
        list,
        cost,
        margin: list - cost,
      };
    });
  const total = rows.reduce(
    (t, r) => ({
      list: t.list + r.list,
      cost: t.cost + r.cost,
      margin: t.margin + r.margin,
    }),
    { list: 0, cost: 0, margin: 0 }
  );
  return { rows, total };
}
