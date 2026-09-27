import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureWorkspaceToken } from "@/lib/discovery/ingest";

export const dynamic = "force-dynamic";

// L'app desktop si collega all'azienda con il codice del link aziendale
// (è nel nome del file scaricato): riceve il token del workspace.
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const code = String(params.code ?? "").slice(0, 60);
  const org = code.length >= 8 ? await db.organization.findUnique({ where: { joinCode: code } }) : null;
  if (!org) return NextResponse.json({ error: "Unknown company link." }, { status: 404 });
  const { token } = await ensureWorkspaceToken(org.id);
  return NextResponse.json({ token, company: org.name }, { headers: { "Cache-Control": "no-store" } });
}
