/**
 * Documentazione di angar — unica fonte per la pagina /docs e per
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
    title: "What is angar",
    summary: "angar finds every AI your company uses or pays for, what it really costs and where you can save — automatically.",
    keywords: ["overview", "intro", "estate", "passport", "what"],
    body: `angar answers three questions without asking you to type anything: which AI does the company use, how much does it cost, and where can we save.
## How it works
1. Sources — give angar a bank or card statement, e-invoices, company accounts (Microsoft 365, Google Workspace), provider keys or the angar desktop app.
2. Your AI — angar lists every AI with its plan, seats, real cost, who uses it and what data it touches (the AI Passport).
3. Savings — angar compares what you pay with how the AI is used and today's prices, and tells you what to change.
4. Radar and monthly report — angar tells you when a new AI appears or a cost goes up, and emails a monthly summary.`,
  },
  {
    slug: "first-10-minutes",
    section: "Getting started",
    title: "Your first 10 minutes",
    summary: "Drop a bank statement, look at Savings, then add the other sources when you want.",
    keywords: ["start", "setup", "onboarding", "quick", "first"],
    body: `1. On Overview, drop a bank or card statement (CSV or Excel) or your e-invoices. angar finds every AI subscription with plan, seats and monthly cost.
2. Open Savings: suggestions are already calculated — yearly billing, unused seats, duplicate tools, oversized models.
3. Optional: in Sources connect Microsoft 365 or Google Workspace to see who uses which AI, and install the desktop app to find AI nobody pays for and see how long each one is used.
4. Nothing else is required: no costs to type, no owners to assign, no invitations. You can invite colleagues later from Workspace.`,
  },
  {
    slug: "bank-statements",
    section: "Sources",
    title: "Bank statements and e-invoices",
    summary: "Drop a bank or card export or your e-invoices: angar finds every AI you pay for, with plan, seats and real cost.",
    keywords: ["bank", "statement", "estratto conto", "card", "invoice", "fattura", "td17", "xml", "p7m", "zip", "revolut", "qonto", "cost", "costs"],
    body: `## Automatic (recommended)
- Bank account: Sources → Bank & invoices → Bank account → Connect. Pick your bank and approve read-only access on its site (90 days). angar reads only AI charges.
- Accounting software: DATEV, Pennylane, Exact, Sage, Odoo, Xero, QuickBooks… connect once and supplier invoices arrive by themselves.
- Fatture in Cloud (Italy): connect once, e-invoices arrive every month.
## Or upload files
1. Export the statement from your bank or card as CSV or Excel (most banks: Movements → Export). Three months is ideal.
2. Drop it on Overview or in Sources → Bank statement & invoices. You can drop several files at once.
3. angar keeps only the lines that are AI services (OpenAI, Claude, Cursor, Copilot, Perplexity, Midjourney…) and discards everything else.
## E-invoices (Italy)
Drop the FatturaPA XML or .p7m files, or the zip your accountant sends. Foreign AI subscriptions appear as TD17 self-invoices: angar reads the supplier and the amount.
## How the cost is calculated
The monthly cost is the average of the charges. From the amount angar also recognises the plan and the number of seats (for example 305 € ≈ 10 seats of ChatGPT Business).`,
  },
  {
    slug: "company-accounts",
    section: "Sources",
    title: "Microsoft 365 and Google Workspace",
    summary: "An administrator approves read-only access once; angar sees which AI apps people sign in to with their work account.",
    keywords: ["microsoft", "365", "entra", "azure", "google", "workspace", "copilot", "sso", "oauth", "who uses"],
    body: `1. Open Sources → Company accounts and press Connect.
2. Sign in as an administrator and approve. angar only reads: never emails, files or chats.
## What angar sees
- Microsoft 365: AI apps in Entra ID, who authorised them, sign-ins of the last 30 days, Microsoft 365 Copilot licences and usage.
- Google Workspace: AI apps people authorised with "Sign in with Google" in the last 6 months.
AI found this way goes to Review, where you decide in one click whether it's allowed.`,
  },
  {
    slug: "desktop-app",
    section: "Sources",
    title: "The desktop app",
    summary: "One install per computer: angar sees which AI each person uses — in every browser and desktop app — and for how long.",
    keywords: ["desktop", "app", "install", "download", "agent", "computer", "shadow", "usage", "silent", "intune", "jamf", "uninstall", "windows", "mac", "linux", "scan", "discover"],
    body: `The angar desktop app is the main way to find the AI people really use, including AI nobody pays for through the company.
## Install it
1. Open Sources → angar desktop app → Get the app (or go straight to Download the app).
2. Download it for Windows, macOS or Linux. The file is already linked to your company.
3. Open it and type your work email once. It then runs in the background and starts at login.
## The whole company
On the download page, copy the company link and send it to your colleagues: each person downloads from it and types their email. Nothing else to configure.
## What it sends
- Only the names of AI tools and the time spent on each per day — e.g. "ChatGPT, 40 minutes".
- Never URLs, pages, prompts, messages, files or anything people write.
- AI-looking tools that aren't in angar's list yet are sent as "possible AI" and appear in Review, where you decide whether they count.
## Silent install (IT)
Run the app as the signed-in user (not SYSTEM/root) with --silent --email-domain yourcompany.com. On Entra ID / Active Directory computers the email is read from Windows automatically. The exact commands for Intune, Jamf or scripts are on the download page under "For IT".
## Uninstall
Run angar --uninstall on the computer: it stops angar and removes it from that computer.
## See connected computers
Connected computers lists every computer with the app and whether it's online. The computer icon at the top right of every page shows how many are connected right now.`,
  },
  {
    slug: "scan",
    section: "Sources",
    title: "Other ways: one-off scan and network logs",
    summary: "Can't install the desktop app? Run a one-off command-line scan, or upload a DNS/firewall log.",
    keywords: ["scan", "scanner", "command", "cli", "network", "shadow", "dns", "firewall", "log", "edge", "discover", "extension"],
    body: `The desktop app is the recommended way to find AI. These alternatives are for computers where you can't install it, or to cover a whole network at once.
## One-off scan (command line)
1. Open Find AI automatically and expand Other ways → One-off scan (command line).
2. Copy the command and run it in Terminal (macOS, Linux) or PowerShell (Windows). The token is already in it.
3. It shows what it found and asks before sending. --dry-run sends nothing.
## Whole network
In the same section, upload a DNS or firewall log (Pi-hole, pfSense, FortiGate, Sophos, Windows DNS, Cisco Umbrella…). For an always-on view without installing anything on computers, see angar Edge.
## Browser extension
For computers where apps can't be installed (e.g. Chromebooks), a Chrome/Edge extension is available under Other ways. It reports only the names of AI websites.`,
  },
  {
    slug: "spend-check",
    section: "Getting started",
    title: "Free AI Spend Check",
    summary: "A public page anyone can use without an account: drop a statement, see AI spend and savings. Nothing is stored.",
    keywords: ["check", "free", "public", "try", "no account"],
    body: `Open /check (also linked from the sign-in page), drop a statement and see AI subscriptions, spend and savings in seconds. The file is read in memory and never saved. Share the link with anyone who wants to try angar.`,
  },
  {
    slug: "monthly-report",
    section: "Using angar",
    title: "Monthly report and AI register",
    summary: "A monthly email for owners and admins, and an AI register ready for the EU AI Act and GDPR records.",
    keywords: ["report", "email", "monthly", "register", "ai act", "gdpr", "article 4", "pdf"],
    body: `## Monthly report
Owners and admins receive a monthly email: AI in use, spend, top savings and what changed. Open it any time from the user menu → Monthly report, email it to yourself or save it as PDF.
## AI register
On Your AI press AI register: an Excel file with every AI, provider, category, who uses it, the data it touches, the EU AI Act risk class and cost. Use it for your AI Act inventory and AI literacy records (article 4).`,
  },
  {
    slug: "connect-a-provider",
    section: "Sources",
    title: "Connect an AI provider",
    summary: "Paste an API key on the provider's card — angar checks it and runs the first sync immediately.",
    keywords: ["connect", "api key", "key", "anthropic", "openai", "claude", "chatgpt", "gemini", "mistral", "connector", "not working", "rejected", "error"],
    body: `1. Open Sources → AI provider keys and find the provider (e.g. Anthropic, OpenAI, Google Gemini, Mistral, xAI, DeepSeek, Groq, Cohere, Together AI, OpenRouter, Hugging Face).
2. Click Connect, paste the API key and press Connect again.
3. angar verifies the key with a read-only call (it lists the available models — no credits are used), saves it encrypted and runs the first sync.
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
    section: "Sources",
    title: "Where to find your API key",
    summary: "Direct links to the API key page of every supported provider.",
    keywords: ["where", "find", "api key", "console", "create key"],
    body: `Create a dedicated key named "angar" — you can revoke it any time without affecting other apps.
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
Every card in Sources → AI provider keys also has a direct link.`,
  },
  {
    slug: "admin-vs-normal-keys",
    section: "Sources",
    title: "Admin keys vs normal keys",
    summary: "A normal key shows you use a provider and which models are available; an Admin key also brings in users.",
    keywords: ["admin", "users", "organization", "difference"],
    body: `- Normal API key: confirms your company uses the provider and lists the models available. Works with any account.
- Admin key (Anthropic and OpenAI only): also reads the organization's users, so angar knows who has access. Requires an organization account (Anthropic Team/Enterprise, OpenAI organization).
The provider card shows "Admin key" when one is in use.`,
  },
  {
    slug: "import-csv",
    section: "Sources",
    title: "Import from a spreadsheet (CSV)",
    summary: "Upload a CSV with one row per AI system — works for any tool, even without an API.",
    keywords: ["csv", "excel", "import", "spreadsheet", "upload", "template", "bulk"],
    body: `1. In Sources → AI provider keys → Import, click Download template.
2. Fill one row per AI system. Columns: name (required), vendor, type, model, owner_email, department, monthly_cost.
3. Save as CSV (in Excel: File → Save as → CSV) and drop it in the upload area, then press Import CSV.
Rows with the same name update the existing system instead of duplicating it. Owners are created automatically from their email.
Valid types: AI_APPLICATION, AI_AGENT, AI_API, AI_FEATURE, AI_DEV_TOOL, MCP_SERVER.`,
  },
  {
    slug: "add-manually",
    section: "Sources",
    title: "Add an AI system manually",
    summary: "One form, one AI system — risk and assurance are computed immediately.",
    keywords: ["manual", "add", "new system", "create"],
    body: `In Sources → AI provider keys → Import, use "Add one manually": give a name and optionally a vendor, and press Add AI system. The cost is found automatically from your statements. You land on its AI Passport, where you can set the owner, status, EU AI Act classification and alternatives.`,
  },
  {
    slug: "github",
    section: "Sources",
    title: "GitHub code scanning",
    summary: "Finds AI SDKs (OpenAI, Anthropic, Gemini, LangChain…) in your repositories.",
    keywords: ["github", "code", "repository", "sdk", "scan"],
    body: `Once GitHub sign-in is enabled on your deployment, click Sign in with GitHub and pick your organization. angar reads package.json, requirements.txt and pyproject.toml of your most recently updated repositories and creates an AI Passport for each AI SDK it finds, recording where it was found.`,
  },
  {
    slug: "ai-passports",
    section: "Using angar",
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
    section: "Using angar",
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
    section: "Using angar",
    title: "Estate map and dependencies",
    summary: "Which provider powers each system and which data it touches.",
    keywords: ["map", "graph", "dependency", "dependencies", "provider", "data"],
    body: `The estate map on Overview shows three columns: providers → AI systems → data. A red dot marks a high-risk system or sensitive data (personal, financial, source code). Each Passport has its own dependency graph: users → the system → the systems and data it depends on. Click a system on the map to open its Passport.`,
  },
  {
    slug: "savings",
    section: "Using angar",
    title: "Savings",
    summary: "angar calculates savings by itself from your bills, seats, usage and list prices.",
    keywords: ["savings", "save", "cost", "cheaper", "alternative", "optimize", "spend", "seats", "annual"],
    body: `Savings are calculated automatically — there is nothing to enter.
## What angar looks for
- Yearly billing: business plans paid monthly that are cheaper yearly.
- Unused seats: seats you pay for that nobody used in the last 30 days (needs Microsoft 365, Google Workspace or an Admin key to know who is active).
- Premium seats: expensive tiers where the standard plan is probably enough.
- Duplicate tools: two AI assistants (or coding assistants) paid for the same job.
- Oversized models: API usage on a top model where a cheaper one would do for simple requests.
- Unused subscriptions: paid, but not seen on any computer with the desktop app recently.
Each suggestion says how sure angar is (Sure, Likely, Worth checking). Press ✕ to hide one that doesn't apply.
List prices are updated regularly; check before changing a plan.`,
  },
  {
    slug: "changes",
    section: "Using angar",
    title: "Changes",
    summary: "What changed between syncs: model, vendor and status, before and after.",
    keywords: ["changes", "history", "model change", "before", "after"],
    body: `Every time a sync finds a different model or vendor, or someone changes a status, angar records a change with the old and new value and the time it was detected. See them all in Changes, the latest on Overview, and per system in its Passport export.`,
  },
  {
    slug: "export",
    section: "Using angar",
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
3. Copy the link and send it. Whoever opens it sees numbers, charts, the estate map and the system list — nothing else in angar.
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
    title: "angar Edge",
    summary: "A small appliance on your network that detects AI traffic no connector can see.",
    keywords: ["edge", "device", "hardware", "appliance", "network", "shadow ai"],
    body: `angar Edge is a plug-and-play device for your office or plant network. It detects traffic to AI services (ChatGPT, Claude, Gemini, Copilot…) without inspecting content, finds shadow AI and feeds AI Passports, the estate map and Changes.
It's billed per device per month on top of any plan, with a 12-month minimum; hardware and replacement are included. angar Edge is in early access — order from Plan & billing.`,
  },
  {
    slug: "security",
    section: "Security",
    title: "How your keys and data are handled",
    summary: "Read-only access, keys encrypted at rest, nothing sent to third parties.",
    keywords: ["security", "encryption", "privacy", "gdpr", "safe", "keys", "data"],
    body: `- Sources are read-only: angar never changes anything in your providers.
- API keys are encrypted at rest (AES-256-GCM) and can be deleted any time with Disconnect.
- angar stores metadata about AI systems (names, models, owners, costs, events) — not the content of prompts or documents.
- Card details are handled by Stripe and never reach angar.`,
  },
  {
    slug: "alerts",
    section: "Saving money",
    title: "Alerts, renewals and Slack / Teams",
    summary: "Every morning angar checks renewals in the next 14 days, budgets, AI that isn't allowed and seats to free — and tells you in the bell and in your team chat.",
    keywords: ["alerts", "bell", "notifications", "renewal", "slack", "teams", "weekly", "digest"],
    body: `The bell at the top right shows what needs a decision. angar checks every morning (Rome time), nothing to set up.
## What you get alerts for
- Renewals in the next 14 days, with the seats nobody used in 60 days — reduce them before you pay again.
- Budgets at 80% and 100% of a team's monthly budget.
- AI marked "Not allowed" being used by someone.
- Seats ready to remove after the "do you still need it?" email.
## Slack or Microsoft Teams
1. Settings → Slack or Microsoft Teams.
2. Paste an incoming webhook URL (Slack: Apps → Incoming Webhooks; Teams: channel → Workflows → "Post to a channel when a webhook request is received").
3. angar sends a test message, then a summary every Monday and the important alerts as they happen.`,
  },
  {
    slug: "seat-cleanup",
    section: "Saving money",
    title: "Free the seats nobody uses",
    summary: "angar asks inactive people 'do you still need it?' and lists the seats you can remove.",
    keywords: ["seats", "unused", "inactive", "cleanup", "remove", "license"],
    body: `Usage → Seat clean-up.
1. Click "Ask inactive people now": everyone who hasn't used a paid AI in 30 days gets an email with one link.
2. They answer "I still need it" or "free it up". No answer in 7 days counts as "free it up".
3. Remove those seats in the provider's admin page, then click "Mark removed" — angar lowers seats and cost.
Emails need email sending set up on the deployment. Nobody is asked twice within 30 days.`,
  },
  {
    slug: "budgets",
    section: "Saving money",
    title: "Budgets per team",
    summary: "Set a monthly AI budget per department; angar warns at 80% and 100%.",
    keywords: ["budget", "department", "team", "limit"],
    body: `Budgets splits each AI's monthly cost across departments by who uses it (departments come from Microsoft 365 / Google Workspace, or you set them on People). Set a budget per team; angar alerts at 80% and 100%.`,
  },
  {
    slug: "advisor",
    section: "Saving money",
    title: "AI Advisor — your ideal AI stack",
    summary: "From real usage and today's prices, angar suggests one standard tool per job and how to get there.",
    keywords: ["advisor", "recommend", "stack", "standardise", "consolidate"],
    body: `AI Advisor looks at who really uses which AI in the last 30 days and suggests one standard tool per job (assistant, coding, search, meetings), the seats you need, personal plans to move to a business plan and yearly billing where it pays. Every step shows the saving and why.`,
  },
  {
    slug: "ai-act",
    section: "Governance",
    title: "EU AI Act readiness",
    summary: "Classify every AI, see your readiness score and the key dates, export the AI register for your DPO.",
    keywords: ["ai act", "compliance", "risk", "high-risk", "dpo", "register", "literacy"],
    body: `AI Act suggests a risk tier for each AI (minimal, limited, high) from what it is and what data it touches, and shows a readiness score with the key dates (AI literacy since February 2025, most obligations from August 2026). Apply the suggestions, record AI literacy training, and download the AI register (Excel) for your DPO. Guidance, not legal advice.`,
  },
  {
    slug: "not-allowed-ai",
    section: "Governance",
    title: "AI that isn't allowed",
    summary: "Mark an AI 'Not allowed' and angar alerts IT when it's used — and tells the person with a gentle message.",
    keywords: ["policy", "blocked", "not allowed", "shadow ai", "deepseek"],
    body: `In Review (or on the AI's passport) choose "Not allowed". When the desktop app sees someone using it, angar creates an alert for you and shows the person a short message once a day: the company hasn't approved it, please use the approved tools. angar never blocks websites and never sees content.`,
  },
  {
    slug: "partner-console",
    section: "Workspaces",
    title: "Partner console for accountants and MSPs",
    summary: "Manage AI spend for many client companies from one place.",
    keywords: ["partner", "accountant", "msp", "clients", "multi"],
    body: `If you belong to more than one workspace, the account menu shows Partner console: every client workspace with AI spend, possible savings, items to review, connected computers and alerts, sorted by savings. Create a new client workspace from there and open any client in one click.`,
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
