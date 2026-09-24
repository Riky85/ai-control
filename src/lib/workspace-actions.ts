"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { MemberRole, Plan } from "@prisma/client";
import { db } from "@/lib/db";
import { planById, withinLimit, PLANS } from "@/lib/plans";
import { stripeEnabled, stripePost } from "@/lib/stripe";

const ORG_ID = "demo-org";
const ROLES: MemberRole[] = ["OWNER", "ADMIN", "EDITOR", "VIEWER"];

async function org() {
  return db.organization.findUniqueOrThrow({ where: { id: ORG_ID } });
}

function origin() {
  const h = headers();
  return process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

// ── Membri ──────────────────────────────────────────────────────────────
export async function inviteMemberAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const role = (ROLES.includes(formData.get("role") as MemberRole) ? formData.get("role") : "VIEWER") as MemberRole;
  if (!email.includes("@")) redirect(`/workspace?error=${encodeURIComponent("Enter a valid email.")}`);

  const o = await org();
  const count = await db.workspaceMember.count({ where: { organizationId: ORG_ID } });
  if (!withinLimit(planById(o.plan).limits.members, count)) {
    redirect(`/workspace?error=${encodeURIComponent(`Your ${planById(o.plan).name} plan includes ${planById(o.plan).limits.members} members. Upgrade to add more.`)}`);
  }
  await db.workspaceMember.upsert({
    where: { organizationId_email: { organizationId: ORG_ID, email } },
    update: { role, name: name ?? undefined },
    create: { organizationId: ORG_ID, email, name, role },
  });
  revalidatePath("/workspace");
  redirect("/workspace?invited=1");
}

export async function setMemberRoleAction(formData: FormData) {
  const id = String(formData.get("memberId"));
  const role = formData.get("role") as MemberRole;
  if (!ROLES.includes(role)) return;
  // Deve restare almeno un Owner.
  const member = await db.workspaceMember.findUnique({ where: { id } });
  if (member?.role === "OWNER" && role !== "OWNER") {
    const owners = await db.workspaceMember.count({ where: { organizationId: ORG_ID, role: "OWNER" } });
    if (owners <= 1) redirect(`/workspace?error=${encodeURIComponent("A workspace needs at least one owner.")}`);
  }
  await db.workspaceMember.update({ where: { id }, data: { role } });
  revalidatePath("/workspace");
}

export async function removeMemberAction(formData: FormData) {
  const id = String(formData.get("memberId"));
  const member = await db.workspaceMember.findUnique({ where: { id } });
  if (member?.role === "OWNER") {
    const owners = await db.workspaceMember.count({ where: { organizationId: ORG_ID, role: "OWNER" } });
    if (owners <= 1) redirect(`/workspace?error=${encodeURIComponent("You can't remove the last owner.")}`);
  }
  await db.workspaceMember.deleteMany({ where: { id, organizationId: ORG_ID } });
  revalidatePath("/workspace");
}

// ── Dashboard condivise ─────────────────────────────────────────────────
export async function createShareLinkAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim() || "AI estate overview";
  const days = Number(formData.get("expiresInDays") ?? 0);
  const o = await org();
  const active = await db.shareLink.count({ where: { organizationId: ORG_ID, revokedAt: null } });
  if (!withinLimit(planById(o.plan).limits.sharedDashboards, active)) {
    redirect(`/workspace?tab=sharing&error=${encodeURIComponent(`Your ${planById(o.plan).name} plan includes ${planById(o.plan).limits.sharedDashboards} shared dashboard. Upgrade for unlimited.`)}`);
  }
  await db.shareLink.create({
    data: {
      organizationId: ORG_ID,
      token: randomBytes(18).toString("base64url"),
      name,
      expiresAt: days > 0 ? new Date(Date.now() + days * 86400_000) : null,
    },
  });
  revalidatePath("/workspace");
  redirect("/workspace?tab=sharing&shared=1");
}

export async function revokeShareLinkAction(formData: FormData) {
  await db.shareLink.updateMany({ where: { id: String(formData.get("linkId")), organizationId: ORG_ID }, data: { revokedAt: new Date() } });
  revalidatePath("/workspace");
}

// ── Abbonamento ─────────────────────────────────────────────────────────
export async function startCheckoutAction(formData: FormData) {
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
