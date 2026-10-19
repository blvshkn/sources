import { useEffect, useRef, useState } from "react";
import { LeagueSwitch } from "./LeagueSwitch";
import { Answer } from "../engine";
import { AiLabel, Icon } from "./ui";
import { Mark } from "./Logo";

type Msg = { id: number; from: "you" | "sources"; q?: string; a?: Answer };


export function Ask({ answer, onLink, starters, initial }: { answer: (q: string) => Answer; onLink: (l: Answer["links"][number]) => void; starters: string[]; initial?: string }) {
  // A question sent from the inbox composer arrives already answered
  const [msgs, setMsgs] = useState<Msg[]>(() => (initial?.trim() ? [{ id: 1, from: "you", q: initial.trim() }, { id: 2, from: "sources", a: answer(initial.trim()) }] : []));
  const [q, setQ] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const id = Date.now();
    setMsgs((m) => [...m, { id, from: "you", q: t }, { id: id + 1, from: "sources", a: answer(t) }]);
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
          <div key={m.id} className="bubble sources">
            <p><b>{m.a!.text}</b></p>
            {m.a!.points.length > 0 && <ul>{m.a!.points.map((p) => <li key={p}>{p}</li>)}</ul>}
            <div className="row wrap">
              {m.a!.links.map((l) => <button key={l.label} className="btn btn-sm" onClick={() => onLink(l)}>{l.label}<Icon name="chev" size={14} /></button>)}
            </div>
            <AiLabel />
          </div>
        ))}
        <div ref={end} />
        <div className="chips-row">
          {starters.map((s) => <button key={s} className="chip-btn" onClick={() => send(s)}>{s}</button>)}
        </div>
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <label htmlFor="ask" className="sr-only">Ask a question about your league</label>
          <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Who needs a TE most?" autoComplete="off" />
          <button className="btn btn-primary btn-icon" type="submit" aria-label="Ask" disabled={!q.trim()}><Icon name="send" size={18} /></button>
        </form>
      </section>
      <p className="tiny muted">Sources only reads what you give it: your league's public rosters and the tags you log. It never scans private group chats.</p>
    </>
  );
}
