import Link from "next/link";
import { PageHeader, Panel, StatCard, Table, td } from "@/components/ui";
import { EDGE, planById } from "@/lib/plans";
import CopyButton from "@/components/CopyButton";
import { appUrl } from "@/lib/alerts";
import { isOnPrem } from "@/lib/edition";

export const dynamic = "force-dynamic";

// Pagina prodotto di angar Edge, nella grammatica della home: quattro numeri, i modi di
// installarlo, cosa fa rispetto all'app desktop, l'opzione on-premises.
export default function EdgePage() {
  const salesEmail = process.env.SALES_EMAIL;
  const requestHref = salesEmail ? `mailto:${salesEmail}?subject=${encodeURIComponent("angar Edge — request a device")}` : "/billing#edge";
  const fromPlan = planById(EDGE.softwareFromPlan).displayName;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "Connect", href: "/connect" }]}
        title="angar Edge"
        subtitle="Every AI on your network"
        action={
          <div className="flex items-center gap-2">
            <a href={requestHref} className="btn btn-ghost btn-sm">
              Request a device
            </a>
            <Link href="/edge/sensors" className="btn btn-primary btn-sm">
              Set up a sensor
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Install" value="10 min" hint="One sensor for each network" />
        <StatCard label="On computers" value="0 installs" hint="Phones, servers and scripts too" />
        <StatCard label="Software" value="Included" hint={`From ${fromPlan}, any number of sensors`} />
        <StatCard label="angar device" value={`€${EDGE.pricePerDevice}/mo`} hint={`${EDGE.minMonths}-month minimum, shipping included`} />
      </div>

      <Table
        title="Ways to install"
        note="Only AI names, counts and upload sizes"
        columns={["Option", "How", "Works with", { label: "Price", className: "text-right" }]}
        footer={
          <span className="text-xs text-ink-400">
            MSPs and resellers get {EDGE.partnerDiscountPct}% off. See the <Link href="/partner" className="underline hover:text-ink-100">partner console</Link>.
          </span>
        }
      >
        {[
          { t: "Software", d: "Docker image or Linux binary on any always-on server, VM or Raspberry Pi, as DNS resolver or firewall syslog receiver.", w: "Fortinet · Sophos · Palo Alto · Meraki · UniFi · pfSense", p: `Included from ${fromPlan}` },
          { t: "Cloud logs", d: "Push your secure web gateway logs to angar. Nothing runs in your network.", w: "Cloudflare Gateway · Zscaler · Cisco Umbrella", p: "Included" },
          { t: "angar device", d: "Plug & play box for sites without IT. Plug into the LAN, scan the QR code. Replaced free if it fails.", w: "Any network", p: `€${EDGE.pricePerDevice} a month` },
        ].map((x) => (
          <tr key={x.t}>
            <td className={`${td} font-medium text-ink-100 whitespace-nowrap`}>{x.t}</td>
            <td className={`${td} text-ink-400 min-w-[260px]`}>{x.d}</td>
            <td className={`${td} eyebrow`}>{x.w}</td>
            <td className={`${td} text-right text-ink-100 whitespace-nowrap`}>{x.p}</td>
          </tr>
        ))}
      </Table>

      <Table
        title="What it does"
        columns={["", "Edge", "Desktop app"]}
        footer={<span className="text-xs text-ink-400">Never reads content (URLs, prompts, messages, files), never decrypts traffic, never sends non-AI domains anywhere.</span>}
      >
        {[
          ["Covers", "Whole network: phones, servers, scripts and agents", "That computer, anywhere it goes"],
          ["Blocks", "Non-approved AI at DNS, for everyone", "Shows the person the approved AI"],
          ["By person", "Via hostname, AD/DHCP or the app, as privacy mode allows", "Yes, tied to the work email"],
          ["Also finds", "Local models (Ollama, LM Studio), large uploads to non-approved AI", "Unused seats, who uses what"],
          ["Evidence", "Tamper-evident AI Act / NIS2 pack", "Feeds the same pack"],
          ["Best for", "Invisible AI, unmanaged devices, NIS2", "Remote work, seat cleanup"],
        ].map(([k, a, b]) => (
          <tr key={k}>
            <td className={`${td} eyebrow whitespace-nowrap`}>{k}</td>
            <td className={`${td} text-ink-100`}>{a}</td>
            <td className={`${td} text-ink-100`}>{b}</td>
          </tr>
        ))}
      </Table>

      {/* Tutto in azienda: angar intero sul server del cliente o sul dispositivo Edge. */}
      {!isOnPrem() && (
        <Panel title="Keep all data in your company" subtitle="Enterprise">
          <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-400 max-w-3xl">Run all of angar on your own Linux server or on the angar device. Nothing is sent to angar&apos;s cloud.</p>
          <div className="flex items-start gap-2 max-w-3xl">
            <code className="flex-1 min-w-0 rounded-lg border border-line bg-ink px-3 py-2 text-xs text-ink-100 font-mono break-all select-all">{`curl -fsSL ${appUrl()}/api/onprem/install.sh | sudo sh`}</code>
            <CopyButton text={`curl -fsSL ${appUrl()}/api/onprem/install.sh | sudo sh`} />
          </div>
          <p className="text-xs text-ink-400">
            Then open the address it prints and create your account.{" "}
            <Link href="/docs/on-premises" className="underline hover:text-ink-100">How it works</Link>
          </p>
          </div>
        </Panel>
      )}
    </div>
  );
}
