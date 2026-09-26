/** Estratto conto di esempio (ultimi 3 mesi): usato dal download e dai dati demo. */
export function sampleStatementCsv(now = new Date()) {
  const ym = (back: number, day: number) => {
    const x = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day));
    return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`;
  };
  const rows = [["Data contabile", "Importo", "Divisa", "Descrizione"]];
  for (const b of [3, 2, 1]) {
    rows.push([ym(b, 3), "-305,00", "EUR", "OPENAI *CHATGPT SUBSCR SAN FRANCISCO"]);
    rows.push([ym(b, 8), "-122,00", "EUR", "CLAUDE.AI SUBSCRIPTION ANTHROPIC"]);
    rows.push([ym(b, 12), "-195,20", "EUR", "CURSOR, AI POWERED IDE"]);
    rows.push([ym(b, 14), "-24,40", "EUR", "PERPLEXITY AI"]);
    rows.push([ym(b, 18), "-1.200,00", "EUR", "AFFITTO UFFICIO"]);
    rows.push([ym(b, 21), "-36,60", "EUR", "MIDJOURNEY INC"]);
    rows.push([ym(b, 25), `-${[180, 240, 310][b - 1]},00`, "EUR", "ANTHROPIC API USAGE"]);
  }
  return rows.map((r) => r.join(";")).join("\n");
}
