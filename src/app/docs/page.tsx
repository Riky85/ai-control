import Link from "next/link";
import { DOCS, DOC_SECTIONS } from "@/lib/docs";
import { PageHeader } from "@/components/ui";

export default function DocsIndex({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? "").toLowerCase().trim();
  const match = (d: (typeof DOCS)[number]) => !q || `${d.title} ${d.summary} ${d.body} ${(d.keywords ?? []).join(" ")}`.toLowerCase().includes(q);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Documentation" subtitle="Guides for connecting your AI, reading your estate and sharing it. Or ask the assistant — bottom right." />
      <form className="w-full max-w-xl">
        <label className="flex items-center gap-2 border border-line rounded-lg bg-panel px-3 py-2.5 focus-within:border-ink-400">
          <svg width="15" height="15" viewBox="0 0 14 14" fill="none" className="text-ink-400 shrink-0">
            <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.2 9.2L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input name="q" defaultValue={searchParams.q} placeholder="Search the documentation" className="flex-1 bg-transparent text-sm text-ink-100 placeholder:text-ink-400 outline-none" />
        </label>
      </form>

      {DOC_SECTIONS.map((section) => {
        const docs = DOCS.filter((d) => d.section === section && match(d));
        if (!docs.length) return null;
        return (
          <section key={section}>
            <h2 className="text-base font-semibold text-ink-100 mb-3">{section}</h2>
            <div className="grid grid-cols-3 gap-4">
              {docs.map((d) => (
                <Link key={d.slug} href={`/docs/${d.slug}`} className="rounded-xl border border-line bg-panel p-5 hover:border-ink-400 transition-colors">
                  <div className="text-sm font-semibold text-ink-100">{d.title}</div>
                  <p className="text-sm text-ink-400 mt-1">{d.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      {DOCS.every((d) => !match(d)) && <p className="text-sm text-ink-400">No article matches “{searchParams.q}”. Try the assistant in the bottom right.</p>}
    </div>
  );
}
