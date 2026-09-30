"use client";

import { useEffect } from "react";

export function useReportError(error: Error & { digest?: string }) {
  useEffect(() => {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message, digest: error.digest, stack: error.stack, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);
}

/**
 * Dopo un rilascio, una scheda rimasta aperta può mescolare codice vecchio e
 * nuovo (errori tipo "n is not a function"). Un ricaricamento risolve: lo
 * facciamo da soli, una volta al massimo ogni minuto per non entrare in loop.
 * Restituisce true se sta ricaricando (così la pagina d'errore non lampeggia).
 */
export function useAutoRecover(error: Error): boolean {
  const KEY = "angar:auto-reload";
  let reloading = false;
  if (typeof window !== "undefined") {
    try {
      const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
      reloading = Date.now() - last > 60_000;
    } catch {
      reloading = false;
    }
  }
  useEffect(() => {
    if (!reloading) return;
    try {
      window.sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error, reloading]);
  return reloading;
}
