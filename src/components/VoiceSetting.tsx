"use client";

import { useEffect, useState } from "react";
import { VOICE_COOKIE, type VoiceMode } from "@/lib/voice";

const OPTIONS: { id: VoiceMode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "No microphone." },
  { id: "push", label: "Press to talk", hint: "Click the mic at the top right, or press Alt+V, then speak." },
  { id: "always", label: "Always listening", hint: "Say “angar”, then your request — e.g. “angar, where can we save?”." },
];

// Impostazione della voce (per persona, su questo browser). Cambia subito,
// senza ricaricare: il pulsante in alto a destra ascolta l'evento.
export default function VoiceSetting({ initial }: { initial: VoiceMode }) {
  const [mode, setMode] = useState<VoiceMode>(initial);
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported("SpeechRecognition" in window || "webkitSpeechRecognition" in window), []);

  function choose(m: VoiceMode) {
    setMode(m);
    document.cookie = `${VOICE_COOKIE}=${m}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new CustomEvent("angar:voice-mode", { detail: m }));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex self-start gap-1 bg-ink rounded-lg p-1">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={!supported && o.id !== "off"}
            onClick={() => choose(o.id)}
            className={`text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-40 ${mode === o.id ? "bg-panel text-ink-100 font-medium shadow-card" : "text-ink-400 hover:text-ink-100"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-400">
        {supported ? OPTIONS.find((o) => o.id === mode)!.hint : "This browser can't recognise speech — use Chrome, Edge or Safari."}
        {supported && mode !== "off" && " Speech is turned into text by your browser (Chrome uses Google's service); angar only receives the text."}
      </p>
    </div>
  );
}
