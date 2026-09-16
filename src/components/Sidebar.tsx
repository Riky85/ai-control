import Link from "next/link";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/assets", label: "AI Assets" },
  { href: "/connectors", label: "Connectors" },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-panel min-h-screen p-4 flex flex-col gap-1">
      <div className="px-2 py-3 mb-2">
        <div className="text-sm font-semibold tracking-tight text-white">AI Control</div>
        <div className="text-xs text-muted">Discover. Understand. Control.</div>
      </div>
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="px-3 py-2 rounded-md text-sm text-muted hover:text-white hover:bg-white/5 transition-colors"
        >
          {item.label}
        </Link>
      ))}
    </aside>
  );
}
