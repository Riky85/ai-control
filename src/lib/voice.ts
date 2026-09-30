// Voce in tutta la piattaforma: preferenza della persona (cookie, letto anche dal server).
export type VoiceMode = "off" | "push" | "always";
export const VOICE_COOKIE = "angar_voice";
export const parseVoiceMode = (v: string | undefined | null): VoiceMode => (v === "push" || v === "always" ? v : "off");
