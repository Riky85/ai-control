"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { locate } from "@/lib/areas";

// Schede dell'area corrente, sopra il titolo della pagina: una voce in sidebar,
// qui si passa da una pagina all'altra dell'area.
export default function AreaTabs() {
  const pathname = usePathname();
  const here = locate(pathname);
  if (!here || here.area.tabs.length < 2) return null;
  return (
    <nav className="print:hidden mb-5 flex flex-wrap items-center gap-1 text-sm lg:pr-[8.25rem]" aria-label={here.area.label}>
      {here.area.tabs.map((t) => {
        const active = t === here.tab;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-full px-3 py-1 transition-colors ${active ? "bg-ink-100/[0.08] text-ink-100 font-medium" : "text-ink-400 hover:text-ink-100 hover:bg-ink-100/[0.04]"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
