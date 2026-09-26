export type Theme = "light" | "dark" | "system";
// v2: il tema predefinito è diventato scuro (le vecchie scelte ripartono dal nuovo default).
export const THEME_COOKIE = "angar_theme_v2";

export function parseTheme(v: string | undefined): Theme {
  return v === "light" || v === "system" ? v : "dark";
}

// Eseguito prima del disegno della pagina: applica il tema salvato (e per
// "system" segue il sistema operativo, anche se cambia mentre la pagina è aperta).
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]+)/);var t=m?m[1]:"dark";var q=window.matchMedia("(prefers-color-scheme: dark)");var a=function(){var d=t==="dark"||(t==="system"&&q.matches);document.documentElement.classList.toggle("dark",d);};a();if(t==="system"&&q.addEventListener)q.addEventListener("change",a);}catch(e){}})();`;
