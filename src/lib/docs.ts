/**
 * Documentazione di Angar — unica fonte per la pagina /docs e per
 * l'assistente "Ask docs". Formato del corpo: righe normali = paragrafi,
 * "## " = sottotitolo, "- " = elenco puntato, "1. " = passi numerati.
 */
export interface DocArticle {
  slug: string;
  section: string;
  title: string;
  summary: string;
  body: string;
  keywords?: string[];
}

export const DOCS: DocArticle[] = [
  {
    slug: "what-is-angar",
    section: "Getting started",
    title: "What is Angar",
    summary: "A living map of every AI system your company uses: what it is, who owns it, what it costs, what it depends on and what you could change.",
    keywords: ["overview", "intro", "estate", "passport"],
    body: `Angar builds a living map of your company's AI estate — every AI application, agent, API and developer tool in use.
For each AI system it keeps an AI Passport: vendor, model, owner, cost, data it touches, risk and assurance, changes over time and cheaper alternatives.
## The workflow
1. Discover — connect providers, scan code or import a list.
2. Understand — open each AI Passport and the estate map.
3. Measure — add costs, see spend by provider.
4. Optimize — record alternatives and see estimated savings.
5. Govern — review, approve and share evidence when needed.`,
  },
  {
    slug: "first-10-minutes",
    section: "Getting started",
    title: "Your first 10 minutes",
    summary: "Connect one provider, import the rest, assign owners and costs.",
    keywords: ["start", "setup", "onboarding", "quick"],
    body: `1. Open Connections and connect the AI provider your company already pays for (Anthropic, OpenAI, Gemini…). A normal API key is enough.
2. Import anything without an API (SaaS tools, internal apps) with a CSV, or add them one by one.
3. Open AI Passports, open each system and set an owner and a monthly cost.
4. Go back to Overview: risk, review status and the estate map are now filled in.
5. Optional: share a read-only dashboard with management from Workspace → Shared dashboards.`,
  },
  {
    slug: "connect-a-provider",
    section: "Connections",
    title: "Connect an AI provider",
    summary: "Paste an API key on the provider's card — Angar checks it and runs the first sync immediately.",
    keywords: ["connect", "api key", "key", "anthropic", "openai", "claude", "chatgpt", "gemini", "mistral", "connector", "not working", "rejected", "error"],
    body: `1. Open Connections and find the provider (e.g. Anthropic, OpenAI, Google Gemini, Mistral, xAI, DeepSeek, Groq, Cohere, Together AI, OpenRouter, Hugging Face).
2. Click Connect, paste the API key and press Connect again.
3. Angar verifies the key with a read-only call (it lists the available models — no credits are used), saves it encrypted and runs the first sync.
4. The provider appears in AI Passports as "<Provider> API" and the card shows Connected.
## If the key is rejected
- Make sure you copied the whole key, without spaces.
- Check the key hasn't been revoked or expired in the provider's console.
- For Anthropic, a normal key starts with sk-ant-api03-; an Admin key with sk-ant-admin. Both work.
## Disconnect
Press Disconnect on the card: the key is deleted. Your AI Passports stay.`,
  },
  {
    slug: "find-your-api-key",
    section: "Connections",
    title: "Where to find your API key",
    summary: "Direct links to the API key page of every supported provider.",
    keywords: ["where", "find", "api key", "console", "create key"],
    body: `Create a dedicated key named "Angar" — you can revoke it any time without affecting other apps.
- Anthropic (Claude): console.anthropic.com → Settings → API keys
- OpenAI (ChatGPT): platform.openai.com → API keys
- Google Gemini: aistudio.google.com → Get API key
- Mistral AI: console.mistral.ai → API keys
- xAI (Grok): console.x.ai → API keys
- DeepSeek: platform.deepseek.com → API keys
- Groq: console.groq.com → API keys
- Cohere: dashboard.cohere.com → API keys
- Together AI: api.together.ai → Settings → API keys
- OpenRouter: openrouter.ai → Settings → Keys
- Hugging Face: huggingface.co → Settings → Access tokens (read)
Every card on the Connections page also has a direct link.`,
  },
  {
    slug: "admin-vs-normal-keys",
    section: "Connections",
    title: "Admin keys vs normal keys",
    summary: "A normal key shows you use a provider and which models are available; an Admin key also brings in users.",
    keywords: ["admin", "users", "organization", "difference"],
    body: `- Normal API key: confirms your company uses the provider and lists the models available. Works with any account.
- Admin key (Anthropic and OpenAI only): also reads the organization's users, so Angar knows who has access. Requires an organization account (Anthropic Team/Enterprise, OpenAI organization).
The Connections card shows "Admin key" when one is in use.`,
  },
  {
    slug: "import-csv",
    section: "Connections",
    title: "Import from a spreadsheet (CSV)",
    summary: "Upload a CSV with one row per AI system — works for any tool, even without an API.",
    keywords: ["csv", "excel", "import", "spreadsheet", "upload", "template", "bulk"],
    body: `1. On Connections → Import, click Download template.
2. Fill one row per AI system. Columns: name (required), vendor, type, model, owner_email, department, monthly_cost.
3. Save as CSV (in Excel: File → Save as → CSV) and drop it in the upload area, then press Import CSV.
Rows with the same name update the existing system instead of duplicating it. Owners are created automatically from their email.
Valid types: AI_APPLICATION, AI_AGENT, AI_API, AI_FEATURE, AI_DEV_TOOL, MCP_SERVER.`,
  },
  {
    slug: "add-manually",
    section: "Connections",
    title: "Add an AI system manually",
    summary: "One form, one AI system — risk and assurance are computed immediately.",
    keywords: ["manual", "add", "new system", "create"],
    body: `On Connections → Import, use "Add one manually": give a name, optionally a vendor and a monthly cost, and press Add AI system. You land on its AI Passport, where you can set the owner, status, EU AI Act classification and alternatives.`,
  },
  {
    slug: "github",
    section: "Connections",
    title: "GitHub code scanning",
    summary: "Finds AI SDKs (OpenAI, Anthropic, Gemini, LangChain…) in your repositories.",
    keywords: ["github", "code", "repository", "sdk", "scan"],
    body: `Once GitHub sign-in is enabled on your deployment, click Sign in with GitHub and pick your organization. Angar reads package.json, requirements.txt and pyproject.toml of your most recently updated repositories and creates an AI Passport for each AI SDK it finds, recording where it was found.`,
  },
  {
    slug: "ai-passports",
    section: "Using Angar",
    title: "AI Passports",
    summary: "The living technical record of each AI system: owner, cost, dependencies, risk, changes and alternatives.",
    keywords: ["passport", "system", "owner", "cost", "status", "approve"],
    body: `AI Passports lists every AI system. Search by name or filter by type, status and risk; export the list to Excel or PDF.
Open a system to see its Passport:
- Overview: department, model, source and the dependency graph (who uses it → the system → what it touches).
- Risk & Assurance: the risk score with its reasons and the controls that pass or fail.
- Activity: recent events from connectors.
- Alternatives: cheaper or safer options you've evaluated.
On the right, Manage lets you set the owner, approve or reject, set the EU AI Act classification and enter the monthly cost.`,
  },
  {
    slug: "risk-and-assurance",
    section: "Using Angar",
    title: "Risk and assurance",
    summary: "Deterministic scores from facts in the database — never a guess.",
    keywords: ["risk", "assurance", "score", "controls", "blocked", "restricted", "needs review"],
    body: `Risk (Low, Medium, High, Critical) is computed from facts such as access to sensitive data, production systems and missing ownership.
Assurance runs 8 checks: owner assigned, reviewed by a human, vendor identified, sensitive data on a managed provider, EU AI Act classification set, activity observed, elevated risk has a mitigation, covered by an active policy.
- Assured: all checks pass.
- Needs review: some checks have warnings.
- Restricted: at least one check fails.
- Blocked: critical risk with a failing check.
Fix a check from the Passport (e.g. assign an owner) and the status updates immediately.`,
  },
  {
    slug: "estate-map",
    section: "Using Angar",
    title: "Estate map and dependencies",
    summary: "Which provider powers each system and which data it touches.",
    keywords: ["map", "graph", "dependency", "dependencies", "provider", "data"],
    body: `The estate map on Overview shows three columns: providers → AI systems → data. A red dot marks a high-risk system or sensitive data (personal, financial, source code). Each Passport has its own dependency graph: users → the system → the systems and data it depends on. Click a system on the map to open its Passport.`,
  },
  {
    slug: "savings",
    section: "Using Angar",
    title: "Savings and alternatives",
    summary: "Estimated savings = current monthly cost minus the cheapest alternative you've recorded.",
    keywords: ["savings", "save", "cost", "cheaper", "alternative", "optimize", "spend"],
    body: `1. On a Passport, enter the monthly cost in Manage.
2. In the Alternatives tab, add an option with its provider, model, estimated monthly cost and migration effort.
3. Savings lists every system where an alternative is cheaper, largest first, with monthly and yearly savings.
These are estimates from the numbers you entered — validate quality with real tests before migrating.`,
  },
  {
    slug: "changes",
    section: "Using Angar",
    title: "Changes",
    summary: "What changed between syncs: model, vendor and status, before and after.",
    keywords: ["changes", "history", "model change", "before", "after"],
    body: `Every time a sync finds a different model or vendor, or someone changes a status, Angar records a change with the old and new value and the time it was detected. See them all in Changes, the latest on Overview, and per system in its Passport export.`,
  },
  {
    slug: "export",
    section: "Using Angar",
    title: "Export to Excel or PDF",
    summary: "Every table, page and Passport can be exported.",
    keywords: ["export", "excel", "xlsx", "pdf", "download", "print", "report"],
    body: `Use the Export button at the top right of a page.
- Excel: downloads all rows of that page's data with filters ready (AI Passports, Providers, Savings, Changes, People, Activity). A single Passport exports to a workbook with sheets for details, dependencies, risk and controls, alternatives, changes and activity.
- PDF: opens the print dialog with a clean print layout — choose "Save as PDF" as the destination.`,
  },
  {
    slug: "members-and-roles",
    section: "Workspace",
    title: "Members and roles",
    summary: "Owner, Admin, Editor and Viewer — who can do what.",
    keywords: ["members", "roles", "invite", "team", "owner", "admin", "viewer", "editor", "permissions"],
    body: `- Owner: everything, including billing.
- Admin: manage connections and members.
- Editor: edit Passports, owners and costs.
- Viewer: read-only.
Invite from Workspace → Members. A workspace always keeps at least one Owner. The number of members depends on your plan. Sign-in is being rolled out: invited members get access as soon as it's live.`,
  },
  {
    slug: "share-dashboards",
    section: "Workspace",
    title: "Share a dashboard",
    summary: "A read-only link to the Overview for management, auditors or clients.",
    keywords: ["share", "link", "dashboard", "read-only", "board", "auditor", "public"],
    body: `1. Open Workspace → Shared dashboards.
2. Name the link (e.g. "Board — Q3 AI estate"), pick an expiry and press Create link.
3. Copy the link and send it. Whoever opens it sees numbers, charts, the estate map and the system list — nothing else in Angar.
You can see how many times it was opened and revoke it at any time.`,
  },
  {
    slug: "workspaces",
    section: "Workspace",
    title: "Multiple workspaces",
    summary: "One workspace per company, plant or client — switch from the top of the sidebar.",
    keywords: ["workspace", "workspaces", "switch", "create workspace", "multiple", "company", "client"],
    body: `Click the workspace name at the top of the sidebar to switch, create or manage workspaces. Each workspace has its own AI systems, connections, members and shared dashboards. Starter includes 1 workspace, Growth up to 3, Enterprise unlimited. Rename workspaces from Workspace → Workspaces.`,
  },
  {
    slug: "plans",
    section: "Plans & billing",
    title: "Plans",
    summary: "Starter, Growth and Enterprise — limits and how to upgrade.",
    keywords: ["plan", "plans", "pricing", "price", "billing", "upgrade", "subscription", "starter", "growth", "enterprise", "invoice"],
    body: `- Starter — €49/month: 25 AI systems, 3 connections, 3 members, 1 workspace, 1 shared dashboard.
- Growth — €199/month: 250 AI systems, unlimited connections, 15 members, 3 workspaces, savings, unlimited shared dashboards.
- Enterprise — custom: unlimited everything, governance exports, priority support.
Upgrade from Plan & billing. Payments are processed by Stripe; invoices and payment method are in "Invoices & payment method". Prices exclude VAT.`,
  },
  {
    slug: "angar-edge",
    section: "Plans & billing",
    title: "Angar Edge",
    summary: "A small appliance on your network that detects AI traffic no connector can see.",
    keywords: ["edge", "device", "hardware", "appliance", "network", "shadow ai"],
    body: `Angar Edge is a plug-and-play device for your office or plant network. It detects traffic to AI services (ChatGPT, Claude, Gemini, Copilot…) without inspecting content, finds shadow AI and feeds AI Passports, the estate map and Changes.
It's billed per device per month on top of any plan, with a 12-month minimum; hardware and replacement are included. Angar Edge is in early access — order from Plan & billing.`,
  },
  {
    slug: "security",
    section: "Security",
    title: "How your keys and data are handled",
    summary: "Read-only access, keys encrypted at rest, nothing sent to third parties.",
    keywords: ["security", "encryption", "privacy", "gdpr", "safe", "keys", "data"],
    body: `- Connections are read-only: Angar never changes anything in your providers.
- API keys are encrypted at rest (AES-256-GCM) and can be deleted any time with Disconnect.
- Angar stores metadata about AI systems (names, models, owners, costs, events) — not the content of prompts or documents.
- Card details are handled by Stripe and never reach Angar.`,
  },
];

export const DOC_SECTIONS = Array.from(new Set(DOCS.map((d) => d.section)));
export const docBySlug = (slug: string) => DOCS.find((d) => d.slug === slug);

/** Ricerca per parole chiave — usata dall'assistente quando non c'è un modello AI configurato. */
const IT: Record<string, string> = {
  chiave: "key", chiavi: "key", connettore: "connect", connettori: "connect", collegare: "connect", collego: "connect", connettere: "connect",
  abbonamento: "plan", piano: "plan", piani: "plan", prezzo: "price", prezzi: "price", pagamento: "billing", fattura: "invoice",
  condividere: "share", condivido: "share", esportare: "export", esporto: "export", scaricare: "download", ruoli: "roles", membri: "members",
  invitare: "invite", risparmio: "savings", risparmiare: "save", costo: "cost", costi: "cost", rischio: "risk", dispositivo: "device",
  sicurezza: "security", importare: "import", importo: "import", dove: "where", trovo: "find", trovare: "find", modifiche: "changes",
  alternativa: "alternative", alternative: "alternative", passaporto: "passport", mappa: "map", dipendenze: "dependencies", funziona: "not working",
  errore: "error", rifiutata: "rejected", creare: "create", nuovo: "new", aggiungere: "add", manuale: "manual",
};

export function searchDocs(query: string, limit = 3) {
  const words = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
    .flatMap((w) => (IT[w] ? [w, ...IT[w].split(" ")] : [w]));
  return DOCS.map((d) => {
    const hay = `${d.title} ${d.summary} ${(d.keywords ?? []).join(" ")}`.toLowerCase();
    const body = d.body.toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 3 : 0) + (body.includes(w) ? 1 : 0), 0);
    return { doc: d, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.doc);
}
