// Avvio del server (solo runtime Node): gli errori che Next registra con
// console.error e le eccezioni non gestite finiscono anche nel registro
// errori visibile nella pagina System. Restano comunque nei log di Railway.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("@/lib/errors");
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    const err = args.find((a) => a instanceof Error);
    if (err) void recordError("server", err);
  };
  process.on("unhandledRejection", (reason) => void recordError("server", reason));
  process.on("uncaughtException", (err) => void recordError("server", err));
}
