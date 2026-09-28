import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { NAV_PAGES, fuzzyScore } from "@/lib/search-index";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";

export const dynamic = "force-dynamic";

export type SearchHit = { type: "ai" | "person" | "page"; label: string; sub?: string; href: string; vendor?: string | null };

// Ricerca istantanea e "intelligente": AI, persone e pagine, con punteggio
// fuzzy (uguale/inizia-con/sottostringa/sottosequenza). Tutto in-memory su dati
// già limitati per organizzazione — niente query per battitura oltre a due read.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ hits: [] });
  const orgId = currentOrgId();

  // Le persone si cercano solo con la privacy "per persona".
  const people = showsPeople(await orgPrivacyMode(orgId));
  const [assets, users] = await Promise.all([
    db.aiAsset.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true, vendor: true }, take: 2000 }),
    people ? db.user.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, email: true, department: true }, take: 2000 }) : Promise.resolve([]),
  ]);

  const scored: (SearchHit & { score: number })[] = [];

  for (const a of assets) {
    const score = Math.max(fuzzyScore(q, a.name), a.vendor ? fuzzyScore(q, a.vendor) - 15 : 0);
    if (score > 0) scored.push({ type: "ai", label: a.name, sub: a.vendor ?? undefined, href: `/assets/${a.id}`, vendor: a.vendor, score });
  }
  for (const u of users) {
    const name = u.name ?? u.email;
    const score = Math.max(fuzzyScore(q, name), fuzzyScore(q, u.email) - 5);
    if (score > 0) scored.push({ type: "person", label: name, sub: u.department ?? u.email, href: `/people/${u.id}`, score });
  }
  for (const p of NAV_PAGES) {
    const score = Math.max(fuzzyScore(q, p.label), fuzzyScore(q, p.keywords) - 25);
    if (score > 0) scored.push({ type: "page", label: p.label, href: p.href, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const hits = scored.slice(0, 24).map(({ score, ...h }) => h);
  return NextResponse.json({ hits });
}
