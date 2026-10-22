// The swap picker: the "Swap in at <slot>" menu under (or above) a starter, shared by the full matchup (this week and
// any other week) and the Lineup page so there is one implementation. Open, the starter's box and the list attach into
// one raised card (placeSwap sets data-sw; swap-card.css draws it). Also the lock rules both use, and the player cells the menu lists.
import { Suspense, createContext, lazy, useCallback, useContext, useLayoutEffect, useRef, useState } from "react";
import { useDismiss } from "./useDismiss";
import type { ElementType, MutableRefObject, ReactNode, RefObject } from "react";
import { PLAYERS, Player, SpecialPlayer, WEEK, onBye } from "../data";
import { gameInAt, kickLine, oppAt, useKickoffs } from "../kickoff";
import { fmt, specialPts } from "../engine";
import { Live, onPace } from "../live";
import { WeekPlayer } from "../weeks";
import { gameIn } from "../weekMatch";
import { Avatar } from "./Avatar";
import { StatusPill } from "./ui";
import { deny } from "../deny";
import type { CmpWho } from "./SwapCompare";
import { MetaParts, gameParts } from "./Meta";

// ---- Locks ------------------------------------------------------------------
/** Sleeper locks a player at his game's kickoff: "live" while it's on, "final" once it's over, null before. Byes
 *  have no kickoff, so they stay movable. Reads the same per-team game states the rows' points cells use. */
export const lockOf = (live: Live, p: { nfl: string } | null): "live" | "final" | null => {
  const st = p ? live.games[p.nfl] : undefined;
  return st === "complete" ? "final" : st === "in_game" ? "live" : null;
};
/** Anyone in a lineup slot: a skill player, a kicker or a defense. Defenses read as "it", not "him". */
export type Lockable = { id?: string; name: string; nfl: string; pos: string };
const him = (p: Lockable) => (p.pos === "DEF" ? "it" : "him");
/** On bye this week: his team has no game on the NFL schedule. A missing projection (wk null) is not a bye. */
const isBye = (p: Lockable) => onBye(p.nfl);
/** Swapping in someone on bye only scores 0, so bye candidates stay listed, dimmed and marked Bye, and a tap says why. */
export const BYE_TAG = "Bye";
export const byeWhy = (p: Lockable, week: number) => `${p.name} is on bye in Week ${week}, so ${him(p) === "it" ? "it" : "he"} won't score there.`;
/** For a week other than this one: lock and tag for a candidate with no game that week. */
export const weekBye = (p: WeekPlayer, week: number) => {
  if (!gameIn(p, week)) return { lock: byeWhy(p, week), tag: BYE_TAG };
  const out = outWhy(p, week, false);
  return out ? { lock: out, tag: OUT_TAG } : {};
};
/** Out: this week, Sleeper's Out status; any later week, only a long absence (IR, PUP, suspended, not with the team),
 *  since a plain Out is week to week. Questionable and doubtful players stay pickable; their pill shows the risk. */
export const OUT_TAG = "Out";
const LONG: Record<string, string> = { IR: "on IR", PUP: "on the PUP list", Sus: "suspended", NA: "not with the team" };
export function outWhy(p: { id?: string; name: string; pos: string }, week: number, thisWeek: boolean): string | null {
  const full = p.id ? PLAYERS[p.id] : undefined;
  if (!full) return null;
  const he = p.pos === "DEF" ? "it" : "he";
  const long = full.injury ? LONG[full.injury] : undefined;
  if (long) return `${p.name} is ${long}, so ${he} won't play in Week ${week}.`;
  if (thisWeek && full.status === "O") return `${p.name} is out this week, so ${he} won't score.`;
  return null;
}
/** The short label for a locked option: why, in one word. */
const tagOf = (lock: string) => (/ on bye /.test(lock) ? BYE_TAG : / is out | is on IR| on the PUP| is suspended| not with the team/.test(lock) ? OUT_TAG : "Locked");

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
    const out = outWhy(p, WEEK, true);
    if (out) return out;
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

// ---- Rows that make room -----------------------------------------------------
/** Everything laid out after `el` in its scroll area: its later siblings, then each ancestor's later siblings, up to
 *  the page's main column or a sheet's scroll body. Fixed and sticky layers stay out; they don't move with the flow. */
function flowAfter(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let n: HTMLElement | null = el; n && n.id !== "main" && n !== document.body && !n.hasAttribute("data-sheet-scroll"); n = n.parentElement) {
    for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
      if (s instanceof HTMLElement && s.getClientRects().length && !/fixed|sticky/.test(getComputedStyle(s).position)) out.push(s);
    }
  }
  return out;
}
const still = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** FLIP: the rows just moved by `dy` in layout; play them from where they were to where they are now, 160ms on the
 *  house curve. Additive, so a second move mid-way (another row opening) stacks instead of snapping. */
function slideFrom(els: HTMLElement[], dy: number) {
  if (Math.abs(dy) < 0.5 || still()) return;
  for (const e of els) e.animate?.([{ transform: `translateY(${-dy}px)` }, { transform: "none" }], { duration: 160, easing: "cubic-bezier(0.23, 1, 0.32, 1)", composite: "add" });
}
/** Lineup: where every row of the list, and everything after the list, sits on screen right now. Taken just before an
 *  open or close commits, so the rows can play from these spots to their new ones (the opened row grows, its anchor
 *  takes the list's height, a closed row shrinks back). Null with reduced motion or outside Lineup. */
function snapRows(list: HTMLElement | null | undefined): Map<HTMLElement, number> | null {
  if (!list || still()) return null;
  const m = new Map<HTMLElement, number>();
  for (const e of [...list.children, ...flowAfter(list)]) if (e instanceof HTMLElement) m.set(e, e.getBoundingClientRect().top);
  return m;
}

/** A Lineup anchor whose list is closing keeps its room until the list's 160ms exit has played, then gives it back and
 *  the rows below slide up into it. If the exit removes the anchor first, the slide starts in that same frame. */
function releaseAnchor(a: HTMLElement) {
  if (!a.style.height || a.dataset.swRelease) return;
  a.dataset.swRelease = "";
  const h = a.offsetHeight, rows = flowAfter(a), parent = a.parentElement;
  let t = 0;
  const done = () => {
    if (!t) return;
    window.clearTimeout(t); t = 0; mo.disconnect(); delete a.dataset.swRelease;
    if (a.isConnected && "swOpen" in a.dataset) return;  // the same row opened again mid-exit: keep the room
    a.style.height = "";
    slideFrom(rows.filter((r) => r.isConnected), -h);
  };
  const mo = new MutationObserver(() => { if (!a.isConnected) done(); });
  if (parent) mo.observe(parent, { childList: true });
  t = window.setTimeout(done, 160);
}

/**
 * Open the swap menu below its row when it fits, above it when it doesn't, so it never reaches past the end of the
 * scroll area. A menu that hung past the end made the area taller while open; closing it took that height away and
 * the browser pulled scrollTop up to the new end, so the rows jumped. Measured with the menu hidden, against the
 * scroll content's own top and bottom. When it doesn't fit below, the side with more room on screen wins and the
 * menu's height is capped to that room, so all of it shows without scrolling the list.
 * The row is the menu's parent (matchup), or the row just before it when the parent is a zero-height anchor
 * (data-swap-row="prev", Lineup); then the row's height goes on the anchor as --sw-rowh for the "above" position.
 * Lineup's card pushes the rows instead of covering them, so no part of a row (a suggestion's last line) peeks out
 * from under it: below the row the anchor takes the list's height; above it the row takes it as a top margin, and the
 * returned number is how far that moved the row down, for the scroll hold to take back so the row stays put.
 */
export function placeSwap(menu: HTMLElement): number {
  const host = menu.parentElement;
  if (!host) return 0;
  const prev = host.dataset.swapRow === "prev";
  const row = prev ? host.previousElementSibling as HTMLElement | null : host;
  if (!row) return 0;
  if (prev) {
    host.style.height = ""; row.style.marginTop = "";
    host.style.setProperty("--sw-rowh", `${row.offsetHeight}px`);
    // Line the menu up with the row's outlined box (its ::after pill), whatever inset that has at this size, and
    // hang it off the box's bottom edge (or its top, when flipped) so the row and the list read as one card
    const pill = getComputedStyle(row, "::after");
    if (pill.content !== "none" && pill.left.endsWith("px") && pill.right.endsWith("px")) {
      host.style.setProperty("--sw-l", pill.left); host.style.setProperty("--sw-r", pill.right);
    }
    if (pill.content !== "none" && pill.top.endsWith("px") && pill.bottom.endsWith("px")) {
      host.style.setProperty("--sw-pt", pill.top); host.style.setProperty("--sw-pb", pill.bottom);
    }
    row.dataset.sw = "down"; menu.dataset.sw = "down";
  }
  // Matchup: the menu hangs straight off the starter it swaps, same left edge and width, so the two read as one
  // piece (CSS squares the touching corners through data-sw on the row)
  const mine = prev ? null : host.querySelector<HTMLElement>(":scope > .mu-mine");
  if (mine) {
    menu.style.left = `${mine.offsetLeft}px`; menu.style.right = "auto"; menu.style.width = `${mine.offsetWidth}px`;
    menu.style.top = `${mine.offsetTop + mine.offsetHeight - 1}px`; menu.style.bottom = "";
    host.dataset.sw = "down"; menu.dataset.sw = "down";
  }
  const sc = scrollerOf(row);
  const page = sc === document.scrollingElement || sc === document.documentElement;
  // Measure the menu at full size, not mid-way through its opening spring
  const tf = menu.style.transform;
  menu.style.transform = "none";
  menu.classList.remove("is-up");
  menu.style.maxHeight = "";
  const m = menu.getBoundingClientRect();
  const shown = menu.style.display;
  menu.style.display = "none";
  const top = page ? 0 : sc.getBoundingClientRect().top + sc.clientTop;
  const floor = top + sc.scrollHeight - sc.scrollTop, ceil = top - sc.scrollTop;
  const r = row.getBoundingClientRect();
  menu.style.display = shown;
  menu.style.transform = tf;
  const h = m.height;
  const view = page ? pageView() : sc.getBoundingClientRect();
  const below = Math.min(floor, view.bottom) - m.top - 8, above = r.top + 4 - Math.max(ceil, view.top) - 8;
  // The matchup only flips at the content's end. Lineup rows (prev) also flip when the menu would open below the
  // screen but fits above it, since the page doesn't scroll to show it.
  // Lineup: the anchor holds the list's height below the row (it hangs pb + 1px into the row), plus a 4px gap
  // (useSwapMenu slides the rows below into their new places, so this height never reads as a jump)
  const push = () => {
    if (!prev) return 0;
    host.style.height = `${Math.max(0, menu.offsetHeight - parseFloat(host.style.getPropertyValue("--sw-pb") || "4") - 1 + 4)}px`;
    host.dataset.swOpen = "";
    return 0;
  };
  if (prev ? h <= below || (h <= floor - m.top - 8 && h > above) : h <= floor - m.top - 8) return push();
  // Doesn't fit below: take the side with more room on screen, never past the content's top or end
  if (above > below) {
    menu.classList.add("is-up");
    if (mine) { menu.style.top = "auto"; menu.style.bottom = `${host.offsetHeight - mine.offsetTop - 1}px`; host.dataset.sw = "up"; }
    if (prev) row.dataset.sw = "up";
    if (mine || prev) menu.dataset.sw = "up";
  }
  const room = Math.max(above, below);
  if (h > room) menu.style.maxHeight = `${Math.max(120, Math.floor(room))}px`;
  if (!prev) return 0;
  if (!menu.classList.contains("is-up")) return push();
  // Above: the list ends pt + 1px inside the row's top, so the row moves down by the rest of it, plus the gap
  const shift = Math.max(0, menu.offsetHeight - parseFloat(host.style.getPropertyValue("--sw-pt") || "5") - 1 + 4);
  row.style.marginTop = `${shift}px`;
  return shift;
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
  const rows = useRef<Map<HTMLElement, number> | null>(null);
  const setOpen = (k: K | null, from?: Element | null) => {
    const el = scrollerOf(from ?? menuRef.current);
    hold.current = { el, top: el.scrollTop };
    rows.current = snapRows(from?.closest<HTMLElement>(".lu-list") ?? menuRef.current?.closest<HTMLElement>(".lu-list"));
    setOpenState(k);
  };
  useLayoutEffect(() => {
    // The attached-card marks (data-sw) belong to the open row only: the matchup row that holds the menu, or the
    // Lineup row right before the menu's anchor
    // A Lineup row that was pushed down for a list above it gives the room back, and so does an anchor whose list is
    // closing (it fades over the rows for its 160ms instead of holding them apart). shift keeps the rows in view still.
    const menu = menuRef.current, at = menu?.parentElement;
    let shift = 0;
    document.querySelectorAll<HTMLElement>(":is(.mu-row, .lu-row)[data-sw]").forEach((r) => {
      if (menu && (r.contains(menu) || r.nextElementSibling === at)) return;
      delete r.dataset.sw;
      if (r.style.marginTop) { shift -= parseFloat(r.style.marginTop) || 0; r.style.marginTop = ""; }
    });
    // A closing anchor holds the rows apart through its 160ms exit, then they slide up together (releaseAnchor)
    // (A closing menu keeps menuRef until it unmounts, so on a close its anchor is released too, not placed again.)
    const live = open === null ? null : at;
    document.querySelectorAll<HTMLElement>(".lu-pick-at").forEach((a) => { if (a !== live) { delete a.dataset.swOpen; releaseAnchor(a); } });
    if (menuRef.current && open !== null) shift += placeSwap(menuRef.current);
    const h = hold.current;
    hold.current = null;
    if (h && Math.abs(h.el.scrollTop - (h.top + shift)) > 0.5) h.el.scrollTop = h.top + shift;
    // FLIP: rows that moved (the list opening below a row, the row itself growing or shrinking) slide from where they were
    const snap = rows.current;
    rows.current = null;
    snap?.forEach((top, e) => { if (e.isConnected) slideFrom([e], e.getBoundingClientRect().top - top); });
  }, [open]);
  // Only the bordered box that opened the list (aria-expanded) and the list itself keep it open. A tap or click
  // anywhere else closes it, and so does Escape (useDismiss). A sheet opened from the list (Compare) stacks on top, so taps
  // and Escape there are the sheet's and the list stays open behind it. The opener's own click still toggles it.
  // The matchup's Compare button sits beside its row's tap target, not inside it, so it's kept by class.
  useDismiss(menuRef, (_why, t) => setOpen(null, t), { open: open !== null, keep: '[aria-expanded="true"], .sw-cmp' });
  return { open, setOpen, menuRef };
}

// ---- Cells ------------------------------------------------------------------
/** "WR · " in front of the team, unless the row's slot chip already says WR. Flex, superflex and the swap list (no
 *  slot shown) keep it. */
const posOf = (pos: string, slot?: string) => (slot === pos ? null : pos);
/** "SEA vs LAR · Sun 4:05 PM" as parts: the team with its opponent, then the kickoff. */
const teamGame = (nfl: string, game: string | null | undefined): ReactNode[] => {
  if (!game) return [nfl];
  const [opp, ...rest] = gameParts(game);
  return [<>{nfl} {opp}</>, ...rest];
};
/** One side of a row this week: headshot, name, position, team and game. Module level, so a re-render (a toast, a
 *  live update) keeps the same rows instead of mounting every one of them again. */
export function Who({ p, side, slot }: { p: Player | null; side: "you" | "them"; slot?: string }) {
  useKickoffs();
  return p ? (
    <span className={`mu-p ${side}`}>
      <Avatar p={p} size={32} />
      <span className="mu-n"><b>{p.name}</b><small className="mu-meta"><MetaParts parts={[posOf(p.pos, slot), ...teamGame(p.nfl, onBye(p.nfl) ? null : kickLine(p))]} /><StatusPill p={p} /></small></span>
    </span>
  ) : <span className={`mu-p ${side} empty`}><span className="mu-n"><b>Empty</b></span></span>;
}

/** A K/DEF. One Sleeper left empty shows our best-projected pick, labeled Suggested. */
export function SpecialWho({ p, side, suggested, slot }: { p: SpecialPlayer | null; side: "you" | "them"; suggested?: boolean; slot?: string }) {
  useKickoffs();
  if (!p) return <span className={`mu-p ${side} empty`}><span className="mu-n"><b>Empty</b></span></span>;
  return (
    <span className={`mu-p ${side}`}>
      <Avatar p={p} size={32} />
      <span className="mu-n"><b>{p.name}</b><small className="mu-meta"><MetaParts parts={[posOf(p.pos, slot), ...(onBye(p.nfl) ? [p.nfl, "Bye"] : teamGame(p.nfl, p.opp ? oppAt(p.nfl, p.opp) : null)), suggested && <span className="muted">Suggested</span>]} /></small></span>
    </span>
  );
}

/** One side of a row in a week other than this one: name, position, team and that week's game. */
export function WeekWho({ p, side, week, suggested, slot }: { p: WeekPlayer | null; side: "you" | "them"; week: number; suggested?: boolean; slot?: string }) {
  useKickoffs(week);
  if (!p) return <span className={`mu-p ${side} empty`}><span className="mu-n"><b>Empty</b></span></span>;
  const game = gameInAt(p, week);
  return (
    <span className={`mu-p ${side}`}>
      <Avatar p={p} size={32} text={p.pos === "DEF" ? p.nfl : undefined} />
      <span className="mu-n"><b>{p.name}</b><small className="mu-meta"><MetaParts parts={[posOf(p.pos, slot), ...(game ? teamGame(p.nfl, game) : [p.nfl, "Bye"]), suggested && <span className="muted">Suggested</span>]} /></small></span>
    </span>
  );
}

// ---- The menu ---------------------------------------------------------------
/** What the menu's root renders as. SwapSpring provides Motion's m.div and its spring props; without it, a plain div. */
export const SwapShell = createContext<{ Root: ElementType; props: object } | null>(null);
const SwapSpring = lazy(() => import("./SwapSpring").then((m) => ({ default: m.SwapSpring })));
/** Fetch the menu's spring early (preloadOverlays), so the first tap already has it. */
export const preloadSwapSpring = () => import("./SwapSpring");

/**
 * The anchor a menu hangs from (Lineup's zero-height .lu-pick-at), mounted while `show` is true. The menu springs open
 * from its row and closes back into it, and a tap mid-way turns it around from where it is (Motion's AnimatePresence,
 * loaded in its own chunk). Until that chunk is here the menu opens the way it always has, with the CSS fade.
 */
export function SwapAnchor({ show, className, children }: { show: boolean; className: string; children: ReactNode }) {
  const plain = show ? <div className={className} data-swap-row="prev">{children}</div> : null;
  return <Suspense fallback={plain}><SwapSpring show={show} className={className}>{children}</SwapSpring></Suspense>;
}
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
  /** The player this option brings in (or replaces), for the Compare sheet. Options without one aren't comparable. */
  cmp?: CmpWho;
}

export function SwapPicker({ title, options, empty, className = "", menuRef }: {
  title: string; options: SwapOption[]; empty: string; className?: string;
  /** useSwapMenu's menuRef, so the menu gets placed and the scroll held. */
  menuRef: RefObject<HTMLDivElement>;
}) {
  const shell = useContext(SwapShell);
  const Root = (shell?.Root ?? "div") as "div";
  // A closing menu stays mounted while it springs shut, next to the one opening. It only lets go of menuRef if it
  // still holds it, so the new menu keeps the ref.
  const own = useRef<HTMLDivElement | null>(null);
  const setRef = useCallback((el: HTMLDivElement | null) => {
    const r = menuRef as MutableRefObject<HTMLDivElement | null>;
    if (el) { own.current = el; r.current = el; } else if (r.current === own.current) r.current = null;
  }, [menuRef]);
  return (
    <Root {...(shell?.props ?? {})} className={`mu-swap${shell ? " sw-spring" : ""}${className ? ` ${className}` : ""}`} ref={setRef}>
      <small>{title}</small>
      {options.length ? options.map((o) => (
        <button key={o.key} className={`mu-opt${o.lock ? " is-locked" : ""}`} aria-disabled={o.lock ? true : undefined}
          onClick={(e: { currentTarget: Element }) => (o.lock ? deny(e.currentTarget, o.lock) : o.onPick(e.currentTarget))} aria-label={o.lock ? `${o.name}, ${tagOf(o.lock) === "Locked" ? "locked" : tagOf(o.lock).toLowerCase() === "bye" ? "on bye" : "out"}` : undefined}>
          {o.who}
          <span className="mu-pts">{o.pts.toFixed(1)}</span>
          {o.lock ? <span className="mu-delta mu-locked">{o.tag ?? tagOf(o.lock)}</span> : <span className={`mu-delta ${o.up ? "up" : "down"}`}>{fmt(o.delta)}</span>}
        </button>
      )) : <p className="small muted">{empty}</p>}
    </Root>
  );
}
