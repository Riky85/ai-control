import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Identità dei dispositivi angar (box fisici): seriale stampato sull'etichetta
 * (AE-XXXX-XXXX, Crockford base32: niente I, L, O, U) e segreto di claim
 * scritto nel device. Solo funzioni pure, senza database (testabili da sole).
 */
export const DEVICE_MODELS = ["n100", "pi5"] as const;
export type DeviceModel = (typeof DEVICE_MODELS)[number];
export const MODEL_LABEL: Record<string, string> = { n100: "N100", pi5: "Pi 5" };
export const DEVICE_STATUSES = ["stock", "claimed", "returned", "retired"] as const;

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
export const SERIAL_RE = /^AE-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export function newSerial(): string {
  const b = randomBytes(8);
  const c = [...b].map((x) => ALPHABET[x & 31]).join(""); // 256 % 32 = 0: nessun bias
  return `AE-${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Seriale digitato a mano o letto dal QR → forma canonica, oppure null. Tollera spazi, minuscole, O/I/L. */
export function normalizeSerial(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 40) return null;
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!raw.startsWith("AE") || raw.length !== 10) return null;
  const body = raw.slice(2).replace(/O/g, "0").replace(/[IL]/g, "1");
  const serial = `AE-${body.slice(0, 4)}-${body.slice(4)}`;
  return SERIAL_RE.test(serial) ? serial : null;
}

/** Segreto di claim: 32 byte casuali, base64url (43 caratteri). */
export const newClaimSecret = () => randomBytes(32).toString("base64url");

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

/** Confronto a tempo costante di due hash SHA-256 in esadecimale. */
export function hashesEqual(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}

export function secretMatches(secret: unknown, storedHash: string): boolean {
  if (typeof secret !== "string" || !secret || secret.length > 200) return false;
  return hashesEqual(sha256Hex(secret), storedHash);
}

/** Bearer del token di fabbrica: confronto a tempo costante (sugli hash, così le lunghezze non contano). */
export function factoryTokenMatches(header: string | null, expected: string | undefined): boolean {
  if (!expected) return false;
  const got = header?.replace(/^Bearer\s+/i, "").trim();
  if (!got) return false;
  return hashesEqual(sha256Hex(got), sha256Hex(expected));
}

/**
 * Hash segnaposto per il sensore di un device in attesa: unico, e nessun token
 * "ange_…" lo produce. Il device riceve il token vero alla prossima POST /api/edge/claim.
 */
export const placeholderTokenHash = () => sha256Hex("pending_" + randomBytes(24).toString("base64url"));
