/**
 * Anteprima di una richiesta per l'amministratore: voce del catalogo e prezzo di listino,
 * AI già presenti nella stessa categoria (rischio di doppioni), suggerimento sul rischio dei dati.
 * Solo letture, sempre limitate all'azienda.
 */
import { db } from "@/lib/db";
import { AI_SERVICES, matchDomain, type AiService } from "@/lib/discovery/catalog";
import { matchMerchant } from "@/lib/pricing/merchants";
import { CATEGORY_LABEL, SERVICE_CATEGORY, estimateMonthlyEur } from "@/lib/pricing/catalog";
import { dataRisk } from "./types";

/** Servizio del catalogo per nome, fornitore o link (il link vince: è il più preciso). */
export function matchService(r: { name: string; vendor?: string | null; url?: string | null }): AiService | null {
  if (r.url) {
    try {
      const u = new URL(r.url);
      const hit = matchDomain(`${u.hostname}${u.pathname}`);
      if (hit) return hit;
    } catch {
      /* link non valido: si prova col nome */
    }
  }
  const n = r.name.trim().toLowerCase();
  const exact = AI_SERVICES.find((s) => s.name.toLowerCase() === n || s.id === n);
  if (exact) return exact;
  const id = matchMerchant(`${r.name} ${r.vendor ?? ""}`);
  return id ? AI_SERVICES.find((s) => s.id === id) ?? null : null;
}

export interface RequestPreview {
  service: { id: string; name: string; vendor: string } | null;
  category: string | null;
  /** Listino per gli utenti attesi (piano business più comune), EUR al mese. */
  listPrice: { eur: number; plan: string; users: number } | null;
  /** L'AI c'è già nell'estate (stesso servizio o stesso nome). */
  existing: { id: string; name: string; status: string } | null;
  /** Altre AI nella stessa categoria: rischio di doppioni. */
  overlap: { id: string; name: string; status: string; users: number }[];
  risk: ReturnType<typeof dataRisk>;
}

type Req = { name: string; vendor: string | null; url: string | null; expectedUsers: number | null; dataTypes: string[] };

/** Anteprime di più richieste con una sola lettura dell'estate. */
export async function previewRequests(organizationId: string, reqs: (Req & { id: string })[]): Promise<Map<string, RequestPreview>> {
  const out = new Map<string, RequestPreview>();
  if (!reqs.length) return out;
  const assets = await db.aiAsset.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, name: true, status: true, serviceId: true, _count: { select: { usages: true } } },
    take: 2000,
  });
  for (const r of reqs) {
    const svc = matchService(r);
    const cat = svc ? SERVICE_CATEGORY[svc.id] ?? null : null;
    const price = svc ? estimateMonthlyEur(svc.id, Math.max(1, r.expectedUsers ?? 1)) : null;
    const nameLc = r.name.trim().toLowerCase();
    const existing = assets.find((a) => (svc && a.serviceId === svc.id) || a.name.trim().toLowerCase() === nameLc) ?? null;
    const overlap = cat
      ? assets
          .filter((a) => a.id !== existing?.id && a.serviceId && a.serviceId !== svc?.id && SERVICE_CATEGORY[a.serviceId] === cat && a.status !== "UNAPPROVED")
          .sort((a, b) => b._count.usages - a._count.usages)
          .slice(0, 5)
          .map((a) => ({ id: a.id, name: a.name, status: a.status, users: a._count.usages }))
      : [];
    out.set(r.id, {
      service: svc ? { id: svc.id, name: svc.name, vendor: svc.vendor } : null,
      category: cat ? CATEGORY_LABEL[cat] : null,
      listPrice: price ? { eur: price.eur, plan: price.plan.name, users: Math.max(1, r.expectedUsers ?? 1) } : null,
      existing: existing ? { id: existing.id, name: existing.name, status: existing.status } : null,
      overlap,
      risk: dataRisk(r.dataTypes),
    });
  }
  return out;
}
