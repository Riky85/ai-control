"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Il contenuto scorre dentro un contenitore (non la finestra), che Next non
// riporta in cima cambiando pagina: lo facciamo noi a ogni cambio di percorso.
// Gli anchor (#sezione) restano funzionanti.
export default function ScrollReset({ targetId }: { targetId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    if (window.location.hash) return;
    document.getElementById(targetId)?.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, targetId]);
  return null;
}
