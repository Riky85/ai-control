import { PageHeader } from "@/components/ui";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Link from "next/link";
import { VendorBadge } from "@/components/VendorIcon";
import { NAV_PAGES, fuzzyScore } from "@/lib/search-index";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";

export const dynamic = "force-dynamic";

// Pagina di ricerca completa (fallback: la ricerca principale è la palette
// Ctrl-K). Stesso scorer fuzzy dell'API.
export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim() ?? "";
  const orgId = currentOrgId();

  const [assets, people] = q
    ? await Promise.all([
        db.aiAsset.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true, vendor: true }, take: 2000 }),
        // Le persone si cercano solo con la privacy "per persona".
        showsPeople(await orgPrivacyMode(orgId)) ? db.user.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, email: true, department: true }, take: 2000 }) : Promise.resolve([]),
      ])
    : [[], []];

  const ai = assets
    .map((a) => ({ a, s: Math.max(fuzzyScore(q, a.name), a.vendor ? fuzzyScore(q, a.vendor) - 15 : 0) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 30);
  const persons = people
    .map((u) => ({ u, s: Math.max(fuzzyScore(q, u.name ?? u.email), fuzzyScore(q, u.email) - 5) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 30);
  const pages = NAV_PAGES.map((p) => ({ p, s: Math.max(fuzzyScore(q, p.label), fuzzyScore(q, p.keywords) - 25) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 8);

  const empty = ai.length === 0 && persons.length === 0 && pages.length === 0;
  // Senza ricerca: le pagine più usate, per partire da qualcosa.
  const QUICK = ["/savings", "/usage", "/review", "/providers", "/report", "/compliance"];
  const quick = q ? [] : QUICK.map((h) => NAV_PAGES.find((p) => p.href === h)).filter((p): p is (typeof NAV_PAGES)[number] => !!p);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Search" subtitle={q ? `Results for "${q}"` : "Press Ctrl-K anywhere for instant search."} />

      <form action="/search" method="get" className="flex items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Search AI, people, pages…" aria-label="Search" className="field flex-1 min-w-0 max-w-xl" />
        <button className="btn btn-secondary">Search</button>
      </form>

      {q && empty && (
        <div className="rounded-xl border border-line bg-panel p-5 text-sm text-ink-400">
          No matches for &ldquo;{q}&rdquo; — try a provider name, or browse <Link href="/#your-ai" className="underline hover:text-ink-100">all your AI</Link>.
        </div>
      )}

      {quick.length > 0 && (
        <Group title="Jump to">
          {quick.map((p) => (
            <Link key={p.href} href={p.href} className="flex items-center justify-between px-4 py-3 text-sm text-ink-100 hover:bg-ink-100/[0.02] transition-colors">
              {p.label}
              <span className="text-ink-400">→</span>
            </Link>
          ))}
        </Group>
      )}

      {ai.length > 0 && (
        <Group title="AI systems">
          {ai.map(({ a }) => (
            <Link key={a.id} href={`/assets/${a.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-ink-100/[0.02] transition-colors">
              <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={26} />
              <span className="font-medium text-ink-100 truncate min-w-0">{a.name}</span>
              {a.vendor && <span className="text-ink-400 truncate min-w-0">· {a.vendor}</span>}
            </Link>
          ))}
        </Group>
      )}
      {persons.length > 0 && (
        <Group title="People">
          {persons.map(({ u }) => (
            <Link key={u.id} href={`/people/${u.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-ink-100/[0.02] transition-colors">
              <span className="font-medium text-ink-100 truncate min-w-0">{u.name ?? u.email}</span>
              <span className="text-ink-400 truncate min-w-0 shrink">{u.department ?? u.email}</span>
            </Link>
          ))}
        </Group>
      )}
      {pages.length > 0 && (
        <Group title="Pages">
          {pages.map(({ p }) => (
            <Link key={p.href} href={p.href} className="flex items-center px-4 py-3 text-sm text-ink-100 hover:bg-ink-100/[0.02] transition-colors">
              {p.label}
            </Link>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="rounded-xl border border-line bg-panel divide-y divide-line overflow-hidden">
        <h2 className="px-5 py-3 text-sm font-semibold text-ink-100">{title}</h2>{children}</div>
    </div>
  );
}
