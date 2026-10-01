import Link from "next/link";
import { setAssetStatusAction } from "@/lib/actions";
import { Pill } from "./parts";

/** Server MCP trovati dall'app desktop: cosa possono raggiungere, dove sono, decisione. */
export interface McpRow {
  id: string;
  name: string;
  status: string;
  reach: { label: string; sensitive: boolean }[];
  computers: number;
  people: number;
  clients: string[];
}

const MAX = 8;
const STATUS: Record<string, { label: string; tone: "steady" | "alarm" | "signal" }> = {
  APPROVED: { label: "Allowed", tone: "steady" },
  UNAPPROVED: { label: "Not allowed", tone: "alarm" },
  UNREVIEWED: { label: "To review", tone: "signal" },
  UNKNOWN: { label: "To review", tone: "signal" },
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function McpServers({ rows, canDecide, newAppComputers }: { rows: McpRow[]; canDecide: boolean; newAppComputers: number }) {
  const shown = rows.slice(0, MAX);
  const toReview = rows.filter((r) => r.status === "UNKNOWN" || r.status === "UNREVIEWED").length;
  const sensitive = rows.filter((r) => r.reach.some((x) => x.sensitive)).length;
  return (
    <section id="mcp" className="rounded-xl border border-line bg-panel animate-rise scroll-mt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
        <h2 className="text-sm font-bold text-ink-100">
          AI agents &amp; MCP servers <span className="text-ink-400 font-normal tabular">· {rows.length}</span>
        </h2>
        <span className="flex items-center gap-2 text-xs text-ink-400">
          {sensitive > 0 && <Pill tone="signal">{sensitive} reach sensitive data</Pill>}
          {toReview > 0 && <Pill tone="accent">{toReview} to review</Pill>}
          {!rows.length && <span>Tools that let AI act on your systems</span>}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-line px-4 py-4 text-sm text-ink-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            {newAppComputers > 0
              ? `No MCP servers found on ${plural(newAppComputers, "computer", "computers")} with the desktop app 0.5.6+.`
              : "Install the desktop app 0.5.6+ to find MCP servers on computers."}
          </span>
          {newAppComputers === 0 && (
            <Link href="/download" className="text-ink-100 hover:underline shrink-0">
              Get the app →
            </Link>
          )}
        </div>
      ) : (
        <ul className="border-t border-line divide-y divide-line">
          {shown.map((r) => {
            const st = STATUS[r.status] ?? STATUS.UNKNOWN;
            const pending = r.status === "UNKNOWN" || r.status === "UNREVIEWED";
            return (
              <li key={r.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <Link href={`/assets/${r.id}`} className="text-sm text-ink-100 hover:underline truncate block">
                    {r.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
                    {r.reach.length ? (
                      r.reach.map((x) => (
                        <Pill key={x.label} tone={x.sensitive ? "signal" : "muted"}>
                          {x.label}
                        </Pill>
                      ))
                    ) : (
                      <Pill>Reach unknown</Pill>
                    )}
                    <span className="tabular">
                      · {plural(r.computers, "computer", "computers")}
                      {r.people > 0 && ` · ${plural(r.people, "person", "people")}`}
                      {r.clients.length > 0 && ` · ${r.clients.join(", ")}`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!(canDecide && pending) && <Pill tone={st.tone}>{st.label}</Pill>}
                  {canDecide && (
                    <form action={setAssetStatusAction} className="flex items-center gap-2">
                      <input type="hidden" name="assetId" value={r.id} />
                      {r.status !== "UNAPPROVED" && (
                        <button name="status" value="UNAPPROVED" className="btn btn-ghost btn-sm">
                          Not allowed
                        </button>
                      )}
                      {r.status !== "APPROVED" && (
                        <button name="status" value="APPROVED" className="btn btn-secondary btn-sm">
                          Approve
                        </button>
                      )}
                    </form>
                  )}
                </div>
              </li>
            );
          })}
          {rows.length > MAX && (
            <li className="px-4 py-2 text-xs text-ink-400">
              +{rows.length - MAX} more in{" "}
              <Link href="/assets" className="underline hover:text-ink-100">
                the AI list
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
