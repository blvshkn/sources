import type { KeyboardEvent, MouseEvent } from "react";
import { Team, TEAMS, YOU } from "../data";
import type { Result } from "../liveMath";
import { LiveNum } from "./ui";
import { TeamAvatar } from "./TeamPicker";
import { Tooltip } from "./Tooltip";
import { Trophy } from "./Trophy";

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
/** A team's record and standing from Sleeper's records and points for; your own line adds your points-for rank. */
export function standing(t: Team, withPf = false) {
  const wins = (x: Team) => Number(x.record.split("-")[0]) || 0;
  const rank = [...TEAMS].sort((x, y) => wins(y) - wins(x) || y.pf - x.pf).findIndex((x) => x.id === t.id) + 1;
  const pfRank = [...TEAMS].sort((x, y) => y.pf - x.pf).findIndex((x) => x.id === t.id) + 1;
  return `${t.record} · ${ordinal(rank)}${withPf ? ` · PF ${ordinal(pfRank)}` : ""}`;
}

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
  /** Small mono line under the score: "proj 123.8", "what-if", "final" */
  note?: string;
  /** The score ticks (LiveNum) while games are on */
  live?: boolean;
  /** Trailing or losing side: the score steps back to muted */
  dim?: boolean;
  /** Shown in place of a team on a bye or while loading */
  empty?: string;
}

/** Where the week stands, for the center column: before kickoff, games on, games over with no one live, or final. */
export type FaceState = "pre" | "live" | "scored" | "final";

/**
 * The matchup face-off for tablet and desktop, like Sleeper's matchup header: you on the left, them mirrored on the right,
 * the week's state in the middle, and the win chance bar (or the final line) across the bottom. Every state draws the same
 * rows at the same heights, so switching weeks or tabs never moves anything. Phones keep each card's stacked layout;
 * the CSS (matchup-card.css) swaps between the two. Hidden from assistive tech: the card's own label says it all.
 */
export function FaceOff({ you, them, week, state, chance, res, skel = false, msg }: {
  you: FaceSide; them: FaceSide; week: number; state: FaceState; chance: number | null; res: Result | null; skel?: boolean; msg?: string;
}) {
  const tone = res ? res.tone : chance == null ? "even" : chance >= 55 ? "up" : chance <= 45 ? "down" : "even";
  const tag = res || state === "final" ? "Final" : state === "live" ? null : state === "scored" ? "Scored" : "Projected";
  return (
    <span className={`fo${skel ? " is-skel" : ""}`} aria-hidden="true">
      <Side s={you} side="you" />
      <span className="fo-mid">
        <span className="fo-wk">Week {week}</span>
        <span className="fo-tag">{tag ?? <span className="lu-live"><i />Live</span>}</span>
        {res ? <b className={`fo-big ${tone}`}>{res.letter}</b>
          : chance != null ? <Tooltip content="Win chance from both projected totals. It firms up as points get played."><b className={`fo-big ${tone}`}>{chance}%</b></Tooltip>
          : <b className="fo-big even">{skel ? "00%" : "--"}</b>}
        <small className={`fo-small${res ? ` ${tone}` : ""}`}>{res ? res.short : chance != null ? "to win" : msg ?? "No matchup"}</small>
      </span>
      <Side s={them} side="them" />
      <span className={`fo-foot ${tone}`}>
        {res ? <span className="fo-res">{res.long}</span>
          : <span className="fo-bar"><i style={{ width: `${chance ?? 0}%` }} /></span>}
      </span>
    </span>
  );
}

function Side({ s, side }: { s: FaceSide; side: "you" | "them" }) {
  const t = s.t;
  return (
    <span className={`fo-side ${side}${s.dim ? " is-dim" : ""}`}>
      {t ? <TeamAvatar t={t} size={44} /> : <span className="fo-av-none" />}
      <span className="fo-who">
        <b className={t ? undefined : "muted"}><span>{t ? t.name : s.empty ?? "No matchup"}</span>{t && <Trophy teamId={t.id} />}</b>
        <small>{t ? standing(t, t.id === YOU.id) : " "}</small>
      </span>
      <span className="fo-score">
        {s.pts === null ? <span className="fo-pts muted">--</span>
          : s.live ? <LiveNum className="fo-pts" v={s.pts} /> : <span className="fo-pts">{s.pts.toFixed(1)}</span>}
        <small className="fo-note">{s.note ?? " "}</small>
      </span>
    </span>
  );
}
