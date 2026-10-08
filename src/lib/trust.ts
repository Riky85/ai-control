/**
 * Trust Center: i fatti su dove stanno i dati, cosa angar raccoglie e chi
 * sono i sub-responsabili. Una sola fonte per la pagina /trust e per i
 * modelli di documento (DPA, DPIA, misure di sicurezza): se il codice cambia,
 * si aggiorna qui e tutti i testi restano allineati.
 *
 * Regola: scrivere solo ciò che il codice fa davvero; nel dubbio, in modo prudente.
 */
import { MIN_GROUP } from "@/lib/privacy";
import { USAGE_RETENTION_MONTHS } from "@/lib/jobs";

// Conservazione dei dati d'uso: lo stesso valore usato da purgeOldUsage (jobs.ts).
export { MIN_GROUP, USAGE_RETENTION_MONTHS };

export const HOSTING = {
  provider: "Railway",
  region: "europe-west4",
  country: "the Netherlands (EU)",
};

export interface SubProcessor {
  name: string;
  purpose: string;
  data: string;
  location: string;
  /** Sempre attivo sul cloud, oppure solo se il cliente lo collega / lo usa. */
  when: "always" | "optional";
  whenText: string;
  /** Uso in modalità solo UE (ANGAR_EU_ONLY=1): sempre, mai, o solo se il cliente lo collega. */
  euOnly: "used" | "not-used" | "optional";
  euOnlyText: string;
}

export const SUB_PROCESSORS: SubProcessor[] = [
  {
    name: "Railway Corporation",
    purpose: "Hosting of the application and the database, nightly backups",
    data: "All service data",
    location: `EU — ${HOSTING.region} region, ${HOSTING.country}`,
    when: "always",
    whenText: "Always (cloud edition)",
    euOnly: "used",
    euOnlyText: "Used — EU region only",
  },
  {
    name: "Stripe",
    purpose: "Subscription billing and payments",
    data: "Billing details only: billing contact, company name, VAT number, billing address and payment status, plus an opaque account reference and the plan chosen. Card details are entered on Stripe and never reach angar. No workspace data is sent to Stripe.",
    location: "Ireland entity; transfers outside the EEA under SCCs",
    when: "always",
    whenText: "When you subscribe to a paid plan",
    euOnly: "used",
    euOnlyText: "Used for billing details only — no workspace data",
  },
  {
    name: "Resend",
    purpose: "Sending service emails (sign-in links, alerts, reports, invitations)",
    data: "Recipient work email and the content of the email",
    location: "May process outside the EEA under SCCs / EU–US Data Privacy Framework",
    when: "always",
    whenText: "Cloud edition, unless the deployment sends email through its own SMTP server (SMTP_URL)",
    euOnly: "not-used",
    euOnlyText: "Not used — email goes only through the deployment's SMTP server",
  },
  {
    name: "Anthropic",
    purpose: "In-app assistant (Ask angar) and reading contracts you upload",
    data: "Your question, a summary of workspace figures, or the text of the uploaded contract. Under Anthropic's commercial terms, API data is not used to train models.",
    location: "May process outside the EEA under SCCs / EU–US Data Privacy Framework",
    when: "optional",
    whenText: "Only when the assistant is enabled on the platform and you use it. Never in the on-premises edition, in EU-only mode, or in a workspace that keeps AI answers inside the EU.",
    euOnly: "not-used",
    euOnlyText: "Not used — AI answers are off",
  },
  {
    name: "Enable Banking",
    purpose: "Open-banking connection to read AI charges from your bank account",
    data: "Bank transactions, of which angar keeps only the AI charges",
    location: "EU (Finland)",
    when: "optional",
    whenText: "Only if you connect it",
    euOnly: "optional",
    euOnlyText: "Only if you connect it — EU",
  },
  {
    name: "Chift",
    purpose: "Connection to your accounting software to read AI invoices",
    data: "Supplier invoices, of which angar keeps only the AI lines",
    location: "EU (Belgium)",
    when: "optional",
    whenText: "Only if you connect it",
    euOnly: "optional",
    euOnlyText: "Only if you connect it — EU",
  },
  {
    name: "Fatture in Cloud (TeamSystem)",
    purpose: "Connection to Italian e-invoicing to read AI invoices",
    data: "Supplier e-invoices, of which angar keeps only the AI lines",
    location: "EU (Italy)",
    when: "optional",
    whenText: "Only if you connect it",
    euOnly: "optional",
    euOnlyText: "Only if you connect it — EU",
  },
  {
    name: "GitHub",
    purpose: "Finding AI SDKs and exposed AI keys in your repositories",
    data: "Read access to code you choose; angar stores only the findings (file, service, key fingerprint)",
    location: "May process outside the EEA under SCCs / EU–US Data Privacy Framework",
    when: "optional",
    whenText: "Only if you connect it",
    euOnly: "optional",
    euOnlyText: "Not blocked — only if you connect it; outside the EEA",
  },
  {
    name: "Microsoft Azure, Amazon Web Services, Google Cloud (your accounts)",
    purpose: "Reading the AI lines of your own cloud bill: Azure OpenAI / AI Foundry, AWS Bedrock, Google Vertex AI and Gemini API",
    data: "angar fetches the data from your own cloud accounts with read-only credentials you create (Cost Management Reader, ce:GetCostAndUsage, BigQuery Data Viewer + Job User). They act for you as your providers, not as angar's sub-processors; nothing from angar is sent to them beyond the read request.",
    location: "Wherever your cloud account and billing data are; Cost Explorer answers only from us-east-1",
    when: "optional",
    whenText: "Only if you connect them",
    euOnly: "optional",
    euOnlyText: "Not blocked — only if you connect them; location depends on your account",
  },
];

/**
 * Modalità solo UE: cosa resta nell'UE, cosa no, come si attiva. Solo ciò che
 * il codice impone (eu-only.ts, mail.ts, assistant.ts, contract-actions.ts).
 */
export const EU_ONLY = {
  stays: [
    `Workspace data is stored and processed in the EU: ${HOSTING.provider}, ${HOSTING.region} region, ${HOSTING.country}.`,
    "AI answers are off: nothing is sent to Anthropic — not your questions, not workspace figures, not uploaded contracts. The assistant answers from the documentation, and contracts are read by built-in rules.",
    "Email (sign-in links, invitations, alerts, reports) goes only through the SMTP server set for the deployment, for example Brevo or Mailjet, both in France. Resend is never used; without an SMTP server, email stays off.",
  ],
  outside: [
    "Billing details are handled by Stripe (Ireland entity, transfers under SCCs); no workspace data is sent to Stripe.",
    "Services you connect yourself — Microsoft 365, Google Workspace, GitHub, your AI providers, Slack, Microsoft Teams — exchange data with angar wherever they run. EU-only mode does not block them: connect only the ones you accept.",
  ],
  turnOn: [
    { who: "Self-hosted and on-premises", text: "Set ANGAR_EU_ONLY=1, SMTP_URL (for example smtps://user:password@smtp-relay.brevo.com:465) and EMAIL_FROM, then restart. It applies to every workspace on the server." },
    { who: "Any workspace", text: "Settings → Privacy → Keep AI answers inside the EU. It turns off AI answers for your workspace only; how email is sent is set for the whole deployment." },
  ],
};

/** Cosa raccoglie angar, per fonte. */
export const COLLECTED: { source: string; text: string }[] = [
  { source: "Bank statements and e-invoices", text: "Only the lines recognised as AI services: date, amount, description and service. Every other transaction is dropped while the file is read; the file itself is not stored." },
  { source: "Company accounts (Microsoft 365, Google Workspace)", text: "People (name, work email, department) and which AI apps they signed in to or connected, with dates. Licences change only after an admin approves it." },
  { source: "AI provider admin keys", text: "Seats, usage and cost reported by the provider. Unused seats are removed only after an admin approves it." },
  { source: "Desktop app", text: "The name of each AI tool used, minutes of use each day, the computer's name, operating system and work email. Browser history is matched on the computer; only AI service names leave it." },
  { source: "Browser extension", text: "The names of AI websites visited, each day. Never URLs, page titles or content." },
  { source: "angar Edge (network sensor)", text: "Which AI services are contacted, connection counts for each device and, if you turn on firewall logs, bytes sent. Never URLs or content." },
  { source: "Your team in angar", text: "Members' names, work emails, roles, sign-in records and an audit log of administrator actions." },
  { source: "Email history (Microsoft 365, Google Workspace)", text: "Only messages from known AI services' sender addresses, back up to 24 months. angar reads the sender, the date and the subject; the subject is used in memory to tell sign-ups, sign-ins and receipts apart and is never stored. The body is never read. Stored: the AI service, first and last date, a count of each kind and the person (a pseudonym outside \"By person\"). Admins can turn it off in Sources." },
  { source: "Okta", text: "Which AI apps are configured in Okta, the people assigned to them (name, work email, department), and from the System Log of the last 90 days who signed in to those apps and which OAuth consents they gave, with dates. Never passwords, MFA factors, groups or other apps. The API token is encrypted at rest." },
  { source: "Cloud AI platforms (Azure, AWS, Google Cloud)", text: "From your own cloud accounts: the daily cost of AI services (Azure OpenAI / AI Foundry, Bedrock, Vertex AI, Gemini API) by model, resource or SKU, and usage quantities such as tokens. Never prompts, outputs, resources' content or any other part of the bill. Credentials are read-only and encrypted at rest." },
  { source: "Network logs (Cloudflare Gateway, Cisco Umbrella, uploaded firewall and DNS logs)", text: "Only lines that reach an AI service: the service, the day, a count, whether it was blocked and the person or device (work email, kept as a pseudonym outside \"By person\", or internal IP; neither with company totals only). Every other line, full URLs, paths and query strings are dropped while the logs are read; uploaded files are not stored. API tokens and secrets are read-only and encrypted at rest." },
  { source: "angar Gateway (AI calls your apps send through angar)", text: `Prompts and answers pass through angar's servers in memory to reach the provider you chose; they are never written to disk or stored, and neither are the values the gateway redacts. Stored for each request: time, the angar key and its team, provider, model, token counts, cost, latency, status, the policy result (allowed, redacted or blocked) and how many values of each type were redacted. Kept ${USAGE_RETENTION_MONTHS} months. Provider keys are encrypted at rest; angar keys are stored only as SHA-256 hashes.` },
];

export const NEVER_COLLECTED: string[] = [
  "Prompts, answers, chats, emails, messages, files or documents",
  "Full URLs, searches, page titles, screenshots or keystrokes",
  "Use of websites and programs that are not AI tools",
  "Location, or personal devices that aren't enrolled",
  "Card numbers (they stay with Stripe)",
  "Bank transactions that aren't AI charges",
];

export interface MeasureGroup {
  title: string;
  items: string[];
}

/** Misure tecniche e organizzative (art. 32 GDPR), come le implementa il codice. */
export const MEASURES: MeasureGroup[] = [
  {
    title: "Data minimisation and privacy by default",
    items: [
      "No content is ever collected: only AI tool names, dates, minutes, counts and costs.",
      "Bank and invoice files are filtered while they are read: only AI charges are stored and the file is discarded.",
      `New workspaces start in "By department" mode: usage is only shown as totals for groups of at least ${MIN_GROUP} people; smaller teams are merged into "Other (small teams)", and counts under ${MIN_GROUP} are shown as "<${MIN_GROUP}".`,
      'In "By department" and "Company totals only" modes, usage records are stored under a keyed pseudonym (HMAC-SHA256 with a secret unique to each workspace) instead of an email, and computer names are obfuscated.',
      "Owners can replace names already collected with pseudonyms (Settings → Privacy → Erase names).",
      `Usage data from the desktop app, browser extension and angar Edge is deleted automatically after ${USAGE_RETENTION_MONTHS} months.`,
      "Email history reads only messages from AI services' senders, and only their sender, date and subject (Microsoft: Mail.ReadBasic.All, which gives no access to the body; Google: metadata format only). Subjects are used in memory and never stored; email signals are kept under a keyed pseudonym in every privacy mode.",
    ],
  },
  {
    title: "Encryption",
    items: [
      "All traffic is served over HTTPS (TLS).",
      "Connector credentials and API keys are encrypted at rest with AES-256-GCM, with a key held only in the platform environment; angar refuses to store a credential if that key is missing.",
      "Credentials are deleted when a connector is disconnected.",
      "API keys issued by angar are stored only as SHA-256 hashes.",
    ],
  },
  {
    title: "Access control",
    items: [
      "Sign-in with Microsoft or Google (OpenID Connect single sign-on), or email and password.",
      "Passwords are hashed with scrypt and a unique salt for each password.",
      "Two-step verification (TOTP authenticator apps); workspace owners can make it mandatory for every member.",
      "Signed, HTTP-only session cookies (HMAC-SHA256), Secure in production.",
      "Workspace roles: Owner, Admin, Editor, Viewer. Workspace membership is checked on every request.",
      "Rate limiting on sign-in, sign-up and two-step verification.",
      "Sources are read by default. angar changes something in a provider only when an admin approves it: removing unused seats or opening a ticket in Jira or ServiceNow, each one recorded in the audit log.",
    ],
  },
  {
    title: "Integrity and accountability",
    items: [
      "Audit log of administrator actions, chained with SHA-256 hashes (each entry includes the hash of the previous one), so removed or altered entries can be detected; the chain can be verified from the app.",
      "Workspace data is separated by organisation in every database query.",
    ],
  },
  {
    title: "Availability and resilience",
    items: [
      `Hosted on ${HOSTING.provider} in the ${HOSTING.region} region (${HOSTING.country}).`,
      "Nightly logical backup of the full database, triggered by a protected scheduled job and kept with the hosting provider; access is limited to angar platform administrators.",
      "Health checks and error reporting on the production service.",
    ],
  },
  {
    title: "On-premises edition",
    items: [
      "The whole service can run on a server in your own network (Docker Compose): data never leaves it.",
      "No billing, no calls to the AI assistant and no external sub-processors other than the connectors you choose.",
    ],
  },
  {
    title: "EU-only mode",
    items: [
      "With ANGAR_EU_ONLY=1 the deployment never calls Anthropic: the assistant answers from the documentation and contracts are read by built-in rules.",
      "With ANGAR_EU_ONLY=1 email is never sent through Resend: only through the SMTP server set in SMTP_URL, or not at all.",
      "Each workspace can keep AI answers inside the EU (Settings → Privacy); angar then makes no calls to Anthropic with that workspace's data. The change is recorded in the audit log.",
    ],
  },
];

export const ROADMAP: { title: string; status: string; text: string }[] = [
  { title: "ISO/IEC 27001", status: "In preparation", text: "We are preparing for certification, with a target of 2027. angar is not certified today." },
  { title: "Data Processing Agreement", status: "Available", text: "Standard GDPR art. 28 agreement, below. Signed copies on request." },
];
