import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import FilterBar from "@/components/FilterBar";
import { bankConfigured, listBanks, type Bank } from "@/lib/connectors/bank";
import { startBankAuthAction } from "@/lib/spend-actions";

export const dynamic = "force-dynamic";

const COUNTRIES = [
  ["IT", "Italy"], ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["NL", "Netherlands"], ["BE", "Belgium"], ["AT", "Austria"],
  ["PT", "Portugal"], ["IE", "Ireland"], ["FI", "Finland"], ["SE", "Sweden"], ["DK", "Denmark"], ["NO", "Norway"], ["PL", "Poland"],
  ["LT", "Lithuania"], ["LV", "Latvia"], ["EE", "Estonia"],
] as const;

// Scelta della banca: l'autorizzazione avviene sul sito della banca, in sola lettura.
export default async function BankPage({ searchParams }: { searchParams: { country?: string; q?: string; error?: string } }) {
  const org = await db.organization.findUnique({ where: { id: currentOrgId() } });
  const country = (searchParams.country ?? org?.country ?? "IT").toUpperCase();
  let banks: Bank[] = [];
  let error = searchParams.error ?? null;
  if (bankConfigured()) {
    try {
      banks = await listBanks(country);
    } catch (err) {
      error = (err as Error).message;
    }
  }
  const q = searchParams.q?.toLowerCase().trim();
  const shown = banks.filter((b) => !q || b.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "Sources", href: "/sources" }]}
        title="Connect your bank"
        subtitle="Read-only access for 90 days, approved on your bank's own site. angar keeps only AI charges — every other movement is ignored."
      />
      {!bankConfigured() && (
        <div className="rounded-xl border border-line bg-ink px-4 py-3 text-sm text-ink-400">
          Bank connections aren't enabled on this deployment yet. Meanwhile, <Link href="/sources" className="underline text-ink-100">upload a statement</Link> — it takes a minute.
        </div>
      )}
      {error && <div className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{error}</div>}
      <div className="flex items-center gap-2 flex-wrap">
        {COUNTRIES.map(([code, name]) => (
          <Link key={code} href={`/sources/bank?country=${code}`} className={`btn btn-sm ${code === country ? "btn-primary" : "btn-secondary"}`}>
            {name}
          </Link>
        ))}
      </div>
      {bankConfigured() && (
        <>
          <FilterBar search={{ placeholder: "Find your bank" }} right={`${shown.length} banks`} />
          <div className="grid grid-cols-3 gap-3">
            {shown.slice(0, 90).map((b) => (
              <form key={b.name} action={startBankAuthAction}>
                <input type="hidden" name="name" value={b.name} />
                <input type="hidden" name="country" value={b.country} />
                <button className="w-full rounded-xl border border-line bg-panel px-4 py-3 flex items-center gap-3 text-left hover:border-ink-400 transition-colors">
                  {b.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logo} alt="" className="h-8 w-8 rounded-md object-contain bg-white p-0.5" />
                  ) : (
                    <span className="h-8 w-8 rounded-md bg-ink" />
                  )}
                  <span className="text-sm font-medium text-ink-100 truncate">{b.name}</span>
                </button>
              </form>
            ))}
          </div>
          {shown.length === 0 && <p className="text-sm text-ink-400">No bank matches — try another country or name.</p>}
        </>
      )}
    </div>
  );
}
