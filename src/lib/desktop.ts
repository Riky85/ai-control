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

// Versione dell'app desktop pubblicata (desktop/Cargo.toml).
export const DESKTOP_VERSION = "0.5.3";

export const DESKTOP_OS_LABEL: Record<DesktopOs, string> = { windows: "Windows", mac: "macOS", linux: "Linux" };

export function osFromUserAgent(ua: string | null | undefined): DesktopOs {
  const u = (ua ?? "").toLowerCase();
  if (u.includes("mac os") || u.includes("macintosh")) return "mac";
  if (u.includes("linux") && !u.includes("android")) return "linux";
  return "windows";
}

const cache = new Map<DesktopOs, { at: number; data: Uint8Array }>();

async function binary(os: DesktopOs): Promise<Uint8Array | null> {
  const hit = cache.get(os);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
  const url = `https://github.com/${REPO}/releases/download/${TAG}/${ASSET[os]}`;
  const headers: Record<string, string> = { "User-Agent": "angar-server" };
  if (process.env.GITHUB_RELEASE_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_RELEASE_TOKEN}`;
  const r = await fetch(url, { headers, redirect: "follow", cache: "no-store" });
  if (!r.ok) return hit?.data ?? null;
  const data = new Uint8Array(await r.arrayBuffer());
  cache.set(os, { at: Date.now(), data });
  return data;
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
  const exe = await binary(os);
  if (!exe) return null;
  if (os === "windows") return { name: `angar-${code}.exe`, type: "application/vnd.microsoft.portable-executable", data: exe };
  if (os === "mac") return { name: `angar-${code}.zip`, type: "application/zip", data: macApp(code, exe) };
  return { name: `angar-${code}`, type: "application/octet-stream", data: exe };
}
