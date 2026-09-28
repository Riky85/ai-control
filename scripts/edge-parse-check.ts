// Controlli dei parser di angar Edge (src/lib/edge/parse.ts), stessi casi dei test Rust in edge/src.
// Esegui: npx tsx scripts/edge-parse-check.ts
import assert from "node:assert/strict";
import { AI_SERVICES } from "../src/lib/discovery/catalog";
import {
  parseFortinet, parseSophos, parsePaloAlto, parseMeraki, parseUnifi, parsePfsense, parseGeneric, parseSyslog,
  parseJsonLine, parseUmbrellaCsv, parseCloudLine, parseKv, kvGet, hostOf, parseIp, firstPrivateIpv4,
  aiCandidateDomain, isBlockAction, splitCsv, suffixMatch, serviceByApp, aggregateLog, type Matcher,
} from "../src/lib/edge/parse";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok", name); };

t("util", () => {
  const kv = parseKv(`date=2026-09-28 devname="FGT 60F" srcip=192.168.1.34 hostname="chatgpt.com" msg="a b=c"`);
  assert.equal(kvGet(kv, ["devname"]), "FGT 60F");
  assert.equal(kvGet(kv, ["srcip"]), "192.168.1.34");
  assert.equal(kvGet(kv, ["msg"]), "a b=c");
  assert.equal(kvGet(kv, ["nope", "date"]), "2026-09-28");
  assert.equal(hostOf("https://user@Chat.OpenAI.com:443/c/1?x=1"), "chat.openai.com");
  assert.equal(hostOf("chatgpt.com/backend-api/conversation"), "chatgpt.com");
  assert.equal(hostOf("192.168.1.1"), null);
  assert.equal(hostOf("/just/a/path"), null);
  assert.equal(firstPrivateIpv4("from 8.8.8.8 to 10.1.2.3."), "10.1.2.3");
  assert.equal(parseIp("192.168.1.34:52344"), "192.168.1.34");
  assert.equal(parseIp("::ffff:192.168.1.34"), "192.168.1.34");
  assert.equal(parseIp("[2001:db8::1]:443"), "2001:db8::1");
  assert.equal(parseIp("nope"), null);
  assert.deepEqual(splitCsv(`a,"b,c","d""e"`), ["a", "b,c", `d"e`]);
  assert.ok(isBlockAction("block-url") && isBlockAction("deny") && !isBlockAction("passthrough"));
});

t("candidates", () => {
  assert.equal(aiCandidateDomain("app.genspark.ai"), "genspark.ai");
  assert.equal(aiCandidateDomain("www.supergpt.io"), "supergpt.io");
  assert.equal(aiCandidateDomain("ai.acme.co.uk"), "ai.acme.co.uk");
  assert.equal(aiCandidateDomain("docs-ai.example.com"), "docs-ai.example.com");
  assert.equal(aiCandidateDomain("www.google.com"), null);
  assert.equal(aiCandidateDomain("mail.airbnb.com"), null);
  assert.equal(aiCandidateDomain("192.168.1.10"), null);
  assert.equal(aiCandidateDomain("ai-printer.lan"), null);
  assert.equal(aiCandidateDomain("4.3.2.1.in-addr.arpa"), null);
});

t("fortinet", () => {
  const l = `<189>date=2026-09-28 time=10:15:02 devname="FGT60F" devid="FGT60FTK2209A1B2" logid="0317013312" type="utm" subtype="webfilter" srcip=192.168.1.34 srcport=52344 dstip=104.18.32.47 hostname="chatgpt.com" action="passthrough" url="https://chatgpt.com/backend-api/conversation" sentbyte=1532 rcvdbyte=8211 catdesc="Artificial Intelligence Technology"`;
  const h = parseFortinet(l)!;
  assert.equal(h.client, "192.168.1.34");
  assert.equal(h.host, "chatgpt.com");
  assert.equal(h.bytesUp, 1532);
  assert.ok(!h.blocked && h.aiCategory && !h.dns);
  const b = parseFortinet(`date=2026-09-28 devid="FGT" logid="0317013312" subtype="webfilter" srcip=10.0.5.21 srcname="PC-MARIO" hostname="chat.deepseek.com" action="blocked" url="https://chat.deepseek.com/a/chat" sentbyte=0`)!;
  assert.ok(b.blocked);
  assert.equal(b.clientName, "PC-MARIO");
  const d = parseFortinet(`date=2026-09-28 devid="FGT60F" logid="1501054802" type="utm" subtype="dns" srcip=192.168.1.40 qname="api.openai.com" action="pass"`)!;
  assert.ok(d.dns && !d.blocked);
  assert.equal(d.host, "api.openai.com");
  const a = parseFortinet(`date=2026-09-28 devid="FG100F" logid="0000000013" type="traffic" srcip=192.168.1.50 dstip=13.107.42.14 action="deny" app="ChatGPT" appcat="Generative.AI" sentbyte=420`)!;
  assert.equal(a.app, "ChatGPT");
  assert.ok(a.blocked && !a.host);
  assert.equal(a.bytesUp, 420);
  assert.equal(parseFortinet(`date=2026-09-28 logid="0000000013" type="traffic" srcip=192.168.1.50 dstip=1.1.1.1 action="accept"`), null);
});

t("sophos", () => {
  const h = parseSophos(`<30>device="SFW" log_component="HTTP" log_subtype="Allowed" status="" category="Generative AI" url="https://claude.ai/chat/1a2b" src_ip=192.168.10.23 sent_bytes=2048 domain=claude.ai application=""`)!;
  assert.equal(h.client, "192.168.10.23");
  assert.equal(h.host, "claude.ai");
  assert.equal(h.bytesUp, 2048);
  assert.ok(!h.blocked && h.aiCategory);
  const d = parseSophos(`<30>log_component="HTTP" log_subtype="Denied" category="Uncategorized" url="https://chat.deepseek.com/" src_ip="192.168.10.40" bytes_sent=0 domain="chat.deepseek.com"`)!;
  assert.ok(d.blocked);
  const u = parseSophos(`2026:09:28-10:15:02 utm httpproxy[4321]: action="pass" srcip="192.168.2.15" url="https://api.openai.com/v1/chat/completions" categoryname="Artificial Intelligence"`)!;
  assert.equal(u.host, "api.openai.com");
  assert.ok(u.aiCategory);
});

t("paloalto", () => {
  const l = `<14>Sep 28 10:15:02 PA-VM 1,2026/09/28 10:15:02,012801012345,THREAT,url,2561,2026/09/28 10:15:02,192.168.1.34,104.18.32.47,203.0.113.10,104.18.32.47,allow-web,acme\\mario,,openai-chatgpt,vsys1,trust,untrust,ethernet1/2,ethernet1/1,default,2026/09/28 10:15:02,34567,1,52344,443,40001,443,0x40b000,tcp,alert,"chatgpt.com/backend-api/conversation",(9999),artificial-intelligence,informational,client-to-server`;
  const h = parsePaloAlto(l)!;
  assert.equal(h.client, "192.168.1.34");
  assert.equal(h.host, "chatgpt.com");
  assert.ok(!h.blocked && h.aiCategory);
  assert.ok(parsePaloAlto(l.replace(",alert,", ",block-url,"))!.blocked);
  const tr = `<14>Sep 28 10:16:00 PA-3220 1,2026/09/28 10:16:00,012801054321,TRAFFIC,end,2561,2026/09/28 10:16:00,10.10.4.21,160.79.104.10,203.0.113.10,160.79.104.10,allow-web,,,claude-ai,vsys1,trust,untrust,ethernet1/2,ethernet1/1,default,2026/09/28 10:16:00,45678,1,53012,443,40002,443,0x400053,tcp,allow,18532,6532,12000,40,2026/09/28 10:15:30,28,artificial-intelligence,0,7300000000000000002,0x0,10.0.0.0-10.255.255.255,United States,0,22,18,aged-out`;
  const x = parsePaloAlto(tr)!;
  assert.equal(x.client, "10.10.4.21");
  assert.equal(x.app, "claude-ai");
  assert.equal(x.bytesUp, 6532);
  assert.ok(!x.host && x.aiCategory && !x.blocked);
  assert.equal(parsePaloAlto(`1,2026/09/28 10:15:02,0128,THREAT,virus,2561,2026/09/28 10:15:02,192.168.1.34,1.2.3.4,,,r,,,web-browsing,vsys1,t,u,e1,e2,d,,1,1,1,80,0,0,0x0,tcp,alert,"evil.exe",(1),any,high`), null);
});

t("meraki / unifi / pfsense / generic", () => {
  const m = parseMeraki(`<134>1 1790590502.123 MX84_Milano urls src=192.168.128.34:52344 dst=104.18.32.47:443 mac=AA:BB:CC:DD:EE:01 agent='Mozilla/5.0' request: GET https://chatgpt.com/backend-api/conversation?model=x`)!;
  assert.equal(m.client, "192.168.128.34");
  assert.equal(m.host, "chatgpt.com");
  assert.equal(parseMeraki(`<134>1 1.1 MX84 flows src=192.168.128.34 dst=104.18.32.47 protocol=tcp pattern: allow all`), null);
  const u = parseUnifi(`<30>Sep 28 10:15:02 UDM-Pro dnsmasq[21456]: query[A] chatgpt.com from 192.168.1.34`)!;
  assert.equal(u.host, "chatgpt.com");
  assert.ok(u.dns);
  assert.equal(parseUnifi(`Sep 28 10:15:03 UDM dnsmasq[21456]: reply chatgpt.com is 104.18.32.47`), null);
  const p = parsePfsense(`<30>Sep 28 10:15:02 pfSense unbound[12345]: [12345:0] info: 192.168.1.5 chatgpt.com. A IN`)!;
  assert.equal(p.client, "192.168.1.5");
  assert.equal(p.host, "chatgpt.com");
  assert.equal(parsePfsense(`Sep 28 10:15:02 pfSense unbound[1]: [1:0] info: start of service (unbound 1.19.0).`), null);
  const g = parseGeneric(`<13>Sep 28 10:15:02 fw01.acme.local proxy: client 192.168.3.44 CONNECT claude.ai:443 bytes=1234`)!;
  assert.equal(g.client, "192.168.3.44");
  assert.ok(g.hosts.includes("claude.ai"));
  assert.equal(parseGeneric("from 8.8.8.8 chatgpt.com"), null);
  assert.equal(parseSyslog(`<30>Sep 28 10:15:02 UDM dnsmasq[1234]: query[A] chatgpt.com from 192.168.1.34`)!.vendor, "unifi");
  assert.equal(parseSyslog("<13>Sep 28 10:15:02 host kernel: something unrelated"), null);
});

t("cloud formats", () => {
  const cf = parseJsonLine(`{"Datetime":"2026-09-28T10:00:00Z","QueryName":"chatgpt.com","SrcIP":"10.0.0.7","ResolverDecision":"allowedOnNoPolicyMatch","DeviceName":"LAPTOP-1","Email":"x@acme.com"}`)!;
  assert.equal(cf.vendor, "cloudflare");
  assert.equal(cf.host, "chatgpt.com");
  assert.equal(cf.client, "10.0.0.7");
  assert.equal(cf.clientName, "LAPTOP-1");
  assert.ok(cf.dns && !cf.blocked);
  const cfb = parseJsonLine(`{"QueryName":"chat.deepseek.com.","SrcIP":"10.0.0.8","ResolverDecision":"blockedByCategory"}`)!;
  assert.ok(cfb.blocked);
  assert.equal(cfb.host, "chat.deepseek.com");
  const cfh = parseJsonLine(`{"HTTPHost":"claude.ai","SourceIP":"192.168.5.2","Action":"allow","URL":"https://claude.ai/chat/abc"}`)!;
  assert.equal(cfh.host, "claude.ai");
  assert.equal(cfh.client, "192.168.5.2");
  const zs = parseJsonLine(`{"sourcetype":"zscalernss-web","event":{"datetime":"x","hostname":"api.openai.com","url":"api.openai.com/v1/chat","cintip":"10.1.1.4","clientip":"203.0.113.5","reqsize":"250000","action":"Allowed","urlcategory":"Generative AI"}}`)!;
  assert.equal(zs.vendor, "zscaler");
  assert.equal(zs.host, "api.openai.com");
  assert.equal(zs.client, "10.1.1.4");
  assert.equal(zs.bytesUp, 250000);
  assert.ok(zs.aiCategory && !zs.blocked);
  assert.equal(parseJsonLine(`{"foo":1}`), null);
  assert.equal(parseJsonLine(`{not json`), null);
  const um = parseUmbrellaCsv(`"2026-09-28 10:15:02","ACME\\mario","ACME\\mario,Milan","10.0.3.21","203.0.113.1","Allowed","1 (A)","NOERROR","chatgpt.com.","Generative AI"`)!;
  assert.equal(um.vendor, "umbrella");
  assert.equal(um.client, "10.0.3.21");
  assert.equal(um.host, "chatgpt.com");
  assert.ok(um.dns && !um.blocked && um.aiCategory);
  const up = parseUmbrellaCsv(`"2026-09-28 10:15:02","Milan","10.0.3.22","203.0.113.1","104.18.32.47","text/html","BLOCKED","https://chat.deepseek.com/a/b","","Mozilla","403","1200","0"`)!;
  assert.equal(up.host, "chat.deepseek.com");
  assert.equal(up.client, "10.0.3.22");
  assert.ok(up.blocked);
  assert.equal(up.bytesUp, 1200);
  assert.equal(parseCloudLine(`<30>Sep 28 10:15:02 UDM dnsmasq[1234]: query[A] claude.ai from 192.168.1.9`)!.vendor, "unifi");
});

t("matching + aggregation", () => {
  const services = AI_SERVICES.map((s) => ({ id: s.id, name: s.name, kind: s.type === "AI_API" ? "api" : "web", domains: s.domains.filter((d) => !d.includes("/")) })).filter((s) => s.domains.length);
  const blocked = [{ serviceId: "cand:evilai.io", domains: ["evilai.io"] }];
  const matcher: Matcher = {
    service: (h) => { const s = services.find((x) => suffixMatch(h, x.domains)); return s ? { serviceId: s.id, kind: s.kind } : null; },
    blocked: (h) => { const b = blocked.find((x) => suffixMatch(h, x.domains)); return b ? { serviceId: b.serviceId, kind: "web" } : null; },
    byApp: (a) => serviceByApp(a, services),
  };
  assert.equal(matcher.service("ab.chatgpt.com")?.serviceId, "chatgpt");
  assert.equal(matcher.service("api.openai.com")?.kind, "api");
  assert.equal(matcher.service("notchatgpt.com"), null);
  assert.equal(serviceByApp("openai-chatgpt", services)?.serviceId, "chatgpt");
  assert.equal(serviceByApp("claude-ai", services)?.serviceId, "claude");
  const text = [
    `{"QueryName":"chatgpt.com","SrcIP":"10.0.0.7","ResolverDecision":"allowed","DeviceName":"LAPTOP-1"}`,
    `{"QueryName":"chatgpt.com","SrcIP":"10.0.0.7","ResolverDecision":"blockedByCategory"}`,
    `{"QueryName":"www.google.com","SrcIP":"10.0.0.7"}`,
    `{"QueryName":"www.supergpt.io","SrcIP":"10.0.0.9"}`,
    `{"QueryName":"x.evilai.io","SrcIP":"10.0.0.9"}`,
    `date=2026-09-28 devid="FGT" logid="1" srcip=192.168.1.50 hostname="api.openai.com" sentbyte=5000000 action="accept"`,
    `squid: 10.0.0.8 TCP_TUNNEL/200 3452 CONNECT https://gemini.google.com/app 443`,
    ``,
    `garbage line`,
  ].join("\r\n");
  const r = aggregateLog(text, matcher, { day: "2026-09-28", anonymous: false });
  assert.equal(r.lines, 8);
  const cg = r.events.find((e) => e.serviceId === "chatgpt")!;
  assert.equal(cg.hits, 2);
  assert.equal(cg.blocked, 1);
  assert.equal(cg.source, "cloud:cloudflare");
  assert.equal(cg.clientName, "LAPTOP-1");
  assert.equal(r.events.find((e) => e.serviceId === "openai-api")!.bytesUp, 5000000);
  assert.equal(r.events.find((e) => e.serviceId === "gemini")!.source, "cloud:generic");
  assert.equal(r.events.find((e) => e.serviceId === "cand:evilai.io")!.client, "10.0.0.9");
  assert.deepEqual(r.candidates.map((c) => c.domain), ["supergpt.io"]);
  // Nessun host non-AI finisce nell'output.
  assert.ok(!JSON.stringify(r).includes("google.com/"));
  assert.ok(!JSON.stringify(r).includes("www.google.com"));
  const anon = aggregateLog(text, matcher, { day: "2026-09-28", anonymous: true });
  assert.ok(anon.events.every((e) => e.client === "*" && !e.clientName));
  assert.ok(anon.candidates.every((c) => c.client === "*"));
});

console.log(`\n${n} groups passed`);
