// A player's points cell and game-day counts, on their own so the landing can show them without loading Lineup
// (Roster.tsx).
import { useRef, type ReactNode } from "react";
import { Live, onPace, PlayCount as Counts } from "../live";
import { playLabel } from "../liveMath";
import { NumTip, Tooltip } from "./Tooltip";
import { HeatWx, PixelFlame, PixelSmoke, PixelSnow, RollNum, StoneLock, useTurnedAt } from "../gameDayMotion";

export type GameNow = { state: "pre_game" | "in_game" | "complete" | null; pts: number; left?: number };
/** A player's game right now. If his points haven't come in yet, treat it as not started so we show the projection, not a fake zero. */
export const gameNow = (live: Live | undefined, id: string, nfl: string): GameNow => {
  const pts = live?.points[id];
  return { state: pts === undefined ? null : live?.games[nfl] ?? null, pts: pts ?? 0, left: live?.left?.[nfl] };
};

/** Points column: projection before kickoff, live points (with the projection beneath) during the game, final after. */
/** Live only, the way Sleeper reads it: on fire once he's past his projection, heating up when he's on pace to pass
 *  it, cold when he's on pace to finish more than 15 percent short. Pace needs the game clock; without it, no read.
 *  Once the game is final there's no effect, just what he scored against what he was projected. */
export const heatOf = (pts: number, proj: number, pace: number | null): "fire" | "heating" | "cold" | null =>
  pts >= proj && proj > 0 ? "fire" : pace === null || proj <= 0 ? null : pace >= proj ? "heating" : pace < proj * 0.85 ? "cold" : null;

const HEAT_TIP = { fire: "Past his projection already", heating: "On pace to beat his projection", cold: "On pace to finish 15% or more under projection" };
/** All three are 16-bit (gameDayMotion): `at` is when he turned, so the icon plays once; 0 shows it settled. Heating
 *  up is an ember that smokes and rests as a wisp; `caught` means he went from heating up to on fire, so the smoke
 *  catches into the flame. */
export const HeatMark = ({ heat, at = 0, caught = false }: { heat: "fire" | "heating" | "cold"; at?: number; caught?: boolean }) => <Tooltip content={HEAT_TIP[heat]}>{heat === "fire" ? <PixelFlame at={at} caught={caught} /> : heat === "cold" ? <PixelSnow at={at} /> : <PixelSmoke at={at} />}</Tooltip>;

/** Players whose game was live while you had the app open, and finals that have already stamped. */
const wasLive = new Set<string>(), stamped = new Set<string>();
export const markLive = (id: string) => wasLive.add(id);

/** A final score set in stone: the number sits engraved on a small slab. If you watched the game go final, it stamps
 *  down once; finals that were already final when you opened the app just sit there, and tab switches never replay it. */
export function FinalPts({ id, pts, proj, cls, lock }: { id: string; pts: number; proj: number; cls: string; lock?: ReactNode }) {
  const stamp = useRef(wasLive.has(id) && !stamped.has(id));
  if (stamp.current) stamped.add(id);
  return (
    <span className={`${cls} final cemented${stamp.current ? " stamp" : ""}`} aria-label={`Final, ${pts.toFixed(1)} points, projected ${proj.toFixed(1)}`}>
      {/* The engraved edge is a static copy of the number behind it (.fp-n::before and ::after), not a filter: a
          drop-shadow on this line made Safari redraw it every frame the stone lock moved inside it */}
      <b>{lock}<NumTip label="Points scored" note="Final"><span className="fp-n" data-v={pts.toFixed(1)}><span>{pts.toFixed(1)}</span></span></NumTip></b><small>proj {proj.toFixed(1)}</small>
    </span>
  );
}

/** `them`: an opponent's player, where beating his projection is bad for you, so the pace color flips. `stone`: the
 *  row is locked because his game kicked off, so the 16-bit stone lock sits before the points. Turning hot or cold,
 *  locking at kickoff and new points all animate only when they happen while the row is up (gameDayMotion). */
export function PtsCell({ id, g, proj, cls = "lu-pts", them = false, stone = false }: { id: string; g: GameNow; proj: number; cls?: string; them?: boolean; stone?: boolean }) {
  const live = g.state === "in_game";
  const pace = live ? onPace(g.pts, proj, g.left) : null, heat = live ? heatOf(g.pts, proj, pace) : null;
  const wx = heat === "fire" ? "hot" : heat === "cold" ? "cold" : null;
  const heatAt = useTurnedAt(wx, (v) => v !== null);
  // Heating up has its own clock (the smoke), and on fire right after heating up catches from the smoke
  const smokeAt = useTurnedAt(heat, (v) => v === "heating");
  const was = useRef(heat), caught = useRef(false);
  if (was.current !== heat) { caught.current = was.current === "heating" && heat === "fire"; was.current = heat; }
  // The lock (Zach, Oct 23): it stamps at kickoff, steps aside once he's on the board (no lock while he plays; the
  // flame, smoke or cold carries the row), and comes back when his game is final
  const showLock = stone && (g.state === "complete" || (live && g.pts === 0 && !heat));
  const lockAt = useTurnedAt(showLock, (v) => v);
  const lock = showLock ? <StoneLock at={lockAt} outline={g.state === "complete"} /> : null;
  if (live) {
    markLive(id);
    const note = heat === "fire" ? ", past his projection" : heat === "heating" ? ", on pace to beat his projection" : heat === "cold" ? ", on pace to fall short" : "";
    return (
      <span className={`${cls} live${heat ? ` heat-${heat}` : ""}`} aria-label={`${g.pts.toFixed(1)} points so far${pace !== null ? `, on pace for ${pace.toFixed(1)}` : ""}, projected ${proj.toFixed(1)}${note}`}>
        {wx && <HeatWx key={`${wx}${heatAt}`} kind={wx} at={heatAt} />}
        <b data-pts={g.pts.toFixed(1)}>{lock}{heat && <HeatMark heat={heat} at={heat === "heating" ? smokeAt : heatAt} caught={heat === "fire" && caught.current} />}<NumTip {...soFarTip(proj)}><RollNum v={g.pts} /></NumTip></b>
        {pace !== null ? <NumTip {...paceTip(pace)}><small className={`lu-pace ${(pace >= proj) !== them ? "up" : "down"}`}>pace {pace.toFixed(1)}</small></NumTip> : <small>proj {proj.toFixed(1)}</small>}
      </span>
    );
  }
  if (g.state === "complete") return <FinalPts id={id} pts={g.pts} proj={proj} cls={cls} lock={lock} />;
  return <span className={cls}><NumTip {...PROJ_TIP}><span>{proj.toFixed(1)}</span></NumTip></span>;
}

/* Number tips for a player's points, shared with the Wire cards: what the big number is in each game state. */
export const PROJ_TIP = { label: "Projected points", note: "This week, from Sleeper" };
export const soFarTip = (proj: number) => ({ label: "Points so far", note: `Projected ${proj.toFixed(1)} before kickoff` });
export const paceTip = (pace: number) => ({ label: `On pace for ${pace.toFixed(1)}`, note: "His points so far at the rate he's scoring" });
/** Row state for scanning on game day: finished rows fade back, live rows get an accent edge. */
export const playCls = (g: GameNow, bye?: boolean) => (bye || g.state === "complete" ? " is-done" : g.state === "in_game" ? " is-live" : "");

/** "2 live · 4 to play · 3 done" for a set of starters. */
export function PlayCount({ c, compact }: { c: Counts; compact?: boolean }) {
  if (compact) return (
    <span className="pc pc-compact" aria-label={`${c.left} to play, ${c.live} playing now`}>
      <span className={c.live ? "pc-live" : "pc-left"}>{c.live > 0 && <i aria-hidden="true" />}{playLabel(c)}</span>
    </span>
  );
  return (
    <span className={`pc${compact ? " pc-compact" : ""}`} aria-label={`${c.left} to play, ${c.live} playing now, ${c.done} done`}>
      {c.live > 0 && <span className="pc-live"><i aria-hidden="true" />{c.live} live</span>}
      <span className="pc-left"><b>{c.left}</b> to play</span>
      {!compact && <span className="pc-done">{c.done} done</span>}
    </span>
  );
}
