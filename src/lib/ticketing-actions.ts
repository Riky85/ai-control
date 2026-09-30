"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { encryptJson, decryptJson } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/alerts";
import {
  checkJira,
  checkServiceNow,
  isProjectKey,
  normaliseJiraSite,
  normaliseServiceNowInstance,
  sendTestTicket,
  type JiraConfig,
  type ServiceNowConfig,
  type TicketProvider,
} from "@/lib/ticketing";

/**
 * Jira e ServiceNow in Impostazioni → Integrazioni. Solo admin e owner.
 * Le credenziali si provano prima di salvarle, poi restano cifrate nel
 * Connector; il segreto vuoto in un aggiornamento tiene quello salvato.
 * Nel registro di audit mai segreti, solo host e progetto.
 */
const BACK = "/settings?tab=integrations";
const fail = (msg: string): never => redirect(`${BACK}&error=${encodeURIComponent(msg)}#tickets`);
const field = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

async function saveConnector(orgId: string, provider: TicketProvider, creds: unknown) {
  let enc: string;
  try {
    enc = encryptJson(creds);
  } catch (err) {
    return fail((err as Error).message);
  }
  await db.connector.upsert({
    where: { organizationId_provider: { organizationId: orgId, provider } },
    create: { organizationId: orgId, provider, status: "CONNECTED", credentialsEncrypted: enc, scopes: ["tickets:create"] },
    update: { status: "CONNECTED", credentialsEncrypted: enc, lastSyncError: null, scopes: ["tickets:create"] },
  });
}

export async function saveJiraAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const prev = decryptJson<JiraConfig>((await db.connector.findUnique({ where: { organizationId_provider: { organizationId: s.orgId, provider: "JIRA" } } }))?.credentialsEncrypted);
  const site = normaliseJiraSite(field(formData, "site"));
  const email = field(formData, "email", 200).toLowerCase();
  const apiToken = field(formData, "apiToken", 500) || prev?.apiToken || "";
  const projectKey = field(formData, "projectKey", 20).toUpperCase();
  if (!site) fail("Use your Jira Cloud address, like https://yourcompany.atlassian.net.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter the email of the Jira user that owns the API token.");
  if (!apiToken) fail("Paste a Jira API token (id.atlassian.com → Security → API tokens).");
  if (!isProjectKey(projectKey)) fail("The project key is the short code before ticket numbers, like OPS or IT.");
  const cfg: JiraConfig = { site: site!, email, apiToken, projectKey, issueType: field(formData, "issueType", 60) || prev?.issueType || "Task" };
  const ok = await checkJira(cfg);
  if (!ok.ok) fail(ok.error);
  await saveConnector(s.orgId, "JIRA", cfg);
  await audit("ticketing.connect", "JIRA", { site: cfg.site, projectKey, issueType: cfg.issueType });
  revalidatePath("/settings");
  redirect(`${BACK}&ticket=jira-connected#tickets`);
}

export async function saveServiceNowAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const prev = decryptJson<ServiceNowConfig>((await db.connector.findUnique({ where: { organizationId_provider: { organizationId: s.orgId, provider: "SERVICENOW" } } }))?.credentialsEncrypted);
  const instance = normaliseServiceNowInstance(field(formData, "instance"));
  const user = field(formData, "user", 200);
  const secret = field(formData, "secret", 2000) || prev?.secret || "";
  const assignmentGroup = field(formData, "assignmentGroup", 120);
  if (!instance) fail("Use your ServiceNow address, like https://yourcompany.service-now.com.");
  if (!secret) fail("Paste the password of the integration user, or an OAuth token.");
  const cfg: ServiceNowConfig = { instance: instance!, user, secret, ...(assignmentGroup ? { assignmentGroup } : {}) };
  const ok = await checkServiceNow(cfg);
  if (!ok.ok) fail(ok.error);
  await saveConnector(s.orgId, "SERVICENOW", cfg);
  await audit("ticketing.connect", "SERVICENOW", { instance: cfg.instance, assignmentGroup: assignmentGroup || null, auth: user ? "basic" : "token" });
  revalidatePath("/settings");
  redirect(`${BACK}&ticket=servicenow-connected#tickets`);
}

const providerOf = (f: FormData): TicketProvider | null => {
  const p = String(f.get("provider") ?? "");
  return p === "JIRA" || p === "SERVICENOW" ? p : null;
};

export async function disconnectTicketingAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const provider = providerOf(formData);
  if (!provider) fail("Unknown ticketing tool.");
  await db.connector.deleteMany({ where: { organizationId: s.orgId, provider: provider! } });
  await audit("ticketing.disconnect", provider!);
  revalidatePath("/settings");
  redirect(`${BACK}&ticket=off#tickets`);
}

export async function testTicketAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const provider = providerOf(formData);
  if (!provider) fail("Unknown ticketing tool.");
  const r = await sendTestTicket(s.orgId, provider!, appUrl(), s.email);
  if (!r.ok) fail(`Test ticket failed — ${r.error}`);
  redirect(`${BACK}&ticket=test&key=${encodeURIComponent(r.ok ? r.key : "")}#tickets`);
}
