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
    keywords: ["bank", "statement", "estratto conto", "card", "invoice", "fattura", "td17", "xml", "p7m", "zip", "pdf", "peppol", "ubl", "xrechnung", "zugferd", "factur-x", "facturae", "xsig", "ehf", "e-rechnung", "credit note", "accounting", "datev", "cost", "costs"],
    body: `## Upload files
1. Export the statement from your bank or card as CSV or Excel. Three months is ideal.
2. Drop it on Overview or in Connect → Sources. Several files at once are fine.
3. angar keeps only the AI charges (OpenAI, Claude, Cursor, Copilot, Perplexity…) and discards everything else.
## E-invoices
Drop e-invoices (FatturaPA, Peppol/UBL, XRechnung, ZUGFeRD, Factur-X, Facturae) as XML, PDF or the zip from your accountant — any mix works. The format is recognised from the content.
- Italy: FatturaPA XML or .p7m. Foreign AI subscriptions appear as TD17 self-invoices.
- Peppol, EHF, Svefaktura, XRechnung: UBL or CII XML.
- Spain: Facturae 3.2, 3.2.1 or 3.2.2 as XML, signed or not (.xsig too). Files with several invoices are fine; corrective invoices with negative totals count as credit notes.
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
    keywords: ["microsoft", "365", "entra", "azure", "google", "workspace", "copilot", "sso", "oauth", "who uses", "email history", "sign-ups", "receipts", "mail.readbasic.all", "gmail"],
    body: `1. Open Connect → Sources and press Connect next to Microsoft 365 or Google Workspace.
2. Sign in as an administrator and approve. angar only reads: never emails, files or chats.
## What angar sees
- Microsoft 365: AI apps in Entra ID, who authorised them, sign-ins of the last 30 days, Copilot licences and usage.
- Google Workspace: AI apps people authorised with "Sign in with Google".
New AI found this way appears in To review.
## Email history
angar finds which AI services each person signed up for, signs in to or gets receipts from, going back up to 24 months: right after you connect, then every day.
- Only messages from known AI services' sender addresses are looked at.
- angar reads the sender, the date and the subject. The subject is used in memory to tell sign-ups, sign-ins and receipts apart, and is never stored. The body is never read.
- Stored: the AI service, first and last date, a count of each kind and the person (a pseudonym outside "By person").
- A receipt only shows that someone pays for it themselves or expenses it. angar doesn't guess amounts.
- Microsoft 365 needs the Mail.ReadBasic.All application permission (no access to the body). Google Workspace needs domain-wide delegation for angar's client ID with the gmail.readonly scope; angar only asks Gmail for the sender, subject and date.
- Turn it off in Sources → Accounts. Turning it off deletes the stored email signals.`,
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
    slug: "cloud-ai-platforms",
    section: "Connect",
    title: "Azure OpenAI, AWS Bedrock and Google Vertex AI",
    summary: "Read the daily cost of the AI models you run on Azure, AWS or Google Cloud straight from your own cloud billing. Read-only.",
    keywords: ["azure", "azure openai", "foundry", "aws", "bedrock", "amazon", "google cloud", "gcp", "vertex", "gemini api", "bigquery", "billing export", "cost explorer", "cost management", "cloud", "hyperscaler"],
    body: `Most API spend runs through a cloud account. Connect it in Connect → AI provider keys → Cloud AI platforms and angar reads the AI lines of your cloud bill every day: cost by day, model and resource, converted to EUR.
## Azure OpenAI / AI Foundry
1. In Microsoft Entra ID, register an app and create a client secret.
2. On the subscription, give the app the role "Cost Management Reader". Optional: "Monitoring Reader" adds token counts for each OpenAI resource.
3. Paste tenant ID, client ID, secret value and subscription ID.
angar reads Cost Management for Cognitive Services and Foundry Models and keeps the model lines (gpt-4o, o3, Llama…). Speech, Vision and Translator are left out.
## AWS Bedrock
1. Enable Cost Explorer once in the Billing console.
2. Create an IAM user with one permission: ce:GetCostAndUsage. Create an access key for it.
3. Paste the access key ID and secret.
Models sold through Bedrock, such as Claude or Llama, are shown as "Claude … (Anthropic via Bedrock)". AWS charges $0.01 for each Cost Explorer call; a daily sync makes about two, the first one about ten.
## Google Vertex AI and Gemini API
1. Turn on Billing → Billing export → Standard usage cost to BigQuery. Data appears from the day you turn it on.
2. Create a service account. Give it "BigQuery Data Viewer" on the export dataset and "BigQuery Job User" on the project that holds it. Create a JSON key.
3. Paste the table name (project.dataset.gcp_billing_export_v1_…), the dataset location if it isn't US or EU multi-region, and the JSON key.
angar queries only the Vertex AI and Gemini API lines, credits included.
## How it stays up to date
- The first sync reads up to 12 months, newest first; if that takes too long it continues on the next sync.
- Every day angar re-reads the last 35 days, because cloud bills settle for a few days. Charges are updated in place, never counted twice.
- Amounts in USD or other currencies are converted to EUR; the original amount stays in the charge description.
- Data is read from your own cloud accounts with your read-only credentials, stored encrypted. Disconnect deletes them.`,
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
- Email: add SMTP_URL (e.g. smtps://user:password@smtp-relay.brevo.com:465) and EMAIL_FROM to .env, then run the install command again. Any SMTP server works, including EU providers such as Brevo or Mailjet.
- EU-only mode: add ANGAR_EU_ONLY=1 to .env and run the install command again.
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
Guidance, not legal advice.
## AI Act tier and GDPR register
- Each AI gets an AI Act tier: prohibited, high, limited, minimal or general-purpose AI (GPAI), with the reasons and what your company must do as deployer. HR and recruiting tools are high risk (Annex III, point 4); general chatbots are GPAI with transparency duties.
- angar never marks an AI prohibited on its own. To change a tier, open the AI → Manage → EU AI Act, pick a tier and say why. The change goes to the audit log.
- Governance → Register drafts your GDPR Art. 30 record for each AI that processes personal data: purpose, data, people, processor, transfers outside the EEA, retention, security, owner and AI Act tier.
- Fields angar can't infer show "To complete": click Edit to fill them in. Transfers marked with a yellow dot come from vendor terms and need a check.
- Export the register as CSV, or print it as PDF.`,
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
2. Drop the client's e-invoices (FatturaPA, Peppol / UBL, XRechnung, ZUGFeRD, Factur-X, Facturae) and bank or card statements.
3. Share the results; savings are verified on the next bank charges.
Companies that want to try angar directly can apply to the pilot programme at /pilot.`,
  },
  {
    slug: "security",
    section: "Account & plans",
    title: "Security and privacy",
    summary: "Read-only access, keys encrypted at rest, never the content of what people write.",
    keywords: ["security", "encryption", "privacy", "gdpr", "safe", "keys", "data", "employees", "works council", "betriebsrat", "statuto", "trust", "dpa", "dpia", "sub-processors", "subprocessors", "iso 27001", "cse", "accordo sindacale", "eu-only", "eu only", "smtp", "brevo", "mailjet", "data transfers"],
    body: `- Every source is read-only: angar never changes anything in your providers.
- Keys are encrypted at rest (AES-256-GCM) and deleted on Disconnect.
- angar stores names, models, owners, costs and minutes of use — never prompts, messages, pages or files.
- Employee privacy (Settings → Privacy): show usage by person, by department (groups of 5+) or as company totals only. New workspaces start by department.
- Card details stay with Stripe.
- Keep AI answers inside the EU (Settings → Privacy): nothing from your workspace goes to Anthropic. The assistant answers from the documentation and contracts are read by rules.
- EU-only mode for a whole deployment: set ANGAR_EU_ONLY=1 and send email through your own SMTP server (SMTP_URL), for example Brevo or Mailjet, both in France. Resend and AI answers are then never used.
- Where data lives, sub-processors, the DPA, a DPIA template and works council templates: [Trust Center](/trust).`,
  },
  {
    slug: "okta",
    section: "Connect",
    title: "Okta",
    summary: "For companies on Okta: which AI apps are assigned in Okta, who signs in to them and which OAuth consents people gave.",
    keywords: ["okta", "identity", "sso", "single sign-on", "system log", "api token", "ssws", "read-only administrator", "oauth", "consent", "idp"],
    body: `1. In the Okta Admin Console, sign in as an administrator with the Read-Only Administrator role.
2. Open Security → API → Tokens and create a token. The token has the same rights as the person who creates it, so a read-only administrator keeps it read-only.
3. In angar, open Connect → AI provider keys → Identity, enter your Okta domain (for example acme.okta.com, or your custom sign-in domain) and paste the token.
4. Press Test & connect. angar tries the token with one read of your apps before saving it, then runs the first sync.
## What angar sees
- AI apps configured in Okta, recognised from their name and sign-in addresses.
- The people assigned to each of those apps: work email, name and department.
- From the Okta System Log, the last 90 days: who signed in to those apps with single sign-on (first and last time, how often) and OAuth consents given to them.
angar never reads passwords, MFA factors, groups or any other app. New AI found this way appears in To review.
## Good to know
- Names and emails follow your privacy setting (Settings → Privacy): outside "By person" angar keeps only pseudonyms.
- The token is encrypted at rest (AES-256-GCM) and deleted on Disconnect. You can also revoke it in Okta at any time.
- angar respects Okta's rate limits and stops a sync after about 4 minutes; later syncs only read new events.
- An OAuth service app (scopes okta.apps.read, okta.users.read, okta.logs.read) instead of an API token is planned.`,
  },
  {
    slug: "network-logs",
    section: "Connect",
    title: "Network logs (Cloudflare, Umbrella, Zscaler, Fortinet, DNS)",
    summary: "Find AI in the DNS and firewall logs your company already has — no angar Edge box needed.",
    keywords: ["network", "logs", "dns", "firewall", "proxy", "cloudflare", "gateway", "zero trust", "warp", "umbrella", "cisco", "zscaler", "nss", "fortinet", "fortigate", "fortianalyzer", "bind", "windows dns", "pi-hole", "pfsense", "opnsense", "unbound", "syslog", "csv", "upload", "shadow ai"],
    body: `Open Connect → AI provider keys → Network logs. Results show up next to angar Edge (Connect → angar Edge) and new AI lands in To review.
## Cloudflare Gateway
1. In the Cloudflare dashboard, create an API token with Account Analytics: Read on your account.
2. Copy the account ID from Account home.
3. Paste both in angar and press Test & connect. The first sync reads the last 7 days; after that angar reads new DNS queries once a day.
## Cisco Umbrella
1. In Umbrella, open Admin → API Keys and add a key with the Reports read-only scope.
2. Paste the key and the secret in angar and press Test & connect. Same schedule as Cloudflare.
## Upload a log file
For Zscaler, Fortinet and DNS servers, export the logs and drop the files (.csv, .log, .txt, .json, or a .zip of them, up to 50 MB). angar recognises the format on its own:
- Zscaler NSS web logs (CSV) and Zscaler JSON exports.
- FortiGate and FortiAnalyzer traffic, web filter and DNS logs (key=value lines).
- BIND query logs, Windows DNS debug logs, Pi-hole and dnsmasq, pfSense and OPNsense (Unbound).
- Cisco Umbrella and Cloudflare exports, Palo Alto, Sophos and Meraki syslog.
- Any CSV with a domain, host or URL column, plus optional user, IP and time columns.
After the upload you see how many lines were read, the AI services found and how many people or devices used them.
## What angar keeps
- Only AI services from the catalog (and new sites that look like AI), the day, a count, and the person or device as your privacy setting allows.
- Never full URLs, paths, query strings or any other site. Everything else in the file is dropped while it is read.
- Outside "By person" people are kept as pseudonyms; with "Company totals only" not even devices are kept.
- API tokens and secrets are encrypted at rest (AES-256-GCM) and deleted on Disconnect.`,
  },
  {
    slug: "gateway",
    section: "Connect",
    title: "angar Gateway",
    summary: "Send your apps' OpenAI and Anthropic calls through angar: each one is measured, checked against your rules and cleaned of sensitive values. Prompts are never stored.",
    keywords: ["gateway", "proxy", "llm", "openai", "anthropic", "base url", "virtual key", "agk", "redact", "redaction", "iban", "codice fiscale", "pii", "cap", "limit", "allowed models", "health data", "tokens"],
    body: `angar Gateway sits between your company's apps and the AI providers. Your apps keep their SDK; they change two lines: the key and the base URL. It is part of the Govern plan.
## Connect an app
1. In Connect → Gateway → Policies, under Provider keys, paste the OpenAI and/or Anthropic API key the gateway should use (or reuse a normal key already saved in AI provider keys; admin keys can't call models).
2. In Keys, create a key for the app (agk_…), with its team and, if you want, a monthly cap and allowed models. The key is shown once.
3. In the app, use the agk_ key and set the base URL to /api/gateway/openai/v1 (OpenAI SDK) or /api/gateway/anthropic (Anthropic SDK) on your angar address. "How to connect" in Policies has ready snippets.
## What is supported
- OpenAI: POST /chat/completions (also streaming), POST /embeddings, GET /models.
- Anthropic: POST /messages (also streaming).
- Any other path answers 404 with a JSON error. Bodies are limited to 10 MB.
## The rules, in order
- EU-only providers: requests go only to an endpoint an admin marked as hosted in the EU (for example an Azure OpenAI resource in an EU region or a Mistral endpoint); others are blocked. It is always on when the workspace or the deployment is in EU-only mode.
- Allowed models: any other model is blocked. "gpt-4o-mini" also allows its dated versions; a key can have its own list.
- Health data: requests that mention diagnoses, medical records or medication (English, Italian, German, French, Spanish) are blocked. The word list is deliberately short to avoid stopping ordinary requests.
- Monthly caps: for a team (Policies) or a key (Keys). Once reached, the gateway answers 429 until the 1st of next month.
- Redaction: IBANs (checked with mod-97), Italian tax codes (check character), emails, card numbers (Luhn) and phone numbers are replaced with [IBAN], [TAX_CODE], [EMAIL], [CARD] and [PHONE] before the request leaves. Ordinary numbers, dates and amounts are left alone.
- Rate limit: requests a minute for each key (600 by default).
## What angar keeps
- Metadata only: time, key, team, model, tokens, cost in EUR, latency, status, the policy result and how many values of each type were redacted.
- Never the prompt, the answer or the redacted values. They pass through in memory only.
- Logs are deleted after 12 months, like other usage data.
- Spend at list price becomes a daily line in Savings, Budgets and the forecast (source "gateway"), unless the provider's admin key is connected — then the provider's own billing already counts these calls.
## Errors your app may see
- 401: missing, wrong or revoked agk_ key.
- 403: model not allowed, health data, EU-only, or the plan doesn't include the gateway.
- 429: monthly cap reached or rate limit.
- 503: no provider key set for the gateway.`,
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
