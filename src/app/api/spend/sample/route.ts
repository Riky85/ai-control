import { sampleStatementCsv } from "@/lib/spend/sample";

// Estratto conto di esempio per provare angar senza dati propri.
export async function GET() {
  return new Response(sampleStatementCsv(), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="sample-bank-statement.csv"' },
  });
}
