"use server";

import { currentOrgId } from "@/lib/org";
import { requireRole, currentSession } from "@/lib/auth";
import { issueSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail, appOrigin } from "@/lib/mail";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { MemberRole, Plan } from "@prisma/client";
import { db } from "@/lib/db";
import { planById, withinLimit, PLANS, EDGE, addonById, planRank } from "@/lib/plans";
import { stripeEnabled, stripePost, checkoutCommonParams } from "@/lib/stripe";
import { getPlanState } from "@/lib/plan-gate";
import { revalidateOrgSetup } from "@/lib/layout-data";

const ROLES: MemberRole[] = ["OWNER", "ADMIN", "EDITOR", "VIEWER"];

async function org() {
  return db.organization.findUniqueOrThrow({ where: { id: currentOrgId() } });
}

function origin() {
  const h = headers();
  return process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

// ── Membri ──────────────────────────────────────────────────────────────
export async function inviteMemberAction(formData: FormData) {
  const me = await requireRole("ADMIN", "/workspace");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const role = (ROLES.includes(formData.get("role") as MemberRole) ? formData.get("role") : "VIEWER") as MemberRole;
  if (!email.includes("@")) redirect(`/workspace?error=${encodeURIComponent("Enter a valid email.")}`);
  // Solo un owner crea altri owner (un admin non può promuovere né sé stesso né altri).
  if (role === "OWNER" && me.role !== "OWNER") redirect(`/workspace?error=${encodeURIComponent("Only an owner can add another owner.")}`);

  const o = await org();
  const count = await db.workspaceMember.count({ where: { organizationId: currentOrgId() } });
  if (!withinLimit(planById(o.plan).limits.members, count)) {
    redirect(`/workspace?error=${encodeURIComponent(`Your ${planById(o.plan).displayName} plan includes ${planById(o.plan).limits.members} members. Upgrade to add more.`)}`);
  }
  const existing = await db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: currentOrgId(), email } } });
  // Re-invitare un owner cambierebbe il suo ruolo: stesse regole di setMemberRoleAction.
  if (existing?.role === "OWNER" && role !== "OWNER") {
    if (me.role !== "OWNER") redirect(`/workspace?error=${encodeURIComponent("Only an owner can change the owner role.")}`);
    const owners = await db.workspaceMember.count({ where: { organizationId: currentOrgId(), role: "OWNER" } });
    if (owners <= 1) redirect(`/workspace?error=${encodeURIComponent("A workspace needs at least one owner.")}`);
  }
  // Nuovo link d'invito a ogni invio (solo per chi non è ancora entrato).
  const inviteToken = existing?.status === "active" ? undefined : randomBytes(24).toString("base64url");
  await db.workspaceMember.upsert({
    where: { organizationId_email: { organizationId: currentOrgId(), email } },
    update: { role, name: name ?? undefined, ...(inviteToken ? { inviteToken } : {}) },
    create: { organizationId: currentOrgId(), email, name, role, inviteToken },
  });
  const inviter = currentSession();
  const signupLink = inviteToken ? `${appOrigin(headers())}/api/invite/${inviteToken}` : `${appOrigin(headers())}/login`;
  const mail = await sendEmail({
    to: email,
    subject: `${inviter?.name ?? inviter?.email ?? "Someone"} invited you to ${o.name} on angar`,
    text: `You've been invited to the ${o.name} workspace on angar as ${role.toLowerCase()}.\n\nOpen this link to join (it's personal — don't forward it):\n${signupLink}`,
  });
  await audit("member.invite", email, { role, emailSent: mail.sent });
  revalidateOrgSetup(me.orgId);
  revalidatePath("/workspace");
  redirect(`/workspace?invited=1&inviteLink=${encodeURIComponent(signupLink)}&emailSent=${mail.sent ? 1 : 0}`);
}

export async function setMemberRoleAction(formData: FormData) {
  const me = await requireRole("ADMIN", "/workspace");
  const id = String(formData.get("memberId"));
  const role = formData.get("role") as MemberRole;
  if (!ROLES.includes(role)) return;
  // Solo membri di questo workspace; deve restare almeno un Owner.
  const member = await db.workspaceMember.findFirst({ where: { id, organizationId: currentOrgId() } });
  if (!member) return;
  // Il ruolo Owner (darlo o toglierlo) lo gestiscono solo gli owner.
  if ((role === "OWNER" || member.role === "OWNER") && me.role !== "OWNER") redirect(`/workspace?error=${encodeURIComponent("Only an owner can give or change the owner role.")}`);
  if (member.role === "OWNER" && role !== "OWNER") {
    const owners = await db.workspaceMember.count({ where: { organizationId: currentOrgId(), role: "OWNER" } });
    if (owners <= 1) redirect(`/workspace?error=${encodeURIComponent("A workspace needs at least one owner.")}`);
  }
  await db.workspaceMember.update({ where: { id: member.id }, data: { role } });
  await audit("member.role_change", member?.email, { from: member?.role, to: role });
  revalidatePath("/workspace");
}

export async function removeMemberAction(formData: FormData) {
  const me = await requireRole("ADMIN", "/workspace");
  const id = String(formData.get("memberId"));
  const member = await db.workspaceMember.findFirst({ where: { id, organizationId: currentOrgId() } });
  if (member?.role === "OWNER" && me.role !== "OWNER") redirect(`/workspace?error=${encodeURIComponent("Only an owner can remove an owner.")}`);
  if (member?.role === "OWNER") {
    const owners = await db.workspaceMember.count({ where: { organizationId: currentOrgId(), role: "OWNER" } });
    if (owners <= 1) redirect(`/workspace?error=${encodeURIComponent("You can't remove the last owner.")}`);
  }
  await db.workspaceMember.deleteMany({ where: { id, organizationId: currentOrgId() } });
  await audit("member.remove", member?.email);
  revalidateOrgSetup(me.orgId);
  revalidatePath("/workspace");
}

// ── Dashboard condivise ─────────────────────────────────────────────────
export async function createShareLinkAction(formData: FormData) {
  await requireRole("EDITOR", "/workspace?tab=sharing");
  const name = String(formData.get("name") ?? "").trim() || "AI estate overview";
  const days = Number(formData.get("expiresInDays") ?? 0);
  const o = { plan: (await getPlanState(currentOrgId())).effectivePlan };
  const active = await db.shareLink.count({ where: { organizationId: currentOrgId(), revokedAt: null } });
  if (!withinLimit(planById(o.plan).limits.sharedDashboards, active)) {
    redirect(`/workspace?tab=sharing&error=${encodeURIComponent(`Your ${planById(o.plan).displayName} plan includes ${planById(o.plan).limits.sharedDashboards} shared dashboard${planById(o.plan).limits.sharedDashboards === 1 ? "" : "s"}. Upgrade for more.`)}`);
  }
  const link = await db.shareLink.create({
    data: {
      organizationId: currentOrgId(),
      token: randomBytes(18).toString("base64url"),
      name,
      expiresAt: days > 0 ? new Date(Date.now() + days * 86400_000) : null,
    },
  });
  await audit("share.create", link.id, { name, expiresInDays: days });
  revalidatePath("/workspace");
  redirect("/workspace?tab=sharing&shared=1");
}

export async function revokeShareLinkAction(formData: FormData) {
  await requireRole("EDITOR", "/workspace?tab=sharing");
  await db.shareLink.updateMany({ where: { id: String(formData.get("linkId")), organizationId: currentOrgId() }, data: { revokedAt: new Date() } });
  await audit("share.revoke", String(formData.get("linkId")));
  revalidatePath("/workspace");
}

// ── Abbonamento ─────────────────────────────────────────────────────────
export async function startCheckoutAction(formData: FormData) {
  await requireRole("OWNER", "/billing");
  const plan = formData.get("plan") as Plan;
  const annual = formData.get("interval") === "year";
  const back = `/billing${annual ? "?billing=annual&" : "?"}`;
  const def = PLANS.find((p) => p.id === plan);
  const envName = annual ? def?.stripeAnnualPriceEnv : def?.stripePriceEnv;
  const price = envName ? process.env[envName] : undefined;
  if (!stripeEnabled() || !price) {
    redirect(`${back}error=${encodeURIComponent(annual && def?.stripePriceEnv && process.env[def.stripePriceEnv] ? "Annual billing isn't available yet — choose monthly." : "Payments aren't connected on this deployment yet.")}`);
  }

  const o = await org();
  let url = "";
  try {
    // Già abbonato: il cambio di piano passa dal portale Stripe (niente secondo abbonamento).
    if (o.stripeSubscriptionId && o.stripeCustomerId) {
      const portal = await stripePost<{ url: string }>("/billing_portal/sessions", {
        customer: o.stripeCustomerId,
        return_url: `${origin()}/billing`,
        "flow_data[type]": "subscription_update",
        "flow_data[subscription_update][subscription]": o.stripeSubscriptionId,
      });
      url = portal.url;
    } else {
      const session = await stripePost<{ url: string }>("/checkout/sessions", {
        mode: "subscription",
        "line_items[0][price]": price!,
        "line_items[0][quantity]": "1",
        success_url: `${origin()}/billing?checkout=success`,
        cancel_url: `${origin()}/billing?checkout=cancelled`,
        client_reference_id: o.id,
        "metadata[organizationId]": o.id,
        "metadata[plan]": plan,
        "metadata[interval]": annual ? "year" : "month",
        "subscription_data[metadata][organizationId]": o.id,
        "subscription_data[metadata][plan]": plan,
        ...checkoutCommonParams(o.stripeCustomerId),
      });
      url = session.url;
    }
  } catch (err) {
    redirect(`${back}error=${encodeURIComponent((err as Error).message)}`);
  }
  await audit("billing.checkout_start", plan, { interval: annual ? "year" : "month" });
  redirect(url);
}

/** Add-on (es. Compliance): abbonamento Stripe separato, sopra qualsiasi piano a pagamento. */
export async function startAddonCheckoutAction(formData: FormData) {
  await requireRole("OWNER", "/billing");
  const addon = addonById(String(formData.get("addon") ?? ""));
  const annual = formData.get("interval") === "year";
  if (!addon) redirect("/billing");
  const price = process.env[annual ? addon!.stripeAnnualPriceEnv : addon!.stripePriceEnv];
  if (!stripeEnabled() || !price) redirect(`/billing?error=${encodeURIComponent(annual ? `The ${addon!.name} add-on isn't available with annual billing yet — choose monthly.` : "Payments aren't connected on this deployment yet.")}#addons`);

  const o = await org();
  if (o.addons.includes(addon!.id)) redirect(`/billing?error=${encodeURIComponent(`${addon!.name} is already active.`)}#addons`);
  if (planRank(o.plan) >= planRank(addon!.includedFrom) && o.planStatus === "active") redirect(`/billing?error=${encodeURIComponent(`${addon!.name} is already included in your plan.`)}#addons`);
  let url = "";
  try {
    const session = await stripePost<{ url: string }>("/checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": price!,
      "line_items[0][quantity]": "1",
      success_url: `${origin()}/billing?checkout=addon#addons`,
      cancel_url: `${origin()}/billing?checkout=cancelled#addons`,
      client_reference_id: o.id,
      "metadata[organizationId]": o.id,
      "metadata[kind]": "addon",
      "metadata[addon]": addon!.id,
      "subscription_data[metadata][organizationId]": o.id,
      "subscription_data[metadata][kind]": "addon",
      "subscription_data[metadata][addon]": addon!.id,
      ...checkoutCommonParams(o.stripeCustomerId),
    });
    url = session.url;
  } catch (err) {
    redirect(`/billing?error=${encodeURIComponent((err as Error).message)}#addons`);
  }
  await audit("billing.checkout_start", addon!.id, { interval: annual ? "year" : "month", kind: "addon" });
  redirect(url);
}

export async function openBillingPortalAction() {
  await requireRole("OWNER", "/billing");
  const o = await org();
  if (!stripeEnabled() || !o.stripeCustomerId) redirect(`/billing?error=${encodeURIComponent("No billing account yet — choose a plan first.")}`);
  let url = "";
  try {
    const session = await stripePost<{ url: string }>("/billing_portal/sessions", { customer: o.stripeCustomerId!, return_url: `${origin()}/billing` });
    url = session.url;
  } catch (err) {
    redirect(`/billing?error=${encodeURIComponent((err as Error).message)}`);
  }
  redirect(url);
}

export async function startEdgeCheckoutAction(formData: FormData) {
  await requireRole("OWNER", "/billing");
  const quantity = Math.max(1, Math.min(EDGE.maxSelfServe, Math.floor(Number(formData.get("quantity") ?? 1))));
  const price = process.env[EDGE.stripePriceEnv];
  if (!stripeEnabled() || !price) redirect(`/billing?error=${encodeURIComponent("Payments aren't connected on this deployment yet.")}#edge`);

  const o = await org();
  let url = "";
  try {
    const countries = ["IT", "DE", "FR", "ES", "NL", "BE", "AT", "CH", "PT", "IE", "SE", "DK", "FI", "PL", "GB", "US"];
    const session = await stripePost<{ url: string }>("/checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": price!,
      "line_items[0][quantity]": String(quantity),
      ...Object.fromEntries(countries.map((c, i) => [`shipping_address_collection[allowed_countries][${i}]`, c])),
      success_url: `${origin()}/billing?checkout=edge#edge`,
      cancel_url: `${origin()}/billing?checkout=cancelled#edge`,
      client_reference_id: o.id,
      "metadata[organizationId]": o.id,
      "metadata[kind]": "edge",
      "subscription_data[metadata][organizationId]": o.id,
      "subscription_data[metadata][kind]": "edge",
      ...checkoutCommonParams(o.stripeCustomerId),
    });
    url = session.url;
  } catch (err) {
    redirect(`/billing?error=${encodeURIComponent((err as Error).message)}#edge`);
  }
  redirect(url);
}

// ── Workspace multipli ──────────────────────────────────────────────────
export async function switchWorkspaceAction(formData: FormData) {
  const id = String(formData.get("orgId"));
  const s = currentSession();
  if (!s) redirect("/login");
  const account = await db.account.findUnique({ where: { id: s.accountId } });
  const member = await db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: id, email: s.email } } });
  if (account && member?.status === "active") {
    await issueSession(account, id);
    await audit("workspace.switch", id, undefined, { orgId: id });
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createWorkspaceAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect(`/workspace?tab=workspaces&error=${encodeURIComponent("Give the workspace a name.")}`);
  const s = await requireRole("OWNER", "/workspace?tab=workspaces");
  const { org: current, effectivePlan, trialEndsAt } = await getPlanState(currentOrgId());
  const limit = planById(effectivePlan).limits.workspaces;
  const count = await db.workspaceMember.count({ where: { email: s.email, role: "OWNER" } });
  if (!withinLimit(limit, count)) {
    redirect(`/workspace?tab=workspaces&error=${encodeURIComponent(`The ${planById(effectivePlan).displayName} plan includes ${limit} workspace${limit === 1 ? "" : "s"}. Upgrade to create more.`)}`);
  }
  // Il nuovo workspace eredita il piano di quello corrente, e la stessa fine prova (niente prove nuove a catena).
  const created = await db.organization.create({ data: { name, plan: current.plan, planStatus: current.planStatus, trialEndsAt, privacyMode: "department" } });
  await db.workspaceMember.create({ data: { organizationId: created.id, email: s.email, name: s.name ?? null, role: "OWNER", status: "active" } });
  const account = await db.account.findUniqueOrThrow({ where: { id: s.accountId } });
  await issueSession(account, created.id);
  await audit("workspace.create", created.id, { name }, { orgId: created.id });
  revalidatePath("/", "layout");
  redirect("/connectors");
}

export async function renameWorkspaceAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const id = String(formData.get("orgId"));
  const s = await requireRole("ADMIN", "/workspace?tab=workspaces");
  // Si può rinominare solo un workspace di cui si è Admin/Owner.
  const m = await db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: id, email: s.email } } });
  if (name && m && m.status === "active" && (m.role === "OWNER" || m.role === "ADMIN")) {
    await db.organization.update({ where: { id }, data: { name } });
    await audit("workspace.rename", id, { name }, { orgId: id });
  }
  revalidatePath("/", "layout");
}

/** Passaggio al piano Free (nessun pagamento): solo se i limiti sono rispettati. */
export async function switchToFreeAction() {
  const s = await requireRole("OWNER", "/billing");
  const free = planById("FREE");
  const [ais, members] = await Promise.all([
    db.aiAsset.count({ where: { organizationId: s.orgId, deletedAt: null } }),
    db.workspaceMember.count({ where: { organizationId: s.orgId } }),
  ]);
  if (!withinLimit(free.limits.aiSystems, ais - 1) || !withinLimit(free.limits.members, members - 1)) {
    redirect(`/billing?error=${encodeURIComponent(`Free includes up to ${free.limits.aiSystems} AI and ${free.limits.members} member — you have ${ais} AI and ${members} members.`)}`);
  }
  const o = await db.organization.findUniqueOrThrow({ where: { id: s.orgId } });
  if (o.stripeSubscriptionId) redirect(`/billing?error=${encodeURIComponent("Cancel the paid subscription from 'Invoices & payment method' first.")}`);
  await db.organization.update({ where: { id: s.orgId }, data: { plan: "FREE", planStatus: "active" } });
  await audit("billing.switch_free");
  revalidatePath("/", "layout");
  redirect("/billing");
}

/**
 * Richiesta di dispositivi Edge quando i pagamenti online non sono attivi (o
 * per chi preferisce la fattura): resta nel registro e arriva via email a
 * vendite e amministratori della piattaforma.
 */
export async function requestEdgeDevicesAction(formData: FormData) {
  const s = await requireRole("OWNER", "/billing");
  const quantity = Math.max(1, Math.min(500, Math.floor(Number(formData.get("quantity") ?? 1))));
  const o = await org();
  await audit("edge.request", o.id, { quantity });
  const to = [process.env.SALES_EMAIL, ...(process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",")].map((e) => e?.trim()).filter((e): e is string => !!e && e.includes("@"));
  for (const addr of Array.from(new Set(to))) {
    await sendEmail({
      to: addr,
      subject: `angar Edge request — ${quantity} device${quantity === 1 ? "" : "s"} for ${o.name}`,
      text: `${s.email} (${o.name}) asked for ${quantity} angar Edge device${quantity === 1 ? "" : "s"}.\n\nWorkspace: ${o.id}`,
    }).catch(() => undefined);
  }
  redirect(`/billing?notice=${encodeURIComponent(`Request for ${quantity} Edge device${quantity === 1 ? "" : "s"} sent — we'll contact you within one working day.`)}#edge`);
}
