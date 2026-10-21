import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Steps } from "../steps";
import { useTrace } from "../think";
import { ThinkingTrace, Words, useReveal, wordCount } from "./ThinkingTrace";
import { deny } from "../deny";
import { LeagueSwitch } from "./LeagueSwitch";
import { Answer, AskShow, Trade, acceptance, fmt } from "../engine";
import { Player, TEAMS, YOU, isSpecialFA, playerById, teamById } from "../data";
import { AiLabel, Icon } from "./ui";
import { WorkingLoader, AiMark } from "./WorkingLoader";
import { PlayerSheet } from "./lazy";
import { askJob, turnText, type AskTurnLog } from "../askAi";
import { useLive, type Live } from "../live";
import { SwapRows } from "./SwapRows";
import { useIconStroke } from "./iconStroke";

type Msg = { id: number; q: string; history: AskTurnLog[] };
type Topic = "Trades" | "Lineup" | "Waivers" | "League";
const TOPICS: Topic[] = ["Trades", "Lineup", "Waivers", "League"];

/** What a question is about, read from its words. Needs questions ("Who needs a WR most?", "What does Mike need?")
 *  are trade scouting: who to send your spare players to. */
function topicOf(q: string): Topic {
  const s = q.toLowerCase();
  if (/(unluck|lucky|luck\b|roast|last.place|first.place|worst team|best team|standings|champion|trash talk)/.test(s)) return "League";
  if (/(waiver|pick ?up|\badd\b|faab|bid|free agent)/.test(s)) return "Waivers";
  if (/(start|sit|flex|lineup|bench)/.test(s)) return "Lineup";
  return "Trades";
}

/** The arrow on the send button. Drawn on the icon grid: 24 box, the line set by drawn size (iconStroke.ts), flat ends, round joins. */
function ArrowUp({ size = 18 }: { size?: number }) {
  const stroke = useIconStroke(size);
  return (
    <svg ref={stroke.ref} style={stroke.style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke.strokeWidth} strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19.5V5M5.5 11.2 12 4.8l6.5 6.4" />
    </svg>
  );
}

/** The way out of Ask for each answer, by the tab it opens. Only this link (or a "take me there" question) leaves. */
const OUT: Record<string, string> = { trade: "View in Trade", roster: "Open in Lineup", waivers: "Open in Waivers", league: "Open in League", wire: "Open in Wire" };

/** "Take me to the trade builder", "open my lineup", "go to waivers": a question that asks to go somewhere goes there.
 *  It has to start with the ask to go and name a place, so "open the top deal" is still answered here. */
const GO_ASK = /^(?:please\s+|can you\s+|could you\s+)?(?:take me(?: back)? to|bring me to|go(?: back)? to|navigate to|jump to|switch to|open(?: up)?)\s+(?:the\s+|my\s+)?(.+?)[.!?\s]*$/i;
const GO_TO: [RegExp, string][] = [
  [/^(trade builder|trade|trades|builder)$/, "trade"],
  [/^(lineup|roster|team|start\/sit)$/, "roster"],
  [/^(waivers?|waiver wire|free agents)$/, "waivers"],
  [/^(league|league needs|needs|needs map)$/, "league"],
  [/^(wire|the wire)$/, "wire"],
  [/^settings$/, "settings"],
];
function goTarget(q: string): string | null {
  const m = GO_ASK.exec(q.trim());
  if (!m) return null;
  const place = m[1].toLowerCase().replace(/\s+(tab|page|screen)$/, "");
  return GO_TO.find(([re]) => re.test(place))?.[1] ?? null;
}

/** Where a player sits, for the player sheet's line under the name */
function whereOf(p: { id: string; pos: string }) {
  const t = TEAMS.find((x) => x.roster.includes(p.id) || x.ir?.includes(p.id));
  return t ? (t.you ? `Your ${p.pos}` : `${t.manager}'s ${p.pos}`) : `Free agent ${p.pos}`;
}

type OpenPlayer = (p: Player) => void;

/** A player in an answer. Tapping opens the player sheet over Ask. */
function PRow({ p, k, v, tone = "", onOpen, live }: {
  p: { id: string; name: string; pos: string; nfl: string };
  k?: string; v?: string; tone?: string; onOpen?: () => void; live: boolean;
}) {
  const body = (
    <>
      {k && <span className="ask-prow-k">{k}</span>}
      <span className="ask-prow-name">{p.name}</span>
      <span className="ask-prow-meta">{p.pos} · {p.nfl}</span>
      {v && <span className={`ask-prow-v${tone}`}>{v}</span>}
      {onOpen && <Icon name="chev" size={14} />}
    </>
  );
  return (
    <li>
      {onOpen ? <button type="button" className="ask-prow" tabIndex={live ? undefined : -1} onClick={onOpen}
        aria-label={`${p.name}, ${p.pos}, ${p.nfl}${k ? `, ${k}` : ""}. Player details`}>{body}</button>
        : <div className="ask-prow">{body}</div>}
    </li>
  );
}

/** What the answer is about, shown right in the card: the players each way in a deal, the player you asked about, the
 *  lineup swaps, or the waiver add. */
export function AskShowBlock({ show, deal, onPlayer, live }: { show?: AskShow; deal?: Trade; onPlayer: OpenPlayer; live: boolean }) {
  const row = (id: string, k?: string, v?: string, tone?: string) => {
    const p = playerById(id);
    return p ? <PRow key={`${k}-${id}`} p={p} k={k} v={v} tone={tone} live={live} onOpen={() => onPlayer(p)} /> : null;
  };
  if (deal) {
    const them = teamById(deal.partnerId);
    return (
      <div className="ask-show ask-show-deal">
        <div className="ask-show-g"><p className="ask-k">You give</p><ul className="ask-prows">{deal.give.map((id) => row(id))}</ul></div>
        <div className="ask-show-g"><p className="ask-k">You get{them ? ` from ${them.manager}` : ""}</p><ul className="ask-prows">{deal.get.map((id) => row(id))}</ul></div>
      </div>
    );
  }
  if (!show) return null;
  if (show.kind === "player") return <div className="ask-show"><ul className="ask-prows">{row(show.id)}</ul></div>;
  if (show.kind === "players") return <div className="ask-show"><ul className="ask-prows">{show.ids.map((id) => row(id))}</ul></div>;
  // Swaps, with the reason for each when Set optimal lineup's check gave one (the same rows the Lineup tab shows)
  if (show.kind === "swaps") return <SwapRows rows={show.rows} onPlayer={onPlayer} live={live} />;
  const fa = show.fa;
  return (
    <div className="ask-show">
      <ul className="ask-prows">
        <PRow p={fa} k="Add" v={fmt(show.gain)} tone={show.gain > 0 ? " good" : ""} live={live}
          onOpen={isSpecialFA(fa) ? undefined : () => onPlayer(fa as Player)} />
      </ul>
    </div>
  );
}

/** The key numbers for an answer that carries a deal: what each side gains a week and how likely they are to say yes. */
export function DealNumbers({ t }: { t: Trade }) {
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
function AskTurn({ q, history, live, answer, onLink, onPitch, onPlayer, onDone, follow, onFollow }: {
  q: string;
  /** The last few finished turns, so a follow-up can lean on them */
  history: AskTurnLog[];
  live: Live;
  answer: (q: string) => Steps<Answer>;
  onLink: (l: Answer["links"][number]) => void;
  onPitch?: (t: Trade) => void;
  onPlayer: OpenPlayer;
  onDone: (a?: Answer) => void;
  follow: string[];
  onFollow: (q: string) => void;
}) {
  const { trace, result: a, start } = useTrace<Answer>();
  // Sources AI answers; the engine runs first when it has a rule for the question, and is the answer if the AI is down
  useEffect(() => { start(askJob(q, answer, history, live)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Headline, then each point, then the one-liner, as one stream
  const counts = a ? [wordCount(a.text), ...a.points.map(wordCount), ...(a.quip ? [wordCount(a.quip)] : [])] : [];
  const total = counts.reduce((x, y) => x + y, 0);
  const k = useReveal(total, !!a);
  const done = !!a && k >= total;
  const failed = trace.status === "error";
  useEffect(() => { if (done || failed) onDone(done ? a : undefined); }, [done, failed]); // eslint-disable-line react-hooks/exhaustive-deps
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
          {a.quip && <p className={`ask-quip${k > base ? "" : " thk-wait"}`}><Words text={a.quip} k={k} base={base} /></p>}
          {/* What it's about, the numbers and the actions hold their space from the start and fade in when the text is
              written, so nothing moves. Everything here stays in Ask (players and the pitch open as sheets over it);
              only the "View in" link at the end goes to another tab. */}
          {(deal || a.show) && (
            <div className={`ask-after${done ? "" : " wait"}`} aria-hidden={!done || undefined}>
              <AskShowBlock show={a.show} deal={deal} onPlayer={onPlayer} live={done} />
            </div>
          )}
          {deal && <div className={`ask-after${done ? "" : " wait"}`} aria-hidden={!done || undefined}><DealNumbers t={deal} /></div>}
          {(a.links.length > 0 || (deal && onPitch && deal.themDelta > 0)) && (
            <div className={`ask-acts ask-after${done ? "" : " wait"}`}>
              {deal && onPitch && deal.themDelta > 0 && (
                <button type="button" className="ask-act" tabIndex={done ? undefined : -1} onClick={() => onPitch(deal)}>Write pitch</button>
              )}
              {a.links.map((l) => (
                <button key={l.label} type="button" className="ask-out" tabIndex={done ? undefined : -1} onClick={() => onLink(l)}
                  title={l.label}>
                  {l.tab === "trade" && !l.trade ? "Open in Trade" : OUT[l.tab] ?? l.label}<Icon name="chev" size={14} />
                </button>
              ))}
            </div>
          )}
          {a.by === "off" && <p className="ask-ai-off">Sources AI is offline right now, so this is the built-in answer.</p>}
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

export function Ask({ answer, onLink, onGo, onPitch, starters, initial }: {
  answer: (q: string) => Steps<Answer>;
  /** The explicit way out on an answer: opens that tab (a deal goes into the builder) */
  onLink: (l: Answer["links"][number]) => void;
  /** A "take me there" question */
  onGo?: (tab: string) => void;
  onPitch?: (t: Trade) => void;
  starters: string[];
  initial?: string;
}) {
  // A question sent from the inbox composer arrives here and starts working at once
  const [msgs, setMsgs] = useState<Msg[]>(() => (initial?.trim() ? [{ id: 1, q: initial.trim(), history: [] }] : []));
  // Finished turns, oldest first. The last three go along with each new question.
  const log = useRef<AskTurnLog[]>([]);
  const live = useLive();
  const [busy, setBusy] = useState<number[]>(() => (initial?.trim() ? [1] : []));
  const [q, setQ] = useState("");
  // A player tapped in an answer opens over Ask; the thread and its scroll stay as they are underneath
  const [sheet, setSheet] = useState<Player | null>(null);
  const busyRef = useRef(false);
  const page = useRef<HTMLElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const col = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Scrolling the thread. Sending is an explicit action, so it always brings your question and the answer area into
  // view (smoothly, or at once under reduced motion), then the thread follows the bottom while the trace and the
  // answer stream in. Following never scrolls past the top of the answer card, so on a short phone a long answer
  // keeps its headline in view. Scrolling yourself (wheel, touch, scroll keys, the bar) stops the follow; if the
  // answer card then appears out of view, the thread brings its top into view once. Scroll back to the bottom and
  // the follow picks up again. The empty state starts at the top instead, so a short phone opens on the intro.
  const stick = useRef(!!initial?.trim());
  const cap = useRef(true);
  const userAt = useRef(0);
  const smoothUntil = useRef(0);
  const seenCard = useRef<Element | null>(null);
  const settle = useRef(0);
  const follow = useRef<() => void>(() => {});
  useFitHeight(page);

  useLayoutEffect(() => {
    const t = thread.current, c = col.current;
    if (!t || !c) return;
    const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const now = () => performance.now();
    // Where the thread would sit to put an element's top at its scroll-padding line
    const topOf = (el: Element) =>
      t.scrollTop + el.getBoundingClientRect().top - t.getBoundingClientRect().top - (parseFloat(getComputedStyle(t).scrollPaddingTop) || 0);
    const go = (top: number, smooth: boolean) => {
      const to = Math.round(Math.max(0, Math.min(top, t.scrollHeight - t.clientHeight)));
      if (Math.abs(t.scrollTop - to) < 1) return;
      if (smooth) t.scrollTo({ top: to, behavior: "smooth" }); else t.scrollTop = to;
    };
    // Restarting a smooth scroll on every resize would crawl: send it once, then put it exactly in place after
    const land = () => {
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(() => { smoothUntil.current = 0; follow.current(); }, Math.max(0, smoothUntil.current - now()) + 40);
    };
    let smoothSent = 0, revealAt = 0, wait = 0, moving = false;
    let reveal: Element | null = null;
    follow.current = () => {
      const turn = c.lastElementChild;
      const card = turn?.classList.contains("ask-turn") ? turn.querySelector(".ask-card") : null;
      const fresh = !!card && card !== seenCard.current;
      if (card) seenCard.current = card;
      const smooth = !reduced() && now() < smoothUntil.current;
      if (smooth && smoothSent === smoothUntil.current) return; // already on its way; land() finishes it
      // Never fight a scroll you're making: wait until you've paused
      const idleIn = userAt.current + 400 - now();
      if (idleIn > 0) {
        if (fresh && card) { reveal = card; moving = false; }
        window.clearTimeout(wait);
        wait = window.setTimeout(() => follow.current(), idleIn + 20);
        return;
      }
      if (stick.current) {
        reveal = null;
        let top = t.scrollHeight - t.clientHeight;
        if (card && cap.current) top = Math.min(top, topOf(card));
        if (smooth) { smoothSent = smoothUntil.current; land(); }
        go(top, smooth);
        return;
      }
      // Not following: an answer card that starts appearing out of view is brought in once, smoothly, then put
      // exactly in place after it lands, unless you've scrolled again since
      if (fresh && card) { reveal = card; moving = false; }
      if (!card || reveal !== card || smooth) return;
      const r = card.getBoundingClientRect(), tr = t.getBoundingClientRect();
      const away = r.top < tr.top - 1 || r.top > tr.bottom - 64;
      if (!moving && away) {
        moving = true; revealAt = now();
        const smooth2 = !reduced();
        if (smooth2) { smoothUntil.current = smoothSent = now() + 600; land(); }
        go(topOf(card), smooth2);
        if (smooth2) return;
      } else if (moving && away && userAt.current < revealAt) go(topOf(card), false);
      reveal = null;
    };
    follow.current();
    const ro = new ResizeObserver(() => follow.current());
    ro.observe(c);
    ro.observe(t);
    return () => { ro.disconnect(); window.clearTimeout(settle.current); window.clearTimeout(wait); };
  }, []);
  // A new question: always go to it
  useLayoutEffect(() => { if (msgs.length) follow.current(); }, [msgs.length]);

  // Only your own scrolling stops the follow; the thread's own scrolls (and the content growing) never do
  const mine = () => { userAt.current = performance.now(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End", " "].includes(e.key) && !el.closest("button, input, a, textarea")) mine();
  };
  const onScroll = () => {
    const t = thread.current;
    if (!t) return;
    const gap = t.scrollHeight - t.scrollTop - t.clientHeight;
    if (performance.now() - userAt.current < 400) {
      cap.current = false;
      smoothUntil.current = 0;
      stick.current = gap < 40;
    } else if (gap < 40) stick.current = true;
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
    // "Take me to the trade builder": the one kind of question that leaves Ask
    const dest = onGo && goTarget(t);
    if (dest) { setQ(""); onGo(dest); return; }
    busyRef.current = true;
    const id = Date.now();
    stick.current = true;
    cap.current = true;
    userAt.current = 0;
    smoothUntil.current = performance.now() + 700;
    setMsgs((m) => [...m, { id, q: t, history: log.current.slice(-3) }]);
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
        <div className="ask-thread" ref={thread} onScroll={onScroll} aria-live="polite"
          onWheel={mine} onTouchMove={mine} onKeyDown={onKeyDown} onPointerDown={(e) => { if (e.target === e.currentTarget) mine(); }}>
          <div className="ask-col" ref={col}>
            {msgs.length === 0 ? (
              <div className="ask-empty">
                <div className="ask-intro">
                  <span className="ask-mark"><Icon name="spark" size={32} /></span>
                  <h2 className="ask-title">Ask your league</h2>
                  <p className="ask-sub">Trades, lineups, waivers, or anything else about your league. I run the numbers on your real rosters and show my work.</p>
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
              <AskTurn key={m.id} q={m.q} history={m.history} live={live} answer={answer} onLink={onLink} onPitch={onPitch} onPlayer={setSheet}
                onDone={(a) => { if (a && !log.current.some((x) => x.q === m.q && x.a === turnText(a))) log.current = [...log.current, { q: m.q, a: turnText(a) }].slice(-6); setBusy((b) => b.filter((x) => x !== m.id)); }}
                follow={i === msgs.length - 1 ? followFor(m.q) : []} onFollow={send} />
            ))}
          </div>
        </div>

        <div className="ask-dock">
          <form className="ask-composer" onSubmit={(e) => { e.preventDefault(); send(q); }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); input.current?.focus(); } }}>
            <span className="ask-composer-mark" aria-hidden="true"><AiMark size={16} /></span>
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
      {sheet && <PlayerSheet p={sheet} where={whereOf(sheet)} onClose={() => setSheet(null)} />}
    </>
  );
}
