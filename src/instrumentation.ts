// Avvio del server: solo nel runtime Node si caricano registro errori e
// scheduler (il confronto su NEXT_RUNTIME viene risolto in compilazione, così
// il bundle edge non include moduli Node).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
