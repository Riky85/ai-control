// Avvio del server Node: registro errori + lavori periodici. Separato da
// instrumentation.ts così non finisce nel bundle del runtime edge (niente
// moduli Node come crypto lì).
import { recordError } from "@/lib/errors";
import { startScheduler } from "@/lib/jobs";

const original = console.error.bind(console);
console.error = (...args: unknown[]) => {
  original(...args);
  const err = args.find((a) => a instanceof Error);
  if (err) void recordError("server", err);
};
process.on("unhandledRejection", (reason) => void recordError("server", reason));
process.on("uncaughtException", (err) => void recordError("server", err));

// Lavori periodici (rinnovi, posti, budget, costi, report, riepilogo Slack/Teams).
startScheduler();
