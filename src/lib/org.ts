import { cookies } from "next/headers";

// Workspace corrente: scelto dal selettore in sidebar e salvato in un cookie.
// Senza login non è una barriera di sicurezza — lo diventa quando arriverà
// l'autenticazione (verifica che l'utente appartenga al workspace).
export const DEFAULT_ORG = "demo-org";
export const ORG_COOKIE = "angar_org";

export function currentOrgId(): string {
  try {
    return cookies().get(ORG_COOKIE)?.value || DEFAULT_ORG;
  } catch {
    return DEFAULT_ORG;
  }
}
