import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";
import type { Team } from "../data";
import type { PlayCount, Result } from "../liveMath";
import { Morph, PixelTrophy, RollNum, isFresh, useTurnedAt } from "../gameDayMotion";
import { TeamAvatar } from "./TeamPicker";
import { Trophy, isChampion } from "./Trophy";
import { NumTip as Tip, Tooltip } from "./Tooltip";
import { useCountTogether } from "../motionOnce";

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
 * The matchup face-off (Figma "Score header", node 1:173), shared by the Overview > Command center card, the
 * Lineup team strip and the header of the full matchup. One surface, two mirrored sides around a round
 * VS ring. Each side: avatar, "You" or the handle over the team name, the big score, a bar filled by win %, then a
 * mono meta line (win %, record, the "N to play" chip while games are on, then the projection or points per game,
 * which tablet and desktop push to the inner end). The matchup winner's cup sits before the handle. Under the badge:
 * Final and the result, Live, or Projected; phones put that line under both sides with the to-play chips beside it.
 * Only starters still to play are counted: no live count. matchup-card.css lays it out by the face-off's own
 * width (phone, tablet, desktop), and every state draws the same rows at the same heights, so switching weeks moves
 * nothing. Cards hide it from assistive tech (their own label says it all); the matchup header passes `label`.
 */
export function FaceOff({ you, them, state, chance, res, skel = false, msg, label, flat = false, countKey, countChanges = true }: {
  you: FaceSide; them: FaceSide; week?: number; state: FaceState; chance: number | null; res: Result | null; skel?: boolean; msg?: string;
  /** Read as one image with this label, for a face-off that isn't inside a labelled button */
  label?: string;
  /** No padding of its own: the surface around it already has some (the matchup header) */
  flat?: boolean;
  /** Count the scores up from zero the first time this face-off shows this visit, with each win % bar growing at the
   *  same rate and stopping with its number (Zach). Later it animates only when a score changes. */
  countKey?: string;
  /** Off: only the first arrival counts up; a later change (a week switch) just shows the new numbers */
  countChanges?: boolean;
}) {
  // One win % per side. A final is 100 or 0 (50 each on a tie); before and during games it's the model's chance.
  const mine = res ? (res.letter === "W" ? 100 : res.letter === "L" ? 0 : 50) : chance;
  const theirs = mine === null || !them.t ? null : 100 - mine;
  const final = !!res || state === "final";
  // First arrival counts up; after that a live score rolls its digits (RollNum) and the bars glide on their own
  const liveNow = !!(you.live || them.live) && !final;
  const { vals: cv, running: counting } = useCountTogether(countKey, [you.pts ?? 0, them.pts ?? 0, mine ?? 0, theirs ?? 0], { ready: !skel && you.pts !== null, changes: !liveNow && countChanges });
  const anim = (i: number) => (counting ? cv[i] : undefined);
  // The leader's score is ink and the trailer's muted at every moment, the count-up included (both sides count at
  // the same rate, so the order holds); before kickoff that's the projected totals. A tie dims neither.
  const ya = anim(0) ?? you.pts, ta = anim(1) ?? them.pts;
  const both = ya !== null && ta !== null && !!them.t && !skel;
  const cmp = both ? Math.round(ya! * 10) - Math.round(ta! * 10) : 0;
  const youDim = both ? cmp < 0 : !!you.dim, themDim = both ? cmp > 0 : !!them.dim;
  // Final whistle: the week went final while this face-off was up (already final at mount shows it settled)
  const finalAt = useTurnedAt(final, (v) => v);
  const whistle = isFresh(finalAt, 2000);
  const lost = (s: "you" | "them") => !!res && res.letter !== "T" && (s === "you" ? res.letter === "L" : res.letter === "W");
  // What the week is (under the badge) and what happened (under that, or alone under both sides on a phone)
  const tag = !them.t ? null : final ? "Final" : state === "pre" ? "Projected" : state === "scored" ? "Scored" : null;
  const line = res ? (res.letter === "T" ? "Tied" : res.short)
    : !them.t ? msg ?? "No matchup"
    : state === "live" ? <span className="fo-live"><i />Live</span> : null;
  const chips = !final && (state === "live" || state === "scored");
  // The week's label and line morph when the state changes (Projected, Scored, Live, Final); the result rises in
  const lineKey = res ? "res" : !them.t ? `m:${msg ?? ""}` : state === "live" ? "live" : "none";
  const footKey = res ? "res" : !them.t ? `m:${msg ?? ""}` : state === "live" ? "live" : `t:${tag ?? ""}`;
  const lineV = whistle ? "rise" : "blur";
  return (
    <span className={`fo fo-st-${final ? "final" : state}${flat ? " fo-flat" : ""}${skel ? " is-skel" : ""}${whistle ? " gd-fw" : ""}`} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
      <span className="fo-in">
        <Side s={{ ...you, dim: youDim }} side="you" pct={mine} other={theirs} won={res?.letter === "W"} lost={lost("you")} chip={chips} state={final ? "final" : state} tips={!skel} focus={!!label} ap={anim(0)} apct={anim(2)} />
        <span className="fo-mid">
          <span className="fo-vs">VS</span>
          <span className="fo-tag"><Morph k={tag ?? ""}>{tag}</Morph></span>
          <span className="fo-line"><Morph k={lineKey} variant={lineV}>{res ? <ResultTip res={res} focus={!!label}>{line}</ResultTip> : line}</Morph></span>
        </span>
        <Side s={{ ...them, dim: themDim }} side="them" pct={theirs} other={mine} won={res?.letter === "L" && !!them.t} lost={lost("them") && !!them.t} chip={chips} state={final ? "final" : state} tips={!skel} focus={!!label} ap={anim(1)} apct={anim(3)} />
        <span className="fo-foot">
          <Chip c={chips ? you.count : undefined} />
          <span className="fo-line"><Morph k={footKey} variant={lineV}>{res ? <ResultTip res={res}>{line}</ResultTip> : line ?? tag}</Morph></span>
          <Chip c={chips && them.t ? them.count : undefined} />
        </span>
      </span>
    </span>
  );
}

const Chip = ({ c }: { c?: PlayCount }) => <span className="fo-chip">{toPlay(c) || null}</span>;

/* Number tips. Inside a card that is one button, none of these are tab stops (the card's own label says it all):
   hover or a long press shows them, and the tap still opens the card. The matchup header (`label`, not a button)
   makes each number a tab stop, so keyboard focus shows its tip. */

/** "Lost by 1.4" under the badge: the final margin, with the full score from your side. */
const ResultTip = ({ res, focus = false, children }: { res: Result; focus?: boolean; children: ReactNode }) => (
  <Tip focusable={focus} label={res.letter === "T" ? "Final result" : "Final margin"} note={res.long}><span>{children}</span></Tip>
);

const NoTip = ({ children }: { label: ReactNode; note?: ReactNode; focusable?: boolean; children: ReactNode }) => <>{children}</>;

/** What the win % (and the bar it fills) means in each state: the result once final, the model's chance before that. */
function winTip(pct: number, state: FaceState, bar: boolean) {
  if (state === "final") return { label: pct === 100 ? "Won" : pct === 0 ? "Lost" : "Tied", note: "Final result" };
  const note = state === "pre" ? "From projections" : "From points so far and projections";
  return bar ? { label: `${pct}% chance to win`, note } : { label: "Chance to win", note };
}

/** The big score: points scored, so far, or projected, by state. `note` is the meta line's projection, if any. */
function scoreTip(state: FaceState, note: string | undefined) {
  if (state === "final") return { label: "Points scored" };
  if (state === "pre") return { label: "Projected points", note: note === "what-if" ? "With your lineup changes" : "From the starters' projections" };
  const proj = note?.replace("what-if ", "");
  return { label: "Points so far", note: proj ? `Projected to finish at ${proj}` : undefined };
}

/** The number at the inner end of the meta line: the projected finish while games are on, else points per game. */
function endTip(note: string | undefined) {
  if (note === "what-if") return { label: "What-if", note: "Projected with your lineup changes" };
  if (note?.startsWith("what-if ")) return { label: "Projected finish", note: "With your lineup changes" };
  if (note) return { label: "Projected finish", note: "Points so far plus projections for starters still to play" };
  return { label: "Season average", note: "Points per game" };
}

function Side({ s, side, pct, other, won, lost = false, chip, state, tips = true, focus = false, ap, apct }: { s: FaceSide; side: "you" | "them"; pct: number | null; other: number | null; won: boolean; lost?: boolean; chip: boolean; state?: FaceState; tips?: boolean; focus?: boolean;
  /** Mid count-up: the score and win % to draw this frame (the bar follows the same progress, with its transition off) */
  ap?: number; apct?: number }) {
  const t = s.t;
  // Ahead or behind on win %: the leader's % and bar go green, the trailer's go red. Even stays neutral.
  const tone = pct === null || other === null || pct === other ? "even" : pct > other ? "up" : "down";
  const handle = !t ? null : t.manager === "You" ? "You" : t.manager;
  // The matchup winner's 16-bit trophy sits beside the team name; otherwise last season's champion keeps his cup
  // before the handle (with its tooltip). One cup either way.
  const cup = !t || won ? null : isChampion(t.id) ? <Trophy teamId={t.id} size={11} /> : null;
  const end = t ? s.note ?? perGame(t) : "";
  const left = chip && t ? toPlay(s.count) : "";
  const st = state ?? "pre";
  // No tips on a loading skeleton: its numbers are placeholders
  const NumTip = tips ? Tip : NoTip;
  const parts = t ? t.record.split("-").length : 0;
  const meta = [
    pct === null ? null : <NumTip key="w" focusable={focus} {...winTip(pct, st, false)}><b className="fo-pct">{apct !== undefined ? Math.round(apct) : pct}%</b></NumTip>,
    t ? <NumTip key="r" focusable={focus} label="Season record" note={parts > 2 ? "Wins, losses and ties" : "Wins and losses"}><span>{t.record}</span></NumTip> : null,
  ].filter(Boolean);
  // One counter for every frame: the count-up draws straight through it, a later live change rolls its digits
  const pts = s.pts === null ? null : <RollNum className="fo-pts" v={ap ?? s.pts} roll={ap === undefined && !!s.live} />;
  return (
    <span className={`fo-side ${side} ${tone}${s.dim ? " is-dim" : ""}${won ? " is-won" : ""}${lost ? " is-lost" : ""}`}>
      <span className="fo-av">{t ? <TeamAvatar t={t} size={48} /> : <span className="fo-av-none" />}</span>
      <span className="fo-handle">{cup}<span>{handle ?? ""}</span></span>
      <b className={`fo-name${t ? "" : " muted"}`}><span>{t ? t.name : s.empty ?? "No matchup"}</span>{won && t && <Tooltip content="Won this matchup"><PixelTrophy /></Tooltip>}</b>
      <span className="fo-score">
        {pts === null ? <span className="fo-pts muted">--</span> : t ? <NumTip focusable={focus} {...scoreTip(st, s.note)}>{pts}</NumTip> : pts}
      </span>
      {pct === null ? <span className="fo-bar"><i style={{ "--v": 0 } as CSSProperties} /></span>
        : <NumTip focusable={focus} {...winTip(pct, st, true)}><span className="fo-bar"><i style={{ "--v": (apct ?? pct) / 100, ...(apct !== undefined ? { transition: "none" } : {}) } as CSSProperties} /></span></NumTip>}
      <span className="fo-meta">
        {meta.flatMap((x, i) => (i ? [<i key={`d${i}`} className="fo-dot">•</i>, x] : [x]))}
        {left && <i className="fo-dot fo-dot-chip">•</i>}
        {left && <span className="fo-chip">{left}</span>}
        {meta.length > 0 && end && <i className="fo-dot fo-dot-end">•</i>}
        {end ? <NumTip focusable={focus} {...endTip(s.note)}><span className="fo-end">{end}</span></NumTip> : <span className="fo-end" />}
      </span>
    </span>
  );
}
