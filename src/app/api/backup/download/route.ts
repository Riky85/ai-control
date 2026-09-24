import { createBackup, backupFilename } from "@/lib/backup";
import { currentSession, isPlatformAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Download manuale del backup completo — solo admin di piattaforma.
export async function GET() {
  const s = currentSession();
  if (!s || !(await isPlatformAdmin(s.email))) return new Response("Forbidden", { status: 403 });
  const { buffer, tables, rows } = await createBackup("manual download");
  await audit("backup.download", undefined, { tables, rows, bytes: buffer.length });
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${backupFilename()}"`,
      "Cache-Control": "no-store",
    },
  });
}
