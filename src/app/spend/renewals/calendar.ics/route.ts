import { NextResponse } from "next/server";
import { currentSession, activeMember } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/alerts";
import { fmtDate, fmtEur } from "@/lib/format";
import { buildIcs, renewalCalendar, type IcsEvent } from "@/lib/renewals-calendar";

export const dynamic = "force-dynamic";

/**
 * Scadenze di preavviso in formato .ics (da importare o aggiungere al calendario).
 * Con ?asset=<id> un solo evento ("Set reminder"): la scadenza del preavviso se c'è,
 * altrimenti il rinnovo, con un promemoria 7 giorni prima. Solo il proprio workspace.
 */
export async function GET(req: Request) {
  const s = currentSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await activeMember(s))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const asset = new URL(req.url).searchParams.get("asset");
  if (asset != null && !/^[A-Za-z0-9_-]{1,64}$/.test(asset)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { rows } = await renewalCalendar(s.orgId);
  const base = appUrl();
  const events: IcsEvent[] = [];
  for (const r of rows) {
    if (asset && r.assetId !== asset) continue;
    const yearly = r.yearlyEur ? ` About ${fmtEur(r.yearlyEur)} a year.` : "";
    const owner = r.owner ? ` Owner: ${r.owner}.` : "";
    if (r.noticeBy) {
      events.push({
        uid: `notice-${r.assetId}-${r.noticeBy.toISOString().slice(0, 10)}@angar`,
        date: r.noticeBy,
        summary: `Notice deadline: ${r.name}`,
        description: `Last day to cancel or reduce ${r.name}. The contract ${r.endsOnly ? "ends" : "renews"} on ${fmtDate(r.date)}.${yearly}${owner}`,
        url: `${base}/negotiate/${r.assetId}`,
        alarmDays: 7,
      });
    } else if (asset) {
      events.push({
        uid: `renewal-${r.assetId}-${r.date.toISOString().slice(0, 10)}@angar`,
        date: r.date,
        summary: `${r.endsOnly ? "Ends" : "Renews"}: ${r.name}`,
        description: `${r.name} ${r.endsOnly ? "ends" : "renews"} on ${fmtDate(r.date)}.${yearly}${owner}`,
        url: `${base}/negotiate/${r.assetId}`,
        alarmDays: 7,
      });
    }
  }
  if (asset && !events.length) return NextResponse.json({ error: "No upcoming renewal for that AI system" }, { status: 404 });
  await audit("export.renewals_ics", asset ? "reminder" : "notice deadlines", { events: events.length, ...(asset ? { assetId: asset } : {}) });
  const name = asset ? `angar-reminder-${asset}.ics` : `angar-notice-deadlines-${new Date().toISOString().slice(0, 10)}.ics`;
  return new NextResponse(buildIcs(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
