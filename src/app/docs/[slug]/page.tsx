import { PageHeader } from "@/components/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, DOC_SECTIONS, docBySlug } from "@/lib/docs";
import DocBody from "@/components/DocBody";
import ExportMenu from "@/components/ExportMenu";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export default function DocArticlePage({ params }: { params: { slug: string } }) {
  const doc = docBySlug(params.slug);
  if (!doc) notFound();
  const idx = DOCS.findIndex((d) => d.slug === doc.slug);
  const prev = DOCS[idx - 1];
  const next = DOCS[idx + 1];

  return (
    <div className="grid grid-cols-[220px_1fr] gap-10">
      <nav className="print:hidden sticky top-0 self-start flex flex-col gap-5 text-sm">
        <Link href="/docs" className="text-ink-400 hover:text-ink-100">← All docs</Link>
        {DOC_SECTIONS.map((s) => (
          <div key={s}>
            <div className="text-xs font-medium text-ink-400 mb-1.5">{s}</div>
            <div className="flex flex-col gap-0.5">
              {DOCS.filter((d) => d.section === s).map((d) => (
                <Link key={d.slug} href={`/docs/${d.slug}`} className={`px-2.5 py-1.5 rounded-lg transition-colors ${d.slug === doc.slug ? "bg-ink text-ink-100 font-medium" : "text-ink-400 hover:text-ink-100"}`}>
                  {d.title}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <article className="max-w-2xl">
        <PageHeader crumbs={[{ label: "Documentation", href: "/docs" }, { label: doc.section }]} title={doc.title} action={<ExportMenu />} />
        <p className="text-base text-ink-400 mt-2">{doc.summary}</p>
        <div className="mt-4 border-t border-line pt-2">
          <DocBody body={doc.body} />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-10 print:hidden">
          {prev ? (
            <Link href={`/docs/${prev.slug}`} className="rounded-xl border border-line p-4 hover:border-ink-400 transition-colors">
              <div className="text-xs text-ink-400">Previous</div>
              <div className="text-sm font-medium text-ink-100">{prev.title}</div>
            </Link>
          ) : <span />}
          {next && (
            <Link href={`/docs/${next.slug}`} className="rounded-xl border border-line p-4 text-right hover:border-ink-400 transition-colors">
              <div className="text-xs text-ink-400">Next</div>
              <div className="text-sm font-medium text-ink-100">{next.title}</div>
            </Link>
          )}
        </div>
      </article>
    </div>
  );
}
