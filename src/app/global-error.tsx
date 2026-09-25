"use client";

import { useReportError } from "@/components/ErrorReport";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useReportError(error);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ fontSize: 18 }}>angar hit an unexpected error</h1>
          <p style={{ color: "#5F5F69", fontSize: 14 }}>It has been recorded{error.digest ? ` (reference ${error.digest})` : ""}.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 14px", borderRadius: 8, border: "1px solid #E6E6EB", background: "#fff", cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
