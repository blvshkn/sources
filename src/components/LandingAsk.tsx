import { useEffect, useRef, useState, type ReactNode } from "react";
import { DetailSheet } from "./DetailSheet";
import { AiMark, AiMarkPlay } from "./WorkingLoader";
import { PX } from "./pixelIcons";
import { deny } from "../deny";
import { clearAskHandoff, setAskHandoff } from "../demoHandoff";

/** Questions the sample league answers well, grouped the way the app's Ask groups its starters. */
const GROUPS: { topic: string; items: string[] }[] = [
  { topic: "Trades", items: ["Who needs a WR most?", "Who should I trade with?"] },
  { topic: "Lineup", items: ["Who should I start at flex?"] },
  { topic: "Waivers", items: ["Best waiver add this week?"] },
  { topic: "League", items: ["Who's the unluckiest team?", "Roast the last-place team"] },
];

function ArrowUp() {
  const [box, html] = PX.send;
  return <svg className="px-ic" width={18} height={18} viewBox={box} fill="currentColor" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * The landing's Ask: the app's Ask screen in a sheet (phone) or modal (tablet and up), with the same intro, starter
 * chips and composer. Nothing is answered here. Sending a question always leads to the two ways in: connect a
 * Sleeper league or open the sample league, and the question rides along (demoHandoff.ts) so Ask opens working on it.
 */
export function LandingAsk({ onClose, onDemo, form }: {
  onClose: () => void;
  /** Opens the sample league (the landing's "Or explore a sample league") */
  onDemo: () => void;
  /** The landing's username form, with its own id */
  form: (id: string) => ReactNode;
}) {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const gate = useRef<HTMLHeadingElement>(null);
  const [wave, setWave] = useState(1);

  const send = (text: string, el?: Element | null) => {
    const t = text.trim();
    if (!t) { deny(el, "Type a question first, or tap one of the suggestions."); return; }
    setAskHandoff(t);
    setAsked(t);
    setWave((w) => w + 1);
  };
  useEffect(() => { if (asked) gate.current?.focus({ preventScroll: true }); }, [asked]);
  const back = () => { clearAskHandoff(); setQ(asked ?? ""); setAsked(null); requestAnimationFrame(() => input.current?.focus()); };
  const close = () => { onClose(); };
  const toDemo = () => { try { history.replaceState(null, "", "#ask"); } catch { /* ignore */ } onDemo(); };

  return (
    <DetailSheet className="lda-sheet" onClose={() => { if (!asked) clearAskHandoff(); close(); }} label="Ask Source"
      title={<h2 className="ds-h">Ask Source</h2>}
      foot={asked ? undefined : (
        <div className="lda-dock">
          <form className="ask-composer" onSubmit={(e) => { e.preventDefault(); send(q, e.currentTarget.querySelector(".ask-send")); }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); input.current?.focus(); } }}>
            <span className="ask-composer-mark" aria-hidden="true"><AiMark size={16} /></span>
            <label htmlFor="lda-q" className="sr-only">Ask a question about your league</label>
            <input id="lda-q" ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your league" autoComplete="off" enterKeyHint="send" />
            <button className="ask-send" type="submit" aria-label="Ask" aria-disabled={!q.trim() || undefined}><ArrowUp /></button>
          </form>
        </div>
      )}>
      {asked ? (
        <div className="lda-body lda-asked">
          <div className="ask-you-row"><p className="ask-you">{asked}</p></div>
          <section className="lda-gate" aria-labelledby="lda-gate-h">
            <span className="lda-gate-mark"><AiMarkPlay size={24} replay={wave} /></span>
            <h3 id="lda-gate-h" ref={gate} tabIndex={-1}>Pick a league and I'll answer this.</h3>
            <p>I answer from real rosters, standings and matchups. Connect your Sleeper league to ask about your team, or see how I answer on the sample league. Your question comes along either way.</p>
            <div className="lda-form">{form("lda-user")}</div>
            <div className="lda-or" aria-hidden="true"><span>or</span></div>
            <button type="button" className="btn btn-secondary lda-demo" onClick={toDemo}>Ask on the sample league</button>
          </section>
          <button type="button" className="linkish lda-back" onClick={back}>Ask something else</button>
        </div>
      ) : (
        <div className="lda-body">
          <div className="ask-intro">
            <span className="ask-mark lda-mark"><AiMarkPlay size={32} replay={wave} /></span>
            <p className="ask-sub">Trades, lineups, waivers, or anything else about your league. I run the numbers on real rosters and show my work.</p>
          </div>
          <div className="ask-groups">
            {GROUPS.map((g) => (
              <div key={g.topic} className="ask-group" role="group" aria-labelledby={`lda-g-${g.topic}`}>
                <p className="ask-k" id={`lda-g-${g.topic}`}>{g.topic}</p>
                <div className="ask-chips">
                  {g.items.map((s) => <button key={s} type="button" className="ask-chip" onClick={() => send(s)}>{s}</button>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </DetailSheet>
  );
}
