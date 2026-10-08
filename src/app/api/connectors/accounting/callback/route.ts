import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { appOrigin } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { syncAccounting } from "@/lib/connectors/chift";

export const dynamic = "force-dynamic";

// Ritorno dalla pagina di collegamento: primo import delle fatture passive.
export async function GET(req: Request) {
  const origin = appOrigin(req.headers);
  // Solo Admin, come l'avvio del collegamento.
  const s = await requireRole("ADMIN", "/sources");
  await audit("connector.connect", "ACCOUNTING");
  try {
    const r = await syncAccounting(s.orgId);
    return NextResponse.redirect(`${origin}/?spend=${r.services}`);
  } catch (err) {
    return NextResponse.redirect(`${origin}/sources?error=${encodeURIComponent(`Connected. The first import will run shortly (${(err as Error).message}).`)}`);
  }
}
