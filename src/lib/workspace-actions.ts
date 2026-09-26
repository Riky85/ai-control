"use server";

import { currentOrgId } from "@/lib/org";
import { requireRole, currentSession } from "@/lib/auth";
import { issueSession } from "@/lib/auth-actions";
import { audit } from "@/lib/audit";
import { sendEmail, appOrigin } from "@/lib/mail";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { MemberRole, Plan } from "@prisma/client";
import { db } from "@/lib/db";
import { planById, withinLimit, PLANS, EDGE } from "@/lib/plans";
import { stripeEnabled, stripePost } from "@/lib/stripe";

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
  await requireRole("ADMIN", "/workspace");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const role = (ROLES.includes(formData.get("role") as MemberRole) ? formData.get("role") : "VIEWER") as MemberRole;
  if (!email.includes("@")) redirect(`/workspace?error=${encodeURIComponent("Enter a valid email.")}`);

  const o = await org();
  const count = await db.workspaceMember.count({ where: { organizationId: currentOrgId() } });
  if (!withinLimit(planById(o.plan).limits.members, count)) {
    redirect(`/workspace?error=${encodeURIComponent(`Your ${planById(o.plan).name} plan includes ${planById(o.plan).limits.members} members. Upgrade to add more.`)}`);
  }
  await db.workspaceMember.upsert({
    where: { organizationId_email: { organizationId: currentOrgId(), email } },
    update: { role, name: name ?? undefined },
    create: { organizationId: currentOrgId(), email, name, role },
  });
  const inviter = currentSession();
  const signupLink = `${appOrigin(headers())}/signup?email=${encodeURIComponent(email)}`;
  const mail = await sendEmail({
    to: email,
    subject: `${inviter?.name ?? inviter?.email ?? "Someone"} invited you to ${o.name} on angar`,
    text: `You've been invited to the ${o.name} workspace on angar as ${role.toLowerCase()}.\n\nCreate your account with this email to join:\n${signupLink}`,
  });
  await audit("member.invite", email, { role, emailSent: mail.sent });
  revalidatePath("/workspace");
  redirect(`/workspace?invited=1&inviteLink=${encodeURIComponent(signupLink)}&emailSent=${mail.sent ? 1 : 0}`);
}

export async function setMemberRoleAction(formData: FormData) {
  await requireRole("ADMIN", "/workspace");
  const id = String(formData.get("memberId"));
  const role = formData.get("role") as MemberRole;
  if (!ROLES.includes(role)) return;
  // Deve restare almeno un Owner.
  const member = await db.workspaceMember.findUnique({ where: { id } });
  if (member?.role === "OWNER" && role !== "OWNER") {
    const owners = await db.workspaceMember.count({ where: { organizationId: currentOrgId(), role: "OWNER" } });
    if (owners <= 1) redirect(`/workspace?error=${encodeURIComponent("A workspace needs at least one owner.")}`);
  }
  await db.workspaceMember.update({ where: { id }, data: { role } });
  await audit("member.role_change", member?.email, { from: member?.role, to: role });
  revalidatePath("/workspace");
}

export async function removeMemberAction(formData: FormData) {
  await requireRole("ADMIN", "/workspace");
  const id = String(formData.get("memberId"));
  const member = await db.workspaceMember.findUnique({ where: { id } });
  if (member?.role === "OWNER") {
    const owners = await db.workspaceMember.count({ where: { organizationId: currentOrgId(), role: "OWNER" } });
    if (owners <= 1) redirect(`/workspace?error=${encodeURIComponent("You can't remove the last owner.")}`);
  }
  await db.workspaceMember.deleteMany({ where: { id, organizationId: currentOrgId() } });
  await audit("member.remove", member?.email);
  revalidatePath("/workspace");
}

// ── Dashboard condivise ─────────────────────────────────────────────────
export async function createShareLinkAction(formData: FormData) {
  await requireRole("EDITOR", "/workspace?tab=sharing");
  const name = String(formData.get("name") ?? "").trim() || "AI estate overview";
  const days = Number(formData.get("expiresInDays") ?? 0);
  const o = await org();
  const active = await db.shareLink.count({ where: { organizationId: currentOrgId(), revokedAt: null } });
  if (!withinLimit(planById(o.plan).limits.sharedDashboards, active)) {
    redirect(`/workspace?tab=sharing&error=${encodeURIComponent(`Your ${planById(o.plan).name} plan includes ${planById(o.plan).limits.sharedDashboards} shared dashboard. Upgrade for unlimited.`)}`);
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
  const def = PLANS.find((p) => p.id === plan);
  const price = def?.stripePriceEnv ? process.env[def.stripePriceEnv] : undefined;
  if (!stripeEnabled() || !price) redirect(`/billing?error=${encodeURIComponent("Payments aren't connected on this deployment yet.")}`);

  const o = await org();
  let url = "";
  try {
    const session = await stripePost<{ url: string }>("/checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": price!,
      "line_items[0][quantity]": "1",
      success_url: `${origin()}/billing?checkout=success`,
      cancel_url: `${origin()}/billing?checkout=cancelled`,
      client_reference_id: o.id,
      "metadata[organizationId]": o.id,
      "metadata[plan]": plan,
      "subscription_data[metadata][organizationId]": o.id,
      "subscription_data[metadata][plan]": plan,
      ...(o.stripeCustomerId ? { customer: o.stripeCustomerId } : {}),
    });
    url = session.url;
  } catch (err) {
    redirect(`/billing?error=${encodeURIComponent((err as Error).message)}`);
  }
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
      ...(o.stripeCustomerId ? { customer: o.stripeCustomerId } : {}),
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
  if (account && member) {
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
  const current = await org();
  const limit = planById(current.plan).limits.workspaces;
  const count = await db.workspaceMember.count({ where: { email: s.email, role: "OWNER" } });
  if (!withinLimit(limit, count)) {
    redirect(`/workspace?tab=workspaces&error=${encodeURIComponent(`The ${planById(current.plan).name} plan includes ${limit} workspace${limit === 1 ? "" : "s"}. Upgrade to create more.`)}`);
  }
  // Il nuovo workspace eredita il piano di quello corrente.
  const created = await db.organization.create({ data: { name, plan: current.plan, planStatus: current.planStatus } });
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
  if (name && m && (m.role === "OWNER" || m.role === "ADMIN")) {
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
