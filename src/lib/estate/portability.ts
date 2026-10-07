/**
 * Portabilità delle API: quale "superficie" API espone ogni deployment del catalogo e
 * quali superfici accetta in compatibilità. Fatti dalla documentazione dei fornitori,
 * con provenienza e confidenza (nessun punteggio inventato: i numeri del punteggio
 * stanno in replaceability.ts e sono regole).
 *
 * Puro: nessun accesso al database.
 */

/** Superficie API: il formato delle chiamate che il codice del cliente usa. */
export type ApiSurface = "openai" | "anthropic" | "gemini" | "mistral" | "bedrock" | "vertex" | "unknown";

export const SURFACE_LABEL: Record<ApiSurface, string> = {
  openai: "OpenAI API",
  anthropic: "Anthropic Messages API",
  gemini: "Gemini API",
  mistral: "Mistral API",
  bedrock: "Bedrock API",
  vertex: "Vertex AI API",
  unknown: "Unknown API",
};

export interface SurfaceFact {
  surface: ApiSurface;
  /** Superfici che questo deployment accetta anche (livello di compatibilità documentato). */
  accepts: ApiSurface[];
  note: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

// Per deployment del catalogo (AiDeployment.id).
const DEPLOYMENT_SURFACE: Record<string, SurfaceFact> = {
  "openai-direct": { surface: "openai", accepts: [], note: "Native OpenAI API", confidence: "HIGH" },
  "azure-openai": { surface: "openai", accepts: [], note: "Azure OpenAI uses the OpenAI API format (different endpoint and auth)", confidence: "HIGH" },
  "anthropic-direct": { surface: "anthropic", accepts: ["openai"], note: "Anthropic documents an OpenAI SDK compatibility layer with limits", confidence: "MEDIUM" },
  "google-direct": { surface: "gemini", accepts: ["openai"], note: "Gemini API documents OpenAI compatibility", confidence: "MEDIUM" },
  "mistral-direct": { surface: "mistral", accepts: [], note: "Own API, similar to the OpenAI chat format but not declared compatible", confidence: "MEDIUM" },
  "deepseek-direct": { surface: "openai", accepts: [], note: "DeepSeek documents an OpenAI-compatible API", confidence: "MEDIUM" },
  "xai-direct": { surface: "openai", accepts: [], note: "xAI documents an OpenAI-compatible API", confidence: "MEDIUM" },
  "aws-bedrock": { surface: "bedrock", accepts: [], note: "Bedrock Converse / InvokeModel API", confidence: "HIGH" },
  "google-vertex": { surface: "vertex", accepts: [], note: "Vertex AI API", confidence: "HIGH" },
};

export function surfaceOf(deploymentId: string | null | undefined): SurfaceFact {
  return (deploymentId && DEPLOYMENT_SURFACE[deploymentId]) || { surface: "unknown", accepts: [], note: "API format not known", confidence: "LOW" };
}

/**
 * Endpoint del Gateway propri di un fornitore (accoppiamento): le chiamate che non si
 * spostano su un altro fornitore senza riscrivere il codice. chat/completions ed embeddings
 * sono il formato comune; "messages" è il formato Anthropic.
 */
export const PROVIDER_SPECIFIC_ENDPOINTS: Record<string, string> = {
  responses: "OpenAI Responses API",
  assistants: "OpenAI Assistants API",
  threads: "OpenAI Assistants threads",
  batches: "Provider batch API",
  "fine_tuning/jobs": "Provider fine-tuning",
  files: "Provider file storage",
  "vector_stores": "OpenAI vector stores",
};

/** Funzioni proprie del fornitore viste negli endpoint del Gateway. */
export function providerSpecificFromEndpoints(endpoints: string[]): string[] {
  const out = new Set<string>();
  for (const e of endpoints) {
    const k = Object.keys(PROVIDER_SPECIFIC_ENDPOINTS).find((p) => e === p || e.startsWith(`${p}/`));
    if (k) out.add(PROVIDER_SPECIFIC_ENDPOINTS[k]);
  }
  return [...out].sort();
}

/**
 * Punteggio di portabilità API (0–100) tra la superficie attuale e quella dell'alternativa:
 * 100 stessa superficie · 80 l'alternativa accetta la superficie attuale (livello di compatibilità)
 * · 40 riscrittura del client · 30 superficie attuale non nota (prudente).
 * Ogni funzione propria del fornitore toglie 20 punti.
 */
export function apiPortability(current: ApiSurface, alt: SurfaceFact, providerSpecific: string[]): { score: number; reason: string } {
  let score: number;
  let reason: string;
  if (current === "unknown") {
    score = 30;
    reason = "Current API format not known";
  } else if (alt.surface === current) {
    score = 100;
    reason = `Same API format (${SURFACE_LABEL[current]})`;
  } else if (alt.accepts.includes(current)) {
    score = 80;
    reason = `Accepts the ${SURFACE_LABEL[current]} format through a compatibility layer`;
  } else {
    score = 40;
    reason = `Different API format (${SURFACE_LABEL[current]} → ${SURFACE_LABEL[alt.surface]}): client code changes`;
  }
  if (providerSpecific.length) {
    score = Math.max(0, score - 20 * providerSpecific.length);
    reason += ` · uses ${providerSpecific.join(", ")}`;
  }
  return { score, reason };
}
