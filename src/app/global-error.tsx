"use client";

import { useReportError } from "@/components/ErrorReport";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useReportError(error);
  return (
    <html lang="en">
      {/* Fuori dal layout normale: stili inline, colori del tema scuro. */}
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, background: "#202327", color: "#EDEDEF" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: "0 16px" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>angar hit an unexpected error</h1>
          <p style={{ color: "#9CA0A8", fontSize: 14 }}>It has been recorded{error.digest ? ` (reference ${error.digest})` : ""}.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 14px", borderRadius: 8, border: "1px solid #34383D", background: "#202327", color: "#EDEDEF", fontSize: 14, cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
