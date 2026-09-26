import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { appOrigin } from "@/lib/mail";
import { accountingConnectLink, chiftConfigured } from "@/lib/connectors/chift";

export const dynamic = "force-dynamic";

// Porta alla pagina (Chift) dove il cliente sceglie e collega il proprio software di contabilità.
export async function GET(req: Request) {
  const s = await requireRole("ADMIN", "/sources");
  const origin = appOrigin(req.headers);
  if (!chiftConfigured()) return NextResponse.redirect(`${origin}/sources?error=${encodeURIComponent("Accounting software connections aren't enabled on this deployment yet.")}`);
  try {
    const org = await db.organization.findUniqueOrThrow({ where: { id: s.orgId } });
    return NextResponse.redirect(await accountingConnectLink(s.orgId, org.name, `${origin}/api/connectors/accounting/callback`));
  } catch (err) {
    return NextResponse.redirect(`${origin}/sources?error=${encodeURIComponent((err as Error).message)}`);
  }
}
