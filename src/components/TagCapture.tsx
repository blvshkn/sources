import { useEffect, useRef, useState } from "react";
import { ManagerTag, TEAMS, playerById, teamById } from "../data";
import { parseTag } from "../engine";
import { Icon } from "./ui";

type SR = { start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; lang: string; interimResults: boolean };

/** "Tags from what people say": type or dictate a line, Sources turns it into an intent tag. */
export function TagCapture({ onSave, placeholder, compact }: { onSave: (t: Omit<ManagerTag, "id">) => void; placeholder?: string; compact?: boolean }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const rec = useRef<SR | null>(null);
  const parsed = text.trim().length > 6 ? parseTag(text) : null;
  const w = typeof window !== "undefined" ? (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }) : null;
  const Speech = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;

  useEffect(() => () => rec.current?.stop(), []);

  const dictate = () => {
    if (!Speech) return;
    if (listening) { rec.current?.stop(); return; }
    try {
      const r = new Speech();
      r.lang = "en-US";
      r.interimResults = true;
      r.onresult = (e) => setText(Array.from(e.results).map((x) => x[0].transcript).join(" "));
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      rec.current = r;
      r.start();
      setListening(true);
    } catch { setListening(false); }
  };

  const save = () => {
    if (!parsed?.tag) return;
    onSave(parsed.tag);
    setText("");
  };

  return (
    <div className={`capture${compact ? " compact" : ""}`}>
      <div className="capture-row">
        <label htmlFor="capture" className="sr-only">What did they say?</label>
        <input id="capture" className="capture-input" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={placeholder ?? `${TEAMS.find((t) => !t.you)?.manager ?? "Mike"} said he won't move his RB`} autoComplete="off" />
        {Speech && (
          <button className={`btn btn-icon${listening ? " is-live" : ""}`} onClick={dictate} aria-label={listening ? "Stop dictation" : "Dictate"} aria-pressed={listening}>
            <Icon name="mic" size={18} />
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!parsed?.tag}>Save tag</button>
      </div>
      {parsed && (
        parsed.tag ? (
          <p className="capture-preview">
            <span className={`tag-dot tag-${parsed.tag.kind}`} />
            <span><b>{teamById(parsed.tag.teamId).manager}:</b> {parsed.tag.text}
              {parsed.tag.playerId ? <span className="muted"> · {playerById(parsed.tag.playerId).nfl}</span> : null}</span>
            <span className="tiny muted">Private to you</span>
          </p>
        ) : <p className="capture-preview muted">{parsed.reason}</p>
      )}
    </div>
  );
}
