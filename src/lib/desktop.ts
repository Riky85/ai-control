import { zipSync, strToU8 } from "fflate";

/**
 * App desktop angar: i binari li compila GitHub Actions (desktop/ nel repo)
 * e li pubblica nella release "desktop-latest". Qui si scaricano e si
 * rinominano con il codice dell'azienda, così l'app si collega da sola.
 */
export type DesktopOs = "windows" | "mac" | "linux";

const REPO = process.env.DESKTOP_RELEASE_REPO ?? "Riky85/ai-control";
const TAG = process.env.DESKTOP_RELEASE_TAG ?? "desktop-latest";
const ASSET: Record<DesktopOs, string> = {
  windows: "angar-windows-x64.exe",
  mac: "angar-macos-universal",
  linux: "angar-linux-x64",
};
// macOS: bundle finito da CI (firmato Developer ID + notarizzato quando ci sono i secret).
// Se la release non lo ha ancora, si ricade sul binario nudo impacchettato qui (macApp).
const MAC_APP_ZIP = "angar-macos.app.zip";

// Versione dell'app desktop pubblicata (desktop/Cargo.toml).
export const DESKTOP_VERSION = "0.5.3";

export const DESKTOP_OS_LABEL: Record<DesktopOs, string> = { windows: "Windows", mac: "macOS", linux: "Linux" };

export function osFromUserAgent(ua: string | null | undefined): DesktopOs {
  const u = (ua ?? "").toLowerCase();
  if (u.includes("mac os") || u.includes("macintosh")) return "mac";
  if (u.includes("linux") && !u.includes("android")) return "linux";
  return "windows";
}

const MISS_TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: Uint8Array | null }>();

/** Un asset della release, così com'è (i byte non vengono mai modificati). */
async function asset(name: string): Promise<Uint8Array | null> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < MISS_TTL) return hit.data;
  const url = `https://github.com/${REPO}/releases/download/${TAG}/${name}`;
  const headers: Record<string, string> = { "User-Agent": "angar-server" };
  if (process.env.GITHUB_RELEASE_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_RELEASE_TOKEN}`;
  let r: Response;
  try {
    r = await fetch(url, { headers, redirect: "follow", cache: "no-store" });
  } catch {
    return hit?.data ?? null;
  }
  // 404 = asset non (ancora) pubblicato: lo ricordiamo per non chiederlo a ogni download.
  if (r.status === 404) {
    cache.set(name, { at: Date.now(), data: hit?.data ?? null });
    return hit?.data ?? null;
  }
  if (!r.ok) return hit?.data ?? null;
  const data = new Uint8Array(await r.arrayBuffer());
  cache.set(name, { at: Date.now(), data });
  return data;
}

/**
 * Rinomina la cartella del bundle nello zip di CI (angar.app/... → angar-<code>.app/...)
 * copiando i dati compressi byte per byte: contenuti, permessi Unix e firma restano
 * identici. Il nome della cartella .app non fa parte della firma di codice né del
 * ticket di notarizzazione, e l'app legge il codice dal nome (join_code_from_file_name).
 * Restituisce null se lo zip non ha la forma attesa.
 */
export function renameAppInZip(zip: Uint8Array, from: string, to: string): Uint8Array | null {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  // End of central directory (con eventuale commento fino a 64 KB)
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = u16(eocd + 10);
  const cdSize = u32(eocd + 12);
  const cdOffset = u32(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff || cdOffset + cdSize > zip.length) return null; // zip64: non previsto
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const prefix = new RegExp(`^(__MACOSX/)?(\\._)?${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/|$)`);
  type Entry = { head: Uint8Array; name: Uint8Array; data: Uint8Array; offset: number };
  const entries: Entry[] = [];
  let p = cdOffset;
  let sawExe = false;
  for (let n = 0; n < count; n++) {
    if (p + 46 > zip.length || u32(p) !== 0x02014b50) return null;
    const flags = u16(p + 8);
    if (flags & 0x1) return null; // cifrato
    const csize = u32(p + 20);
    const usize = u32(p + 24);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commentLen = u16(p + 32);
    const local = u32(p + 42);
    if (csize === 0xffffffff || usize === 0xffffffff || local === 0xffffffff) return null;
    const oldName = dec.decode(zip.subarray(p + 46, p + 46 + nameLen));
    if (oldName.includes("..") || oldName.startsWith("/")) return null;
    const newName = oldName.replace(prefix, (_m, mac = "", dot = "", tail) => `${mac}${dot}${to}${tail}`);
    if (newName === `${to}/Contents/MacOS/angar`) sawExe = true;
    if (local + 30 > zip.length || u32(local) !== 0x04034b50) return null;
    const dataStart = local + 30 + u16(local + 26) + u16(local + 28);
    if (dataStart + csize > zip.length) return null;
    // Campi comuni al local header: versione, flag (senza data descriptor), metodo, data/ora, crc, dimensioni
    const head = new Uint8Array(46);
    const hv = new DataView(head.buffer);
    hv.setUint32(0, 0x02014b50, true);
    head.set(zip.subarray(p + 4, p + 28), 4); // made by, needed, flags, method, time, date, crc, csize, usize
    hv.setUint16(8, flags & ~0x8, true);
    hv.setUint16(30, 0, true); // extra
    hv.setUint16(32, 0, true); // commento
    hv.setUint16(34, 0, true); // disco
    head.set(zip.subarray(p + 36, p + 42), 36); // attributi interni + esterni (permessi Unix)
    entries.push({ head, name: enc.encode(newName), data: zip.subarray(dataStart, dataStart + csize), offset: 0 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (!sawExe) return null;
  const size = entries.reduce((s, e) => s + 30 + e.name.length + e.data.length + 46 + e.name.length, 0) + 22;
  if (size > 0xffffffff) return null;
  const out = new Uint8Array(size);
  const ov = new DataView(out.buffer);
  let o = 0;
  for (const e of entries) {
    e.offset = o;
    ov.setUint32(o, 0x04034b50, true);
    out.set(e.head.subarray(6, 28), o + 4); // needed, flags, method, time, date, crc, csize, usize
    ov.setUint16(o + 26, e.name.length, true);
    ov.setUint16(o + 28, 0, true);
    out.set(e.name, o + 30);
    out.set(e.data, o + 30 + e.name.length);
    o += 30 + e.name.length + e.data.length;
  }
  const cdStart = o;
  for (const e of entries) {
    out.set(e.head, o);
    ov.setUint16(o + 28, e.name.length, true);
    ov.setUint32(o + 42, e.offset, true);
    out.set(e.name, o + 46);
    o += 46 + e.name.length;
  }
  ov.setUint32(o, 0x06054b50, true);
  ov.setUint16(o + 8, entries.length, true);
  ov.setUint16(o + 10, entries.length, true);
  ov.setUint32(o + 12, o - cdStart, true);
  ov.setUint32(o + 16, cdStart, true);
  return out;
}

function macApp(code: string, exe: Uint8Array) {
  const app = `angar-${code}.app`;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>angar</string>
  <key>CFBundleDisplayName</key><string>angar</string>
  <key>CFBundleIdentifier</key><string>ai.angar.setup</string>
  <key>CFBundleExecutable</key><string>angar</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSUIElement</key><true/>
</dict></plist>
`;
  // Permessi Unix nel zip: l'eseguibile deve restare eseguibile dopo l'estrazione.
  const exec = { os: 3, attrs: 0o100755 * 65536 };
  const file = { os: 3, attrs: 0o100644 * 65536 };
  return zipSync(
    {
      [`${app}/Contents/Info.plist`]: [strToU8(plist), file],
      [`${app}/Contents/MacOS/angar`]: [exe, { ...exec, level: 6 }],
    },
    { level: 6 }
  );
}

/** Il file da scaricare per l'azienda con questo codice, o null se la build non c'è ancora. */
export async function desktopDownload(os: DesktopOs, code: string): Promise<{ name: string; type: string; data: Uint8Array } | null> {
  // Il codice finisce nei nomi di file/cartelle: solo caratteri sicuri.
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(code)) return null;
  // Windows e Linux: byte identici all'asset di CI (firma Authenticode intatta), cambia solo il nome.
  if (os === "windows") {
    const exe = await asset(ASSET.windows);
    return exe && { name: `angar-${code}.exe`, type: "application/vnd.microsoft.portable-executable", data: exe };
  }
  if (os === "linux") {
    const exe = await asset(ASSET.linux);
    return exe && { name: `angar-${code}`, type: "application/octet-stream", data: exe };
  }
  const bundle = await asset(MAC_APP_ZIP);
  const renamed = bundle && renameAppInZip(bundle, "angar.app", `angar-${code}.app`);
  if (renamed) return { name: `angar-${code}.zip`, type: "application/zip", data: renamed };
  // Release precedente (solo binario nudo): impacchettato qui, non firmato Developer ID.
  const exe = await asset(ASSET.mac);
  return exe && { name: `angar-${code}.zip`, type: "application/zip", data: macApp(code, exe) };
}
