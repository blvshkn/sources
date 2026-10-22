import { useEffect, useRef, useState, type ReactNode } from "react";
import { DetailSheet } from "./DetailSheet";
import { AiMark, AiMarkPlay } from "./WorkingLoader";
import { PX } from "./pixelIcons";
import { deny } from "../deny";
import { clearAskHandoff, setAskHandoff } from "../demoHandoff";

/** Starters about Source itself, each one a question from the landing's FAQ so it gets that exact answer here. */
const GROUPS: { topic: string; items: string[] }[] = [
  { topic: "About Source", items: ["What is Source?", "Is Source free?", "Which platforms work?"] },
  { topic: "Your league and data", items: ["Do you need my Sleeper password?", "Can Source make moves in my league?", "What data does Source keep?"] },
  { topic: "How it works", items: ["Where do trade values come from?", "How does Ask work?", "Does a pitch send on its own?"] },
];

const STOP = new Set("a an the is are do does i my me you your it its of to for and or in on with can what how which who where when will be this that source sources league team player much".split(" "));
/** Everyday words for what the FAQ calls something else */
const SYN: Record<string, string> = { cost: "free", price: "free", pay: "free", paid: "free", money: "free", subscription: "free", charge: "free",
  safe: "password", secure: "password", login: "password", log: "password", espn: "platform", yahoo: "platform", mfl: "platform", cbs: "platform",
  private: "note", privacy: "data", store: "keep", save: "keep", trade: "move", ai: "ask", chatbot: "ask", message: "pitch", text: "pitch" };
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/s$/, "")).map((w) => SYN[w] ?? w);
/** The FAQ answer for a typed question, when one clearly fits: its words against each FAQ question (counted double)
 *  and answer. An exact FAQ question always matches. Anything else is a question for a league. */
function faqFor(q: string, faqs: [string, string][]): string | null {
  const exact = faqs.find(([fq]) => fq.toLowerCase() === q.trim().toLowerCase());
  if (exact) return exact[1];
  const qw = new Set(words(q));
  if (q.trim().toLowerCase().replace(/[?!. ]+$/, "") === "what is source") return faqs[0]?.[1] ?? null;
  let best: [number, string] | null = null;
  for (const [fq, fa] of faqs) {
    const hits = words(fq).filter((w) => qw.has(w)).length;
    // At least one word has to hit the FAQ question itself; the answer's words only break ties
    const score = hits ? hits * 2 + new Set(words(fa).filter((w) => qw.has(w))).size * 0.5 : 0;
    if (!best || score > best[0]) best = [score, fa];
  }
  return best && best[0] >= 2 ? best[1] : null;
}

function ArrowUp() {
  const [box, html] = PX.send;
  return <svg className="px-ic" width={18} height={18} viewBox={box} fill="currentColor" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * The landing's Ask: the app's Ask screen in a sheet (phone) or modal (tablet and up), with the same intro, starter
 * chips and composer. Questions about Source get the FAQ's answer here. Every answer still ends on the two ways in,
 * connect a Sleeper league or open the sample league; a question about a league rides along (demoHandoff.ts) so Ask
 * opens working on it.
 */
export function LandingAsk({ onClose, onDemo, form, faqs }: {
  onClose: () => void;
  /** Opens the sample league (the landing's "Or explore a sample league") */
  onDemo: () => void;
  /** The landing's username form, with its own id */
  form: (id: string) => ReactNode;
  /** The landing's FAQ, which answers questions about Source right here */
  faqs: [string, string][];
}) {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  // A question about Source gets its FAQ answer here; a question about a league goes to connect or the sample league
  const [answer, setAnswer] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const gate = useRef<HTMLHeadingElement>(null);
  const [wave, setWave] = useState(1);

  const send = (text: string, el?: Element | null) => {
    const t = text.trim();
    if (!t) { deny(el, "Type a question first, or tap one of the suggestions."); return; }
    const a = faqFor(t, faqs);
    setAnswer(a);
    if (a) clearAskHandoff(); else setAskHandoff(t);
    setAsked(t);
    setWave((w) => w + 1);
  };
  useEffect(() => { if (asked && !answer) gate.current?.focus({ preventScroll: true }); }, [asked, answer]);
  const back = () => { clearAskHandoff(); setQ(answer ? "" : asked ?? ""); setAsked(null); setAnswer(null); requestAnimationFrame(() => input.current?.focus()); };
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
            <label htmlFor="lda-q" className="sr-only">Ask a question about Source</label>
            <input id="lda-q" ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about Source" autoComplete="off" enterKeyHint="send" />
            <button className="ask-send" type="submit" aria-label="Ask" aria-disabled={!q.trim() || undefined}><ArrowUp /></button>
          </form>
        </div>
      )}>
      {asked ? (
        <div className="lda-body lda-asked">
          <div className="ask-you-row"><p className="ask-you">{asked}</p></div>
          {answer && (
            <div className="ask-card lda-answer">
              <p className="ask-head">{answer.split(/(?<=\.)\s/)[0]}</p>
              {answer.split(/(?<=\.)\s/).slice(1).join(" ") && <p className="lda-answer-more">{answer.split(/(?<=\.)\s/).slice(1).join(" ")}</p>}
            </div>
          )}
          <section className={`lda-gate${answer ? " lda-gate-soft" : ""}`} aria-labelledby="lda-gate-h">
            <span className="lda-gate-mark"><AiMarkPlay size={24} replay={wave} /></span>
            <h3 id="lda-gate-h" ref={gate} tabIndex={-1}>{answer ? "Now ask about your own league." : "Pick a league and I'll answer this."}</h3>
            <p>{answer
              ? "Connect your Sleeper league and I'll answer from your real rosters, or try me on the sample league first."
              : "I answer from real rosters, standings and matchups. Connect your Sleeper league to ask about your team, or see how I answer on the sample league. Your question comes along either way."}</p>
            <div className="lda-form">{form("lda-user")}</div>
            <div className="lda-or" aria-hidden="true"><span>or</span></div>
            <button type="button" className="btn btn-secondary lda-demo" onClick={toDemo}>{answer ? "Try the sample league" : "Ask on the sample league"}</button>
          </section>
          <button type="button" className="linkish lda-back" onClick={back}>Ask something else</button>
        </div>
      ) : (
        <div className="lda-body">
          <div className="ask-intro">
            <span className="ask-mark lda-mark"><AiMarkPlay size={32} replay={wave} /></span>
            <p className="ask-sub">Ask me how Source works, what it costs, or what it does with your league. Questions about your own team come next.</p>
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
