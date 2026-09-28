import Link from "next/link";

const ITEMS = [
  { href: "/governance", label: "Overview" },
  { href: "/compliance", label: "AI Act" },
  { href: "/data", label: "Data exposure" },
  { href: "/activity", label: "Activity" },
];

// Le pagine di governance come un'unica sezione: una sola voce in sidebar,
// qui si passa da una all'altra.
export default function GovernanceNav({ active }: { active: string }) {
  return (
    <nav className="-mb-2 flex flex-wrap items-center gap-1 text-sm" aria-label="Governance">
      <span className="mr-2 text-ink-400">Governance</span>
      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`rounded-full px-3 py-1 transition-colors ${i.href === active ? "bg-ink-100/[0.08] text-ink-100 font-medium" : "text-ink-400 hover:text-ink-100 hover:bg-ink-100/[0.04]"}`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
