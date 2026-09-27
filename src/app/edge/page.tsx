import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { EDGE } from "@/lib/plans";

export const dynamic = "force-dynamic";

// Pagina prodotto di angar Edge: cos'è, dove si installa, cosa vede (e cosa no),
// come si affianca all'app desktop, prezzo. Posizionamento per la vendita.
export default function EdgePage() {
  const salesEmail = process.env.SALES_EMAIL;
  const requestHref = salesEmail
    ? `mailto:${salesEmail}?subject=${encodeURIComponent("angar Edge — request a device")}`
    : "/billing#edge";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        crumbs={[{ label: "Sources", href: "/sources" }]}
        title="angar Edge"
        subtitle="An always-on sensor for your whole network. Plug it in and see every AI in use — nothing installed on anyone's computer."
        action={
          <div className="flex items-center gap-2">
            <Link href={requestHref} className="btn btn-primary">Request a device</Link>
          </div>
        }
      />

      {/* Cos'è, in una riga forte. */}
      <section className="rounded-xl border border-accent/40 bg-panel p-6">
        <p className="text-[15px] text-ink-100 leading-relaxed max-w-3xl">
          A small, silent box you connect to the company network. It watches which AI services the network reaches — the same detection as the desktop app, but{" "}
          <span className="text-white font-medium">always on and for every device</span>: computers, phones, servers, even the ones where you can&apos;t install anything.
          It never inspects content — only the names of AI services and how often they&apos;re reached.
        </p>
      </section>

      {/* Dove si installa. */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-ink-100">Where it goes — pick the easiest for your network</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              n: "1",
              t: "As your DNS resolver",
              d: "Point the router/DHCP to the Edge for DNS. It sees lookups to AI domains (chatgpt.com, claude.ai…) and reports them. Simplest — like a Pi-hole, set up in minutes.",
              tag: "Recommended",
            },
            {
              n: "2",
              t: "From your DNS / firewall logs",
              d: "Most routers and firewalls already export DNS or web logs. The Edge reads them and finds the AI — it doesn't sit in the traffic path at all.",
            },
            {
              n: "3",
              t: "On a mirror / SPAN port",
              d: "For structured networks: mirror a switch port to the Edge. Deeper visibility, still passive — no decryption, no content.",
            },
          ].map((x) => (
            <div key={x.n} className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-full border border-line text-sm font-medium text-ink-100 flex items-center justify-center">{x.n}</span>
                {x.tag && <span className="text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2 py-0.5">{x.tag}</span>}
              </div>
              <div className="text-sm font-semibold text-ink-100">{x.t}</div>
              <p className="text-sm text-ink-400">{x.d}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-ink-400">
          It ships pre-configured and linked to your workspace. Connect it to the LAN, give it an IP, and within an hour you see every AI on the network — no software on any computer.
        </p>
      </section>

      {/* Cosa vede / cosa no. */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-line bg-panel p-5">
          <h3 className="text-sm font-semibold text-steady mb-3">What it sees</h3>
          <ul className="flex flex-col gap-2 text-sm text-ink-400">
            {[
              "Every AI service reached from the network — including phones, tablets, servers and unmanaged/BYOD devices",
              "New AI the moment someone starts using it, 24/7",
              "How often each AI is used, to feed Your AI, Savings and the monthly report",
            ].map((t) => (
              <li key={t} className="flex gap-2"><Tick />{t}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-panel p-5">
          <h3 className="text-sm font-semibold text-ink-100 mb-3">What it never does</h3>
          <ul className="flex flex-col gap-2 text-sm text-ink-400">
            {[
              "No content: never pages, prompts, messages or files — only AI service names",
              "No agent on anyone's computer, no decryption of traffic",
              "By itself it sees the device, not the person — pair it with the desktop app (or AD/DHCP) for per-person usage",
              "Only covers devices on the office network — remote/home work is covered by the desktop app",
            ].map((t) => (
              <li key={t} className="flex gap-2"><Dash />{t}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Edge + app desktop = copertura completa. */}
      <section className="rounded-xl border border-line bg-panel p-6">
        <h2 className="text-lg font-semibold text-ink-100">Edge and the desktop app work together</h2>
        <p className="text-sm text-ink-400 mt-1 mb-4 max-w-3xl">They answer different questions. Most companies use both.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Compare
            title="angar Edge"
            rows={[
              ["Install", "Nothing on computers — one box on the network"],
              ["Covers", "Everything on the network, incl. phones & servers"],
              ["Per person", "Only with AD/DHCP or the desktop app"],
              ["Remote work", "Not covered (office network only)"],
              ["Best for", "Full-network sweep, unmanaged devices, zero-install policies"],
            ]}
          />
          <Compare
            title="Desktop app"
            rows={[
              ["Install", "One download per computer, no admin rights"],
              ["Covers", "That computer — every browser + desktop AI apps"],
              ["Per person", "Yes — tied to the work email"],
              ["Remote work", "Covered anywhere the computer goes"],
              ["Best for", "Who uses what and for how long, unused seats"],
            ]}
          />
        </div>
      </section>

      {/* Prezzo + CTA. */}
      <section className="rounded-xl border border-line bg-panel p-6 flex flex-col md:flex-row md:items-center gap-6">
        <div className="flex-1">
          <h2 className="text-base font-semibold text-ink-100">Get an Edge</h2>
          <p className="text-sm text-ink-400 mt-1">
            Software for any always-on computer is included from Growth up. Prefer hardware? A pre-configured device is <span className="text-ink-100">€{EDGE.pricePerDevice}</span> per device / month, {EDGE.minMonths}-month minimum, shipping and free replacement included.
          </p>
        </div>
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-[34px] font-semibold tracking-tight tabular text-ink-100">€{EDGE.pricePerDevice}</span>
          <span className="text-sm text-ink-400">/device·mo</span>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Link href={requestHref} className="btn btn-primary">Request a device</Link>
          <Link href="/discover" className="text-xs text-center text-ink-400 hover:text-ink-100 underline">Or start with the desktop app</Link>
        </div>
      </section>
    </div>
  );
}

function Compare({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-xl border border-line overflow-hidden">
      <div className="px-4 py-3 border-b border-line bg-ink/40 text-sm font-semibold text-ink-100">{title}</div>
      <div className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 px-4 py-2.5">
            <span className="w-24 shrink-0 text-xs text-ink-400">{k}</span>
            <span className="flex-1 text-sm text-ink-100">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0 text-steady">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Dash() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0 text-ink-400">
      <path d="M4 8h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
