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
