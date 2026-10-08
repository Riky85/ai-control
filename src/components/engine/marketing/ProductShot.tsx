import ScoreMock from "@/components/engine/marketing/ScoreMock";
import { fmtEur } from "@/lib/format";

/**
 * "Foto del prodotto" per l'hero: finestra con barra del titolo, Angar Score
 * (numero, livello e le 5 dimensioni), la prima azione e una riga di
 * risparmio. Dati illustrativi.
 */
export default function ProductShot() {
  return (
    <div className="relative w-full max-w-[520px] mx-auto">
      <figure className="relative rounded-2xl border border-line bg-panel shadow-[0_1px_2px_rgba(20,20,24,0.04),0_24px_48px_-24px_rgba(20,20,24,0.22)] overflow-hidden">
        {/* Barra della finestra */}
        <div className="flex items-center gap-3 border-b border-line px-4 h-10">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-ink-100/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink-100/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink-100/10" />
          </span>
          <span className="flex-1 flex justify-center">
            <span className="rounded-md bg-ink-100/[0.04] px-3 py-0.5 text-[11px] text-ink-400">angar · Score</span>
          </span>
          <span className="w-[42px]" aria-hidden />
        </div>

        <div className="p-3.5 sm:p-5 flex flex-col gap-4">
          <ScoreMock compact />
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-xs">
            <span className="text-ink-100 min-w-0 truncate">Remove 9 inactive ChatGPT seats</span>
            <span className="tabular text-ink-100 font-medium shrink-0">+5 points</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 sm:px-5 py-2.5 text-xs">
          <span className="flex items-center gap-2 text-ink-400">
            <span className="h-1.5 w-1.5 rounded-full bg-steady" aria-hidden />
            Verified on bills
          </span>
          <span className="tabular text-ink-100">
            <b className="font-semibold">{fmtEur(1240)}</b> <span className="text-ink-400">a month</span>
          </span>
        </div>
        <figcaption className="sr-only">Example company: Angar Score 82 out of 100, Good.</figcaption>
      </figure>
    </div>
  );
}
