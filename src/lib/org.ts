import { currentSession } from "@/lib/auth";

// Workspace corrente: viene dalla sessione firmata (verificata dal
// middleware), non più da un cookie che il browser può modificare.
export const DEFAULT_ORG = "demo-org";

export function currentOrgId(): string {
  const s = currentSession();
  if (!s) throw new Error("Not signed in");
  return s.orgId;
}
