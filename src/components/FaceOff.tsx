import type { KeyboardEvent, MouseEvent } from "react";
import type { Team } from "../data";
import type { PlayCount, Result } from "../liveMath";
import { LiveNum } from "./ui";
import { TeamAvatar } from "./TeamPicker";
import { Trophy, WinCup, isChampion } from "./Trophy";

/** Props that make a card a button: Enter and Space open it, and a click on a control inside it never opens it too. */
export function pressProps(onPress: () => void, label: string) {
  return {
    role: "button" as const, tabIndex: 0, "aria-label": label,
    onClick: (e: MouseEvent<HTMLElement>) => { if ((e.target as Element).closest("a, button, [role='button']") === e.currentTarget) onPress(); },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault(); onPress();
    },
  };
}

export interface FaceSide {
  t: Team | null;
  pts: number | null;
  /** The number at the inner end of the meta line while there's a projection to show ("123.8", "what-if 123.8").
   *  Without one the line ends on the team's season points per game. */
  note?: string;
  /** The score ticks (LiveNum) while games are on */
  live?: boolean;
  /** Trailing or losing side: the score steps back to muted */
  dim?: boolean;
  /** Starters done, live and still to play: the "N to play" chip while games are on (only `left` is shown) */
  count?: PlayCount;
  /** Shown in place of a team on a bye or while loading */
  empty?: string;
}

/** The to-play chip's words: starters still to kick off ("2 to play"). Empty once everyone has played or is playing. */
export function toPlay(c: PlayCount | undefined) {
  return c && c.left > 0 ? `${c.left} to play` : "";
}

/** Where the week stands: before kickoff, games on, games over with no one live, or final. */
export type FaceState = "pre" | "live" | "scored" | "final";

/** Season points per game from the team's record and points for: "113.73". Empty before a game is played. */
function perGame(t: Team) {
  const games = t.record.split("-").reduce((n, x) => n + (Number(x) || 0), 0);
  return games && t.pf ? (t.pf / games).toFixed(2) : "";
}

/**
 * The matchup face-off (Figma "Score header", node 1:173), shared by the Wire Overview card, the Wire This week
 * strip, the Lineup team strip and the header of the full matchup. One surface, two mirrored sides around a round
 * VS ring. Each side: avatar, "You" or the handle over the team name, the big score, a bar filled by win %, then a
 * mono meta line (win %, record, the "N to play" chip while games are on, then the projection or points per game,
 * which tablet and desktop push to the inner end). The matchup winner's cup sits before the handle. Under the badge:
 * Final and the result, Live, or Projected; phones put that line under both sides with the to-play chips beside it.
 * Only starters still to play are counted: no live count. matchup-card.css lays it out by the face-off's own
 * width (phone, tablet, desktop), and every state draws the same rows at the same heights, so switching weeks moves
 * nothing. Cards hide it from assistive tech (their own label says it all); the matchup header passes `label`.
 */
export function FaceOff({ you, them, state, chance, res, skel = false, msg, label, flat = false }: {
  you: FaceSide; them: FaceSide; week?: number; state: FaceState; chance: number | null; res: Result | null; skel?: boolean; msg?: string;
  /** Read as one image with this label, for a face-off that isn't inside a labelled button */
  label?: string;
  /** No padding of its own: the surface around it already has some (the matchup header) */
  flat?: boolean;
}) {
  // One win % per side. A final is 100 or 0 (50 each on a tie); before and during games it's the model's chance.
  const mine = res ? (res.letter === "W" ? 100 : res.letter === "L" ? 0 : 50) : chance;
  const theirs = mine === null || !them.t ? null : 100 - mine;
  const final = !!res || state === "final";
  // What the week is (under the badge) and what happened (under that, or alone under both sides on a phone)
  const tag = !them.t ? null : final ? "Final" : state === "pre" ? "Projected" : state === "scored" ? "Scored" : null;
  const line = res ? (res.letter === "T" ? "Tied" : res.short)
    : !them.t ? msg ?? "No matchup"
    : state === "live" ? <span className="fo-live"><i />Live</span> : null;
  const chips = !final && (state === "live" || state === "scored");
  return (
    <span className={`fo fo-st-${final ? "final" : state}${flat ? " fo-flat" : ""}${skel ? " is-skel" : ""}`} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      <span className="fo-in">
        <Side s={you} side="you" pct={mine} other={theirs} won={res?.letter === "W"} chip={chips} />
        <span className="fo-mid">
          <span className="fo-vs">VS</span>
          <span className="fo-tag">{tag}</span>
          <span className="fo-line">{line}</span>
        </span>
        <Side s={them} side="them" pct={theirs} other={mine} won={res?.letter === "L" && !!them.t} chip={chips} />
        <span className="fo-foot">
          <Chip c={chips ? you.count : undefined} />
          <span className="fo-line">{line ?? tag}</span>
          <Chip c={chips && them.t ? them.count : undefined} />
        </span>
      </span>
    </span>
  );
}

const Chip = ({ c }: { c?: PlayCount }) => <span className="fo-chip">{toPlay(c) || null}</span>;

function Side({ s, side, pct, other, won, chip }: { s: FaceSide; side: "you" | "them"; pct: number | null; other: number | null; won: boolean; chip: boolean }) {
  const t = s.t;
  // Ahead or behind on win %: the leader's % and bar go green, the trailer's go red. Even stays neutral.
  const tone = pct === null || other === null || pct === other ? "even" : pct > other ? "up" : "down";
  const handle = !t ? null : t.manager === "You" ? "You" : t.manager;
  // One cup before the handle: the matchup winner's, or else last season's champion's (with its tooltip)
  const cup = !t ? null : won ? <WinCup size={11} /> : isChampion(t.id) ? <Trophy teamId={t.id} size={11} /> : null;
  const end = t ? s.note ?? perGame(t) : "";
  const left = chip && t ? toPlay(s.count) : "";
  const meta = [
    pct === null ? null : <b key="w" className="fo-pct">{pct}%</b>,
    t ? <span key="r">{t.record}</span> : null,
  ].filter(Boolean);
  return (
    <span className={`fo-side ${side} ${tone}${s.dim ? " is-dim" : ""}`}>
      <span className="fo-av">{t ? <TeamAvatar t={t} size={48} /> : <span className="fo-av-none" />}</span>
      <span className="fo-handle">{cup}<span>{handle ?? ""}</span></span>
      <b className={`fo-name${t ? "" : " muted"}`}><span>{t ? t.name : s.empty ?? "No matchup"}</span></b>
      <span className="fo-score">
        {s.pts === null ? <span className="fo-pts muted">--</span>
          : s.live ? <LiveNum className="fo-pts" v={s.pts} /> : <span className="fo-pts">{s.pts.toFixed(1)}</span>}
      </span>
      <span className="fo-bar"><i style={{ width: `${pct ?? 0}%` }} /></span>
      <span className="fo-meta">
        {meta.flatMap((x, i) => (i ? [<i key={`d${i}`} className="fo-dot">•</i>, x] : [x]))}
        {left && <i className="fo-dot fo-dot-chip">•</i>}
        {left && <span className="fo-chip">{left}</span>}
        {meta.length > 0 && end && <i className="fo-dot fo-dot-end">•</i>}
        <span className="fo-end">{end}</span>
      </span>
    </span>
  );
}
