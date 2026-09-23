import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifratura a riposo delle credenziali dei connettori (AES-256-GCM).
 * La chiave deriva da CREDENTIALS_SECRET (variabile di piattaforma, mai
 * del cliente). Se manca, rifiutiamo di salvare: meglio un errore chiaro
 * che una API key in chiaro nel database.
 */
function key(): Buffer {
  const secret = process.env.CREDENTIALS_SECRET;
  if (!secret) throw new Error("CREDENTIALS_SECRET is not set on this deployment — refusing to store credentials unencrypted.");
  return createHash("sha256").update(secret).digest();
}

export function encryptJson(data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

/** Legge sia il formato cifrato v1 sia il JSON in chiaro legacy (es. installationId GitHub). */
export function decryptJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    if (value.startsWith("v1:")) {
      const [, iv, tag, data] = value.split(":");
      const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      const dec = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]);
      return JSON.parse(dec.toString("utf8")) as T;
    }
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
