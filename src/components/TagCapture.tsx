import { useEffect, useRef, useState } from "react";
import { deny } from "../deny";
import { ManagerTag, TEAMS, playerById, teamById } from "../data";
import { parseTag } from "../engine";
import { Icon } from "./ui";
import { Select } from "./Select";

type SR = { start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; lang: string; interimResults: boolean };

/** "Tags from what people say": type or dictate a line, Sources turns it into an intent tag. */
export function TagCapture({ onSave, placeholder, compact, teamId, onTeam }: { onSave: (t: Omit<ManagerTag, "id">) => void; placeholder?: string; compact?: boolean; teamId?: string; onTeam?: (id: string) => void }) {
  const others = TEAMS.filter((t) => !t.you);
  // Who said it stays put, so you only type what they said. Tap the name to switch managers.
  const [who, setWho] = useState(teamId ?? others[0]?.id ?? "");
  useEffect(() => { if (teamId) setWho(teamId); }, [teamId]);
  const pickWho = (id: string) => { setWho(id); onTeam?.(id); };
  const whoTeam = others.find((t) => t.id === who);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const rec = useRef<SR | null>(null);
  const parsed = text.trim().length > 3 ? parseTag(text, who || undefined) : null;
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
      <div className={`composer has-who${listening ? " live" : ""}`}>
        {whoTeam && (
          <Select className="composer-who" size="chip" aria-label="Who said it" header="Who said it" value={who} onChange={pickWho}
            searchPlaceholder="Manager or team"
            options={others.map((t) => ({ value: t.id, label: t.manager, hint: t.name !== t.manager ? t.name : undefined, match: { also: t.name } }))} />
        )}
        <label htmlFor="capture" className="sr-only">{`What did ${whoTeam?.manager ?? "they"} say?`}</label>
        <input id="capture" className="composer-input" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder={placeholder ?? "won't move his RB"} autoComplete="off" enterKeyHint="send" />
        {Speech && (
          <button className="composer-btn" onClick={dictate} aria-label={listening ? "Stop dictation" : "Dictate"} aria-pressed={listening}>
            <Icon name="mic" size={18} />
          </button>
        )}
        <button className="composer-btn send" onClick={(e) => (parsed?.tag ? save() : deny(e.currentTarget, text.trim() ? "Sources can't read a tag from that yet. Name a player or position." : "Type what they said first, like \"won't move his RB\"."))} aria-disabled={!parsed?.tag || undefined} aria-label="Save tag">
          <Icon name="check" size={16} />
        </button>
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
