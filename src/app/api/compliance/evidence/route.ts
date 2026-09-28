import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { buildEvidencePack, packFingerprint } from "@/lib/evidence-pack";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Evidence pack AI Act / NIS2 in JSON. Contiene il registro di audit, quindi
// come la pagina /audit è per admin e owner, sempre limitato all'azienda della sessione.
export async function GET() {
  const s = currentSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const member = await db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: s.orgId, email: s.email } }, select: { role: true } });
  if (!member || (member.role !== "ADMIN" && member.role !== "OWNER")) return NextResponse.json({ error: "Admins and owners only." }, { status: 403 });

  const pack = await buildEvidencePack(s.orgId, s.email);
  const fingerprint = packFingerprint(pack);
  await audit("compliance.evidence_pack", "json", { fingerprint });
  const slug = `${pack.organisation.name.replace(/[^a-z0-9]+/gi, "-")}-evidence-pack-${pack.generatedAt.slice(0, 10)}`.toLowerCase();
  const body = {
    ...pack,
    fingerprint: {
      algorithm: "sha256",
      of: "Canonical JSON (keys sorted, no whitespace) of this document without the fingerprint field",
      value: fingerprint,
    },
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
