import { useEffect, useRef, useState } from "react";
import { INITIAL_MY_TAGS, YOU, playerById, type ManagerTag, type Team } from "../data";
import { counterFor, evaluate, findTrades, scanTrades, type Trade } from "../engine";
import { drain } from "../steps";
import { whyEffect, whyLabel } from "../declineWhy";
import type { DeclineWhy } from "../sentOffers";
import { whenNear } from "../idle";
import { setInert } from "../inert";
import { ManagerAvatar } from "./Avatar";
import { AskShowBlock, DealNumbers } from "./AskShow";
import { AiMark, WorkingLoader } from "./WorkingLoader";
import { Words, useReveal, wordCount } from "./ThinkingTrace";
import { Icon } from "./ui";

/** Everything the card shows, worked out by the engine on the sample league */
interface Story {
  /** The offer he passed on, and the reason you logged for it */
  before: Trade;
  why: DeclineWhy;
  /** Source's answer: the reworked deal, the words around it, and how many deals it tested to get there */
  after: Trade;
  head: string;
  point: string;
  tested: number;
}

const nameOf = (id: string) => playerById(id)?.name ?? id;
const lastOf = (id: string) => nameOf(id).split(" ").slice(-1)[0];
const names = (ids: string[]) => ids.map(nameOf).join(", ");
const poss = (s: string) => (/s$/i.test(s) ? `${s}'` : `${s}'s`);
const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

/**
 * The story, from the engine. The note that says he won't move a player is where it starts: without that note, the
 * finder's best idea that asks for him is the offer he turned down, and the reason is that note in the decline
 * flow's words (declineWhy.ts). Then Ask's job: rebuild it with every note in play. Of the deals the finder keeps,
 * the one that keeps the most of your original offer wins, then the one most likely to get a yes.
 */
function tell(them: Team, notes: ManagerTag[], tags: ManagerTag[], avoid?: Trade): Story | null {
  const keep = notes.find((t) => t.kind === "refuses" && t.playerId && them.roster.includes(t.playerId));
  if (!keep?.playerId) return null;
  const pid = keep.playerId;
  const without = tags.filter((t) => t.id !== keep.id);
  let before = findTrades(YOU, them, without, INITIAL_MY_TAGS, {}, 8).find((t) => t.get.includes(pid));
  // The sample league's own answer, priced live, in case the finder's ranking ever moves
  if (!before && ["chuba-hubbard", "tyler-warren"].every((id) => YOU.roster.includes(id)))
    before = evaluate(YOU, them, ["chuba-hubbard", "tyler-warren"], [pid], without, INITIAL_MY_TAGS, {});
  if (!before) return null;
  const why: DeclineWhy = { kind: "keeps", playerId: pid, at: 0 };

  const scored = { n: 0 };
  const ideas = drain(scanTrades(YOU, them, tags, INITIAL_MY_TAGS, {}, 6, scored)).filter((t) => t.key !== avoid?.key);
  const kept = (t: Trade) => t.give.filter((id) => before!.give.includes(id)).length + t.get.filter((id) => before!.get.includes(id)).length;
  // A swap at the same position as the player he kept reads as the closest fix
  const samePos = (t: Trade) => t.get.filter((id) => playerById(id)?.pos === playerById(pid)?.pos).length;
  const score = (t: Trade) => kept(t) * 2 + samePos(t) + (t.accept?.p ?? 0);
  let after: Trade | undefined = [...ideas].sort((a, b) => score(b) - score(a))[0];
  if (!after) after = counterFor(before, tags, INITIAL_MY_TAGS, {})?.trade;
  if (!after) return null;

  const getOut = before.get.filter((id) => !after!.get.includes(id)), getIn = after.get.filter((id) => !before!.get.includes(id));
  const giveOut = before.give.filter((id) => !after!.give.includes(id)), giveIn = after.give.filter((id) => !before!.give.includes(id));
  let head = getOut.length && getIn.length ? `Leave ${lastOf(getOut[0])} out and ask for ${names(getIn)} instead.`
    : getOut.length ? `Leave ${lastOf(getOut[0])} out of it.`
    : `Offer ${names(after.give)} for ${names(after.get)}.`;
  if (giveOut.length === 1 && giveIn.length === 1) head += ` Send ${lastOf(giveIn[0])} in ${poss(lastOf(giveOut[0]))} spot.`;
  else if (giveIn.length && !giveOut.length) head += ` Add ${names(giveIn)}.`;
  else if (giveOut.length && !giveIn.length) head += ` Keep ${names(giveOut)}.`;

  const want = notes.find((t) => t.kind === "wants" && t.pos);
  const both = after.youDelta >= 0.5 && after.themDelta >= 0.5;
  const parts = [
    after.fillsWant && want ? `${them.manager} still gets the ${want.pos} he's after` : "",
    both ? "both starting lineups go up" : "",
  ].filter(Boolean);
  const point = parts.length ? `${parts.join(", and ")}.`.replace(/^./, (c) => c.toUpperCase()) : `${lastOf(pid)} stays with ${them.manager}.`;
  return { before, why, after, head, point, tested: scored.n };
}

type Phase = "wait" | "ask" | "think" | "test" | "say";

/**
 * "When they say no": your notes on a league mate, the offer he turned down and why, and Source's answer to "How do
 * I make the Mike deal work?". All of it comes from the engine on the sample league. The Ask plays once when it
 * scrolls into view (the question, two working steps, the answer streaming in word by word as in the app), and again
 * on "Ask again". Nothing loops, and the card is its final size from the start. Reduced motion shows the answer.
 */
export function LandingNotesCard({ them, notes, tags, avoid, onOpen, onAsk }: {
  /** The league mate: `demo.mike` */
  them: Team;
  /** Your notes on him, shown as chips: `demo.notes` */
  notes: ManagerTag[];
  /** Every active note in the league, which the engine reads: `demo.tags` */
  tags: ManagerTag[];
  /** A deal shown elsewhere on the page that the answer shouldn't repeat: `demo.trade` */
  avoid?: Trade;
  /** Shows "Try the demo" under the answer (Zach, Oct 23) and opens the reworked deal */
  onOpen?: (t: Trade) => void;
  /** Called when "Ask again" is tapped, after the card starts its replay */
  onAsk?: () => void;
}) {
  const cell = useRef<HTMLElement>(null);
  const askRef = useRef<HTMLDivElement>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [phase, setPhase] = useState<Phase>("wait");
  const [seen, setSeen] = useState(false);
  const timers = useRef<number[]>([]);

  // Worked out once the reader is near, off the hero's path (idle.whenNear), like the landing's Ask demo
  useEffect(() => whenNear(cell.current, () => setStory(tell(them, notes, tags, avoid))), [them, notes, tags, avoid]);
  useEffect(() => {
    const el = askRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: "0px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const play = () => {
    timers.current.forEach(clearTimeout);
    if (reduced()) { setPhase("say"); return; }
    setPhase("ask");
    const at = (ms: number, p: Phase) => timers.current.push(window.setTimeout(() => setPhase(p), ms));
    at(450, "think");
    at(1350, "test");
    at(2350, "say");
  };
  useEffect(() => { if (seen && story && phase === "wait") play(); }, [seen, story]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const counts = story ? [wordCount(story.head), wordCount(story.point)] : [0, 0];
  const k = useReveal(counts[0] + counts[1], phase === "say");
  const done = phase === "say" && k >= counts[0] + counts[1];
  const working = phase === "think" || phase === "test";
  const who = them.manager;
  const kept = story ? lastOf(story.why.playerId!) : "";
  const status = phase === "think" ? `Reading your notes on ${who}`
    : phase === "test" ? `Testing ${story?.tested.toLocaleString("en-US")} deals without ${kept}`
    : phase === "say" ? `Tested ${story?.tested.toLocaleString("en-US")} deals without ${kept}` : "";
  const fx = story ? whyEffect(story.why, them.id, "him") : null;

  return (
    <article className="card ld-cell ld2-reveal wide lnc" ref={cell}>
      <h3>When they say no</h3>
      <p>Log why a league mate passed and Source keeps it with your notes. Ask how to make it work, and it rebuilds the deal around what he told you.</p>

      <div className="lnc-notes">
        <span className="lnc-k">Your notes on {who}</span>
        <ul>{notes.map((t) => <li key={t.id} className={t.kind === "wants" ? "want" : "no"}>{t.text}</li>)}</ul>
      </div>

      {story && (
        <div className="lnc-offer" aria-label={`Your offer to ${who}, declined`}>
          <div className="lnc-offer-top">
            <ManagerAvatar src={them.avatar} name={who} size={32} className="lnc-av" />
            <b>Offer to {who}</b>
            <span className="lnc-pill">Declined</span>
          </div>
          <dl className="lnc-offer-ps">
            <div><dt>Out</dt><dd>{names(story.before.give)}</dd></div>
            <div><dt>In</dt><dd>{names(story.before.get)}</dd></div>
          </dl>
          <p className="lnc-why"><span className="lnc-why-k">Why:</span><span>{whyLabel(story.why)}</span>{fx && <small>{fx}</small>}</p>
        </div>
      )}

      {story && (
        <div className={`lnc-ask is-${phase}`} ref={askRef}>
          <div className="ask-you-row"><p className="ask-you">How do I make the {who} deal work?</p></div>
          <div className="ask-card lnc-answer" aria-busy={!done}>
            <p className="lnc-status" aria-hidden={!status || undefined}>
              <span className="lnc-status-ic">{working ? <WorkingLoader size={14} /> : <AiMark size={14} />}</span>
              <span className="lnc-status-t">{status || "Source"}</span>
            </p>
            <p className="ask-head"><Words text={story.head} k={k} /></p>
            <p className="lnc-point"><Words text={story.point} k={k} base={counts[0]} /></p>
            <div className={`ask-after lnc-after${done ? "" : " wait"}`} aria-hidden={!done || undefined}>
              <div ref={setInert}><AskShowBlock deal={story.after} onPlayer={() => {}} live={false} /></div>
              <DealNumbers t={story.after} />
            </div>
          </div>
          <div className="lnc-foot">
            <button type="button" className="lnc-again" disabled={phase !== "say" || !done} onClick={() => { play(); onAsk?.(); }}>
              <AiMark size={14} />Ask again
            </button>
            {onOpen && (
              <button type="button" className="lnc-open" disabled={!done} onClick={() => onOpen(story.after)}>
                Try the demo<Icon name="chev" size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
