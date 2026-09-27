import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { desktopDownload, osFromUserAgent, type DesktopOs } from "@/lib/desktop";

export const dynamic = "force-dynamic";

// Download pubblico dal link aziendale: il nome del file porta il codice,
// così l'app sa a quale azienda collegarsi senza chiedere nulla.
export async function GET(req: Request, { params }: { params: { code: string } }) {
  const code = String(params.code ?? "").slice(0, 60);
  const org = code.length >= 8 ? await db.organization.findUnique({ where: { joinCode: code }, select: { id: true } }) : null;
  if (!org) return NextResponse.json({ error: "Unknown company link." }, { status: 404 });
  const q = new URL(req.url).searchParams.get("os");
  const os: DesktopOs = q === "windows" || q === "mac" || q === "linux" ? q : osFromUserAgent(req.headers.get("user-agent"));
  const file = await desktopDownload(os, code);
  if (!file) return NextResponse.json({ error: "The desktop app is being prepared. Try again in a few minutes." }, { status: 503 });
  return new NextResponse(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.type,
      "Content-Disposition": `attachment; filename="${file.name}"`,
      "Content-Length": String(file.data.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
