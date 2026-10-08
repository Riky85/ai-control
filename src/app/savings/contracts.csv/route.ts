import { NextResponse } from "next/server";
import { currentSession, activeMember } from "@/lib/auth";
import { contractRows, contractsCsv } from "@/lib/contracts";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Registro contratti in CSV (vista Contracts di /savings). Solo il proprio workspace.
export async function GET() {
  const s = currentSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // La sessione da sola non basta: serve essere ancora membri attivi del workspace.
  if (!(await activeMember(s))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const csv = contractsCsv(await contractRows(s.orgId));
  await audit("export.contracts", "csv");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="angar-contracts-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
