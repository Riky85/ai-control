"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import CommandReply, { type CommandReplyData } from "./CommandReply";
import type { VoiceMode } from "@/lib/voice";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Parola di attivazione in modalità "sempre in ascolto" (il riconoscimento
// spesso sente "hangar" o "anger").
const WAKE = /(?:^|\s)(?:h?angar|anger|angaar|ungar)\b[\s,.:!]*(.*)$/i;

/**
 * Voce in tutta la piattaforma (pulsante fisso in alto a destra).
 * - Press to talk: clic sul microfono o Alt+V, poi si parla.
 * - Always listening: ascolta sempre; risponde solo dopo "angar …".
 * Il riconoscimento lo fa il browser; ad angar arriva solo il testo, che passa
 * da /api/command (dati del workspace, navigazione, azioni con conferma).
 */
// Comandi vocali attivi; si spengono solo con NEXT_PUBLIC_ANGAR_VOICE=0.
export default function VoiceControl({ initialMode }: { initialMode: VoiceMode }) {
  if (process.env.NEXT_PUBLIC_ANGAR_VOICE === "0") return null;
  return <VoiceControlActive initialMode={initialMode} />;
}

function VoiceControlActive({ initialMode }: { initialMode: VoiceMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<VoiceMode>(initialMode);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false); // il microfono è aperto
  const [armed, setArmed] = useState(false); // ha sentito "angar": aspetta la richiesta
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState<CommandReplyData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<any>(null);
  const paused = useRef(false);
  const modeRef = useRef(mode);
  const armedUntil = useRef(0);
  modeRef.current = mode;

  useEffect(() => {
    setSupported("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  }, []);
  useEffect(() => {
    const onMode = (e: Event) => setMode((e as CustomEvent<VoiceMode>).detail);
    window.addEventListener("angar:voice-mode", onMode);
    return () => window.removeEventListener("angar:voice-mode", onMode);
  }, []);

  const speak = useCallback((text: string) => {
    try {
      if (!("speechSynthesis" in window) || text.length > 260) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = navigator.language || "en-GB";
      u.rate = 1.05;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  }, []);

  const run = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      setBusy(true);
      setReply(null);
      setHeard(t);
      try {
        const r = await fetch("/api/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t }) });
        const data = await r.json();
        const answer = String(data.answer || "I didn't get that — try other words.");
        if (data.go && data.href) {
          router.push(data.href);
          setReply({ answer });
          speak(answer);
        } else {
          setReply({ answer, href: data.href, hrefLabel: data.hrefLabel, confirm: data.confirm, sources: data.sources });
          speak(answer);
        }
      } catch {
        setReply({ answer: "Something went wrong — try again." });
      } finally {
        setBusy(false);
      }
    },
    [router, speak]
  );

  const stopRec = useCallback(() => {
    try {
      rec.current?.abort();
    } catch {}
    rec.current = null;
    setListening(false);
  }, []);

  const startRec = useCallback(
    (continuous: boolean) => {
      const w = window as any;
      const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
      if (!Ctor || paused.current) return;
      try {
        rec.current?.abort();
      } catch {}
      const r = new Ctor();
      r.lang = navigator.language || "en-GB";
      r.interimResults = true;
      r.continuous = continuous;
      r.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text: string = e.results[i][0].transcript.trim();
          const final = e.results[i].isFinal;
          if (!continuous) {
            setHeard(text);
            if (final) run(text);
            continue;
          }
          // Sempre in ascolto: solo dopo la parola "angar".
          const m = text.match(WAKE);
          const awaiting = Date.now() < armedUntil.current;
          if (m) {
            setArmed(true);
            setHeard(m[1] || "");
            if (final) {
              if (m[1]?.trim()) {
                armedUntil.current = 0;
                setArmed(false);
                run(m[1]);
              } else armedUntil.current = Date.now() + 7000;
            }
          } else if (awaiting) {
            setHeard(text);
            if (final) {
              armedUntil.current = 0;
              setArmed(false);
              run(text);
            }
          }
        }
      };
      r.onerror = (e: any) => {
        if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
          setError("Microphone blocked — allow it from the icon in the address bar.");
          paused.current = true;
        }
      };
      r.onend = () => {
        setListening(false);
        if (!continuous) setArmed(false);
        // Sempre in ascolto: il browser chiude dopo un po' di silenzio, si riapre da solo.
        if (continuous && modeRef.current === "always" && !paused.current && !document.hidden) setTimeout(() => modeRef.current === "always" && startRec(true), 300);
      };
      rec.current = r;
      setError(null);
      try {
        r.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    },
    [run]
  );

  // Modalità "sempre in ascolto": si accende e si spegne con la scheda.
  useEffect(() => {
    if (!supported) return;
    if (mode !== "always") {
      stopRec();
      return;
    }
    paused.current = false;
    startRec(true);
    const onVis = () => (document.hidden ? stopRec() : !paused.current && startRec(true));
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stopRec();
    };
  }, [mode, supported, startRec, stopRec]);

  // Altri microfoni della pagina (ricerca, aiuto): questo si mette in pausa.
  useEffect(() => {
    const pause = () => {
      paused.current = true;
      stopRec();
    };
    const resume = () => {
      paused.current = false;
      if (modeRef.current === "always") setTimeout(() => startRec(true), 400);
    };
    window.addEventListener("angar:voice-pause", pause);
    window.addEventListener("angar:voice-resume", resume);
    return () => {
      window.removeEventListener("angar:voice-pause", pause);
      window.removeEventListener("angar:voice-resume", resume);
    };
  }, [startRec, stopRec]);

  // Press to talk da tastiera: Alt+V.
  useEffect(() => {
    if (mode === "off") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        push();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // La risposta resta visibile per un po', poi sparisce.
  useEffect(() => {
    if (!reply || reply.confirm) return;
    const t = setTimeout(() => setReply(null), 12000);
    return () => clearTimeout(t);
  }, [reply]);

  function push() {
    if (mode === "always") {
      // Già in ascolto: il clic equivale a dire "angar".
      armedUntil.current = Date.now() + 7000;
      setArmed(true);
      setHeard("");
      return;
    }
    if (listening) return stopRec();
    setReply(null);
    setHeard("");
    startRec(false);
  }

  // Un pulsante in più nella barra in alto (32px + 8px di spazio): le azioni della pagina si spostano a sinistra.
  const visible = mode !== "off" && supported;
  useEffect(() => {
    if (!visible) return;
    document.documentElement.style.setProperty("--hdr-tools", "9.5rem");
    return () => {
      document.documentElement.style.removeProperty("--hdr-tools");
    };
  }, [visible]);

  if (!visible) return null;
  const hot = (mode === "push" && listening) || armed;
  const showPanel = hot || busy || reply || error;

  return (
    <span className="relative group/voice">
      <button
        type="button"
        onClick={push}
        aria-label={mode === "always" ? "angar is listening — say “angar” and your request" : "Speak to angar (Alt+V)"}
        title={mode === "always" ? "Listening — say “angar”, then your request" : "Speak to angar (Alt+V)"}
        className={`btn btn-icon relative ${hot ? "btn-primary" : "btn-secondary"}`}
      >
        {hot && <span aria-hidden className="absolute inset-0 rounded-[inherit] bg-accent/50 animate-ping" />}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="relative">
          <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" />
          <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15" />
        </svg>
        {/* Sempre in ascolto: puntino verde fisso = il microfono è aperto. */}
        {mode === "always" && listening && !hot && <span aria-hidden className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-steady ring-2 ring-panel" />}
      </button>

      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-panel shadow-2xl p-4 z-50" role="status" aria-live="polite">
          <div className="flex items-center gap-2 mb-2">
            <span className={`h-2 w-2 rounded-full ${hot ? "bg-accent animate-pulse" : busy ? "bg-signal animate-pulse" : "bg-steady"}`} />
            <span className="text-xs text-ink-400 flex-1">{hot ? "Listening…" : busy ? "Thinking…" : error ? "Voice" : "angar"}</span>
            <button type="button" onClick={() => { setReply(null); setError(null); setArmed(false); armedUntil.current = 0; if (mode === "push") stopRec(); }} aria-label="Close" className="btn btn-ghost btn-sm btn-icon -my-1.5 -mr-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {error ? (
            <p className="text-sm text-alarm">{error}</p>
          ) : reply && !hot ? (
            <CommandReply reply={reply} tone="panel" onNavigate={() => setReply(null)} />
          ) : (
            <p className="text-sm text-ink-100 min-h-[1.25rem]">{heard ? `“${heard}”` : <span className="text-ink-400">Try “where can we save?” or “block DeepSeek”.</span>}</p>
          )}
        </div>
      )}
    </span>
  );
}
