import type { KeyboardEvent, MouseEvent } from "react";
import { Team, TEAMS } from "../data";
import type { Result } from "../liveMath";
import { Icon, LiveNum } from "./ui";
import { TeamAvatar } from "./TeamPicker";
import { Trophy, WinCup, isChampion } from "./Trophy";

/** A team's place in the standings: most wins first, points for breaking ties (Sleeper's order). */
export function rankOf(t: Team) {
  const wins = (x: Team) => Number(x.record.split("-")[0]) || 0;
  return [...TEAMS].sort((x, y) => wins(y) - wins(x) || y.pf - x.pf).findIndex((x) => x.id === t.id) + 1;
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
  /** Small mono line under the score: the projected total while games are on ("123.8"), or "what-if" */
  note?: string;
  /** The score ticks (LiveNum) while games are on */
  live?: boolean;
  /** Trailing or losing side: the score steps back to muted */
  dim?: boolean;
  /** Shown in place of a team on a bye or while loading */
  empty?: string;
}

/** Where the week stands: before kickoff, games on, games over with no one live, or final. */
export type FaceState = "pre" | "live" | "scored" | "final";

/**
 * The matchup face-off. Phones get one card with mirrored halves and a rounded-square VS badge between them; tablet
 * and desktop get two mirrored containers with a round VS badge over the gap (matchup-card.css swaps the layout with a
 * container query; the markup is the same). Each half: avatar (ringed by who's ahead on wider cards), @handle, team
 * name, score, a bar filled by win %, then win %, record and the projected total. The winner of a final gets a cup. The week's state (Final with the result, Live, Projected) is said
 * once, centered under it, with a chevron: the whole card opens the full matchup. Every state draws the same rows at
 * the same heights, so switching weeks moves nothing. Hidden from assistive tech: the card's own label says it all.
 */
export function FaceOff({ you, them, state, chance, res, skel = false, msg }: {
  you: FaceSide; them: FaceSide; week?: number; state: FaceState; chance: number | null; res: Result | null; skel?: boolean; msg?: string;
}) {
  // One win % per side. A final is 100 or 0 (50 each on a tie); before and during games it's the model's chance.
  const mine = res ? (res.letter === "W" ? 100 : res.letter === "L" ? 0 : 50) : chance;
  const theirs = mine === null || !them.t ? null : 100 - mine;
  const final = !!res || state === "final";
  // Rings stay neutral until points are on the board
  const rings = state !== "pre";
  return (
    <span className={`fo${skel ? " is-skel" : ""}`} aria-hidden="true">
      <Side s={you} side="you" pct={mine} other={theirs} ring={rings} won={res?.letter === "W"} />
      <span className="fo-mid"><span className="fo-vs">VS</span></span>
      <Side s={them} side="them" pct={theirs} other={mine} ring={rings} won={res?.letter === "L" && !!them.t} />
      <span className="fo-line">
        {res ? <>Final<i>·</i><b className={res.tone}>{res.letter === "T" ? "Tie" : res.short}</b></>
          : final ? "Final"
          : !them.t ? msg ?? "No matchup"
          : state === "live" ? <span className="lu-live"><i />Live</span>
          : state === "scored" ? "Scored" : "Projected"}
        {them.t && !skel && <span className="fo-go"><Icon name="chev" size={14} /></span>}
      </span>
    </span>
  );
}

function Side({ s, side, pct, other, ring, won }: { s: FaceSide; side: "you" | "them"; pct: number | null; other: number | null; ring: boolean; won: boolean }) {
  const t = s.t;
  // Ahead or behind on win %: the leader's % and bar go green, the trailer's % goes red over a neutral bar. Even stays neutral.
  const tone = pct === null || other === null || pct === other ? "even" : pct > other ? "up" : "down";
  const handle = !t ? null : t.manager === "You" ? "You" : t.manager === "Open team" ? "Open team" : `@${t.manager}`;
  const rec = t ? `${t.record} (#${rankOf(t)})` : null;
  // Two cups, two meanings. The winner of a final gets one on the outer side, by the avatar. Last season's champion
  // keeps the league cup on the outside of the name: before yours, after theirs.
  const champ = t && isChampion(t.id) ? <span className="fo-name-cup"><Trophy teamId={t.id} /></span> : null;
  return (
    <span className={`fo-side ${side} ${tone}${ring && tone !== "even" ? ` ring-${tone}` : ""}${s.dim ? " is-dim" : ""}`}>
      <span className="fo-av">{t ? <TeamAvatar t={t} size={56} /> : <span className="fo-av-none" />}</span>
      <span className="fo-cup">{won && <WinCup />}</span>
      <b className={`fo-name${t ? "" : " muted"}`}>
        {side === "you" && champ}
        <span className="fo-name-t">{t ? t.name : s.empty ?? "No matchup"}</span>
        {side === "them" && champ}
      </b>
      <span className="fo-score">
        {s.pts === null ? <span className="fo-pts muted">--</span>
          : s.live ? <LiveNum className="fo-pts" v={s.pts} /> : <span className="fo-pts">{s.pts.toFixed(1)}</span>}
      </span>
      <span className="fo-bar"><i style={{ width: `${pct ?? 0}%` }} /></span>
      <span className="fo-win"><b>{pct === null ? "--" : `${pct}%`}</b> WIN</span>
      <small className="fo-note">{s.note ?? ""}</small>
      <span className="fo-meta">
        <span className="fo-handle">{handle ?? ""}</span>
        {handle && rec && <i className="fo-dot">•</i>}
        <span className="fo-rec">{rec ?? ""}</span>
      </span>
    </span>
  );
}
