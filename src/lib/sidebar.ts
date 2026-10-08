// Condiviso tra server (layout) e client (Sidebar): una costante esportata da
// un modulo "use client" arriva al server come riferimento, non come stringa.
// Nome nuovo: azzera le preferenze vecchie, così la sidebar riparte chiusa per tutti.
export const SIDEBAR_COOKIE = "angar_sb";
