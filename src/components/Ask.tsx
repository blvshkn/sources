import { useEffect, useRef, useState } from "react";
import type { Steps } from "../steps";
import { useTrace } from "../think";
import { ThinkingTrace, Words, useReveal, wordCount } from "./ThinkingTrace";
import { deny } from "../deny";
import { LeagueSwitch } from "./LeagueSwitch";
import { Answer } from "../engine";
import { AiLabel, Icon } from "./ui";
import { Mark } from "./Logo";

type Msg = { id: number; from: "you" | "sources"; q: string };

/** One answer: the trace of the work, then the answer streaming in as it's written out. */
function AskTurn({ q, answer, onLink, onGrow }: { q: string; answer: (q: string) => Steps<Answer>; onLink: (l: Answer["links"][number]) => void; onGrow: () => void }) {
  const { trace, result: a, start } = useTrace<Answer>();
  useEffect(() => { start(() => answer(q)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Text, then each point, as one stream
  const counts = a ? [wordCount(a.text), ...a.points.map(wordCount)] : [];
  const total = counts.reduce((x, y) => x + y, 0);
  const k = useReveal(total, !!a);
  const done = !!a && k >= total;
  useEffect(onGrow, [trace.steps.length, trace.status, !!a, done]); // eslint-disable-line react-hooks/exhaustive-deps
  let base = counts[0] ?? 0;
  return (
    <div className="ask-turn">
      <ThinkingTrace trace={trace} />
      {a && (
        <div className="bubble sources" aria-busy={!done}>
          <p><b><Words text={a.text} k={k} /></b></p>
          {a.points.length > 0 && <ul>{a.points.map((p, i) => { const b = base; base += counts[i + 1]; return <li key={p} className={k > b ? undefined : "thk-wait"}><Words text={p} k={k} base={b} /></li>; })}</ul>}
          {a.links.length > 0 && (
            <div className={`row wrap ask-links${done ? "" : " wait"}`}>
              {a.links.map((l) => <button key={l.label} className="btn btn-sm" tabIndex={done ? undefined : -1} onClick={() => onLink(l)}>{l.label}<Icon name="chev" size={14} /></button>)}
            </div>
          )}
          <AiLabel />
        </div>
      )}
    </div>
  );
}


export function Ask({ answer, onLink, starters, initial }: { answer: (q: string) => Steps<Answer>; onLink: (l: Answer["links"][number]) => void; starters: string[]; initial?: string }) {
  // A question sent from the inbox composer arrives here and starts working at once
  const [msgs, setMsgs] = useState<Msg[]>(() => (initial?.trim() ? [{ id: 1, from: "you", q: initial.trim() }, { id: 2, from: "sources", q: initial.trim() }] : []));
  const [q, setQ] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const grow = () => end.current?.scrollIntoView({ block: "end", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  useEffect(grow, [msgs]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const id = Date.now();
    setMsgs((m) => [...m, { id, from: "you", q: t }, { id: id + 1, from: "sources", q: t }]);
    setQ("");
  };

  return (
    <>
      <header className="page-head">
        <div>
          <LeagueSwitch title="Ask Sources" meta={<>Ask your league</>} />
        </div>
      </header>

      <section className="card chat" aria-live="polite">
        {msgs.length === 0 && (
          <div className="chat-empty">
            <Mark size={52} />
            <p className="small muted">Try one of these.</p>
          </div>
        )}
        {msgs.map((m) => m.from === "you" ? (
          <div key={m.id} className="bubble you">{m.q}</div>
        ) : (
          <AskTurn key={m.id} q={m.q} answer={answer} onLink={onLink} onGrow={grow} />
        ))}
        <div ref={end} />
        <div className="chips-row">
          {starters.map((s) => <button key={s} className="chip-btn" onClick={() => send(s)}>{s}</button>)}
        </div>
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <label htmlFor="ask" className="sr-only">Ask a question about your league</label>
          <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Who needs a TE most?" autoComplete="off" />
          <button className="btn btn-primary btn-icon ask-send" type="submit" aria-label="Ask" aria-disabled={!q.trim() || undefined}
            onClick={(e) => { if (!q.trim()) { e.preventDefault(); deny(e.currentTarget, "Type a question first, or tap one of the suggestions."); } }}><Icon name="send" size={18} /></button>
        </form>
      </section>
      <p className="tiny muted">Sources only reads what you give it: your league's public rosters and the tags you log. It never scans private group chats.</p>
    </>
  );
}
