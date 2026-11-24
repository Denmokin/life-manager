import { useEffect, useRef, useState } from "react";
import type { Item } from "../shared/types.ts";
import { capture, useStore } from "./store.ts";
import { KindChip } from "./bits.tsx";

// Minimal typing for the Web Speech API (not in every TS DOM lib).
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;
const SpeechCtor: RecognitionCtor | undefined =
  (window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

export function Dump() {
  const { items } = useStore();
  const [text, setText] = useState("");
  const [justSaved, setJustSaved] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => boxRef.current?.focus(), []);

  const save = () => {
    if (!text.trim()) return;
    const created = capture(text);
    setJustSaved((prev) => [...created.map((c) => c.id), ...prev].slice(0, 8));
    setText("");
    boxRef.current?.focus();
  };

  const toggleVoice = () => {
    if (!SpeechCtor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SpeechCtor();
    rec.lang = navigator.language;
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setText((t) => (t ? t + " " : "") + said);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  // Follow items through sorting; a split dump shows all its pieces.
  const shown: Item[] = [];
  for (const id of justSaved) {
    const it = items[id];
    if (!it) continue;
    shown.push(it);
    for (const child of Object.values(items)) if (child.fromId === id) shown.push(child);
  }

  return (
    <section className="dump">
      <h1 className="quiet-title">What's on your mind?</h1>
      <div className="dump-box">
        <textarea
          ref={boxRef}
          value={text}
          rows={3}
          placeholder="Anything. Messy is fine. Enter to save."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          }}
        />
        <div className="dump-actions">
          {SpeechCtor && (
            <button className={`ghost ${listening ? "listening" : ""}`} onClick={toggleVoice}>
              {listening ? "Listening… tap to stop" : "Speak"}
            </button>
          )}
          <button className="primary" onClick={save} disabled={!text.trim()}>
            Save
          </button>
        </div>
      </div>
      <p className="hint">One thought per line, or several in one line. The robot sorts it out.</p>

      {shown.length > 0 && (
        <ul className="just-saved">
          {shown.map((it) => (
            <li key={it.id}>
              <span>{it.title}</span>
              {it.kind ? <KindChip kind={it.kind} /> : <span className="sorting">sorting…</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
