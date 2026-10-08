"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAssetStatusAction } from "@/lib/actions";

export interface CommandReplyData {
  answer: string;
  href?: string;
  hrefLabel?: string;
  confirm?: { label: string; assetId: string; status: "APPROVED" | "UNAPPROVED" };
  sources?: { slug: string; title: string }[];
}

// Risposta a un comando: testo, link alla pagina giusta e, per le azioni,
// un pulsante di conferma (nulla cambia senza questo clic).
export default function CommandReply({ reply, onNavigate, tone = "dark" }: { reply: CommandReplyData; onNavigate?: () => void; tone?: "dark" | "panel" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const btn = tone === "dark" ? "text-xs rounded-lg border border-sb-ink/15 px-2.5 py-1 text-sb-ink hover:bg-sb-ink/[0.08]" : "btn btn-secondary btn-sm";
  return (
    <div className="flex flex-col gap-2">
      <p className={`text-sm leading-relaxed whitespace-pre-line ${tone === "dark" ? "text-sb-ink" : "text-ink-100"}`}>{done ? "Done." : reply.answer}</p>
      <div className="flex flex-wrap items-center gap-2">
        {reply.confirm && !done && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const fd = new FormData();
                fd.set("assetId", reply.confirm!.assetId);
                fd.set("status", reply.confirm!.status);
                await setAssetStatusAction(fd);
                setDone(true);
                router.refresh();
              })
            }
            className="btn btn-primary btn-sm"
          >
            {pending ? "…" : reply.confirm.label}
          </button>
        )}
        {reply.href && (
          <Link href={reply.href} onClick={onNavigate} className={btn}>
            {reply.hrefLabel ?? "Open"}
          </Link>
        )}
        {reply.sources?.map((s) => (
          <Link key={s.slug} href={`/docs/${s.slug}`} onClick={onNavigate} className={btn}>
            {s.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
