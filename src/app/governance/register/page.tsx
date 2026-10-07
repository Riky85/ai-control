import { currentOrgId } from "@/lib/org";
import { currentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { featureEnabled } from "@/lib/plan-gate";
import { PageHeader, Tabs, Notice } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import { LockedNote } from "@/components/LockedFeature";
import { loadRegister } from "@/lib/compliance/register";
import { AI_ACT_TIERS, type AiActTier } from "@/lib/compliance/ai-act";
import { RegisterTable, RegisterEdit, RegisterPrint } from "@/components/governance/RegisterView";

export const dynamic = "force-dynamic";

// Registro AI Act & GDPR art. 30: una riga per ogni AI che tratta dati personali,
// compilata da angar e completata a mano. Export CSV e versione per la stampa.
export default async function RegisterPage({ searchParams }: { searchParams: { edit?: string; saved?: string; error?: string } }) {
  const orgId = currentOrgId();
  const canEdit = !!currentSession() && currentSession()?.role !== "VIEWER";
  const [reg, csvOk, org] = await Promise.all([
    loadRegister(orgId),
    featureEnabled(orgId, "registerExport").catch(() => false),
    db.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
  ]);
  const editing = canEdit && searchParams.edit ? reg.rows.find((r) => r.id === searchParams.edit) : undefined;
  // Classi AI Act delle sole righe del registro.
  const tiers = Object.fromEntries(AI_ACT_TIERS.map((t) => [t, reg.rows.filter((r) => r.aiAct.tier === t).length])) as Record<AiActTier, number>;

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <PageHeader
          crumbs={[{ label: "Governance", href: "/governance" }, { label: "Register" }]}
          title="AI Act & GDPR register"
          subtitle="GDPR Art. 30 record"
          action={
            <>
              {!csvOk && <LockedNote feature="registerExport" />}
              <ExportMenu csv={csvOk ? "/api/export/ropa" : undefined} />
            </>
          }
        />
      </div>

      <div className="print:hidden">
        <Tabs
          active="register"
          items={[
            { key: "overview", label: "Overview", href: "/governance" },
            { key: "assurance", label: "Assurance checks", href: "/governance?tab=assurance" },
            { key: "register", label: "Register", href: "/governance/register" },
          ]}
        />
      </div>

      {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}
      {searchParams.saved !== undefined && !editing && <Notice tone="success">{Number(searchParams.saved) ? "Saved." : "Nothing changed."}</Notice>}

      {editing && <RegisterEdit row={editing} />}

      <RegisterTable rows={reg.rows} canEdit={canEdit} tiers={tiers} />

      <RegisterPrint rows={reg.rows} orgName={org?.name ?? ""} generated={new Date().toISOString().slice(0, 10)} />
    </div>
  );
}
