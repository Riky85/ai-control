import { NextResponse } from "next/server";
import { AI_SERVICES } from "@/lib/discovery/catalog";

// Elenco pubblico dei servizi AI riconoscibili (nessun dato del cliente).
export async function GET() {
  return NextResponse.json(
    { services: AI_SERVICES.map(({ id, name, vendor, domains, apps }) => ({ id, name, vendor, domains, apps: apps ?? [] })) },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
