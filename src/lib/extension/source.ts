/**
 * Estensione angar per Chrome / Edge (Manifest V3). Vede SOLO se una pagina
 * aperta appartiene a un servizio AI del catalogo (es. "chatgpt.com") e ogni
 * 30 minuti invia ad angar: servizio, numero di visite, ultima visita, email
 * aziendale di chi usa il browser. Mai URL completi, contenuti o prompt.
 * Configurazione: token del workspace (e server) via policy gestita da IT
 * (chrome.storage.managed) o a mano nella pagina opzioni.
 */
export function extensionFiles(server: string): Record<string, string> {
  const manifest = {
    manifest_version: 3,
    name: "angar",
    version: "1.0.0",
    description: "Tells your company which AI tools are used at work — only the names of AI websites, nothing else.",
    permissions: ["storage", "alarms", "tabs", "identity", "identity.email"],
    host_permissions: [`${server}/*`],
    background: { service_worker: "background.js" },
    options_page: "options.html",
    action: { default_title: "angar", default_popup: "options.html" },
    storage: { managed_schema: "schema.json" },
  };
  const schema = {
    type: "object",
    properties: {
      token: { title: "angar workspace token", description: "From angar: Sources > Scan computers & network", type: "string" },
      server: { title: "angar server", type: "string" },
      email: { title: "User email (optional; default: the browser profile email)", type: "string" },
    },
  };
  const background = String.raw`const DEFAULT_SERVER = ${JSON.stringify(server)};

async function cfg() {
  let m = {};
  try { m = await chrome.storage.managed.get(null); } catch (e) {}
  const l = await chrome.storage.local.get(["token", "email", "server"]);
  let email = m.email || l.email || "";
  if (!email && chrome.identity && chrome.identity.getProfileUserInfo) {
    try { const u = await chrome.identity.getProfileUserInfo({ accountStatus: "ANY" }); email = u.email || ""; } catch (e) {}
  }
  return { server: (m.server || l.server || DEFAULT_SERVER).replace(/\/$/, ""), token: m.token || l.token || "", email, managed: Boolean(m.token) };
}

async function catalog() {
  const c = await chrome.storage.local.get(["catalog", "catalogAt"]);
  if (c.catalog && Date.now() - c.catalogAt < 86400000) return c.catalog;
  const { server } = await cfg();
  try {
    const j = await (await fetch(server + "/api/discovery/catalog")).json();
    const list = j.services.flatMap((s) => s.domains.map((d) => [d.toLowerCase(), s.id]));
    await chrome.storage.local.set({ catalog: list, catalogAt: Date.now() });
    return list;
  } catch (e) {
    return c.catalog || [];
  }
}

function match(list, url) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  for (const [pat] of list) {
    if (pat.includes("/")) {
      const i = pat.indexOf("/");
      const h = pat.slice(0, i), p = pat.slice(i);
      if ((host === h || host.endsWith("." + h)) && u.pathname.startsWith(p)) return host + p;
    } else if (host === pat || host.endsWith("." + pat)) return host;
  }
  return null;
}

chrome.tabs.onUpdated.addListener(async (_id, info, tab) => {
  if (info.status !== "complete" || !tab.url) return;
  const hit = match(await catalog(), tab.url);
  if (!hit) return;
  const { pending = {} } = await chrome.storage.local.get("pending");
  const p = pending[hit] || { hits: 0 };
  p.hits += 1;
  p.lastSeen = new Date().toISOString();
  pending[hit] = p;
  await chrome.storage.local.set({ pending });
});

async function flush() {
  const { token, email, server } = await cfg();
  const { pending = {} } = await chrome.storage.local.get("pending");
  const keys = Object.keys(pending);
  if (!token || keys.length === 0) return;
  const body = { user: email || null, findings: keys.map((k) => ({ kind: "domain", value: k, hits: pending[k].hits, lastSeen: pending[k].lastSeen, via: "browser extension" })) };
  try {
    const r = await fetch(server + "/api/discovery/usage", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(body) });
    if (r.ok) await chrome.storage.local.set({ pending: {}, lastSent: Date.now(), lastError: "" });
    else await chrome.storage.local.set({ lastError: "angar answered " + r.status });
  } catch (e) {
    await chrome.storage.local.set({ lastError: String(e) });
  }
}

chrome.alarms.create("flush", { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "flush") flush(); });
chrome.runtime.onStartup.addListener(flush);
chrome.runtime.onMessage.addListener((msg, _s, reply) => { if (msg === "flush") flush().then(() => reply(true)); return true; });
`;
  const options = `<!doctype html>
<html><head><meta charset="utf-8"><title>angar</title>
<style>
body{font:14px system-ui,sans-serif;margin:0;padding:18px;width:340px;color:#EDEDEF;background:#202327}
h1{font-size:16px;margin:0 0 4px}p{color:#9CA0A8;margin:0 0 14px;font-size:12px;line-height:1.5}
label{display:block;font-size:12px;color:#9CA0A8;margin:10px 0 4px}input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #34383D;background:#282B30;color:#EDEDEF}
button{margin-top:14px;width:100%;padding:9px;border:0;border-radius:8px;background:#FF7323;color:#fff;font-weight:600;cursor:pointer}
#status{margin-top:12px;font-size:12px;color:#9CA0A8}.ok{color:#3FB67A}
</style></head><body>
<h1>angar</h1>
<p>Tells your company which AI tools are used at work. Only the names of AI websites are sent (e.g. "chatgpt.com, 12 visits") — never pages, prompts or other browsing.</p>
<div id="form">
<label>Workspace token</label><input id="token" placeholder="angd_…" autocomplete="off">
<label>Your work email</label><input id="email" placeholder="name@company.com">
<button id="save">Save</button>
</div>
<div id="status"></div>
<script src="options.js"></script>
</body></html>`;
  const optionsJs = `async function load(){
  let m={};try{m=await chrome.storage.managed.get(null)}catch(e){}
  const l=await chrome.storage.local.get(["token","email","lastSent","lastError","pending"]);
  if(m.token){document.getElementById("form").style.display="none"}
  document.getElementById("token").value=l.token||"";document.getElementById("email").value=l.email||m.email||"";
  const n=Object.keys(l.pending||{}).length;
  const s=document.getElementById("status");
  s.innerHTML=(m.token?'<span class="ok">Set up by your company.</span> ':'')+(l.lastSent?'Last sent '+new Date(l.lastSent).toLocaleString()+'. ':'Nothing sent yet. ')+(n?n+' AI service'+(n>1?'s':'')+' waiting to be sent. ':'')+(l.lastError?'<br>Problem: '+l.lastError:'');
}
document.getElementById("save").onclick=async()=>{
  await chrome.storage.local.set({token:document.getElementById("token").value.trim(),email:document.getElementById("email").value.trim()});
  chrome.runtime.sendMessage("flush",()=>load());
  load();
};
load();`;
  const readme = `angar browser extension

INSTALL ON ONE COMPUTER (test)
1. Unzip this folder.
2. Chrome: open chrome://extensions — Edge: edge://extensions
3. Turn on "Developer mode", click "Load unpacked" and choose the folder.
4. Click the angar icon, paste the workspace token (angar > Sources > Scan computers & network) and your work email.

INSTALL ON EVERY COMPUTER (IT)
Publish the extension once (Chrome Web Store and Edge Add-ons, "unlisted"), then force-install it with your device management
(Google Admin, Intune/GPO: ExtensionInstallForcelist) and push this managed configuration:
  { "token": "YOUR_TOKEN", "server": "${server}" }
The user's email comes from the signed-in browser profile; set "email" per user if profiles aren't managed.

WHAT IS SENT
Only AI service names from angar's list, visit counts, last visit time and the work email. Nothing else.`;
  return {
    "manifest.json": JSON.stringify(manifest, null, 2),
    "schema.json": JSON.stringify(schema, null, 2),
    "background.js": background,
    "options.html": options,
    "options.js": optionsJs,
    "README.txt": readme,
  };
}
