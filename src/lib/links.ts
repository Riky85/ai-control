/** Link alla pagina di dettaglio di un'AI (la pagina vive sotto /estate; /assets/[id] rimanda lì). */
export const aiHref = (id: string, tab?: string) => `/estate/${encodeURIComponent(id)}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`;
