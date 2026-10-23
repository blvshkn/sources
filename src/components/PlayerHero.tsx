// The one header for the player sheet and the waiver claim sheet: headshot in front of his team's logo, name, position,
// team and jersey number, injury status, a bio row, a rankings row and the sheet's actions. It sits in the sheet's
// scrolling body above the sticky tabs; once its name scrolls away, the sheet top's compact bar (PlayerBar) fades in. Every number here comes from the app's own data: bios from Sleeper (playerBio.ts),
// ranks from the Values board, rostered % and adds from the waiver feed. Anything without a source is left out.
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { FREE_AGENTS, LEAGUE, SPECIAL_FREE_AGENTS, WEEK, isDemo, type BoardRow } from "../data";
import { teamColors } from "../jersey";
import { feet, useBio } from "../playerBio";
import { Avatar, AvatarPhotos, teamLogo, teamLogoHi } from "./Avatar";
import { viaEdge } from "../imgProxy";
import { fetchResearch } from "../sleeper";
import { demoBoard, specialBoard } from "./Values";
import { Tooltip } from "./Tooltip";
import { PosBadge } from "./ui";
import { WatchStar } from "./WatchStar";

export interface HeroSubject { id: string; name: string; pos: string; nfl: string }

// ---- Ranks -------------------------------------------------------------------------------
let boardMemo: { league: unknown; board: BoardRow[]; specials: BoardRow[] } | null = null;
function boards() {
  if (boardMemo?.league !== LEAGUE) boardMemo = { league: LEAGUE, board: LEAGUE.board?.length ? LEAGUE.board : demoBoard(), specials: specialBoard() };
  return boardMemo;
}
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

interface Stat { k: string; v: string; tip: string }
/** Position and overall rank by trade value (the same order as League > Values), then rostered % and adds when the
 *  waiver feed has them. Nothing for a player the board doesn't list. */
const pct = (n: number) => (n > 0 && n < 1 ? "<1" : String(Math.round(n)));

/** This week's Sleeper research figures (rostered and started percents), fetched once and shared by every header. */
export function useResearch(): Record<string, { owned?: number; started?: number }> | null {
  const [r, setR] = useState<Record<string, { owned?: number; started?: number }> | null>(null);
  useEffect(() => {
    if (isDemo() || !LEAGUE.season) return;
    let on = true;
    fetchResearch(LEAGUE.season, WEEK).then((x) => { if (on) setR(x); });
    return () => { on = false; };
  }, []);
  return r;
}

export function ranksFor(s: HeroSubject, research?: Record<string, { owned?: number; started?: number }> | null): Stat[] {
  const out: Stat[] = [];
  const special = s.pos === "K" || s.pos === "DEF";
  const { board, specials } = boards();
  const list = special ? specials : board;
  const i = list.findIndex((r) => r.id === s.id);
  if (i >= 0) {
    const pr = list.slice(0, i + 1).filter((r) => r.pos === s.pos).length;
    out.push({ k: `${s.pos} rank`, v: `#${pr}`, tip: special
      ? `By projected points among the ${s.pos === "K" ? "kickers" : "defenses"} rostered in your league or on its wire. Same order as League > Values.`
      : `By trade value among ${s.pos}s. Same order as League > Values.` });
    if (!special) out.push({ k: "Overall", v: `#${i + 1}`, tip: "By trade value across QB, RB, WR and TE. Same order as League > Values." });
  }
  // Rostered and Started: the share of Sleeper leagues that roster and start him this week (Zach: these over the
  // weekly position rank). Live leagues read Sleeper's research feed; the demo uses its own clearly demo figures.
  const fa = [...FREE_AGENTS, ...SPECIAL_FREE_AGENTS].find((f) => f.id === s.id);
  const rs = research?.[s.id];
  const owned = isDemo() ? fa?.rostered : rs?.owned, started = isDemo() ? (fa?.rostered !== undefined ? Math.round(fa.rostered * 0.45) : undefined) : rs?.started;
  if (typeof owned === "number") out.push({ k: "Rostered", v: `${pct(owned)}%`, tip: isDemo() ? "Demo league figure: the share of leagues that roster him." : `The share of Sleeper leagues that roster him, week ${WEEK}.` });
  if (typeof started === "number") out.push({ k: "Started", v: `${pct(started)}%`, tip: isDemo() ? "Demo league figure: the share of leagues that start him." : `The share of Sleeper leagues that start him in week ${WEEK}.` });
  // Waiver claims across Sleeper this week (Zach: keep it, labeled as claims). From the trending feed's adds.
  if (fa?.adds) out.push({ k: "Claims 7d", v: compact(fa.adds), tip: isDemo() ? "Demo league figure: claims across Sleeper over the last 7 days." : "Times he was added across Sleeper leagues over the last 7 days, from Sleeper's trending feed." });
  const row = i >= 0 ? list[i] : null;
  if (out.length < 4 && row && !special && row.trend) {
    out.push({ k: "Value trend", v: `${row.trend > 0 ? "+" : "−"}${compact(Math.abs(row.trend))}`, tip: isDemo() ? "Demo league figure: how his trade value has moved lately." : "How his trade value has moved lately, the same figure as League > Values risers and fallers." });
  }
  return out;
}

// ---- Large title (iOS pattern) ----------------------------------------------------------------
// The hero and the tab row scroll with the body; the tabs stick under the sheet's top. The top never changes height:
// it holds the grab handle, the close button and a compact bar (headshot, name, position and team) that fades in once
// the hero's name has scrolled under it. Nothing above the body resizes, so the list never jumps.

/** Where the tab row starts sticking, in the scroller's content coordinates. */
function stickAt(sc: HTMLElement): number | null {
  const hero = sc.querySelector<HTMLElement>(":scope > .ph"), stick = sc.querySelector<HTMLElement>(":scope > .ph-stick");
  if (!hero || !stick) return null;
  const cs = getComputedStyle(sc), ss = getComputedStyle(stick);
  // Below the hero: the body's row gap (grid) plus the margin between them (block margins collapse to the larger)
  const between = (parseFloat(cs.rowGap) || 0) + Math.max(parseFloat(getComputedStyle(hero).marginBottom) || 0, parseFloat(ss.marginTop) || 0);
  const natural = hero.getBoundingClientRect().bottom - sc.getBoundingClientRect().top - sc.clientTop + sc.scrollTop + between;
  // Sticky offsets count from inside the scroller's padding
  return Math.max(0, Math.round(natural - (parseFloat(cs.paddingTop) || 0) - (parseFloat(ss.top) || 0)));
}
/** Call before a tab or week switch swaps the body: keeps the tab row exactly where it is. Scrolled past the hero, the
 *  tabs stay stuck; above that, nothing moves. Room is reserved first so a shorter tab can't pull the scroll back. */
export function keepTabs(sc: HTMLElement | null | undefined) {
  if (!sc) return;
  const at = stickAt(sc);
  if (at === null) return;
  sc.style.setProperty("--ph-fill", `${sc.clientHeight}px`);
  if (sc.scrollTop > at) sc.scrollTop = at;
  requestAnimationFrame(() => requestAnimationFrame(() => sc.dispatchEvent(new Event("ph-fit"))));
}
function useLargeTitle(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    const sc = el?.closest<HTMLElement>("[data-sheet-scroll]");
    const sheet = el?.closest<HTMLElement>(".ps");
    const name = el?.querySelector<HTMLElement>(".ph-name");
    if (!el || !sc || !sheet || !name) return;
    // The compact bar shows once the name is fully under the sheet's top (the body runs under it)
    const topH = parseFloat(getComputedStyle(sc).paddingTop) || 0;
    const io = new IntersectionObserver(([e]) => sheet.toggleAttribute("data-ph-compact", !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0) + topH),
      { root: sc, rootMargin: `-${Math.round(topH)}px 0px 0px 0px` });
    io.observe(name);
    // Room under a short tab so the tab row can always reach its stuck spot (a pseudo-element sized by --ph-fill)
    const fit = () => {
      const at = stickAt(sc);
      if (at === null) return;
      const kids = [...sc.children].filter((k) => !k.classList.contains("sa-track"));
      const last = kids[kids.length - 1];
      if (!last) return;
      const end = last.getBoundingClientRect().bottom - sc.getBoundingClientRect().top - sc.clientTop + sc.scrollTop + (parseFloat(getComputedStyle(sc).paddingBottom) || 0);
      const fill = Math.max(0, Math.ceil(sc.clientHeight - (end - at)));
      sc.style.setProperty("--ph-fill", `${fill}px`);
    };
    let raf = 0;
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
    const ro = new ResizeObserver(later);
    const watch = () => { ro.disconnect(); ro.observe(sc); for (const k of sc.children) ro.observe(k); };
    watch();
    const mo = new MutationObserver(() => { watch(); later(); });
    mo.observe(sc, { childList: true });
    sc.addEventListener("ph-fit", fit);
    return () => { io.disconnect(); ro.disconnect(); mo.disconnect(); cancelAnimationFrame(raf); sc.removeEventListener("ph-fit", fit); sheet.removeAttribute("data-ph-compact"); };
  }, [ref]);
}

/** The sheet top's compact bar: headshot, name, position and team. Hidden until the hero's name scrolls away; a tap
 *  goes back to the top. Never any actions: on phones they're docked at the bottom, wider up they stay in the hero. */
export function PlayerBar({ s }: { s: HeroSubject }) {
  const toTop = (e: React.MouseEvent<HTMLButtonElement>) => {
    const sc = e.currentTarget.closest(".ps")?.querySelector<HTMLElement>("[data-sheet-scroll]");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sc?.scrollTo({ top: 0, behavior: reduce ? ("instant" as ScrollBehavior) : "smooth" });
  };
  const team = s.nfl && s.nfl !== "FA";
  return (
    <button type="button" className="ph-bar" onClick={toTop} aria-label={`${s.name}. Back to top`}>
      <Avatar p={s} size={36} badge={false} />
      <span className="ph-bar-who">
        <b>{s.name}</b>
        <span className="ph-bar-meta"><PosBadge pos={s.pos} />{team && <span>{s.nfl}</span>}</span>
      </span>
    </button>
  );
}

// ---- Header ----------------------------------------------------------------------------------
export function PlayerHero({ s, nameId, status, meta, where, actions, watch }: {
  s: HeroSubject;
  /** id on the name, for the dialog's aria-labelledby */
  nameId?: string;
  /** Injury or bye pill */
  status?: ReactNode;
  /** This week's game, after the team */
  meta?: ReactNode;
  /** Whose he is ("Your bench", "Mike's WR") */
  where?: string;
  /** Primary action, Watch, and any small text action. Shown in the hero from 768px; on phones the sheet docks the
   *  same actions to its bottom edge (.ph-dock) and the hero's copy is hidden. */
  actions?: ReactNode;
  /** The Watch star, as an icon button on the headshot's bottom-left corner (Zach, Oct 23) */
  watch?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLargeTitle(ref);
  const photos = useContext(AvatarPhotos);
  // 0: ESPN's 500px mark through Vercel's cache, 1: the same mark directly, 2: Sleeper's smaller one, 3: none
  const [logoTry, setLogoTry] = useState(0);
  useEffect(() => setLogoTry(0), [s.nfl]);
  const logoOk = logoTry < 3;
  const bio = useBio(s);
  const def = s.pos === "DEF";
  const [c1, , c3] = teamColors(s.nfl);
  const team = s.nfl && s.nfl !== "FA";
  const b = bio === "loading" ? null : bio;
  const facts: Stat[] = b ? [
    b.age !== undefined && { k: "Age", v: String(b.age), tip: "" },
    b.height !== undefined && { k: "Height", v: feet(b.height), tip: "" },
    b.weight !== undefined && { k: "Weight", v: `${b.weight} lb`, tip: "" },
    b.exp !== undefined && { k: "Exp", v: b.exp === 0 ? "Rookie" : `${b.exp} yr${b.exp === 1 ? "" : "s"}`, tip: "" },
    b.college && { k: "College", v: b.college, tip: "" },
  ].filter((x): x is Stat => !!x) : [];
  const research = useResearch();
  const ranks = ranksFor(s, research);
  const num = b?.number;

  return (
    <div ref={ref} className={`ph${def ? " ph-def" : ""}`} style={{ ["--tc" as string]: c1, ["--tc2" as string]: c3 }}>
      <span className="ph-wash" aria-hidden="true" />
      {photos && team && logoOk && <img className="ph-logo" src={logoTry === 0 ? viaEdge(teamLogoHi(s.nfl), 240) : logoTry === 1 ? teamLogoHi(s.nfl) : teamLogo(s.nfl)} alt="" aria-hidden="true" decoding="async" onError={() => setLogoTry((n) => n + 1)} />}
      <span className="ph-art"><Avatar p={s} size={def ? 76 : 84} badge={false} cut /></span>
      {/* Its own grid item, so tablet and desktop can line it up with the bio row */}
      {watch && <span className="ph-art-watch">{watch}</span>}
      <div className="ph-who">
        <h2 className="ph-name" id={nameId}>{s.name}</h2>
        <div className="ph-meta">
          <PosBadge pos={s.pos} />
          {team && <span className="ph-team">{s.nfl}{num !== undefined && <span className="ph-num">#{num}</span>}</span>}
          {meta && <span className="ph-game">{meta}</span>}
        </div>
        {/* Injury and whose he is: one row of same-size pills, each in its own colors */}
        {(status || where) && <div className="ph-tags">
          {status}
          {where && <span className={`ps-where ph-where${/bench|\w's /i.test(where) ? " bench" : ""}`}>{where}</span>}
        </div>}
      </div>
      {/* The bio and the actions share a row on tablet and desktop, the actions wrapping below when it runs out of room */}
      <div className="ph-row">
      {!def && (bio === "loading" ? <span className="ph-bio ph-skel" aria-hidden="true"><i /><i /><i /><i /></span>
        : facts.length > 0 && (
          <dl className="ph-bio" aria-label="Bio">
            {facts.map((f) => <div key={f.k} className={f.k === "College" ? "ph-col" : undefined}><dt>{f.k}</dt><dd>{f.v}</dd></div>)}
          </dl>
        ))}
        {actions && <div className="ph-acts">{actions}</div>}
      </div>
      {ranks.length > 0 && (
        <dl className="ph-ranks" aria-label="Rankings">
          {ranks.map((r) => <div key={r.k}><dt><Tooltip focusable content={r.tip}><span className="tt-term">{r.k}</span></Tooltip></dt><dd>{r.v}</dd></div>)}
        </dl>
      )}
    </div>
  );
}

/** The Watch star for the header: one button, filled when he's on the watchlist. */
export function WatchButton({ on, name, week, onToggle }: { on: boolean; name: string; week: number; onToggle: () => void }) {
  const label = on ? `Watching for week ${week}. Tap to stop` : `Watch for week ${week}`;
  return (
    <Tooltip content={label}>
      <button className="btn btn-icon ph-watch ph-watch-ic" aria-pressed={on} aria-label={`${label}: ${name}`} onClick={onToggle}>
        <WatchStar on={on} />
      </button>
    </Tooltip>
  );
}
