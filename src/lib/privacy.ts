/**
 * Privacy dei dipendenti (Statuto dei lavoratori art. 4, Betriebsrat, GDPR):
 * - "individual": uso per persona (default dello schema, per i workspace esistenti);
 * - "department": solo per reparto, e solo gruppi di almeno MIN_GROUP persone
 *   (privacy di default: i nuovi workspace nascono così, vedi auth-actions / workspace-actions / SSO);
 * - "anonymous": solo totali dell'azienda, nessun nome né dispositivo.
 */
export type PrivacyMode = "individual" | "department" | "anonymous";

export const PRIVACY_MODES: { id: PrivacyMode; label: string; description: string }[] = [
  { id: "individual", label: "By person", description: "See who uses which AI — best for seat clean-up and licences. Give staff the employee notice first." },
  { id: "department", label: "By department", description: "Only totals by department (groups of at least 5 people). No names." },
  { id: "anonymous", label: "Company totals only", description: "Only company-wide totals. No names, no devices, no departments." },
];

export const MIN_GROUP = 5;

/** Etichetta del gruppo in cui finiscono i reparti troppo piccoli. */
export const SMALL_GROUPS_LABEL = "Other (small teams)";
export const NO_DEPARTMENT_LABEL = "No department";

export function privacyModeOf(org: { privacyMode?: string | null } | null | undefined): PrivacyMode {
  const m = org?.privacyMode;
  return m === "department" || m === "anonymous" ? m : "individual";
}

export function isPrivacyMode(v: unknown): v is PrivacyMode {
  return v === "individual" || v === "department" || v === "anonymous";
}

export const privacyModeLabel = (mode: PrivacyMode) => PRIVACY_MODES.find((m) => m.id === mode)!.label;

/** Si possono mostrare nomi, email e dispositivi delle persone? */
export const showsPeople = (mode: PrivacyMode) => mode === "individual";

/** Si possono mostrare totali per reparto (sempre con k-anonimato)? */
export const showsDepartments = (mode: PrivacyMode) => mode !== "anonymous";

/** Modalità privacy dell'azienda (lettura dal database, import pigro: il modulo resta puro). */
export async function orgPrivacyMode(organizationId: string): Promise<PrivacyMode> {
  const { db } = await import("@/lib/db");
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { privacyMode: true } });
  return privacyModeOf(org);
}

/**
 * Nome di una persona in un testo (avvisi, email, report): nelle modalità
 * non individuali diventa "someone", mai un nome, un'email o un dispositivo.
 */
export function personLabel(mode: PrivacyMode, who: string | null | undefined, fallback = "someone") {
  return showsPeople(mode) && who ? who : fallback;
}

/** Conteggio mostrabile: sotto MIN_GROUP (ma > 0) diventa "<5". */
export function maskCount(n: number, min = MIN_GROUP): string {
  return n > 0 && n < min ? `<${min}` : String(n);
}

export interface DepartmentGroup<T> {
  /** Nome del reparto, oppure SMALL_GROUPS_LABEL per i reparti uniti. */
  department: string;
  /** Persone distinte nel gruppo (sempre >= min, salvo `suppressed`). */
  people: number;
  rows: T[];
  /** true se il gruppo unisce più reparti piccoli. */
  merged: boolean;
  /**
   * true se neanche unendo tutto si arriva a `min` persone: il gruppo non va
   * mostrato (nemmeno i suoi numeri), solo "meno di 5 persone".
   */
  suppressed: boolean;
}

/**
 * Raggruppa righe per reparto con k-anonimato: ogni gruppo mostrato conta
 * almeno `min` persone distinte. I reparti più piccoli finiscono in
 * "Other (small teams)"; se anche quel gruppo resta sotto la soglia, viene
 * unito al reparto più piccolo tra quelli mostrabili (così non si può
 * ricavare per differenza dal totale). Se l'intera azienda ha meno di `min`
 * persone, resta un solo gruppo marcato `suppressed`.
 *
 * Righe senza persona (personOf → null/"") non contano come persone ma i
 * loro dati restano nel gruppo del loro reparto.
 */
export function groupByDepartment<T>(
  rows: T[],
  personOf: (r: T) => string | null | undefined,
  departmentOf: (r: T) => string | null | undefined,
  min = MIN_GROUP,
): DepartmentGroup<T>[] {
  const byDept = new Map<string, { label: string; rows: T[]; people: Set<string> }>();
  for (const r of rows) {
    const d = departmentOf(r)?.trim() || NO_DEPARTMENT_LABEL;
    // Chiave senza maiuscole/minuscole: "Sales" e "sales" sono lo stesso reparto.
    const key = d.toLowerCase();
    let g = byDept.get(key);
    if (!g) byDept.set(key, (g = { label: d, rows: [], people: new Set() }));
    g.rows.push(r);
    const p = personOf(r);
    if (p) g.people.add(p.toLowerCase());
  }

  const big: DepartmentGroup<T>[] = [];
  const small = { rows: [] as T[], people: new Set<string>(), count: 0 };
  for (const g of byDept.values()) {
    const label = g.label;
    if (g.people.size >= min) {
      big.push({ department: label, people: g.people.size, rows: g.rows, merged: false, suppressed: false });
    } else {
      small.rows.push(...g.rows);
      g.people.forEach((p) => small.people.add(p));
      small.count++;
    }
  }

  if (small.count > 0) {
    if (small.people.size >= min) {
      big.push({ department: SMALL_GROUPS_LABEL, people: small.people.size, rows: small.rows, merged: true, suppressed: false });
    } else if (big.length > 0) {
      // Il resto è troppo piccolo: si unisce al reparto mostrabile più piccolo.
      big.sort((a, b) => a.people - b.people);
      const host = big[0];
      const people = new Set<string>(small.people);
      for (const r of host.rows) {
        const p = personOf(r);
        if (p) people.add(p.toLowerCase());
      }
      big[0] = { department: SMALL_GROUPS_LABEL, people: people.size, rows: [...host.rows, ...small.rows], merged: true, suppressed: false };
    } else if (small.rows.length > 0) {
      return [{ department: SMALL_GROUPS_LABEL, people: small.people.size, rows: small.rows, merged: true, suppressed: true }];
    }
  }

  // Reparti veri per numero di persone, "Other" sempre in fondo.
  return big.sort((a, b) => Number(a.merged) - Number(b.merged) || b.people - a.people || a.department.localeCompare(b.department));
}
