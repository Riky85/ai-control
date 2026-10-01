"use client";

import { useState } from "react";
import CopyButton from "@/components/CopyButton";

/** "How to connect": stesso SDK, chiave angar e base URL del Gateway. */
export default function ConnectSnippets({ openaiUrl, anthropicUrl }: { openaiUrl: string; anthropicUrl: string }) {
  const snippets = [
    {
      key: "py",
      label: "OpenAI · Python",
      code: `from openai import OpenAI\n\nclient = OpenAI(\n    api_key=ANGAR_KEY,  # agk_…\n    base_url="${openaiUrl}",\n)`,
    },
    {
      key: "js",
      label: "OpenAI · JS",
      code: `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: process.env.ANGAR_KEY, // agk_…\n  baseURL: "${openaiUrl}",\n});`,
    },
    {
      key: "anthropic",
      label: "Anthropic · Python",
      code: `from anthropic import Anthropic\n\nclient = Anthropic(\n    api_key=ANGAR_KEY,  # agk_…\n    base_url="${anthropicUrl.replace(/\/v1$/, "")}",\n)`,
    },
  ];
  const [tab, setTab] = useState(snippets[0].key);
  const current = snippets.find((s) => s.key === tab) ?? snippets[0];
  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex gap-1 bg-ink-100/[0.06] dark:bg-ink rounded-lg p-1 w-fit max-w-full overflow-x-auto [scrollbar-width:none]">
        {snippets.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setTab(s.key)}
            className={`shrink-0 whitespace-nowrap text-xs px-2.5 py-1 rounded-md transition-colors ${tab === s.key ? "bg-panel text-ink-100 font-medium shadow-card" : "text-ink-400 hover:text-ink-100"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <pre className="rounded-lg border border-line px-4 py-3 text-xs leading-relaxed font-mono text-ink-100 overflow-x-auto whitespace-pre">{current.code}</pre>
      <div>
        <CopyButton text={current.code} label="Copy snippet" />
      </div>
    </div>
  );
}
