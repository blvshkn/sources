// The swap picker: the "Swap in at <slot>" menu under (or above) a starter, shared by the full matchup and the
// Lineup page so there is one implementation. Also the lock rules both use, and the player cells the menu lists.
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Player, SpecialPlayer, WEEK, gameLine, onBye } from "../data";
import { fmt, specialPts } from "../engine";
import { Live, onPace } from "../live";
import { WeekPlayer } from "../weeks";
import { gameIn } from "../weekMatch";
import { Avatar } from "./Avatar";
import { Icon, StatusPill } from "./ui";
import { deny } from "../deny";

// ---- Locks ------------------------------------------------------------------
/** Sleeper locks a player at his game's kickoff: "live" while it's on, "final" once it's over, null before. Byes
 *  have no kickoff, so they stay movable. Reads the same per-team game states the rows' points cells use. */
export const lockOf = (live: Live, p: { nfl: string } | null): "live" | "final" | null => {
  const st = p ? live.games[p.nfl] : undefined;
  return st === "complete" ? "final" : st === "in_game" ? "live" : null;
};
/** Anyone in a lineup slot: a skill player, a kicker or a defense. Defenses read as "it", not "him". */
export type Lockable = { name: string; nfl: string; pos: string };
const him = (p: Lockable) => (p.pos === "DEF" ? "it" : "him");
/** On bye this week: a K/DEF carries wk null, a skill player's team is on the bye list. */
const isBye = (p: Lockable) => ("wk" in p ? (p as { wk: unknown }).wk === null : onBye(p.nfl));
/** Swapping in someone on bye only scores 0, so bye candidates stay listed, dimmed and marked Bye, and a tap says why. */
export const BYE_TAG = "Bye";
export const byeWhy = (p: Lockable, week: number) => `${p.name} is on bye in Week ${week}, so ${him(p) === "it" ? "it" : "he"} won't score there.`;
/** For a week other than this one: lock and tag for a candidate with no game that week. */
export const weekBye = (p: WeekPlayer, week: number) => (gameIn(p, week) ? {} : { lock: byeWhy(p, week), tag: BYE_TAG });

/** This week's lock words, the same everywhere. A starter whose game kicked off, or any starter once the week is
 *  over, can't move; a bench player whose game started can't come in. */
export function lockRules(live: Live, pastWeek: boolean) {
  const starterLock = (p: Lockable | null): string | null => {
    if (pastWeek) return `Week ${WEEK} is over. Lineups can't change.`;
    const l = lockOf(live, p);
    return !p || !l ? null : l === "final" ? `${p.name}'s game is final. ${him(p) === "it" ? "Its" : "His"} spot locked at kickoff.` : `${p.name} is playing now. Lineups lock at kickoff.`;
  };
  const candidateLock = (p: Lockable): string | null => {
    if (pastWeek) return `Week ${WEEK} is over. Lineups can't change.`;
    if (isBye(p)) return byeWhy(p, WEEK);
    const l = lockOf(live, p);
    return !l ? null : l === "final" ? `${p.name}'s game is final, so Sleeper won't move ${him(p)} in.` : `${p.name} is playing now, so Sleeper won't move ${him(p)} in.`;
  };
  return { starterLock, candidateLock };
}

/** A K/DEF's expected finish right now: final points, live points or projection, the way the totals count it. */
export const spPts = (live: Live, p: SpecialPlayer | null) => {
  if (!p) return 0;
  const now = live.points[p.id], st = live.games[p.nfl], pr = live.proj?.[p.id] ?? specialPts(p);
  if (now === undefined) return pr;
  return st === "complete" ? now : st === "in_game" ? onPace(now, pr, live.left?.[p.nfl]) ?? Math.max(now, pr) : pr;
};

// ---- Placement --------------------------------------------------------------
/** The element that scrolls the menu's list: the sheet's body, or the page itself. */
export const scrollerOf = (el: Element | null): HTMLElement =>
  el?.closest<HTMLElement>("[data-sheet-scroll]") ?? (document.scrollingElement as HTMLElement) ?? document.documentElement;

/** The part of the page a list shows through: below the sticky top bar, above the phone tab bar. */
function pageView() {
  const bar = document.querySelector(".topbar"), tabs = document.querySelector(".tabbar");
  const fixed = (el: Element | null) => !!el && /sticky|fixed/.test(getComputedStyle(el).position) && el.getClientRects().length > 0;
  const top = fixed(bar) ? Math.max(0, bar!.getBoundingClientRect().bottom) : 0;
  const bottom = fixed(tabs) ? Math.min(window.innerHeight, tabs!.getBoundingClientRect().top) : window.innerHeight;
  return { top, bottom };
}

/**
 * Open the swap menu below its row when it fits, above it when it doesn't, so it never reaches past the end of the
 * scroll area. A menu that hung past the end made the area taller while open; closing it took that height away and
 * the browser pulled scrollTop up to the new end, so the rows jumped. Measured with the menu hidden, against the
 * scroll content's own top and bottom. When it doesn't fit below, the side with more room on screen wins and the
 * menu's height is capped to that room, so all of it shows without scrolling the list.
 * The row is the menu's parent (matchup), or the row just before it when the parent is a zero-height anchor
 * (data-swap-row="prev", Lineup); then the row's height goes on the anchor as --sw-rowh for the "above" position.
 */
export function placeSwap(menu: HTMLElement) {
  const host = menu.parentElement;
  if (!host) return;
  const prev = host.dataset.swapRow === "prev";
  const row = prev ? host.previousElementSibling as HTMLElement | null : host;
  if (!row) return;
  if (prev) host.style.setProperty("--sw-rowh", `${row.offsetHeight}px`);
  // Matchup: the menu hangs straight off the starter it swaps, same left edge and width, so the two read as one
  // piece (CSS squares the touching corners through data-sw on the row)
  const mine = prev ? null : host.querySelector<HTMLElement>(":scope > .mu-mine");
  if (mine) {
    menu.style.left = `${mine.offsetLeft}px`; menu.style.right = "auto"; menu.style.width = `${mine.offsetWidth}px`;
    menu.style.top = `${mine.offsetTop + mine.offsetHeight - 1}px`; menu.style.bottom = "";
    host.dataset.sw = "down";
  }
  const sc = scrollerOf(row);
  const page = sc === document.scrollingElement || sc === document.documentElement;
  menu.classList.remove("is-up");
  menu.style.maxHeight = "";
  const m = menu.getBoundingClientRect();
  const shown = menu.style.display;
  menu.style.display = "none";
  const top = page ? 0 : sc.getBoundingClientRect().top + sc.clientTop;
  const floor = top + sc.scrollHeight - sc.scrollTop, ceil = top - sc.scrollTop;
  const r = row.getBoundingClientRect();
  menu.style.display = shown;
  const h = m.height;
  const view = page ? pageView() : sc.getBoundingClientRect();
  const below = Math.min(floor, view.bottom) - m.top - 8, above = r.top + 4 - Math.max(ceil, view.top) - 8;
  // The matchup only flips at the content's end. Lineup rows (prev) also flip when the menu would open below the
  // screen but fits above it, since the page doesn't scroll to show it.
  if (prev ? h <= below || (h <= floor - m.top - 8 && h > above) : h <= floor - m.top - 8) return;
  // Doesn't fit below: take the side with more room on screen, never past the content's top or end
  if (above > below) {
    menu.classList.add("is-up");
    if (mine) { menu.style.top = "auto"; menu.style.bottom = `${host.offsetHeight - mine.offsetTop - 1}px`; host.dataset.sw = "up"; }
  }
  const room = Math.max(above, below);
  if (h > room) menu.style.maxHeight = `${Math.max(120, Math.floor(room))}px`;
}

/**
 * Which row's menu is open, with taps that keep the view exactly where it was: each open or close notes the
 * scroller's position first, and once React has committed (and the menu has been placed) puts it back if anything
 * moved it. `menuRef` goes on the open SwapPicker.
 */
export function useSwapMenu<K extends string | number>() {
  const [open, setOpenState] = useState<K | null>(null);
  const hold = useRef<{ el: HTMLElement; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const setOpen = (k: K | null, from?: Element | null) => {
    const el = scrollerOf(from ?? menuRef.current);
    hold.current = { el, top: el.scrollTop };
    setOpenState(k);
  };
  useLayoutEffect(() => {
    document.querySelectorAll<HTMLElement>(".mu-row[data-sw]").forEach((r) => { if (!r.contains(menuRef.current)) delete r.dataset.sw; });
    if (menuRef.current) placeSwap(menuRef.current);
    const h = hold.current;
    hold.current = null;
    if (h && Math.abs(h.el.scrollTop - h.top) > 0.5) h.el.scrollTop = h.top;
  }, [open]);
  return { open, setOpen, menuRef };
}

// ---- Cells ------------------------------------------------------------------
/** One side of a row this week: headshot, name, position, team and game. Module level, so a re-render (a toast, a
 *  live update) keeps the same rows instead of mounting every one of them again. */
export function Who({ p, side }: { p: Player | null; side: "you" | "them" }) {
  return p ? (
    <span className={`mu-p ${side}`}>
      <Avatar p={p} size={32} />
      <span className="mu-n"><b>{p.name}</b><small>{p.pos} · {p.nfl}{!onBye(p.nfl) && gameLine(p) ? ` · ${gameLine(p)}` : ""} <StatusPill p={p} /></small></span>
    </span>
  ) : <span className={`mu-p ${side} empty`}><span className="mu-n"><b>Empty</b></span></span>;
}

/** A K/DEF. One Sleeper left empty shows our best-projected pick, labeled Suggested. */
export function SpecialWho({ p, side, suggested }: { p: SpecialPlayer | null; side: "you" | "them"; suggested?: boolean }) {
  if (!p) return <span className={`mu-p ${side} empty`}><span className="mu-n"><b>Empty</b></span></span>;
  return (
    <span className={`mu-p ${side}`}>
      <Avatar p={p} size={32} />
      <span className="mu-n"><b>{p.name}</b><small>{p.pos} · {p.nfl}{p.wk === null ? " · Bye" : p.opp ? ` · ${p.opp}` : ""}{suggested && <span className="muted"> · Suggested</span>}</small></span>
    </span>
  );
}

/** One side of a row in a week other than this one: name, position, team and that week's game. */
export function WeekWho({ p, side, week, suggested }: { p: WeekPlayer | null; side: "you" | "them"; week: number; suggested?: boolean }) {
  if (!p) return <span className={`mu-p ${side} empty`}><span className="mu-n"><b>Empty</b></span></span>;
  const game = gameIn(p, week);
  return (
    <span className={`mu-p ${side}`}>
      <Avatar p={p} size={32} text={p.pos === "DEF" ? p.nfl : undefined} />
      <span className="mu-n"><b>{p.name}</b><small>{p.pos} · {p.nfl} · {game ?? "Bye"}{suggested && <span className="muted"> · Suggested</span>}</small></span>
    </span>
  );
}

// ---- The menu ---------------------------------------------------------------
export interface SwapOption {
  key: string;
  who: ReactNode;
  /** Name for the locked label read by screen readers. */
  name: string;
  pts: number;
  /** Point change if picked, already rounded; `up` decides its color (green good, red bad). */
  delta: number;
  up: boolean;
  /** Why this one can't move, or null. Locked options stay listed, dimmed, and a tap shakes and says why. */
  lock: string | null;
  /** The short label in place of the point change when locked; "Locked" unless set ("Bye"). */
  tag?: string;
  onPick: (from: Element) => void;
}

export function SwapPicker({ title, options, empty, className = "", info, menuRef }: {
  title: string; options: SwapOption[]; empty: string; className?: string;
  /** A "Player info" row at the top that opens the player sheet. */
  info?: { name: string; onOpen: () => void };
  /** useSwapMenu's menuRef, so the menu gets placed and the scroll held. */
  menuRef: RefObject<HTMLDivElement>;
}) {
  return (
    <div className={`mu-swap${className ? ` ${className}` : ""}`} ref={menuRef}>
      {info && (
        <button className="sw-info" onClick={info.onOpen} aria-label={`Player info for ${info.name}`}>
          <Icon name="eye" size={16} /><span>Player info</span><Icon name="chev" size={14} />
        </button>
      )}
      <small>{title}</small>
      {options.length ? options.map((o) => (
        <button key={o.key} className={`mu-opt${o.lock ? " is-locked" : ""}`} aria-disabled={o.lock ? true : undefined}
          onClick={(e: { currentTarget: Element }) => (o.lock ? deny(e.currentTarget, o.lock) : o.onPick(e.currentTarget))} aria-label={o.lock ? `${o.name}, ${/ on bye /.test(o.lock) ? "on bye" : "locked"}` : undefined}>
          {o.who}
          <span className="mu-pts">{o.pts.toFixed(1)}</span>
          {o.lock ? <span className="mu-delta mu-locked">{o.tag ?? (/ on bye /.test(o.lock) ? BYE_TAG : "Locked")}</span> : <span className={`mu-delta ${o.up ? "up" : "down"}`}>{fmt(o.delta)}</span>}
        </button>
      )) : <p className="small muted">{empty}</p>}
    </div>
  );
}
