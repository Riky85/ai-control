import Link from "next/link";
import { Panel } from "@/components/ui";
import { loadMarketFeed } from "@/lib/market/service";
import { changeHeadline, impactLine } from "@/lib/market/format";

/**
 * Overview — "AI estate changes": solo i cambiamenti del mercato che toccano materialmente
 * l'azienda (massimo 4). Niente da mostrare = niente blocco. Componente autonomo (server).
 */
export default async function MarketChangesBlock({ orgId, max = 4 }: { orgId: string; max?: number }) {
  const now = new Date();
  const rows = await loadMarketFeed(orgId, { now }).catch(() => []);
  if (!rows.length) return null;
  return (
    <Panel title="AI estate changes" flush action={<Link href="/market" className="eyebrow hover:!text-ink-100 transition-colors">See all [→]</Link>}>
      <div className="divide-y divide-line">
        {rows.slice(0, max).map((r) => {
          const h = changeHeadline(r.change, now);
          return (
            <Link key={r.id} href={`/market/${r.change.id}`} className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-0.5 px-5 py-3 text-sm hover:bg-ink/60 transition-colors">
              <span className="text-ink-100 min-w-0 sm:flex-1 truncate">
                <span className="eyebrow mr-2">{h.provider} · {h.subject}</span>
                <span>{h.change}</span>
              </span>
              <span className="text-ink-400 text-xs whitespace-nowrap tabular">{impactLine(r)}</span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}
