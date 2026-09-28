import Link from "next/link";

// Pagina inesistente (o un'AI / persona che non appartiene a questo workspace).
export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center flex flex-col items-center gap-4">
        <span className="font-display text-[56px] leading-none font-semibold tracking-tight text-accent tabular">404</span>
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink-100">This page doesn&apos;t exist</h1>
          <p className="text-sm text-ink-400 mt-1.5">The link may be old, or what it pointed to was removed or belongs to another workspace.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/" className="btn btn-primary">Go to Overview</Link>
          <Link href="/docs" className="btn btn-secondary">Documentation</Link>
        </div>
      </div>
    </div>
  );
}
