import { NextResponse } from "next/server";
import { readBodyLimited } from "@/lib/body-limit";
import { gunzipSync } from "zlib";
import { sensorForToken, tokenFrom } from "@/lib/edge/auth";
import { blockedFor, buildMatcher } from "@/lib/edge/config";
import { processEdgeBatch, touchSensor, utcDay } from "@/lib/edge/ingest";
import { aggregateLog } from "@/lib/edge/parse";
import { privacyModeOf } from "@/lib/privacy";

export const dynamic = "force-dynamic";

const MAX_BODY = 5_000_000;
const MAX_TEXT = 50_000_000; // dopo la decompressione

// Log inviati dal cloud (Cloudflare Gateway Logpush, Zscaler NSS, Cisco Umbrella, SIEM):
// testo, NDJSON, CSV o syslog, anche gzip. Si tengono solo le AI del catalogo.
export async function POST(req: Request) {
  const sensor = await sensorForToken(tokenFrom(req, true));
  if (!sensor) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  // Lettura a flusso con tetto: niente corpi enormi in memoria (Content-Length può mancare).
  const buf = await readBodyLimited(req, MAX_BODY);
  if (buf === null) return NextResponse.json({ error: "Too much data (max 5 MB in each request)." }, { status: 413 });

  let data = buf;
  const gz = /gzip/i.test(req.headers.get("content-encoding") ?? "") || (buf[0] === 0x1f && buf[1] === 0x8b);
  if (gz) {
    try {
      data = gunzipSync(buf, { maxOutputLength: MAX_TEXT });
    } catch {
      return NextResponse.json({ error: "Invalid or too large gzip body." }, { status: 400 });
    }
  }
  const text = data.toString("utf8");

  const anonymous = privacyModeOf(sensor.organization) === "anonymous";
  const matcher = buildMatcher(await blockedFor(sensor.organizationId));
  const agg = aggregateLog(text, matcher, { day: utcDay(), anonymous, prefix: "cloud" });
  await touchSensor(sensor, { logs: { lines: agg.lines, aiLines: agg.aiLines } });
  const result = await processEdgeBatch(sensor, { events: agg.events, candidates: agg.candidates.slice(0, 500), localModels: [] });
  return NextResponse.json({ ok: true, lines: agg.lines, aiLines: agg.aiLines, ...result });
}
