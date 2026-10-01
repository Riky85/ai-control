/**
 * Documentazione di angar — unica fonte per la pagina /docs e per
 * l'assistente "Ask docs". Formato del corpo: righe normali = paragrafi,
 * "## " = sottotitolo, "- " = elenco puntato, "1. " = passi numerati.
 */
import { PARTNER, SUCCESS_FEE } from "@/lib/plans";

export interface DocArticle {
  slug: string;
  section: string;
  title: string;
  summary: string;
  body: string;
  keywords?: string[];
}

export const DOCS: DocArticle[] = [
  // ——— Getting started ———
  {
    slug: "what-is-angar",
    section: "Getting started",
    title: "What is angar",
    summary: "angar finds every AI your company uses or pays for, what it costs and where you can save — automatically.",
    keywords: ["overview", "intro", "what", "how it works"],
    body: `angar answers three questions without asking you to type anything: which AI does the company use, how much does it cost, and where can we save.
## The sidebar, top to bottom
- Overview — every AI you use or pay for, with cost and status.
- To review — new AI angar found: allow it or not, in one click.
- Savings — what to change to pay less.
- Usage — who uses which AI, and the seats nobody uses.
- Budgets — monthly AI cost for each team.
- Governance — policies, EU AI Act and the records auditors ask for.
- Connect — where the data comes from: bank and invoices, company accounts, provider keys, the desktop app and angar Edge.`,
  },
  {
    slug: "first-10-minutes",
    section: "Getting started",
    title: "Your first 10 minutes",
    summary: "Drop a bank statement, look at Savings, then connect more when you want.",
    keywords: ["start", "setup", "onboarding", "quick", "first"],
    body: `1. On Overview, drop a bank or card statement (CSV or Excel) or your e-invoices. angar finds every AI subscription with plan, seats and monthly cost.
2. Open Savings: suggestions are already calculated.
3. When you're ready, open Connect: add Microsoft 365 or Google Workspace to see who uses what, and the desktop app to find AI nobody pays for.
Nothing else is required: no costs to type, no owners to assign. Invite colleagues later from Settings → Workspace.`,
  },
  {
    slug: "spend-check",
    section: "Getting started",
    title: "Free AI Spend Check",
    summary: "A public page anyone can use without an account: drop a statement, see AI spend and savings. Nothing is stored.",
    keywords: ["check", "free", "public", "try", "no account"],
    body: `Open /check (also linked from the sign-in page), drop a statement and see AI subscriptions, spend and savings in seconds. The file is read in memory and never saved.`,
  },

  // ——— Connect ———
  {
    slug: "bank-statements",
    section: "Connect",
    title: "Bank statements and e-invoices",
    summary: "Drop a bank or card export or your e-invoices: angar finds every AI you pay for, with plan, seats and real cost.",
    keywords: ["bank", "statement", "estratto conto", "card", "invoice", "fattura", "td17", "xml", "p7m", "zip", "pdf", "peppol", "ubl", "xrechnung", "zugferd", "factur-x", "ehf", "e-rechnung", "credit note", "accounting", "datev", "cost", "costs"],
    body: `## Upload files
1. Export the statement from your bank or card as CSV or Excel. Three months is ideal.
2. Drop it on Overview or in Connect → Sources. Several files at once are fine.
3. angar keeps only the AI charges (OpenAI, Claude, Cursor, Copilot, Perplexity…) and discards everything else.
## E-invoices
Drop e-invoices (FatturaPA, Peppol/UBL, XRechnung, ZUGFeRD, Factur-X) as XML, PDF or the zip from your accountant — any mix works. The format is recognised from the content.
- Italy: FatturaPA XML or .p7m. Foreign AI subscriptions appear as TD17 self-invoices.
- Peppol, EHF, Svefaktura, XRechnung: UBL or CII XML.
- ZUGFeRD and Factur-X: the PDF itself — angar reads the XML inside it. A PDF without e-invoice data is not read here: use Read a contract (PDF) or upload the bank statement.
Invoices from resellers keep only the AI lines. Credit notes reduce the cost. Amounts in USD, GBP, CHF, SEK, NOK, DKK, PLN or CZK are converted to EUR (approximate rates outside USD).
## Or connect once
In Connect → Sources: Bank account (read-only, renewed every 90 days), Accounting software (DATEV, Pennylane, Exact, Sage, Xero…) or Fatture in Cloud. New charges then arrive by themselves.
## How cost is calculated
The monthly cost is the average of the charges. From the amount angar also recognises the plan and the seats (e.g. 305 € ≈ 10 seats of ChatGPT Business).`,
  },
  {
    slug: "company-accounts",
    section: "Connect",
    title: "Microsoft 365 and Google Workspace",
    summary: "An administrator approves read-only access once; angar sees which AI apps people sign in to with their work account.",
    keywords: ["microsoft", "365", "entra", "azure", "google", "workspace", "copilot", "sso", "oauth", "who uses"],
    body: `1. Open Connect → Sources and press Connect next to Microsoft 365 or Google Workspace.
2. Sign in as an administrator and approve. angar only reads: never emails, files or chats.
## What angar sees
- Microsoft 365: AI apps in Entra ID, who authorised them, sign-ins of the last 30 days, Copilot licences and usage.
- Google Workspace: AI apps people authorised with "Sign in with Google".
New AI found this way appears in To review.`,
  },
  {
    slug: "connect-a-provider",
    section: "Connect",
    title: "AI provider keys",
    summary: "Paste an OpenAI, Anthropic, Gemini… key to get exact API costs. Read-only, encrypted.",
    keywords: ["connect", "api key", "key", "anthropic", "openai", "claude", "chatgpt", "gemini", "mistral", "admin", "not working", "rejected", "error", "where", "find"],
    body: `1. Open Connect → AI provider keys and pick the provider.
2. Paste the key and press Connect. angar checks it with a read-only call (no credits used) and runs the first sync.
Create a dedicated key named "angar" in the provider's console — each card has a direct link to it — so you can revoke it any time.
## Normal or Admin key
- Normal key: confirms you use the provider and lists the models.
- Admin key (Anthropic, OpenAI): also brings in users and exact costs.
## If the key is rejected
Copy the whole key without spaces, and check it isn't revoked or expired. Disconnect deletes the key; your data stays.`,
  },
  {
    slug: "import-csv",
    section: "Connect",
    title: "Import a list or add one AI",
    summary: "Upload a CSV with one row for each AI — works for tools without an API — or add a single AI by hand.",
    keywords: ["csv", "excel", "import", "spreadsheet", "upload", "template", "bulk", "manual", "add"],
    body: `1. In Connect → AI provider keys → Import, download the template.
2. One row for each AI. Columns: name (required), vendor, type, model, owner_email, department, monthly_cost.
3. Save as CSV and drop it in. Rows with the same name update the existing AI instead of duplicating it.
To add a single AI, use "Add one manually" in the same place.`,
  },
  {
    slug: "desktop-app",
    section: "Connect",
    title: "The desktop app",
    summary: "One install on each computer: angar sees which AI each person uses — in every browser and app — and for how long.",
    keywords: ["desktop", "app", "install", "download", "agent", "computer", "shadow", "usage", "silent", "intune", "jamf", "uninstall", "windows", "mac", "linux", "resync", "mcp", "mcp server", "agents"],
    body: `The desktop app finds the AI people really use, including AI nobody pays for through the company.
## Install it
1. Open Connect → Desktop app and download it for Windows, macOS or Linux. The file is already linked to your company.
2. Open it and type your work email once. It runs in the background and starts at login.
3. To cover everyone, copy the company link on the same page and send it to colleagues.
## What it sends
- Only AI tool names and the minutes spent on each, each day — e.g. "ChatGPT, 40 minutes".
- Never URLs, pages, prompts, messages or files.
## AI agents and MCP servers
It also lists MCP servers configured on the computer — names only, never keys. From version 0.5.6, once a day, it reads the MCP settings of Claude Desktop, Claude Code, Cursor, VS Code, Windsurf and Zed and sends the server name, the app, and the package or the web address host (e.g. "GitHub MCP in Cursor"). Never tokens, passwords, environment values, headers or file paths.
Each server appears in To review and in Governance → AI agents & MCP servers, with the data it can reach (code, email, files, databases, payments…), how many computers and people have it, and an Approve / Not allowed decision.
## For IT
Silent install: run it as the signed-in user with --silent --email-domain yourcompany.com. Commands for Intune, Jamf and scripts are on the Desktop app page. Uninstall with angar --uninstall.
After you reset workspace data, the app sends its history again by itself.`,
  },
  {
    slug: "angar-edge",
    section: "Connect",
    title: "angar Edge",
    summary: "One sensor on your network sees every AI on every device — phones, servers, scripts — with nothing installed on computers.",
    keywords: ["edge", "sensor", "device", "hardware", "appliance", "network", "dns", "firewall", "syslog", "shadow ai", "block", "docker", "raspberry"],
    body: `angar Edge watches the network instead of the computers. It sees only AI service names, counts and upload sizes — never URLs, prompts or files.
## Three ways to run it
- Software: Docker or a Linux/Windows binary on any always-on machine. It acts as the network's DNS resolver and/or reads your firewall logs (Fortinet, Sophos, Palo Alto, Meraki, UniFi, pfSense).
- Cloud logs: already on Cloudflare Gateway, Zscaler or Cisco Umbrella? Send their logs, nothing to install.
- angar device: a plug & play box for sites without IT.
## Set it up
Connect → angar Edge → add a sensor and follow the steps; the page shows when the sensor reports.
## What it adds
Blocks AI you mark "Not allowed" at DNS level, finds servers and scripts calling AI APIs directly, local models (Ollama, LM Studio) and large uploads to non-approved AI.
Software and cloud logs are included from the Save plan; each device is billed monthly.`,
  },

  {
    slug: "on-premises",
    section: "Connect",
    title: "angar on your own server",
    summary: "For companies that want no data on the internet: the whole of angar runs on your server or on the angar device.",
    keywords: ["on-prem", "on premises", "onprem", "self-hosted", "local", "locale", "server", "docker", "compose", "gdpr", "no cloud", "internal", "backup"],
    body: `With angar on-premises the app, the database and the network sensor run inside your company. Computers and sensors report to your server; nothing is sent to angar's cloud.
## Install
1. Take a Linux server or VM (2 CPU, 4 GB RAM, 20 GB disk) — or the angar device.
2. Run the command shown on the angar Edge page: curl -fsSL <angar>/api/onprem/install.sh | sudo sh
3. It installs Docker if needed, starts angar and prints its address (e.g. http://192.168.1.20:8080). Open it and create your account.
## Add computers and the network
- Connect → Desktop app: the downloaded app already points to your server.
- Connect → angar Edge: create a sensor, then on the same server run the installer again with "-s -- edge <token>".
## Update, backup, move
- Update: run the same install command again. Settings and data are kept.
- Backup: docker compose exec -T db pg_dump -U angar angar > backup.sql (in /opt/angar).
- Settings (address, port, keys) are in /opt/angar/.env.
## Good to know
Internet is used only to download updates and the desktop app. Bank, Microsoft 365 and Google connections work only if the server can reach them. Available on Enterprise.`,
  },

  // ——— Using angar ———
  {
    slug: "overview-and-review",
    section: "Using angar",
    title: "Overview and To review",
    summary: "Overview lists every AI with its cost; To review is where you decide about new AI in one click.",
    keywords: ["overview", "review", "approve", "allowed", "not allowed", "passport", "status", "owner"],
    body: `## Overview
Every AI you use or pay for, with monthly cost, users and status. Click one to open its page: cost, seats, who uses it, the data it touches, risk and how to save. Set the status (Approved, Needs review, Not allowed) next to the title.
## To review
New AI found by any source lands here. For each one choose Allow or Not allowed — or approve everything at once. The number next to To review in the sidebar is what's still waiting.`,
  },
  {
    slug: "savings",
    section: "Using angar",
    title: "Savings",
    summary: "angar calculates savings by itself from your bills, seats, usage and list prices.",
    keywords: ["savings", "save", "cost", "cheaper", "alternative", "optimize", "spend", "seats", "annual", "advisor", "stack"],
    body: `Nothing to enter: savings are calculated from what you pay and how the AI is used.
## What angar looks for
- Yearly billing where it's cheaper than monthly.
- Seats nobody used in the last 30 days.
- Premium tiers where the standard plan is enough.
- Two tools paid for the same job.
- API usage on a top model where a cheaper one would do.
- Subscriptions not seen on any computer recently.
Each suggestion says how sure angar is and has a button to the provider's billing page. Mark it done and angar checks the next bills to confirm the saving.`,
  },
  {
    slug: "seat-cleanup",
    section: "Using angar",
    title: "Usage and unused seats",
    summary: "Who uses which AI in the last 30 days — and a one-click email that asks inactive people if they still need their seat.",
    keywords: ["usage", "people", "seats", "unused", "inactive", "cleanup", "remove", "license", "who"],
    body: `Usage shows each AI and each person over the last 30 days. Click a person to see and edit their details (name, department).
## Seat clean-up
1. Press "Ask inactive people now": everyone who hasn't used a paid AI in 30 days gets an email with one link.
2. They answer "I still need it" or "free it up". No answer in 7 days counts as "free it up".
3. Remove those seats in the provider's admin page, then mark them removed — angar lowers seats and cost.`,
  },
  {
    slug: "budgets",
    section: "Using angar",
    title: "Budgets",
    summary: "A monthly AI budget for each team; angar warns at 80% and 100%.",
    keywords: ["budget", "department", "team", "limit", "chargeback", "showback", "cost centre"],
    body: `Budgets splits each AI's monthly cost across teams by who uses it (teams come from Microsoft 365 / Google Workspace, or from each person's department). Add a budget for a team and angar alerts at 80% and 100%.`,
  },
  {
    slug: "alerts",
    section: "Using angar",
    title: "Alerts, monthly report and Slack / Teams",
    summary: "Renewals, budgets, AI that isn't allowed and seats to free — in the bell, by email and in your team chat.",
    keywords: ["alerts", "bell", "notifications", "renewal", "slack", "teams", "weekly", "report", "monthly", "email"],
    body: `The bell at the top right shows what needs a decision. angar checks every morning:
- renewals in the next 14 days, with unused seats to cut first;
- budgets at 80% and 100%;
- AI marked "Not allowed" being used;
- seats ready to remove.
Owners and admins also get a monthly report by email (AI in use, spend, savings, what changed).
## Slack or Microsoft Teams
Settings → Integrations: paste an incoming webhook URL. angar sends a test, then a Monday summary and important alerts as they happen.`,
  },
  {
    slug: "ai-act",
    section: "Using angar",
    title: "Governance and the EU AI Act",
    summary: "Policies, AI that isn't allowed, EU AI Act classification and the AI register for your DPO — in one page.",
    keywords: ["governance", "ai act", "compliance", "risk", "high-risk", "dpo", "register", "literacy", "policy", "not allowed", "audit", "evidence"],
    body: `Governance collects the rules and records for every AI.
- Policies: mark an AI "Not allowed"; the desktop app shows the person a gentle message and you get an alert. With angar Edge it can also be blocked on the network.
- EU AI Act: angar suggests a risk tier for each AI and shows your readiness and the key dates. Record AI literacy training.
- Records: download the AI register (Excel) and the audit log for your DPO or auditor.
Guidance, not legal advice.`,
  },
  {
    slug: "export",
    section: "Using angar",
    title: "Export and share",
    summary: "Export any page to Excel or PDF, or share a read-only dashboard link.",
    keywords: ["export", "excel", "xlsx", "pdf", "download", "print", "share", "link", "dashboard", "board", "auditor"],
    body: `- Export: the Export button at the top right of a page downloads Excel or opens a clean PDF print.
- Share: Settings → Workspace → Share a dashboard creates a read-only link with an expiry, for management or auditors. You can see how often it was opened and revoke it any time.`,
  },

  // ——— Account & plans ———
  {
    slug: "members-and-roles",
    section: "Account & plans",
    title: "Members, roles and workspaces",
    summary: "Owner, Admin, Editor and Viewer — and one workspace for each company or client.",
    keywords: ["members", "roles", "invite", "team", "owner", "admin", "viewer", "editor", "permissions", "workspace", "workspaces", "switch", "partner", "msp", "accountant"],
    body: `## Roles
- Owner: everything, including billing.
- Admin: connections and members.
- Editor: edit AI, owners and costs.
- Viewer: read-only.
Invite from Settings → Workspace.
## Workspaces
Click the workspace name at the top of the sidebar to switch or create one. Each has its own AI, connections and members. Accountants and MSPs with several clients get the Partner console in the account menu.`,
  },
  {
    slug: "plans",
    section: "Account & plans",
    title: "Plans",
    summary: "Discover, Save, Govern and Enterprise — and how to upgrade.",
    keywords: ["plan", "plans", "pricing", "price", "billing", "upgrade", "subscription", "discover", "save", "govern", "free", "starter", "growth", "scale", "enterprise", "invoice", "trial", "success fee"],
    body: `- Discover — free: 5 AI, 1 connection, 1 member.
- Save — €249/month: 250 AI, unlimited connections, 15 members, 3 workspaces, savings verified on the next bank charges, angar Edge software. Or, instead of the fixed fee, ${SUCCESS_FEE.pct}% of the savings angar verifies on your bills — nothing if there are none (talk to us).
- Govern — €599/month: unlimited AI, Compliance included (AI Act evidence pack), 50 members, 10 workspaces.
- Enterprise: custom.
New workspaces start with a 14-day Save trial. Workspaces already on Starter keep it. Upgrade from Plan & billing (account menu). Yearly billing is cheaper. Payments by Stripe; prices exclude VAT.`,
  },
  {
    slug: "partners",
    section: "Account & plans",
    title: "For accountants and IT partners",
    summary: "Accountants, tax advisers and MSPs / IT providers manage many clients from one console, with a partner discount.",
    keywords: ["partner", "partners", "accountant", "accountants", "commercialista", "steuerberater", "bookkeeper", "tax adviser", "msp", "it provider", "reseller", "discount", "revenue share", "clients", "programme", "pilot"],
    body: `angar works well for firms that already handle their clients' e-invoices and bank statements: it finds the AI spend in them and shows each client where to save.
## How to join
Apply at /partners (English, Italiano, Deutsch, Français, Español). We reply within two working days.
## What partners get
- Partner console (account menu): every client workspace in one place, with AI spend, possible savings and what to review.
- ${PARTNER.discountPct}% off every licence and angar Edge device — or, if you prefer not to resell, a recurring share of what referred clients pay.
- Your brand on client reports: coming soon.
## Working with clients
1. Create a workspace for each client from the Partner console.
2. Drop the client's e-invoices (FatturaPA, Peppol / UBL, XRechnung, ZUGFeRD, Factur-X) and bank or card statements.
3. Share the results; savings are verified on the next bank charges.
Companies that want to try angar directly can apply to the pilot programme at /pilot.`,
  },
  {
    slug: "security",
    section: "Account & plans",
    title: "Security and privacy",
    summary: "Read-only access, keys encrypted at rest, never the content of what people write.",
    keywords: ["security", "encryption", "privacy", "gdpr", "safe", "keys", "data", "employees", "works council", "betriebsrat", "statuto", "trust", "dpa", "dpia", "sub-processors", "subprocessors", "iso 27001", "cse", "accordo sindacale"],
    body: `- Every source is read-only: angar never changes anything in your providers.
- Keys are encrypted at rest (AES-256-GCM) and deleted on Disconnect.
- angar stores names, models, owners, costs and minutes of use — never prompts, messages, pages or files.
- Employee privacy (Settings → Privacy): show usage by person, by department (groups of 5+) or as company totals only. New workspaces start by department.
- Card details stay with Stripe.
- Where data lives, sub-processors, the DPA, a DPIA template and works council templates: [Trust Center](/trust).`,
  },
];

/** Vecchi indirizzi degli articoli → articolo attuale. */
export const DOC_ALIASES: Record<string, string> = {
  scan: "desktop-app",
  "find-your-api-key": "connect-a-provider",
  "admin-vs-normal-keys": "connect-a-provider",
  "add-manually": "import-csv",
  github: "connect-a-provider",
  "ai-passports": "overview-and-review",
  "risk-and-assurance": "overview-and-review",
  "estate-map": "overview-and-review",
  changes: "overview-and-review",
  "monthly-report": "alerts",
  "share-dashboards": "export",
  workspaces: "members-and-roles",
  "partner-console": "members-and-roles",
  advisor: "savings",
  "not-allowed-ai": "ai-act",
};

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
