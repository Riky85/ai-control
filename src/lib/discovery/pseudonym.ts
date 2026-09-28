import { createHmac, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { privacyModeOf, type PrivacyMode } from "@/lib/privacy";

/**
 * Pseudonimi delle persone (privacy "per reparto" o "solo totali"): nel database
 * non finisce l'email ma p_ + HMAC-SHA256(chiave dell'azienda, email), 16 cifre
 * esadecimali. Stessa persona → stesso pseudonimo, così i conteggi di persone
 * distinte restano giusti; senza la chiave non si risale all'email.
 * Uno pseudonimo non è mai un nome: le pagine non lo mostrano (isPseudonym).
 */
export const PSEUDONYM_RE = /^p_[0-9a-f]{16}$/;

export const isPseudonym = (v: string | null | undefined): boolean => !!v && PSEUDONYM_RE.test(v);

/** Nome mostrabile di una persona: null se è uno pseudonimo (o vuoto). */
export const displayableRef = (v: string | null | undefined): string | null => (v && !isPseudonym(v) ? v : null);

export function pseudonymWith(salt: string, identity: string): string {
  const v = identity.trim().toLowerCase();
  if (isPseudonym(v)) return v; // già pseudonimo: idempotente
  return "p_" + createHmac("sha256", salt).update(v).digest("hex").slice(0, 16);
}

// La chiave non cambia mai una volta creata: si tiene in memoria.
const salts = new Map<string, string>();

/** Chiave dell'azienda per gli pseudonimi, creata al primo uso (senza gare tra richieste). */
export async function orgSalt(organizationId: string): Promise<string> {
  const cached = salts.get(organizationId);
  if (cached) return cached;
  let org = await db.organization.findUnique({ where: { id: organizationId }, select: { privacySalt: true } });
  if (!org?.privacySalt) {
    await db.organization.updateMany({ where: { id: organizationId, privacySalt: null }, data: { privacySalt: randomBytes(16).toString("hex") } });
    org = await db.organization.findUnique({ where: { id: organizationId }, select: { privacySalt: true } });
  }
  if (!org?.privacySalt) throw new Error("Organization not found");
  salts.set(organizationId, org.privacySalt);
  return org.privacySalt;
}

export async function pseudonymFor(organizationId: string, identity: string): Promise<string> {
  return pseudonymWith(await orgSalt(organizationId), identity);
}

/**
 * Come salvare le persone per un'azienda: in "per persona" tutto com'è; altrimenti
 * pseudonimi, nessun nome, reparto solo in "per reparto", nomi dei computer offuscati.
 */
export interface Identities {
  mode: PrivacyMode;
  people: boolean;
  /** email/utente → valore da salvare (email in "per persona", pseudonimo altrimenti). */
  person(identity: string): string;
  /** nome del computer → da salvare ("computer-xxxxxxxx" fuori da "per persona"). */
  host(host: string): string;
  /** reparto da salvare (mai in "solo totali"). */
  department(d: string | null | undefined): string | null | undefined;
}

export async function identitiesFor(organizationId: string, knownMode?: string | null): Promise<Identities> {
  const mode =
    knownMode !== undefined
      ? privacyModeOf({ privacyMode: knownMode })
      : privacyModeOf(await db.organization.findUnique({ where: { id: organizationId }, select: { privacyMode: true } }));
  if (mode === "individual") {
    return { mode, people: true, person: (x) => x, host: (h) => h, department: (d) => d };
  }
  const salt = await orgSalt(organizationId);
  return {
    mode,
    people: false,
    person: (x) => pseudonymWith(salt, x),
    host: (h) => "computer-" + pseudonymWith(salt, "host:" + h).slice(2, 10),
    department: (d) => (mode === "department" ? d : undefined),
  };
}
