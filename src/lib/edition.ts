/**
 * Edizione on-premises: angar gira su un server dell'azienda (docker compose)
 * e i dati non escono mai dalla rete. Tutte le funzioni incluse, niente prova
 * né fatturazione Stripe. Si attiva con ANGAR_ONPREM=1 (lo mette l'installer).
 */
export function isOnPrem(): boolean {
  return process.env.ANGAR_ONPREM === "1" || process.env.ANGAR_EDITION === "onprem";
}

const CLOUD = "https://ai-control-production.up.railway.app";

/**
 * Il server scritto nel nome del file dell'app desktop, così l'app si collega
 * da sola al server dell'azienda: "@<schema>~<host>[_<porta>]".
 * Vuoto sul cloud (l'app usa già il cloud) o se l'indirizzo non si può scrivere in un nome di file.
 */
export function desktopServerTag(appUrl = process.env.APP_URL ?? CLOUD): string {
  let u: URL;
  try {
    u = new URL(appUrl);
  } catch {
    return "";
  }
  if (u.origin === CLOUD || !/^https?:$/.test(u.protocol)) return "";
  if (!/^[A-Za-z0-9.-]{1,120}$/.test(u.hostname)) return "";
  const scheme = u.protocol.slice(0, -1);
  return `@${scheme}~${u.hostname}${u.port ? `_${u.port}` : ""}`;
}

/**
 * Cookie "Secure" in produzione — tranne quando angar è servito in http (un
 * server on-premises nella rete interna): lì il browser non li salverebbe.
 */
export function secureCookies(): boolean {
  return process.env.NODE_ENV === "production" && !(process.env.APP_URL ?? "").startsWith("http://");
}
