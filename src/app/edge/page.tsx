import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { EDGE, planById } from "@/lib/plans";
import EdgeBox from "@/components/EdgeBox";
import CopyButton from "@/components/CopyButton";
import { appUrl } from "@/lib/alerts";
import { isOnPrem } from "@/lib/edition";

export const dynamic = "force-dynamic";

// Pagina prodotto di angar Edge: cos'è, i tre modi di installarlo, cosa fa (e
// cosa mai), come si affianca all'app desktop, prezzo. Compatta: griglie strette.
export default function EdgePage() {
  const salesEmail = process.env.SALES_EMAIL;
  const requestHref = salesEmail ? `mailto:${salesEmail}?subject=${encodeURIComponent("angar Edge — request a device")}` : "/billing#edge";
  const fromPlan = planById(EDGE.softwareFromPlan).name;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        crumbs={[{ label: "Connect", href: "/connect" }]}
        title="angar Edge"
        subtitle="The network sensor: every AI on your network, the ones you don't approve blocked — nothing installed on anyone's computer."
        action={
          <div className="flex items-center gap-2">
            <a href={requestHref} className="btn btn-secondary">
              Request a device
            </a>
            <Link href="/edge/sensors" className="btn btn-primary">
              Set up a sensor
            </Link>
          </div>
        }
      />

      {/* Hero */}
      <section className="rounded-xl border border-accent/50 bg-panel p-5 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_auto] items-center gap-6 overflow-hidden">
        <div className="flex flex-col gap-3 max-w-xl">
          <span className="self-start text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2 py-0.5">Software · cloud logs · device</span>
          <p className="text-[16px] text-ink-100 leading-relaxed">
            One sensor on your network — as a DNS resolver or reading your firewall logs — sees every AI in use on <span className="font-medium">every device</span>:
            laptops, phones, servers, and the scripts and agents nobody told you about.
          </p>
          <p className="text-sm text-ink-400">Only AI service names, counts and upload sizes. Never URLs, prompts, messages or files.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-400">
            <span>
              <span className="text-ink-100 font-medium">10 min</span> to install
            </span>
            <span>
              <span className="text-ink-100 font-medium">0</span> installs on computers
            </span>
            <span>
              <span className="text-ink-100 font-medium">Included</span> from {fromPlan}
            </span>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Link href="/edge/sensors" className="btn btn-primary">
              Set up a sensor
            </Link>
            <a href={requestHref} className="text-sm text-ink-400 hover:text-ink-100 underline">
              or request a plug &amp; play device
            </a>
          </div>
        </div>
        <div className="justify-self-center">
          <EdgeBox width={280} />
        </div>
      </section>

      {/* Tre modi di installarlo */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          {
            t: "Software",
            tag: `Included from ${fromPlan}`,
            d: "Docker image or Linux binary on any always-on server, VM or Raspberry Pi. Acts as the network's DNS resolver and/or receives firewall syslog.",
            foot: "Fortinet · Sophos · Palo Alto · Meraki · UniFi · pfSense",
          },
          {
            t: "Cloud logs",
            tag: "No install",
            d: "Already on a secure web gateway? Push its logs to angar and we do the rest — nothing runs in your network.",
            foot: "Cloudflare Gateway · Zscaler · Cisco Umbrella",
          },
          {
            t: "angar device",
            tag: `€${EDGE.pricePerDevice}/device·mo`,
            d: "Pre-configured, plug & play box for sites without IT or servers. Plug into the LAN, scan the QR code, done. Replaced free if it fails.",
            foot: `${EDGE.minMonths}-month minimum · shipping included`,
          },
        ].map((x) => (
          <div key={x.t} className="rounded-xl border border-line bg-panel p-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink-100">{x.t}</span>
              <span className="text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2 py-0.5 whitespace-nowrap">{x.tag}</span>
            </div>
            <p className="text-sm text-ink-400">{x.d}</p>
            <p className="text-xs text-ink-400 mt-auto pt-1">{x.foot}</p>
          </div>
        ))}
      </section>

      {/* Cosa fa */}
      <section className="rounded-xl border border-line bg-panel p-5">
        <h2 className="text-base font-semibold text-ink-100 mb-3">What it does</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
          {[
            ["Discover", "Every AI reached from the network, 24/7 — incl. phones, servers and BYOD."],
            ["Block + suggest", "Stops non-approved AI at DNS level. The desktop app tells the person which approved AI to use instead."],
            ["Invisible AI", "Servers, scripts and agents calling OpenAI, Anthropic & co. directly — often on personal API keys."],
            ["Local models", "Finds Ollama and LM Studio servers on the LAN (opt-in scan)."],
            ["Large uploads", "Alerts when a device sends lots of data to a non-approved AI — from firewall byte counts, never content."],
            ["Privacy modes", "By person, by department (groups ≥ 5) or company totals only — for Statuto dei lavoratori art. 4 and the Betriebsrat."],
            ["AI Act / NIS2 evidence", "Tamper-evident evidence pack of what AI runs where, and what was blocked."],
            ["Feeds angar", "Your AI, Savings, alerts and the monthly report update themselves."],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-2">
              <Tick />
              <div>
                <div className="text-sm font-medium text-ink-100">{t}</div>
                <p className="text-xs text-ink-400 leading-relaxed">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cosa mai + Edge vs app desktop */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-3">
        <div className="rounded-xl border border-line bg-panel p-4">
          <h3 className="text-sm font-semibold text-ink-100 mb-2">What it never does</h3>
          <ul className="flex flex-col gap-1.5 text-sm text-ink-400">
            {[
              "Read content — no URLs, prompts, messages or files",
              "Decrypt traffic or sit in the data path (DNS answers only)",
              "Send non-AI domains anywhere — matching happens on the sensor",
              "Show names when privacy mode says otherwise",
              "Cover home networks — that's the desktop app's job",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <Dash />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-panel overflow-hidden">
          <div className="grid grid-cols-[6rem_1fr_1fr] text-xs">
            <div className="px-3 py-2 border-b border-line" />
            <div className="px-3 py-2 border-b border-line font-semibold text-ink-100 text-sm">angar Edge</div>
            <div className="px-3 py-2 border-b border-line font-semibold text-ink-100 text-sm">Desktop app</div>
            {[
              ["Install", "One sensor for each network, or cloud logs", "One download on each computer, no admin rights"],
              ["Covers", "Whole network: phones, servers, scripts", "That computer, anywhere it goes"],
              ["Blocks", "Yes, at DNS for everyone", "Shows the person the approved AI"],
              ["By person", "Via hostname, AD/DHCP or the app", "Yes, tied to the work email"],
              ["Best for", "Invisible AI, unmanaged devices, NIS2", "Who uses what, unused seats, remote work"],
            ].map(([k, a, b]) => (
              <Row key={k} k={k} a={a} b={b} />
            ))}
          </div>
          <p className="px-3 py-2 text-xs text-ink-400">Most companies use both: Edge for the network, the app for people.</p>
        </div>
      </section>

      {/* Tutto in azienda: angar intero sul server del cliente o sul dispositivo Edge. */}
      {!isOnPrem() && (
        <section className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-ink-100">Keep every piece of data in your company</h2>
            <span className="text-[11px] font-medium text-accent border border-accent/40 rounded-full px-2 py-0.5">Enterprise</span>
          </div>
          <p className="text-sm text-ink-400 max-w-3xl">
            Run the whole of angar on your own server or on the angar device. Computers, sensors, people and costs all stay on your network — nothing is sent to
            angar&apos;s cloud. One command on any Linux server with internet access for updates:
          </p>
          <div className="flex items-start gap-2 max-w-3xl">
            <code className="flex-1 min-w-0 rounded-lg border border-line bg-ink px-3 py-2 text-xs text-ink-100 font-mono break-all select-all">{`curl -fsSL ${appUrl()}/api/onprem/install.sh | sudo sh`}</code>
            <CopyButton text={`curl -fsSL ${appUrl()}/api/onprem/install.sh | sudo sh`} />
          </div>
          <p className="text-xs text-ink-400">
            Then open the address it prints and create your account.{" "}
            <Link href="/docs/on-premises" className="underline hover:text-ink-100">How it works</Link>
          </p>
        </section>
      )}

      {/* Prezzo */}
      <section className="rounded-xl border border-line bg-panel p-4 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 text-sm text-ink-400">
          <span className="text-ink-100 font-medium">Software and cloud logs are included from {fromPlan}</span> — as many sensors as you need. Prefer hardware? The angar
          device is <span className="text-ink-100">€{EDGE.pricePerDevice}</span> a month for each device, {EDGE.minMonths}-month minimum, shipping and replacement included.
          MSPs and resellers get {EDGE.partnerDiscountPct}% off — see the{" "}
          <Link href="/partner" className="underline hover:text-ink-100">
            partner console
          </Link>
          .
        </div>
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-[28px] font-semibold tracking-tight tabular text-ink-100">€{EDGE.pricePerDevice}</span>
          <span className="text-sm text-ink-400">/device·mo</span>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/edge/sensors" className="btn btn-primary">
            Set up a sensor
          </Link>
          <a href={requestHref} className="btn btn-secondary">
            Request a device
          </a>
        </div>
      </section>
    </div>
  );
}

function Row({ k, a, b }: { k: string; a: string; b: string }) {
  return (
    <>
      <div className="px-3 py-1.5 border-b border-line text-ink-400">{k}</div>
      <div className="px-3 py-1.5 border-b border-line text-ink-100 text-[13px]">{a}</div>
      <div className="px-3 py-1.5 border-b border-line text-ink-100 text-[13px]">{b}</div>
    </>
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
