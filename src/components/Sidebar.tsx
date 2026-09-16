import Link from "next/link";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/assets", label: "AI Assets" },
  { href: "/connectors", label: "Connectors" },
  { href: "/evidence", label: "Evidence" },
];

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-line bg-panel min-h-screen px-5 py-7 flex flex-col gap-1">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-signal opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
          </span>
          <span className="font-display font-semibold text-[15px] tracking-tight text-ink-100">
            AI Control
          </span>
        </div>
        <p className="text-xs text-ink-400 leading-snug pl-4">
          Discover what's running. Understand what it touches.
        </p>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-3 py-2 rounded text-sm text-ink-400 hover:text-ink-100 hover:bg-white/[0.04] transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
