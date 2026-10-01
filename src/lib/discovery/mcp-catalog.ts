import type { DataSensitivity } from "@prisma/client";

/**
 * Server MCP noti: a quale servizio portano e quali dati possono raggiungere.
 * L'app desktop manda solo nome, trasporto, comando, pacchetto o host: qui si
 * riconosce il servizio e si decide che cosa l'agente AI può toccare.
 */

export type McpReach = "code" | "email" | "files" | "databases" | "payments" | "web" | "chat" | "docs" | "tickets" | "crm" | "calendar" | "cloud";

export const REACH_LABEL: Record<McpReach, string> = {
  code: "Code",
  email: "Email",
  files: "Files",
  databases: "Databases",
  payments: "Payments",
  web: "Web",
  chat: "Chat",
  docs: "Documents",
  tickets: "Tickets",
  crm: "Customers",
  calendar: "Calendar",
  cloud: "Cloud",
};

/** Dato raggiungibile → riga di "Data exposure" (nome e sensibilità, letti dal risk engine). */
export const REACH_DATA: Record<McpReach, { name: string; sensitivity: DataSensitivity }> = {
  code: { name: "Source code", sensitivity: "SOURCE_CODE" },
  email: { name: "Email", sensitivity: "PII" },
  files: { name: "Files", sensitivity: "PII" },
  databases: { name: "Databases", sensitivity: "PII" },
  payments: { name: "Payments", sensitivity: "FINANCIAL" },
  web: { name: "Web", sensitivity: "PUBLIC" },
  chat: { name: "Chat messages", sensitivity: "PII" },
  docs: { name: "Documents", sensitivity: "CONFIDENTIAL" },
  tickets: { name: "Tickets", sensitivity: "INTERNAL" },
  crm: { name: "Customer records", sensitivity: "PII" },
  calendar: { name: "Calendar", sensitivity: "PII" },
  cloud: { name: "Cloud infrastructure", sensitivity: "CONFIDENTIAL" },
};

/** Dati che contano per il rischio (stesse classi del risk engine). */
export const SENSITIVE_REACH: McpReach[] = ["code", "email", "files", "databases", "payments", "chat", "crm", "calendar"];

export interface McpService {
  id: string;
  name: string;
  vendor: string;
  reach: McpReach[];
  /** Pacchetto npm/PyPI o immagine docker. */
  pkg?: RegExp;
  /** Host dei server remoti (suffisso). */
  hosts?: string[];
  /** Nome dato al server nel file di configurazione. */
  key?: RegExp;
}

export const MCP_SERVICES: McpService[] = [
  { id: "github", name: "GitHub", vendor: "GitHub", reach: ["code"], pkg: /(^|\/)(server-github|github-mcp-server|github)$/, hosts: ["api.githubcopilot.com"], key: /^(github|gh)([-_ ]?mcp)?$/i },
  { id: "gitlab", name: "GitLab", vendor: "GitLab", reach: ["code"], pkg: /(server-gitlab|gitlab-mcp)/, key: /^gitlab/i },
  { id: "git", name: "Git", vendor: "Open source", reach: ["code"], pkg: /^(mcp-server-git|@modelcontextprotocol\/server-git|@cyanheads\/git-mcp-server)$/, key: /^git$/i },
  { id: "slack", name: "Slack", vendor: "Slack", reach: ["chat"], pkg: /slack/, hosts: ["mcp.slack.com"], key: /^slack/i },
  { id: "gmail", name: "Gmail", vendor: "Google", reach: ["email"], pkg: /gmail/, key: /^gmail/i },
  { id: "google-drive", name: "Google Drive", vendor: "Google", reach: ["files", "docs"], pkg: /(gdrive|google-drive)/, key: /^(gdrive|google[-_ ]?drive)/i },
  { id: "google-calendar", name: "Google Calendar", vendor: "Google", reach: ["calendar"], pkg: /google-calendar/, key: /^google[-_ ]?calendar/i },
  { id: "google-workspace", name: "Google Workspace", vendor: "Google", reach: ["email", "files", "calendar", "docs"], pkg: /(workspace-mcp|google-workspace)/, key: /^google[-_ ]?workspace/i },
  { id: "microsoft-365", name: "Microsoft 365", vendor: "Microsoft", reach: ["email", "files", "calendar", "docs"], pkg: /(ms-365|microsoft-365|outlook|onedrive|sharepoint)/, key: /^(ms365|m365|outlook|microsoft[-_ ]?365|onedrive|sharepoint)/i },
  { id: "notion", name: "Notion", vendor: "Notion", reach: ["docs"], pkg: /notion/, hosts: ["mcp.notion.com"], key: /^notion/i },
  { id: "linear", name: "Linear", vendor: "Linear", reach: ["tickets"], pkg: /linear/, hosts: ["mcp.linear.app"], key: /^linear/i },
  { id: "atlassian", name: "Atlassian (Jira, Confluence)", vendor: "Atlassian", reach: ["tickets", "docs"], pkg: /(atlassian|jira|confluence)/, hosts: ["mcp.atlassian.com"], key: /^(atlassian|jira|confluence)/i },
  { id: "postgres", name: "PostgreSQL", vendor: "Open source", reach: ["databases"], pkg: /(postgres|pg-mcp)/, key: /^(postgres|postgresql|pg)$/i },
  { id: "mysql", name: "MySQL", vendor: "Open source", reach: ["databases"], pkg: /mysql/, key: /^mysql/i },
  { id: "sqlite", name: "SQLite", vendor: "Open source", reach: ["databases"], pkg: /sqlite/, key: /^sqlite/i },
  { id: "mongodb", name: "MongoDB", vendor: "MongoDB", reach: ["databases"], pkg: /mongo/, key: /^mongo/i },
  { id: "supabase", name: "Supabase", vendor: "Supabase", reach: ["databases", "code"], pkg: /supabase/, hosts: ["mcp.supabase.com"], key: /^supabase/i },
  { id: "redis", name: "Redis", vendor: "Redis", reach: ["databases"], pkg: /redis/, key: /^redis/i },
  { id: "filesystem", name: "Filesystem", vendor: "Open source", reach: ["files"], pkg: /(server-filesystem|filesystem)/, key: /^(filesystem|files|fs)$/i },
  { id: "playwright", name: "Playwright", vendor: "Microsoft", reach: ["web"], pkg: /playwright/, key: /^playwright/i },
  { id: "puppeteer", name: "Puppeteer", vendor: "Open source", reach: ["web"], pkg: /puppeteer/, key: /^puppeteer/i },
  { id: "brave-search", name: "Brave Search", vendor: "Brave", reach: ["web"], pkg: /brave-search/, key: /^brave/i },
  { id: "fetch", name: "Web fetch", vendor: "Open source", reach: ["web"], pkg: /^(mcp-server-fetch|@modelcontextprotocol\/server-fetch|fetch)$/, key: /^fetch$/i },
  { id: "firecrawl", name: "Firecrawl", vendor: "Firecrawl", reach: ["web"], pkg: /firecrawl/, key: /^firecrawl/i },
  { id: "tavily", name: "Tavily", vendor: "Tavily", reach: ["web"], pkg: /tavily/, key: /^tavily/i },
  { id: "exa", name: "Exa", vendor: "Exa", reach: ["web"], pkg: /exa-mcp/, hosts: ["mcp.exa.ai"], key: /^exa$/i },
  { id: "context7", name: "Context7", vendor: "Upstash", reach: ["web"], pkg: /context7/, hosts: ["mcp.context7.com"], key: /^context7/i },
  { id: "stripe", name: "Stripe", vendor: "Stripe", reach: ["payments", "crm"], pkg: /stripe/, hosts: ["mcp.stripe.com"], key: /^stripe/i },
  { id: "paypal", name: "PayPal", vendor: "PayPal", reach: ["payments"], pkg: /paypal/, hosts: ["mcp.paypal.com"], key: /^paypal/i },
  { id: "shopify", name: "Shopify", vendor: "Shopify", reach: ["payments", "crm"], pkg: /shopify/, key: /^shopify/i },
  { id: "hubspot", name: "HubSpot", vendor: "HubSpot", reach: ["crm"], pkg: /hubspot/, hosts: ["mcp.hubspot.com"], key: /^hubspot/i },
  { id: "salesforce", name: "Salesforce", vendor: "Salesforce", reach: ["crm"], pkg: /salesforce/, key: /^salesforce/i },
  { id: "sentry", name: "Sentry", vendor: "Sentry", reach: ["code"], pkg: /sentry/, hosts: ["mcp.sentry.dev"], key: /^sentry/i },
  { id: "figma", name: "Figma", vendor: "Figma", reach: ["files"], pkg: /figma/, hosts: ["mcp.figma.com"], key: /^figma/i },
  { id: "aws", name: "AWS", vendor: "AWS", reach: ["cloud"], pkg: /^(awslabs\.|@aws|aws-)/, key: /^aws/i },
  { id: "cloudflare", name: "Cloudflare", vendor: "Cloudflare", reach: ["cloud"], pkg: /cloudflare/, hosts: ["mcp.cloudflare.com"], key: /^cloudflare/i },
  { id: "vercel", name: "Vercel", vendor: "Vercel", reach: ["cloud", "code"], pkg: /vercel/, hosts: ["mcp.vercel.com"], key: /^vercel/i },
  { id: "zapier", name: "Zapier", vendor: "Zapier", reach: ["email", "files", "crm"], pkg: /zapier/, hosts: ["mcp.zapier.com"], key: /^zapier/i },
  { id: "memory", name: "Memory", vendor: "Open source", reach: [], pkg: /server-memory/, key: /^memory$/i },
  { id: "sequential-thinking", name: "Sequential thinking", vendor: "Open source", reach: [], pkg: /sequential-?thinking/, key: /^sequential[-_ ]?thinking$/i },
];

export const MCP_CLIENTS = ["claude_desktop", "cursor", "vscode", "windsurf", "claude_code", "zed"] as const;
export type McpClient = (typeof MCP_CLIENTS)[number];
export const CLIENT_LABEL: Record<McpClient, string> = {
  claude_desktop: "Claude Desktop",
  cursor: "Cursor",
  vscode: "VS Code",
  windsurf: "Windsurf",
  claude_code: "Claude Code",
  zed: "Zed",
};

/** Un server come arriva dall'app desktop, già ripulito di nuovo qui (mai fidarsi). */
export interface McpServerIn {
  client: McpClient;
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  package?: string;
  host?: string;
}

const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** Ripulisce un elemento di `mcp`: campi sconosciuti o sospetti si scartano. */
export function cleanMcpServer(raw: unknown): McpServerIn | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const client = MCP_CLIENTS.find((c) => c === r.client);
  if (!client) return null;
  const name = typeof r.name === "string" ? r.name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) : "";
  if (!name) return null;
  const transport = r.transport === "http" || r.transport === "sse" ? r.transport : "stdio";
  const out: McpServerIn = { client, name, transport };
  if (transport === "stdio") {
    const cmd = typeof r.command === "string" ? r.command.toLowerCase() : "";
    if (/^[a-z0-9._+-]{1,40}$/.test(cmd)) out.command = cmd;
    const pkg = typeof r.package === "string" ? r.package.toLowerCase().trim() : "";
    // Pacchetto npm (@scope/nome), PyPI o immagine docker (org/nome): mai percorsi o URL.
    if (pkg.length <= 100 && /^@?[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?$/.test(pkg)) out.package = pkg;
  } else {
    const host = typeof r.host === "string" ? r.host.toLowerCase().trim().replace(/\.$/, "") : "";
    if (HOST.test(host)) out.host = host;
  }
  return out;
}

const suffix = (host: string, d: string) => host === d || host.endsWith("." + d);

/** Servizio noto: prima dal pacchetto o dall'host, poi dal nome dato al server. */
export function matchMcp(s: Pick<McpServerIn, "name" | "package" | "host">): McpService | null {
  if (s.package) {
    const hit = MCP_SERVICES.find((m) => m.pkg?.test(s.package!));
    if (hit) return hit;
  }
  if (s.host) {
    const hit = MCP_SERVICES.find((m) => m.hosts?.some((d) => suffix(s.host!, d)));
    if (hit) return hit;
  }
  return MCP_SERVICES.find((m) => m.key?.test(s.name.trim())) ?? null;
}

const slug = (x: string) =>
  x
    .toLowerCase()
    .replace(/[^a-z0-9@/._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** "@acme/mcp-server-weather" → "weather"; "mcp.acme.com" → "acme.com". */
function prettyUnknown(s: McpServerIn): string {
  if (s.package) {
    const base = s.package.split("/").pop() ?? s.package;
    const p = base.replace(/^(mcp[-_]server[-_]|server[-_])/, "").replace(/([-_]mcp([-_]server)?|[-_]server)$/, "");
    return p || base;
  }
  if (s.host) return s.host.replace(/^(mcp|api)\./, "");
  return s.name;
}

/** Identità stabile dell'asset e nome da mostrare. */
export function mcpIdentity(s: McpServerIn): { externalId: string; name: string; vendor?: string; service: McpService | null } {
  const service = matchMcp(s);
  if (service) return { externalId: `mcp:${service.id}`, name: `${service.name} MCP`, vendor: service.vendor, service };
  const key = s.package ? s.package : s.host ? s.host : `name:${slug(s.name)}`;
  return { externalId: `mcp:${key}`, name: `${prettyUnknown(s)} MCP`.slice(0, 90), service: null };
}

/** Dati raggiungibili per un asset MCP salvato (dall'externalId). */
export function reachOfExternalId(externalId: string | null | undefined): McpReach[] | null {
  if (!externalId?.startsWith("mcp:")) return null;
  const id = externalId.slice(4);
  return MCP_SERVICES.find((m) => m.id === id)?.reach ?? null;
}
