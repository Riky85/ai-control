import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/crypto";
import { Wordmark } from "@/components/Logo";
import JoinConnect from "@/components/JoinConnect";

export const dynamic = "force-dynamic";

// Link aziendale da mandare ai colleghi: installano l'estensione, aprono il
// link, scrivono l'email di lavoro. Fatto.
export default async function JoinPage({ params, searchParams }: { params: { code: string }; searchParams: { email?: string } }) {
  const org = await db.organization.findUnique({ where: { joinCode: params.code } });
  const token = decryptJson<{ token: string }>(org?.discoveryTokenEncrypted)?.token;
  if (!org || !token) notFound();
  return (
    <div className="min-h-screen bg-panel flex flex-col items-center justify-center px-6 py-12">
      <div className="text-ink-100 mb-8"><Wordmark size={20} /></div>
      <JoinConnect
        company={org.name}
        token={token}
        defaultEmail={searchParams.email ?? ""}
        chromeUrl={process.env.CHROME_EXTENSION_URL ?? null}
        edgeUrl={process.env.EDGE_EXTENSION_URL ?? null}
      />
    </div>
  );
}
