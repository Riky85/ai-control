import { db } from "@/lib/db";
import Link from "next/link";
import Badge from "@/components/Badge";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim() ?? "";

  const [assets, people] = q
    ? await Promise.all([
        db.aiAsset.findMany({
          where: { organizationId: ORG_ID, deletedAt: null, name: { contains: q, mode: "insensitive" } },
          include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
          take: 20,
        }),
        db.user.findMany({
          where: { organizationId: ORG_ID, name: { contains: q, mode: "insensitive" } },
          take: 10,
        }),
      ])
    : [[], []];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Search</h1>
        <p className="text-sm text-ink-400 mt-1.5">{q ? `Results for "${q}"` : "Type something in the sidebar search."}</p>
      </div>

      {q && (
        <>
          {assets.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-ink-400 mb-3">AI Passports</h2>
              <div className="rounded-xl border border-line bg-panel shadow-card divide-y divide-line">
                {assets.map((a) => (
                  <Link key={a.id} href={`/assets/${a.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-white/[0.03] transition-colors">
                    <span className="font-medium text-ink-100">{a.name}</span>
                    {a.riskAssessments[0] && <Badge>{a.riskAssessments[0].level}</Badge>}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {people.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-ink-400 mb-3">People</h2>
              <div className="rounded-xl border border-line bg-panel shadow-card divide-y divide-line">
                {people.map((p) => (
                  <Link key={p.id} href={`/people/${p.id}`} className="flex items-center px-4 py-3 text-sm hover:bg-white/[0.03] transition-colors">
                    <span className="font-medium text-ink-100">{p.name ?? p.email}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {assets.length === 0 && people.length === 0 && (
            <div className="rounded-xl border border-line bg-panel shadow-card p-5 text-sm text-ink-400">
              No matches for "{q}".
            </div>
          )}
        </>
      )}
    </div>
  );
}
