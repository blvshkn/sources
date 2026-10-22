// The one header for the player sheet and the waiver claim sheet: headshot in front of his team's logo, name, position,
// team and jersey number, injury status, a bio row, a rankings row and the sheet's actions. It sits in the sheet's
// fixed top with the tabs, so only the body below scrolls. On phones it folds to a slim bar once you scroll the body,
// and opens again back at the top. Every number here comes from the app's own data: bios from Sleeper (playerBio.ts),
// ranks from the Values board, rostered % and adds from the waiver feed. Anything without a source is left out.
import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FREE_AGENTS, LEAGUE, SPECIAL_FREE_AGENTS, isDemo, type BoardRow } from "../data";
import { teamColors } from "../jersey";
import { feet, useBio } from "../playerBio";
import { Avatar, AvatarPhotos, teamLogo, teamLogoHi } from "./Avatar";
import { demoBoard, specialBoard } from "./Values";
import { Tooltip } from "./Tooltip";
import { Icon, PosBadge } from "./ui";

export interface HeroSubject { id: string; name: string; pos: string; nfl: string }

// ---- Ranks -------------------------------------------------------------------------------
let boardMemo: { league: unknown; board: BoardRow[]; specials: BoardRow[] } | null = null;
function boards() {
  if (boardMemo?.league !== LEAGUE) boardMemo = { league: LEAGUE, board: LEAGUE.board?.length ? LEAGUE.board : demoBoard(), specials: specialBoard() };
  return boardMemo;
}
const compact = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

interface Stat { k: string; v: string; tip: string }
/** Position and overall rank by trade value (the same order as League > Values), then rostered % and adds when the
 *  waiver feed has them. Nothing for a player the board doesn't list. */
export function ranksFor(s: HeroSubject): Stat[] {
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
  const fa = [...FREE_AGENTS, ...SPECIAL_FREE_AGENTS].find((f) => f.id === s.id);
  if (fa?.rostered !== undefined) out.push({ k: "Rostered", v: `${fa.rostered}%`, tip: isDemo() ? "Demo league figure: the share of leagues that roster him." : "The share of Sleeper leagues that roster him." });
  if (fa?.adds) out.push({ k: "Adds 7d", v: compact(fa.adds), tip: isDemo() ? "Demo league figure: adds across Sleeper over the last 7 days." : "Adds across Sleeper over the last 7 days, from Sleeper's trending feed." });
  return out;
}

// ---- Slim on scroll (phones) ----------------------------------------------------------------
const PHONE = "(max-width: 767px)";
/** Call before a tab switch scrolls the body back to the top, so the header keeps its size and the tabs don't move. */
export function holdHeader(scroller: HTMLElement | null | undefined) {
  if (!scroller) return;
  scroller.dataset.phHold = "1";
  window.setTimeout(() => { delete scroller.dataset.phHold; }, 180);
}
function useSlim(ref: React.RefObject<HTMLDivElement | null>) {
  const [slim, setSlim] = useState(false);
  const full = useRef(0);
  const prevH = useRef(0);
  const first = useRef(true);
  // Fold and unfold as one motion instead of a snap (Zach: it read janky on iPhone). After the swap, the header is set
  // back to its old height and eased to the new one, so the tabs and list below glide with it; the bottom edge is
  // clipped meanwhile so a growing header never paints over the tabs. The new content fades up as it lands.
  useLayoutEffect(() => {
    const el = ref.current;
    if (first.current) { first.current = false; return; }
    if (!el || !prevH.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = el.offsetHeight, from = prevH.current;
    if (Math.abs(to - from) < 2) return;
    const ease = "cubic-bezier(0.32, 0.72, 0, 1)";
    const a = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 260, easing: ease });
    el.style.clipPath = "inset(-120px -100vw 0 -100vw)";
    a.onfinish = a.oncancel = () => { el.style.clipPath = ""; };
    for (const c of el.querySelectorAll<HTMLElement>(":scope > .ph-art, :scope > .ph-who, :scope > .ph-acts")) {
      c.animate([{ opacity: 0.4, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
    }
  }, [slim, ref]);
  useEffect(() => {
    const el = ref.current;
    const sc = el?.closest(".ps")?.querySelector<HTMLElement>("[data-sheet-scroll]");
    if (!el || !sc) return;
    const mq = window.matchMedia(PHONE);
    const on = () => {
      prevH.current = el.offsetHeight;
      if (!mq.matches) { setSlim(false); return; }
      if (sc.dataset.phHold) return;
      const t = sc.scrollTop;
      setSlim((cur) => {
        if (!cur) {
          if (t <= 56) return false;
          // Only fold when the body stays scrolled after it grows by the height the header gives up; otherwise the
          // scroll would clamp to the top and the header would bounce open again
          full.current = el.offsetHeight;
          const room = sc.scrollHeight - sc.clientHeight - (full.current - 64);
          return room > t + 8;
        }
        return t > 4;
      });
    };
    sc.addEventListener("scroll", on, { passive: true });
    mq.addEventListener("change", on);
    return () => { sc.removeEventListener("scroll", on); mq.removeEventListener("change", on); };
  }, [ref]);
  /** A tap on the slim bar opens the header again: back to the top of the tab */
  const open = () => {
    const sc = ref.current?.closest(".ps")?.querySelector<HTMLElement>("[data-sheet-scroll]");
    if (ref.current) prevH.current = ref.current.offsetHeight;
    if (!sc || sc.scrollTop < 4) { setSlim(false); return; }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sc.scrollTo({ top: 0, behavior: reduce ? ("instant" as ScrollBehavior) : "smooth" });
  };
  return [slim, open] as const;
}

// ---- Header ----------------------------------------------------------------------------------
export function PlayerHero({ s, nameId, status, meta, where, actions }: {
  s: HeroSubject;
  /** id on the name, for the dialog's aria-labelledby */
  nameId?: string;
  /** Injury or bye pill */
  status?: ReactNode;
  /** This week's game, after the team */
  meta?: ReactNode;
  /** Whose he is ("Your bench", "Mike's WR") */
  where?: string;
  /** Primary action, Watch, and any small text action. Always visible, the slim bar included. */
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [slim, open] = useSlim(ref);
  const photos = useContext(AvatarPhotos);
  // 0: ESPN's 500px mark, 1: Sleeper's smaller one, 2: none
  const [logoTry, setLogoTry] = useState(0);
  useEffect(() => setLogoTry(0), [s.nfl]);
  const logoOk = logoTry < 2;
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
  const ranks = ranksFor(s);
  const num = b?.number;

  return (
    <div ref={ref} className={`ph${slim ? " ph-slim" : ""}${def ? " ph-def" : ""}`} style={{ ["--tc" as string]: c1, ["--tc2" as string]: c3 }}>
      <span className="ph-wash" aria-hidden="true" />
      {photos && team && logoOk && !def && <img className="ph-logo" src={logoTry === 0 ? teamLogoHi(s.nfl) : teamLogo(s.nfl)} alt="" aria-hidden="true" decoding="async" onError={() => setLogoTry((n) => n + 1)} />}
      <span className="ph-art"><Avatar p={s} size={slim ? 40 : def ? 76 : 84} badge={false} /></span>
      <div className="ph-who">
        <h2 className="ph-name" id={nameId}>{s.name}</h2>
        <div className="ph-meta">
          <PosBadge pos={s.pos} />
          {team && <span className="ph-team">{s.nfl}{num !== undefined && <span className="ph-num">#{num}</span>}</span>}
          {meta && <span className="ph-game">{meta}</span>}
          {status}
        </div>
        {where && <span className={`ps-where ph-where${/bench|\w's /i.test(where) ? " bench" : ""}`}>{where}</span>}
      </div>
      {slim && <button className="ph-open" onClick={open} aria-label="Show player details"><Icon name="chev" size={16} /></button>}
      {!def && (bio === "loading" ? <span className="ph-bio ph-skel" aria-hidden="true"><i /><i /><i /><i /></span>
        : facts.length > 0 && (
          <dl className="ph-bio" aria-label="Bio">
            {facts.map((f) => <div key={f.k} className={f.k === "College" ? "ph-col" : undefined}><dt>{f.k}</dt><dd>{f.v}</dd></div>)}
          </dl>
        ))}
      {ranks.length > 0 && (
        <dl className="ph-ranks" aria-label="Rankings">
          {ranks.map((r) => <div key={r.k}><dt><Tooltip focusable content={r.tip}><span className="tt-term">{r.k}</span></Tooltip></dt><dd>{r.v}</dd></div>)}
        </dl>
      )}
      {actions && <div className="ph-acts">{actions}</div>}
    </div>
  );
}

/** The Watch star for the header: one button, filled when he's on the watchlist. */
export function WatchButton({ on, name, week, onToggle }: { on: boolean; name: string; week: number; onToggle: () => void }) {
  const label = on ? `Watching for week ${week}. Tap to stop` : `Watch for week ${week}`;
  return (
    <Tooltip content={label}>
      <button className="btn btn-sm ph-watch" aria-pressed={on} aria-label={`${label}: ${name}`} onClick={onToggle}>
        <Icon name="star" size={16} /><span className="ph-watch-l">{on ? "Watching" : "Watch"}</span>
      </button>
    </Tooltip>
  );
}
