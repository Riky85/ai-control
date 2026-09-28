import { currentSession } from "@/lib/auth";
import { myGroups, intercompany } from "@/lib/groups";
import { currentMonth, monthRange } from "@/lib/chargeback";
import { deNumber, toCsv } from "@/lib/accounting-export";

export const dynamic = "force-dynamic";

/** Chargeback intercompany del gruppo: ?id=<gruppo>&month=aaaa-mm. Solo società che l'utente amministra. */
export async function GET(req: Request) {
  const s = currentSession();
  if (!s) return new Response("Not signed in", { status: 401 });
  const url = new URL(req.url);
  const month = url.searchParams.get("month") || currentMonth();
  if (!monthRange(month)) return new Response("Invalid month — use YYYY-MM", { status: 400 });
  const { groups } = await myGroups(s.email);
  const group = groups.find((g) => g.id === url.searchParams.get("id"));
  if (!group) return new Response("Group not found", { status: 404 });

  const rows = await intercompany(group.entities, month);
  const total = rows.reduce((t, r) => t + r.eur, 0);
  const csv = toCsv(
    ["Month", "Group", "Entity", "Country", "AI cost EUR", "From charges EUR", "At current monthly cost EUR"],
    [
      ...rows.map((r) => [month, group.name, r.name, r.country ?? "", deNumber(r.eur), deNumber(r.actualEur), deNumber(r.runRateEur)]),
      [month, group.name, "Total", "", deNumber(total), "", ""],
    ]
  );
  const slug = `${group.name.replace(/[^a-z0-9]+/gi, "-")}-intercompany-ai-${month}`.toLowerCase();
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}.csv"`, "Cache-Control": "no-store" },
  });
}
