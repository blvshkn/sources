// This week's matchup card, on its own so the landing can show it without loading the rest of Overview (Wire.tsx).
import { denyOn } from "../deny";
import { scoreTone, flipTone } from "../liveMath";
import { teamById, YOU, TEAMS, WEEK, OPPONENT_ID } from "../data";
import { TeamNeeds, fmt } from "../engine";
import { Icon } from "./ui";
import { TeamAvatar } from "./Avatar";
import { Tooltip } from "./Tooltip";
import { Trophy } from "./Trophy";
import { useMemo } from "react";
import { useLive, matchNow, type Live } from "../live";
import { FaceOff } from "./FaceOff";

/** This week's matchup card: the shared face-off (FaceOff.tsx). The whole card opens the full matchup. */
export function Scoreboard({ you, partner, onPartner, onMatchup, extras = true, at }: { you: TeamNeeds; partner: string | null; onPartner?: () => void; onMatchup?: () => void; extras?: boolean;
  /** A fixed moment of the week to show instead of live scoring (the landing's Projected, Live and Final states) */
  at?: Live }) {
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  // Expected finishes from the lineups actually set in Sleeper (K/DEF included); win chance from what's left to play
  // One score per team, the same one the full matchup and the Lineup strip read (live.matchNow): Sleeper's team
  // score, projected finish, and win % that turns into the result once every starter is done
  const shared = useLive();
  const live = at ?? shared;
  // The win model, once per Live state (the landing's live section re-renders this on every beat)
  const ms = useMemo(() => matchNow(live), [live]);
  const mine = ms.me.proj;
  const theirs = ms.opp ? ms.opp.proj : null;
  const chance = ms.chance;
  const pt = partner ? TEAMS.find((t) => t.manager === partner || t.name === partner) : undefined;
  const need = you.groups[you.need].diff;
  // Once games start, the big numbers are points scored and the projection drops to a footnote
  const started = Object.values(live.games).some((x) => x === "in_game" || x === "complete");
  const nowLive = Object.values(live.games).some((x) => x === "in_game");
  const myNow = started ? ms.me.scored : undefined, oppNow = started && ms.opp ? ms.opp.scored : undefined;
  const inPlay = started && myNow !== undefined && (!opp || oppNow !== undefined);
  const res = ms.result;
  // Score tones (liveMath.scoreTone): the side ahead now, or the winner once final, stays bright; pregame both do
  const myTone = scoreTone(myNow ?? mine, oppNow ?? theirs, res ? "final" : inPlay ? "live" : "pre");
  return (
    <section className="card sb2" aria-label="This week">
      <button className="sb2-rows sb2-open mc-press" onClick={onMatchup ?? denyOn(`No matchup in Week ${WEEK}, so there's nothing to open.`)} aria-disabled={!onMatchup || undefined} aria-label={`Open this week's matchup${res ? `. Final: ${res.long}` : `${inPlay ? `. You ${myNow!.toFixed(1)}${oppNow !== undefined ? `, them ${oppNow.toFixed(1)}` : ""}` : ""}${chance !== null ? `. ${chance} percent to win` : ""}`}`}>
        <FaceOff week={WEEK} state={res ? "final" : inPlay && nowLive ? "live" : inPlay ? "scored" : "pre"} chance={opp ? chance : null} res={opp ? res : null} msg="Bye week" countKey="overview-faceoff"
          you={{ t: YOU, pts: inPlay ? myNow! : mine, live: inPlay, note: inPlay && !res ? mine.toFixed(1) : undefined, dim: myTone === "trail", count: ms.me.count }}
          them={opp && theirs !== null ? { t: opp, pts: inPlay && oppNow !== undefined ? oppNow : theirs, live: inPlay, note: inPlay && !res ? theirs.toFixed(1) : undefined, dim: flipTone(myTone) === "trail", count: ms.opp?.count } : { t: null, pts: null, empty: "No matchup" }} />
      </button>
      {extras && <>
      <dl className="ti-stats sb2-stats">
        <div className="ti-stat"><dt><Tooltip focusable content="Starting lineup strength against the other teams. 1 is strongest."><span className="tt-term">Power rank</span></Tooltip></dt><dd>#{you.rank}<small>of {TEAMS.length}</small></dd></div>
        <div className="ti-stat"><dt>Weakest spot</dt><dd>{you.need}<span className={`sb2-need ${need < 0 ? "down" : "up"}`}>{fmt(need)}</span></dd></div>
      </dl>
      {partner && onPartner ? (
        <button className="sb2-partner" onClick={onPartner} aria-label={`Build a trade with ${partner}`}>
          {pt && <TeamAvatar t={pt} size={36} />}
          <span className="sb2-who"><small>Best trade partner</small><b>{partner}{pt && <Trophy teamId={pt.id} />}</b></span>
          <span className="sb2-go">Build a deal<Icon name="chev" size={16} /></span>
        </button>
      ) : (
        <p className="sb2-none">No clear trade partner yet.</p>
      )}
      </>}
    </section>
  );
}
