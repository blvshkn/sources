import { Kick } from "./Meta";
import { KickNote } from "../gameDayMotion";
import { kickWhen, oppText } from "../kickoff";
import { onBye, type Player } from "../data";
import type { GameNow } from "./LivePts";

/** The one line under a player's name everywhere (Zach, Oct 23: "a single component for this throughout all the
 *  views"): position, team and who he plays, then the game's state. Before kickoff that's the time, then LIVE, then
 *  FINAL, and the opponent stays the whole way ("WR · CHI v NE · FINAL"). A bye reads "CHI · Bye".
 *  Dots between the parts come from .lu-meta (styles.css), so the wrapper is that class. */
export function GameMeta({ p, g, pos = true, opp, lockAt = 0, className = "" }: {
  p: Pick<Player, "pos" | "nfl"> & Partial<Pick<Player, "id" | "opp">>;
  g: GameNow;
  /** Show the position (the Lineup leaves it off when the slot pill already says it) */
  pos?: boolean;
  /** The opponent when the caller has it in another form (the Wire's vsOf); defaults to the player's own */
  opp?: string;
  /** When the lock stamped, so "Locked at kickoff" can play before LIVE */
  lockAt?: number;
  className?: string;
}) {
  const bye = onBye(p.nfl);
  const vs = opp ?? p.opp;
  return (
    <span className={`lu-meta ${className}`.trim()}>
      {pos && <b className={`lu-pos p-${p.pos}`}>{p.pos}</b>}
      <TeamOpp nfl={p.nfl} opp={bye ? undefined : vs} />
      {bye ? <span className="lu-game">Bye</span> : <GameTag g={g} fallback={kickWhen({ nfl: p.nfl, opp: vs }) || null} lockAt={lockAt} />}
    </span>
  );
}

/** Team and opponent together, no dot between them: "NO v PIT". */
export const TeamOpp = ({ nfl, opp }: { nfl: string; opp?: string }) => <span>{nfl}{opp && <> <span className="lu-game">{oppText(opp)}</span></>}</span>;

/** Replaces the kickoff time once the game starts. */
export function GameTag({ g, fallback, lockAt = 0 }: { g: GameNow; fallback: string | null; lockAt?: number }) {
  // Kicked off while you watched: "Locked at kickoff" takes the time's place for a moment, then the Live tag
  if (g.state === "in_game") return <KickNote at={lockAt} after={<span className="lu-live"><i aria-hidden="true" />Live</span>} />;
  if (g.state === "complete") return <span className="lu-final">Final</span>;
  return fallback ? <span className="lu-game"><Kick when={fallback} /></span> : null;
}
