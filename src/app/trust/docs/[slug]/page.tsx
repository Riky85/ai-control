import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentSession } from "@/lib/auth";
import PrintButton from "@/components/PrintButton";
import { TrustFooter, TrustHeader, TRUST_REVIEWED } from "@/components/trust/TrustChrome";
import { DISCLAIMER, docVersion, trustDocBySlug, type DocBlock } from "@/lib/trust-docs";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const meta = trustDocBySlug(params.slug);
  return { title: meta ? `${meta.title} — angar Trust Center` : "angar Trust Center" };
}

// Documento del Trust Center, pronto da stampare o salvare in PDF.
export default function TrustDocPage({ params, searchParams }: { params: { slug: string }; searchParams: { v?: string } }) {
  const meta = trustDocBySlug(params.slug);
  if (!meta) notFound();
  const signedIn = !!currentSession();
  const version = docVersion(meta, searchParams.v);
  const doc = meta.build(version.id);
  const hasPlaceholders = /\[\[/.test(JSON.stringify(doc.blocks));

  return (
    <div className={signedIn ? "" : "min-h-screen bg-panel"}>
      {!signedIn && <TrustHeader />}
      <div className={signedIn ? "max-w-4xl" : "max-w-4xl mx-auto px-4 sm:px-6 pt-10 sm:pt-12 pb-10"}>
        <div className="print:hidden flex flex-col gap-5">
          <div className="text-sm text-ink-400">
            <Link href="/trust#documents" className="hover:text-ink-100">Trust Center</Link>
            <span className="mx-2">/</span>
            <span className="text-ink-100">{meta.title}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {meta.versions.length > 1 ? (
              <nav aria-label="Version" className="flex flex-wrap gap-1.5">
                {meta.versions.map((v) => (
                  <Link
                    key={v.id}
                    href={`/trust/docs/${meta.slug}?v=${v.id}`}
                    aria-current={v.id === version.id ? "page" : undefined}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${v.id === version.id ? "border-ink-400 text-ink-100" : "border-line text-ink-400 hover:text-ink-100 hover:border-ink-400"}`}
                  >
                    {v.label}
                  </Link>
                ))}
              </nav>
            ) : (
              <span className="text-sm text-ink-400">{version.label}</span>
            )}
            <PrintButton label="Print / Save as PDF" />
          </div>
          {meta.slug === "employee-notice" && (
            <p className="text-sm text-ink-400 leading-relaxed">
              A generic version listing every source. Remove the ones you don&apos;t use.{" "}
              {signedIn ? (
                <Link href="/compliance/employee-notice" className="underline hover:text-ink-100">Generate it from your workspace →</Link>
              ) : (
                "Customers can generate it from the sources they have actually connected."
              )}
            </p>
          )}
          {hasPlaceholders && <p className="text-sm text-signal">Fill in the highlighted parts before using it.</p>}
        </div>

        <article lang={version.lang} className="mt-6 rounded-xl border border-line bg-panel px-5 py-7 sm:px-10 sm:py-10 text-ink-100 print:mt-0 print:border-0 print:p-0 print:text-black">
          {meta.template && (
            <p className="mb-6 rounded-lg border border-line px-3.5 py-2.5 text-xs leading-relaxed text-ink-400 print:text-black print:border-black/30">
              {DISCLAIMER[version.lang] ?? DISCLAIMER.en}
            </p>
          )}
          <h1 className="font-display text-[22px] sm:text-[26px] leading-tight font-semibold tracking-tight">{doc.title}</h1>
          {doc.subtitle && <p className="text-sm text-ink-400 mt-1.5 print:text-black/70">{doc.subtitle}</p>}
          <div className="mt-6 flex flex-col gap-3 text-[14.5px] leading-relaxed">
            {doc.blocks.map((b, i) => (
              <Block key={i} b={b} lang={version.lang} />
            ))}
          </div>
        </article>

        <TrustFooter updated={TRUST_REVIEWED} />
      </div>
    </div>
  );
}

// Riga sotto la firma, nella lingua del documento.
const SIGN_HINT: Record<string, string> = {
  en: "Name, role, date, signature",
  it: "Nome, ruolo, data, firma",
  de: "Name, Funktion, Datum, Unterschrift",
  fr: "Nom, fonction, date, signature",
  es: "Nombre, cargo, fecha, firma",
};

function Block({ b, lang }: { b: DocBlock; lang: string }) {
  if ("h" in b) return <h2 className="text-base font-bold mt-5 break-after-avoid">{b.h}</h2>;
  if ("h3" in b) return <h3 className="text-sm font-bold mt-2 break-after-avoid">{b.h3}</h3>;
  if ("p" in b) return <p><Filled text={b.p} /></p>;
  if ("ul" in b)
    return (
      <ul className="list-disc pl-5 flex flex-col gap-1.5 marker:text-ink-400">
        {b.ul.map((x, j) => (
          <li key={j}><Filled text={x} /></li>
        ))}
      </ul>
    );
  if ("table" in b)
    return (
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[13px] leading-snug border border-line print:border-black/30 border-collapse">
          <thead>
            <tr>
              {b.table.head.map((h) => (
                <th key={h} className="text-left font-normal px-3 py-2 border-b border-line print:border-black/30 align-bottom">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.table.rows.map((r, j) => (
              <tr key={j} className="align-top break-inside-avoid">
                {r.map((c, k) => (
                  <td key={k} className={`px-3 py-2 border-t border-line print:border-black/30 ${k === 0 ? "font-medium min-w-[140px]" : "min-w-[160px]"}`}><Filled text={c} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-8 mt-6 break-inside-avoid">
      {b.sign.map((who) => (
        <div key={who} className="text-sm">
          <div className="font-medium">{who}</div>
          <div className="mt-10 border-t border-ink-400 print:border-black pt-1.5 text-xs text-ink-400 print:text-black/70">{SIGN_HINT[lang] ?? SIGN_HINT.en}</div>
        </div>
      ))}
    </div>
  );
}

/** Evidenzia i segnaposto [[…]] da completare. */
function Filled({ text }: { text: string }) {
  const parts = text.split(/(\[\[.+?\]\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("[[") ? (
          <mark key={i} className="bg-signal/15 text-current rounded px-1 print:bg-transparent print:border-b print:border-dotted print:border-black">[{p.slice(2, -2)}]</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
