import { Prisma, type Account } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Primo account della piattaforma: diventa Owner di TUTTI i workspace già
 * esistenti. È un privilegio enorme, quindi:
 * - se ANGAR_BOOTSTRAP_EMAIL è impostata, vale solo per quell'email;
 * - in ogni caso il controllo "nessun account" e la creazione avvengono in una
 *   transazione serializzabile: due registrazioni simultanee non possono
 *   diventare entrambe "il primo account".
 * NON sta in un file "use server": non deve diventare un'azione chiamabile.
 */
export function bootstrapEmailAllowed(email: string): boolean {
  const want = process.env.ANGAR_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  return !want || want === email.toLowerCase();
}

/** true se il proprietario della piattaforma ha indicato esplicitamente questa email. */
export const bootstrapEmailConfigured = (email: string) => Boolean(process.env.ANGAR_BOOTSTRAP_EMAIL?.trim()) && bootstrapEmailAllowed(email);

/**
 * Crea l'account come primo della piattaforma, se lo è davvero (dentro la
 * transazione). Restituisce null se esiste già un account o se l'email non è
 * quella indicata: si procede allora con la registrazione normale.
 */
export async function claimFirstAccount(
  email: string,
  data: Omit<Prisma.AccountCreateInput, "email">,
  opts: { name: string | null; company?: string }
): Promise<{ account: Account; orgId: string } | null> {
  if (!bootstrapEmailAllowed(email)) return null;
  if ((await db.account.count()) !== 0) return null;
  try {
    return await db.$transaction(
      async (tx) => {
        if ((await tx.account.count()) !== 0) return null;
        const account = await tx.account.create({ data: { ...data, email } });
        const orgs = await tx.organization.findMany({ orderBy: { createdAt: "asc" } });
        for (const o of orgs) {
          await tx.workspaceMember.upsert({
            where: { organizationId_email: { organizationId: o.id, email } },
            update: { role: "OWNER", status: "active", name: opts.name ?? undefined },
            create: { organizationId: o.id, email, name: opts.name, role: "OWNER", status: "active" },
          });
        }
        let orgId = orgs[0]?.id;
        if (!orgId) {
          orgId = (await tx.organization.create({ data: { name: opts.company || "My company", privacyMode: "department" } })).id;
          await tx.workspaceMember.create({ data: { organizationId: orgId, email, name: opts.name, role: "OWNER", status: "active" } });
        }
        return { account, orgId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    // Conflitto di serializzazione o email già presa: non è il primo account.
    console.error("[bootstrap]", (err as Error).message);
    return null;
  }
}
