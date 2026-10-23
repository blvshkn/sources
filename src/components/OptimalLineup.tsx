// Set optimal lineup, inline under the Starters header: the button, the real thinking trace while it works, then the
// moves to make in Sleeper with what each adds and why, and the way into Sleeper. Nothing here changes the Sleeper
// lineup or claims it's set. The rows it recommends are marked on the lineup until dismissed (Roster.tsx draws the
// marks), and nothing moves.
import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useTrace } from "../think";
import { ThinkingTrace } from "./ThinkingTrace";
import { WorkingLoader, AiMark } from "./WorkingLoader";
import { SwapRows } from "./SwapRows";
import { PlatformLogo } from "./PlatformLogo";
import { AiLabel } from "./ui";
import { deny } from "../deny";
import { moveLock } from "../kickoff";
import { LOCKED_LINE, weekFinal } from "../locks";
import { lineupStatus, noMoveText } from "../engine";
import { Player, WEEK, playerById, sleeperUrl } from "../data";
import type { Live } from "../live";
import { bestUnderLocks, sleeperNow } from "../lineupWhatIf";
import { keepOptimal, lastOptimal, lockedIn, optimalJob, resultFor, type OptimalResult } from "../optimalLineup";

export type AiMarks = Record<string, "start" | "sit">;
const marksOf = (r: OptimalResult): AiMarks => Object.fromEntries(r.swaps.flatMap((w) => [[w.start, "start"], [w.bench, "sit"]]));

export function OptimalLineup({ live, locked, onPlayer, onMarks }: {
  live: Live;
  /** Every starter is locked (or the week is over): a tap says so instead of running. */
  locked: boolean;
  onPlayer: (p: Player, where: string) => void;
  onMarks: (m: AiMarks | null) => void;
}) {
  const { trace, result, start } = useTrace<OptimalResult>();
  // The last result for this week comes back when you return to the tab, without its trace
  const [kept, setKept] = useState<OptimalResult | null>(() => lastOptimal());
  const [open, setOpen] = useState(() => !!lastOptimal());
  const running = trace.status === "thinking" || trace.status === "working";
  const raw = running ? null : result ?? kept;
  // A result kept from before kickoff drops any move whose players have since locked (either side)
  const isLocked = lockedIn(live);
  const openSwaps = raw ? raw.swaps.filter((w) => !isLocked(w.start) && !isLocked(w.bench)) : [];
  const res = raw && (openSwaps.length === raw.swaps.length ? raw
    : { ...raw, swaps: openSwaps, summary: `${openSwaps.length} ${openSwaps.length === 1 ? "move is" : "moves are"} still open. The rest locked at kickoff.` });
  useEffect(() => { if (result) { keepOptimal(result); setKept(result); } }, [result]);
  const markKey = res ? res.swaps.map((w) => `${w.start}>${w.bench}`).join() : "";
  useEffect(() => { onMarks(open && res && res.swaps.length ? marksOf(res) : null); }, [open, raw, markKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onMarks(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (e: MouseEvent<HTMLButtonElement>) => {
    if (running) { deny(e.currentTarget, "Still working on your lineup. One moment."); return; }
    if (locked) { deny(e.currentTarget, weekFinal(live) ? `Week ${WEEK} is final. Lineups can't change.` : LOCKED_LINE); return; }
    setOpen(true); setKept(null); keepOptimal(null);
    start(optimalJob(live)).catch(() => {
      // Something broke mid-run: the engine's lineup is still the answer, never an error
      const cur = sleeperNow().mine;
      const r = resultFor(cur, bestUnderLocks(cur, lockedIn(live)), "off", null, "Source AI couldn't finish, so this is your best lineup by projection.");
      keepOptimal(r); setKept(r);
    });
  };
  // Already set (Zach, Oct 23): when Source already knows the lineup in Sleeper is the best one (by projection, with
  // nothing to move, or Source AI checked it this week and found no moves) the bar says so instead of offering
  // another run. "Check again" is still there for fresh news.
  const st = lineupStatus();
  const [recheck, setRecheck] = useState(false);
  const knownSet = !recheck && !running && !locked && !st.final && !st.blocked && st.moves.length === 0 && !(raw && raw.swaps.length > 0);
  const dismiss = () => { setOpen(false); setKept(null); keepOptimal(null); onMarks(null); };
  // The moves lock at the earliest kickoff among the players in them
  const lockBy = res ? moveLock(...res.swaps.flatMap((w) => [playerById(w.start), playerById(w.bench)])) : "";
  const where = (id: string) => (res?.swaps.some((w) => w.start === id) ? "Source AI says start" : "Source AI says bench");

  return (
    <div className={`lu-ai${open ? " is-open" : ""}`} aria-label="Set optimal lineup">
      <div className="lu-ai-bar">
        {knownSet ? <>
          <p className="lu-ai-txt"><b>Your lineup is set</b><span>{raw ? "Source AI checked it this week. Nothing to move." : "Your best projected lineup is already in Sleeper. Nothing to move."}</span></p>
          <button type="button" className="btn btn-sm btn-ghost lu-ai-again" onClick={(e) => { setRecheck(true); go(e); }}><AiMark size={16} />Check again</button>
        </> : <>
          <p className="lu-ai-txt"><b>Source AI</b><span>Weighs news, injuries, Vegas lines and weather against your projections.</span></p>
          <button type="button" className="btn btn-sm lu-ai-go" onClick={go} aria-busy={running || undefined} aria-disabled={locked || running || undefined}>
            {running ? <WorkingLoader size={16} /> : <AiMark size={16} />}Set optimal lineup
          </button>
        </>}
      </div>
      {open && trace.status !== "idle" && <ThinkingTrace trace={trace} />}
      {open && res && (
        <div className="lu-ai-res" aria-live="polite">
          <p className="lu-ai-head">{res.swaps.length ? res.summary : noMoveText(lineupStatus(), res.total)}</p>
          {res.swaps.length > 0 && <SwapRows rows={res.swaps} onPlayer={(p) => onPlayer(p, where(p.id))} />}
          {res.by === "off" && res.note && <p className="lu-ai-off">{res.note}</p>}
          <div className="lu-ai-foot">
            {res.swaps.length > 0 && <span className="lu-ai-hint">Make {res.swaps.length > 1 ? "these moves" : "this move"} in Sleeper{lockBy ? ` before ${lockBy}` : ""}.</span>}
            <div className="lu-ai-btns">
              <button type="button" className="btn btn-sm lu-ai-x" onClick={dismiss}>Dismiss</button>
              {res.swaps.length > 0 && <a className="btn btn-sm lu-ai-open" href={sleeperUrl("team")} target="_blank" rel="noreferrer"><PlatformLogo size={16} />Open in Sleeper</a>}
            </div>
          </div>
          {res.by === "ai" && <AiLabel />}
        </div>
      )}
    </div>
  );
}
