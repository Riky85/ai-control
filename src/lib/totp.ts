import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238, SHA-1, 6 cifre, 30 s) — lo standard di Google Authenticator,
 * Microsoft Authenticator, 1Password ecc. Nessuna dipendenza.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Nuovo segreto: 20 byte casuali (160 bit, come raccomanda RFC 4226). */
export const newTotpSecret = () => base32Encode(randomBytes(20));

/** HOTP (RFC 4226) per un contatore. */
export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP);

/**
 * Verifica un codice accettando ±1 intervallo (orologi non allineati).
 * Restituisce il passo usato (da salvare: lo stesso codice non vale due volte)
 * oppure null. `lastStep` = ultimo passo già usato per questo account.
 */
export function verifyTotp(secretB32: string, code: string, lastStep?: number | null, now = Date.now()): number | null {
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const secret = base32Decode(secretB32);
  const step = currentStep(now);
  for (const s of [step - 1, step, step + 1]) {
    if (lastStep != null && s <= lastStep) continue;
    const expected = Buffer.from(hotp(secret, s));
    if (timingSafeEqual(expected, Buffer.from(digits))) return s;
  }
  return null;
}

export function otpauthUri(secretB32: string, email: string, issuer = "angar"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
}

// ── Codici di recupero ──────────────────────────────────────────────────
// 10 codici monouso "xxxxx-xxxxx"; nel DB solo lo SHA-256 (sono casuali ad alta entropia).

const RC_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const b = randomBytes(10);
    const s = Array.from(b, (x) => RC_ALPHABET[x % RC_ALPHABET.length]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export const normalizeRecoveryCode = (c: string) => c.toLowerCase().replace(/[^a-z0-9]/g, "");
export const hashRecoveryCode = (c: string) => createHash("sha256").update(normalizeRecoveryCode(c)).digest("hex");
