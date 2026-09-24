"use client";

import { useReportError } from "@/components/ErrorReport";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useReportError(error);
  return (
    <div className="max-w-md mx-auto mt-24 text-center">
      <h1 className="text-lg font-semibold text-ink-100">Something went wrong on this page</h1>
      <p className="text-sm text-ink-400 mt-1">The error has been recorded{error.digest ? ` (reference ${error.digest})` : ""}. Try again, and if it keeps happening send us that reference.</p>
      <button onClick={reset} className="btn btn-secondary mt-5">Try again</button>
    </div>
  );
}
