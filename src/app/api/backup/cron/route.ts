import { timingSafeEqual } from "node:crypto";
import { createBackup, backupFilename } from "@/lib/backup";

export const dynamic = "force-dynamic";

// Chiamato dalla funzione notturna su Railway, che poi salva il file nel
// bucket. Protetto da BACKUP_TOKEN (header Authorization: Bearer …).
export async function POST(req: Request) {
  const expected = process.env.BACKUP_TOKEN;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { buffer } = await createBackup("scheduled");
  return new Response(buffer, { headers: { "Content-Type": "application/gzip", "X-Backup-Filename": backupFilename() } });
}
