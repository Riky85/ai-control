"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { identitiesFor, isPseudonym } from "./pseudonym";

// Valori che non sono persone: restano come sono.
const NOT_A_PERSON = /^(\*|Desktop app|Browser extension|Device|angar Edge\b.*|Network log\b.*|computer-[0-9a-f]{8})$/;
const EMAIL_RE = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,24}/gi;

/**
 * "Erase names from past data" (solo owner): con la privacy per reparto o solo
 * totali, pseudonimizza anche i dati già salvati — attività, uso per persona,
 * persone scoperte, computer, etichette di angar Edge, testo degli avvisi.
 * Non tocca i membri del workspace né le persone indicate come responsabili di
 * un'AI (servono alla governance). Il registro di audit non si modifica mai.
 */
export async function erasePastNamesAction() {
  const s = await requireRole("OWNER", "/settings");
  const orgId = s.orgId;
  const ids = await identitiesFor(orgId);
  if (ids.people) redirect(`/settings?tab=privacy&error=${encodeURIComponent("Switch employee privacy to per department or company totals first.")}#privacy`);
  const person = (v: string) => (isPseudonym(v) || NOT_A_PERSON.test(v) ? v : ids.person(v));
  const counts = { activities: 0, usages: 0, people: 0, computers: 0, alerts: 0, edge: 0 };

  // 1. Attività: chi (actorRef) e il nome del computer nel payload.
  const actors = await db.aiAssetActivity.findMany({
    where: { aiAsset: { organizationId: orgId }, actorRef: { not: null } },
    distinct: ["actorRef"],
    select: { actorRef: true },
  });
  for (const { actorRef } of actors) {
    const next = person(actorRef!);
    if (next === actorRef) continue;
    const r = await db.aiAssetActivity.updateMany({ where: { aiAsset: { organizationId: orgId }, actorRef }, data: { actorRef: next } });
    counts.activities += r.count;
  }
  // "Desktop app · mario-pc" → "Desktop app" (i sensori Edge e i log di rete restano).
  counts.activities += await db.$executeRaw`
    UPDATE "AiAssetActivity" SET "payload" = jsonb_set("payload"::jsonb, '{device}', to_jsonb(trim(split_part("payload"->>'device', '·', 1))))
    WHERE "aiAssetId" IN (SELECT "id" FROM "AiAsset" WHERE "organizationId" = ${orgId})
      AND "payload" IS NOT NULL AND jsonb_typeof("payload"::jsonb) = 'object'
      AND "payload"->>'device' LIKE '%·%'
      AND "payload"->>'device' NOT LIKE 'angar Edge%' AND "payload"->>'device' NOT LIKE 'Network log%'`;
  await db.$executeRaw`
    UPDATE "AiAssetConnectedSystem" SET "detail" = trim(split_part("detail", '·', 1))
    WHERE "aiAssetId" IN (SELECT "id" FROM "AiAsset" WHERE "organizationId" = ${orgId})
      AND "system" = 'Seen on' AND "detail" LIKE '%·%'
      AND "detail" NOT LIKE 'angar Edge%' AND "detail" NOT LIKE 'Network log%'`;

  // 2. Uso per persona senza scheda persona (riferimento esterno del provider).
  const refs = await db.aiAssetUsage.findMany({
    where: { aiAsset: { organizationId: orgId }, externalUserRef: { not: null } },
    distinct: ["externalUserRef"],
    select: { externalUserRef: true },
  });
  for (const { externalUserRef } of refs) {
    const next = person(externalUserRef!);
    if (next === externalUserRef) continue;
    const r = await db.aiAssetUsage.updateMany({ where: { aiAsset: { organizationId: orgId }, externalUserRef }, data: { externalUserRef: next } });
    counts.usages += r.count;
  }

  // 3. Persone scoperte: email → pseudonimo, niente nome (reparto solo "per reparto").
  //    Chi è responsabile di un'AI resta com'è.
  const users = await db.user.findMany({
    where: { organizationId: orgId, ownedAssets: { none: {} } },
    select: { id: true, email: true, name: true, department: true },
  });
  for (const u of users) {
    const email = person(u.email);
    const department = ids.mode === "anonymous" ? null : u.department;
    if (email === u.email && !u.name && department === u.department) continue;
    const twin = email !== u.email ? await db.user.findUnique({ where: { organizationId_email: { organizationId: orgId, email } } }) : null;
    if (!twin) {
      await db.user.update({ where: { id: u.id }, data: { email, name: null, department } });
    } else {
      // Lo pseudonimo esiste già (dati arrivati dopo il cambio di modalità): si uniscono.
      await mergeUsage(u.id, twin.id);
      if (!twin.department && department) await db.user.update({ where: { id: twin.id }, data: { department } });
      await db.user.delete({ where: { id: u.id } });
    }
    counts.people++;
  }

  // 4. Computer con l'app desktop: email e nome host.
  const devices = await db.desktopDevice.findMany({ where: { organizationId: orgId }, select: { id: true, deviceKey: true, host: true, email: true } });
  for (const d of devices) {
    const host = NOT_A_PERSON.test(d.host) ? d.host : ids.host(d.host);
    const email = d.email ? person(d.email) : null;
    if (host === d.host && email === d.email) continue;
    const deviceKey = `${host.toLowerCase()}|${email ?? ""}`.slice(0, 220);
    const clash = await db.desktopDevice.findUnique({ where: { organizationId_deviceKey: { organizationId: orgId, deviceKey } } });
    if (clash && clash.id !== d.id) await db.desktopDevice.delete({ where: { id: d.id } });
    else await db.desktopDevice.update({ where: { id: d.id }, data: { host, email, deviceKey } });
    await db.desktopToken.updateMany({ where: { organizationId: orgId, deviceKey: d.deviceKey }, data: { deviceKey } });
    counts.computers++;
  }

  // 5. angar Edge: etichette dei dispositivi (email o nome host).
  counts.edge = (await db.edgeEvent.updateMany({ where: { organizationId: orgId, clientLabel: { not: null } }, data: { clientLabel: null } })).count;

  // 6. Avvisi già creati con un'email nel testo.
  const alerts = await db.alert.findMany({
    where: { organizationId: orgId, OR: [{ title: { contains: "@" } }, { body: { contains: "@" } }] },
    select: { id: true, title: true, body: true },
    take: 5000,
  });
  for (const a of alerts) {
    const title = a.title.replace(EMAIL_RE, "someone");
    const body = a.body.replace(EMAIL_RE, "someone");
    if (title === a.title && body === a.body) continue;
    await db.alert.update({ where: { id: a.id }, data: { title, body } });
    counts.alerts++;
  }

  await audit("privacy.erase_names", ids.mode, counts);
  revalidatePath("/", "layout");
  redirect(`/settings?tab=privacy&privacy=erased`);
}

/** Sposta l'uso di una persona su un'altra; se entrambe usano la stessa AI resta l'ultimo uso. */
async function mergeUsage(fromUserId: string, toUserId: string) {
  const [from, to] = await Promise.all([
    db.aiAssetUsage.findMany({ where: { userId: fromUserId } }),
    db.aiAssetUsage.findMany({ where: { userId: toUserId } }),
  ]);
  const byAsset = new Map(to.map((u) => [u.aiAssetId, u]));
  for (const u of from) {
    const other = byAsset.get(u.aiAssetId);
    if (!other) {
      await db.aiAssetUsage.update({ where: { id: u.id }, data: { userId: toUserId } });
      continue;
    }
    const later = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);
    const data: Prisma.AiAssetUsageUpdateInput = {
      firstSeenAt: u.firstSeenAt < other.firstSeenAt ? u.firstSeenAt : other.firstSeenAt,
      lastSeenAt: later(u.lastSeenAt, other.lastSeenAt),
      messageOrEventCount: u.messageOrEventCount != null || other.messageOrEventCount != null ? (u.messageOrEventCount ?? 0) + (other.messageOrEventCount ?? 0) : null,
    };
    await db.aiAssetUsage.update({ where: { id: other.id }, data });
    await db.aiAssetUsage.delete({ where: { id: u.id } });
  }
}
