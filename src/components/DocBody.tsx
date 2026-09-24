// Rende il corpo di un articolo: "## " sottotitoli, "- " elenchi, "1. " passi.
export default function DocBody({ body }: { body: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (line.startsWith("## ")) {
      blocks.push(<h2 key={i} className="text-base font-semibold text-ink-100 mt-6 mb-2">{line.slice(3)}</h2>);
      i++;
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i].trim())) items.push(lines[i++].trim().replace(/^(- |\d+\. )/, ""));
      blocks.push(
        ordered ? (
          <ol key={i} className="flex flex-col gap-2 my-3">
            {items.map((t, n) => (
              <li key={n} className="flex gap-3 text-[15px] text-ink-100 leading-relaxed">
                <span className="h-6 w-6 rounded-full bg-ink text-xs font-semibold text-ink-100 flex items-center justify-center shrink-0 mt-0.5">{n + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="flex flex-col gap-1.5 my-3 list-disc pl-5 marker:text-ink-400">
            {items.map((t, n) => (
              <li key={n} className="text-[15px] text-ink-100 leading-relaxed">{t}</li>
            ))}
          </ul>
        )
      );
    } else {
      blocks.push(<p key={i} className="text-[15px] text-ink-100 leading-relaxed my-3">{line}</p>);
      i++;
    }
  }
  return <div>{blocks}</div>;
}
