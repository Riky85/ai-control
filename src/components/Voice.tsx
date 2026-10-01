"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any;

/**
 * Dettatura con il riconoscimento vocale del browser (Web Speech API: Chrome,
 * Edge, Safari). Nessuna libreria e nessun audio passa da angar. Nota: Chrome
 * trascrive sui server di Google. Senza supporto il pulsante non appare.
 */
export function useVoice(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec>(null);
  const cb = useRef(onFinal);
  cb.current = onFinal;

  useEffect(() => {
    setSupported(typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window));
    return () => {
      try {
        rec.current?.abort();
      } catch {}
    };
  }, []);

  const stop = useCallback(() => {
    try {
      rec.current?.stop();
    } catch {}
  }, []);

  const start = useCallback(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      rec.current?.abort();
    } catch {}
    // Il microfono globale (in alto a destra) si mette in pausa mentre usiamo questo.
    window.dispatchEvent(new Event("angar:voice-pause"));
    const r: Rec = new Ctor();
    r.lang = navigator.language || "en-GB";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      let text = "";
      let final = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      setInterim(text);
      if (final && text.trim()) cb.current(text.trim());
    };
    r.onerror = (e: any) => {
      setError(e?.error === "not-allowed" ? "Microphone access was blocked — allow it in the browser's address bar." : e?.error === "no-speech" ? "I didn't hear anything — try again." : "Voice isn't available right now.");
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
      window.dispatchEvent(new Event("angar:voice-resume"));
    };
    rec.current = r;
    setError(null);
    setInterim("");
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  }, []);

  return { supported, listening, interim, error, start, stop };
}

/** Comandi vocali attivi; si spengono solo con NEXT_PUBLIC_ANGAR_VOICE=0. */
export const VOICE_ENABLED = process.env.NEXT_PUBLIC_ANGAR_VOICE !== "0";

export function MicButton({ voice, className = "" }: { voice: ReturnType<typeof useVoice>; className?: string }) {
  if (!VOICE_ENABLED || !voice.supported) return null;
  return (
    <button
      type="button"
      onClick={() => (voice.listening ? voice.stop() : voice.start())}
      aria-label={voice.listening ? "Stop listening" : "Speak"}
      title={voice.listening ? "Listening… click to stop" : "Speak a question or an instruction"}
      className={`relative shrink-0 h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${voice.listening ? "text-white bg-accent" : "text-[#A3A19C] hover:text-white hover:bg-white/[0.08]"} ${className}`}
    >
      {voice.listening && <span aria-hidden className="absolute inset-0 rounded-lg bg-accent/60 animate-ping" />}
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="relative">
        <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" />
        <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15" />
      </svg>
    </button>
  );
}
