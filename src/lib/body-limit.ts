/**
 * Legge il corpo di una richiesta fermandosi appena supera `limit` byte:
 * Content-Length può mancare (chunked) o mentire, quindi si contano i byte
 * reali durante lo streaming invece di caricare tutto con arrayBuffer().
 * null = troppo grande.
 */
export async function readBodyLimited(req: Request, limit: number): Promise<Buffer | null> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > limit) return null;
  if (!req.body) return Buffer.alloc(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
