import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Usato quando la sessione non è più valida (es. membro rimosso dal workspace).
export function GET(req: Request) {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", new URL(req.url).searchParams.get("reason") ?? "Please sign in again.");
  const res = NextResponse.redirect(url);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
