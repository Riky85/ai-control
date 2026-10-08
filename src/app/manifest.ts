import type { MetadataRoute } from "next";

// App installabile dal browser (PWA): su Android "Installa app", su iPhone
// "Aggiungi a Home". Si apre a tutto schermo, scura, con l'icona angar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "angar — AI spend & usage",
    short_name: "angar",
    description: "Every AI your company uses, what it costs, who uses it and where to save.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["business", "productivity", "finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Opportunities", url: "/opportunities", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Usage", url: "/usage", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Review", url: "/review", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
