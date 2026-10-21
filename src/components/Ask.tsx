import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Steps } from "../steps";
import { useTrace } from "../think";
import { ThinkingTrace, Words, useReveal, wordCount } from "./ThinkingTrace";
import { deny } from "../deny";
import { LeagueSwitch } from "./LeagueSwitch";
import { Answer, Trade, acceptance, fmt } from "../engine";
import { YOU, teamById } from "../data";
import { AiLabel, Icon } from "./ui";
import { WorkingLoader } from "./WorkingLoader";

type Msg = { id: number; q: string };
type Topic = "Trades" | "Lineup" | "Waivers";
const TOPICS: Topic[] = ["Trades", "Lineup", "Waivers"];

/** What a question is about, read from its words. Needs questions ("Who needs a WR most?", "What does Mike need?")
 *  are trade scouting: who to send your spare players to. */
function topicOf(q: string): Topic {
  const s = q.toLowerCase();
  if (/(waiver|pick ?up|\badd\b|faab|bid|free agent)/.test(s)) return "Waivers";
  if (/(start|sit|flex|lineup|bench)/.test(s)) return "Lineup";
  return "Trades";
}

/** The arrow on the send button. Drawn on the icon grid: 24 box, 1.6 line, flat ends, round joins. */
function ArrowUp({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19.5V5M5.5 11.2 12 4.8l6.5 6.4" />
    </svg>
  );
}

/** The key numbers for an answer that carries a deal: what each side gains a week and how likely they are to say yes. */
function DealNumbers({ t }: { t: Trade }) {
  const them = teamById(t.partnerId);
  const acc = useMemo(() => t.accept ?? (them ? acceptance(t, YOU, them) : null), [t, them]);
  const tone = (n: number) => (n > 0 ? " good" : n < 0 ? " bad" : "");
  return (
    <dl className="ask-nums">
      <div><dt>You<span className="ask-wide"> / wk</span></dt><dd className={`ask-num${tone(t.youDelta)}`}>{fmt(t.youDelta)}</dd></div>
      {them && <div><dt><span className="ask-mgr">{them.manager}</span><span className="ask-wide"> / wk</span></dt><dd className={`ask-num${tone(t.themDelta)}`}>{fmt(t.themDelta)}</dd></div>}
      {acc && <div><dt><span className="ask-wide">Will accept</span><span className="ask-narrow">Accept</span></dt><dd className="ask-num">{Math.round(acc.p * 100)}%</dd></div>}
    </dl>
  );
}

/** One answer: the trace of the work, then the answer card streaming in as it's written out. */
function AskTurn({ q, answer, onLink, onPitch, onDone, follow, onFollow }: {
  q: string;
  answer: (q: string) => Steps<Answer>;
  onLink: (l: Answer["links"][number]) => void;
  onPitch?: (t: Trade) => void;
  onDone: () => void;
  follow: string[];
  onFollow: (q: string) => void;
}) {
  const { trace, result: a, start } = useTrace<Answer>();
  useEffect(() => { start(() => answer(q)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Headline, then each point, as one stream
  const counts = a ? [wordCount(a.text), ...a.points.map(wordCount)] : [];
  const total = counts.reduce((x, y) => x + y, 0);
  const k = useReveal(total, !!a);
  const done = !!a && k >= total;
  const failed = trace.status === "error";
  useEffect(() => { if (done || failed) onDone(); }, [done, failed]); // eslint-disable-line react-hooks/exhaustive-deps
  const deal = a?.links.find((l) => l.trade)?.trade;
  let base = counts[0] ?? 0;
  return (
    <div className="ask-turn">
      <div className="ask-you-row"><p className="ask-you">{q}</p></div>
      <ThinkingTrace trace={trace} />
      {a && (
        <article className="ask-card" aria-busy={!done}>
          <p className="ask-head"><Words text={a.text} k={k} /></p>
          {a.points.length > 0 && (
            <ul className={`ask-pts${a.points.length > 1 ? " many" : ""}`}>
              {a.points.map((p, i) => { const b = base; base += counts[i + 1]; return <li key={p} className={k > b ? undefined : "thk-wait"}><Words text={p} k={k} base={b} /></li>; })}
            </ul>
          )}
          {/* Numbers and actions hold their space from the start and fade in when the text is written, so nothing moves */}
          {deal && <div className={`ask-after${done ? "" : " wait"}`} aria-hidden={!done || undefined}><DealNumbers t={deal} /></div>}
          {(a.links.length > 0 || (deal && onPitch)) && (
            <div className={`ask-acts ask-after${done ? "" : " wait"}`}>
              {a.links.map((l) => (
                <button key={l.label} type="button" className="ask-act" tabIndex={done ? undefined : -1} onClick={() => onLink(l)}>
                  {l.label}<Icon name="chev" size={14} />
                </button>
              ))}
              {deal && onPitch && deal.themDelta > 0 && (
                <button type="button" className="ask-act" tabIndex={done ? undefined : -1} onClick={() => onPitch(deal)}>Write pitch</button>
              )}
            </div>
          )}
          <AiLabel />
        </article>
      )}
      {done && follow.length > 0 && (
        <div className="ask-chips ask-follow" role="group" aria-label="Follow-up questions">
          {follow.map((s) => <button key={s} type="button" className="ask-chip" onClick={() => onFollow(s)}>{s}</button>)}
        </div>
      )}
    </div>
  );
}

/** Keeps the Ask page exactly as tall as the room left on screen, above the tab bar and the phone keyboard. */
function useFitHeight(ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const vh = vv ? vv.height : window.innerHeight;
        // A keyboard takes more than a toolbar's worth of the window
        const kb = window.innerHeight - vh > 120;
        if (kb) root.setAttribute("data-ask-kb", ""); else root.removeAttribute("data-ask-kb");
        const bar = document.querySelector<HTMLElement>(".tabbar");
        const barH = !kb && bar && getComputedStyle(bar).display !== "none" ? bar.getBoundingClientRect().height : 0;
        const top = el.getBoundingClientRect().top + window.scrollY;
        el.style.height = `${Math.max(300, Math.floor(vh - top - barH))}px`;
        // The page itself never scrolls here; on iOS the keyboard can still nudge it, so put it back
        if (window.scrollY && !kb) window.scrollTo({ top: 0 });
      });
    };
    fit();
    window.addEventListener("resize", fit);
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      ro.disconnect();
      root.removeAttribute("data-ask-kb");
    };
  }, [ref]);
}

export function Ask({ answer, onLink, onPitch, starters, initial }: {
  answer: (q: string) => Steps<Answer>;
  onLink: (l: Answer["links"][number]) => void;
  onPitch?: (t: Trade) => void;
  starters: string[];
  initial?: string;
}) {
  // A question sent from the inbox composer arrives here and starts working at once
  const [msgs, setMsgs] = useState<Msg[]>(() => (initial?.trim() ? [{ id: 1, q: initial.trim() }] : []));
  const [busy, setBusy] = useState<number[]>(() => (initial?.trim() ? [1] : []));
  const [q, setQ] = useState("");
  const busyRef = useRef(false);
  const page = useRef<HTMLElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const col = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Follow the newest message unless you've scrolled up to read something earlier. The empty state starts at the
  // top instead, so a short phone opens on the intro and the last suggestions fade under the composer.
  const stick = useRef(!!initial?.trim());
  useFitHeight(page);

  useLayoutEffect(() => {
    const t = thread.current, c = col.current;
    if (!t || !c) return;
    const toEnd = () => { if (stick.current) t.scrollTop = t.scrollHeight; };
    toEnd();
    const ro = new ResizeObserver(toEnd);
    ro.observe(c);
    ro.observe(t);
    return () => ro.disconnect();
  }, []);
  const onScroll = () => {
    const t = thread.current;
    if (t) stick.current = t.scrollHeight - t.scrollTop - t.clientHeight < 40;
  };

  const groups = useMemo(() => {
    const seen = new Set<string>();
    const uniq = starters.filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
    return TOPICS.map((topic) => ({ topic, items: uniq.filter((s) => topicOf(s) === topic) })).filter((g) => g.items.length);
  }, [starters]);

  const send = (text: string) => {
    const t = text.trim();
    // One answer at a time: Enter while one is being built keeps what you typed
    if (!t || busyRef.current) return;
    busyRef.current = true;
    const id = Date.now();
    stick.current = true;
    setMsgs((m) => [...m, { id, q: t }]);
    setBusy((b) => [...b, id]);
    setQ("");
  };
  const asked = new Set(msgs.map((m) => m.q.toLowerCase()));
  const followFor = (q0: string) => {
    const left = [...new Set(starters)].filter((s) => !asked.has(s.toLowerCase()));
    const topic = topicOf(q0);
    return [...left.filter((s) => topicOf(s) === topic), ...left.filter((s) => topicOf(s) !== topic)].slice(0, 3);
  };
  const working = busy.length > 0;
  busyRef.current = working;
  const empty = !q.trim();

  return (
    <>
      <header className="page-head">
        <div>
          <LeagueSwitch title="Ask Sources" meta={<>Ask your league</>} />
        </div>
      </header>

      <section className="ask-page" ref={page} aria-label="Ask your league">
        <div className="ask-thread" ref={thread} onScroll={onScroll} aria-live="polite">
          <div className="ask-col" ref={col}>
            {msgs.length === 0 ? (
              <div className="ask-empty">
                <div className="ask-intro">
                  <span className="ask-mark"><Icon name="spark" size={32} /></span>
                  <h2 className="ask-title">Ask your league</h2>
                  <p className="ask-sub">Trades, lineups, waivers. I run the numbers on your real rosters and show my work.</p>
                </div>
                <div className="ask-groups">
                  {groups.map((g) => (
                    <div key={g.topic} className="ask-group" role="group" aria-labelledby={`ask-g-${g.topic}`}>
                      <p className="ask-k" id={`ask-g-${g.topic}`}>{g.topic}</p>
                      <div className="ask-chips">
                        {g.items.map((s) => <button key={s} type="button" className="ask-chip" onClick={() => send(s)}>{s}</button>)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : msgs.map((m, i) => (
              <AskTurn key={m.id} q={m.q} answer={answer} onLink={onLink} onPitch={onPitch}
                onDone={() => setBusy((b) => b.filter((x) => x !== m.id))}
                follow={i === msgs.length - 1 ? followFor(m.q) : []} onFollow={send} />
            ))}
          </div>
        </div>

        <div className="ask-dock">
          <form className="ask-composer" onSubmit={(e) => { e.preventDefault(); send(q); }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); input.current?.focus(); } }}>
            <span className="ask-composer-mark" aria-hidden="true"><Icon name="spark" size={16} /></span>
            <label htmlFor="ask" className="sr-only">Ask a question about your league</label>
            <input id="ask" ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your league anything"
              autoComplete="off" enterKeyHint="send" />
            <button className="ask-send" type="submit" aria-label={working ? "Ask (working on an answer)" : "Ask"} aria-disabled={empty || working || undefined} aria-busy={working || undefined}
              onClick={(e) => {
                if (working) { e.preventDefault(); deny(e.currentTarget, "Still working on the last answer. One moment."); }
                else if (empty) { e.preventDefault(); deny(e.currentTarget, "Type a question first, or tap one of the suggestions."); }
              }}>
              {working ? <WorkingLoader size={18} /> : <ArrowUp />}
            </button>
          </form>
          <p className="ask-note">Sources only reads your league's public rosters and the tags you log.<span className="ask-wide"> It never scans private group chats.</span></p>
        </div>
      </section>
    </>
  );
}
