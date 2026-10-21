// Compare, from a Lineup swap card: the player in the row against the players in his swap list. Opens in the shared
// DetailSheet (a sheet on phones, a modal from 768px up). It starts with the first option in the list; more can be
// added from that same list only. Each compared option can be swapped in from here, the same swap the list makes.
import { useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { LEAGUE, PLAYERS, Player, SpecialPlayer, WEEK, isDemo, onBye } from "../data";
import { fmt } from "../engine";
import { gameInAt, kickLine, useKickoffs } from "../kickoff";
import { WeekPlayer, lastWeek } from "../weeks";
import { seasonFor } from "../schedule";
import { gameIn } from "../weekMatch";
import { deny } from "../deny";
import { Avatar } from "./Avatar";
import { DetailSheet } from "./DetailSheet";
import { Icon } from "./ui";
import type { SwapOption } from "./SwapPicker";

/** One player as Compare shows him, for the week the swap is in. */
export interface CmpWho {
  id: string; name: string; pos: string; nfl: string;
  /** Text in place of a headshot (defenses in other weeks). */
  avText?: string;
  week: number;
  /** Projected points that week; null on a bye. */
  proj: number | null;
  /** "v ATL · Sun 1:00 PM"; null on a bye. */
  game: string | null;
  status: { word: string; why: string; tone: "bad" | "warn" } | null;
  /** Opens his player sheet. */
  onInfo?: () => void;
}

// ---- Building a player ---------------------------------------------------------
const LONG: Record<string, string> = { IR: "IR", PUP: "PUP", Sus: "Suspended", NA: "Not active" };
const LONG_WHY: Record<string, string> = { IR: "Injured reserve", PUP: "PUP list", Sus: "Suspended", NA: "Not with the team" };
/** Sleeper's note without the status word in front: "Questionable, Groin" reads "Groin". */
const why = (p: { note?: string; injury?: string; status?: string }) =>
  (p.note ?? "").replace(/^(Questionable|Doubtful|Out|IR|PUP|Sus|NA|DNR|COV)\b,?\s*/i, "") || LONG_WHY[p.injury ?? ""] || "No reason given";
function statusOf(p: { status?: string; injury?: string; note?: string }, thisWeek: boolean): CmpWho["status"] {
  const long = p.injury ? LONG[p.injury] : undefined;
  if (long) return { word: long, why: why(p), tone: "bad" };
  if (!thisWeek) return null;
  if (p.status === "O") return { word: "Out", why: why(p), tone: "bad" };
  if (p.status === "Q") return { word: p.injury === "Doubtful" ? "Doubtful" : "Questionable", why: why(p), tone: "warn" };
  return null;
}
/** This week: a skill player, kicker or defense, with the points the list shows for him. */
export function cmpNow(p: Player | SpecialPlayer, proj: number, onInfo?: () => void): CmpWho {
  const bye = onBye(p.nfl);
  return { id: p.id, name: p.name, pos: p.pos, nfl: p.nfl, week: WEEK, proj: bye ? null : proj, game: bye ? null : kickLine(p) || null, status: statusOf(p, true), onInfo };
}
/** Another week (Lineup's week stepper): that week's projection and game. Weekly injury tags don't carry forward. */
export function cmpWeek(p: WeekPlayer, week: number, onInfo?: () => void): CmpWho {
  const game = gameInAt(p, week), full = PLAYERS[p.id];
  return { id: p.id, name: p.name, pos: p.pos, nfl: p.nfl, avText: p.pos === "DEF" ? p.nfl : undefined, week, proj: game ? p.pts ?? 0 : null, game, status: full ? statusOf(full, week === WEEK) : null, onInfo };
}
/** His bye week this season: the week his team has no game. */
const byeWeek = (c: CmpWho) => {
  for (let w = 1; w <= lastWeek(); w++) if (!gameIn(c, w)) return w;
  return null;
};

// ---- Recent weeks --------------------------------------------------------------
/** The weeks played before this one, up to six. */
const recentWeeks = () => Array.from({ length: Math.min(6, WEEK - 1) }, (_, i) => WEEK - Math.min(6, WEEK - 1) + i);
/**
 * Fantasy points per week, from the season the player sheet's game log reads (seasonFor in schedule.ts). A live
 * league gets Sleeper's matchups: every rostered player's points that week, scored by the league (LEAGUE.slate.pts),
 * with your own matchup history behind it. The demo league gets its sample season. undefined means no points on
 * record that week, and null a bye: the chart leaves a gap for both and the table says which. Nothing is filled in.
 */
function recentPts(id: string, nfl: string, pos: string, weeks: number[]): (number | null | undefined)[] {
  const base = PLAYERS[id] ?? LEAGUE.specials?.[id];
  const season = seasonFor((base ?? { id, name: "", nfl, pos, proj: 0 }) as Player);
  return weeks.map((w) => {
    const c = season.find((x) => x.week === w);
    if (c && !c.opp) return null;
    const v = c?.pts ?? (isDemo() ? undefined : LEAGUE.history?.[w]?.points[id]);
    return typeof v === "number" ? v : undefined;
  });
}

/** Series colors, by position in the comparison (never by rank): blue, amber, magenta. Validated as a set for
 *  colorblind separation on both surfaces (dataviz validate_palette, all pairs). No lime, no green or red. */
const MAX = 3;

function RecentChart({ names, weeks, rows }: { names: string[]; weeks: number[]; rows: (number | null | undefined)[][] }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(220, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const h = 156, L = 30, R = 12, T = 12, B = 24;
  const vals = rows.flat().filter((v): v is number => typeof v === "number");
  const top = Math.max(10, Math.ceil(Math.max(0, ...vals) / 10) * 10);
  const x = (i: number) => L + (weeks.length < 2 ? (w - L - R) / 2 : (i * (w - L - R)) / (weeks.length - 1));
  const y = (v: number) => T + (1 - v / top) * (h - T - B);
  // A week with no data breaks the line: each run of weeks with points is its own segment
  const paths = rows.map((r) => {
    let d = "", pen = false;
    r.forEach((v, i) => { if (typeof v === "number") { d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; pen = true; } else pen = false; });
    return d;
  });
  const near = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * w;
    let best = 0;
    weeks.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    setHover(best);
  };
  return (
    <div className="cmp-chart" ref={box}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Fantasy points, weeks ${weeks[0]} to ${weeks[weeks.length - 1]}. The table below lists every value.`}
        onPointerMove={near} onPointerDown={near} onPointerLeave={() => setHover(null)}>
        {[0, top / 2, top].map((t) => (
          <g key={t}>
            <line className="cmp-grid-ln" x1={L} x2={w - R} y1={y(t)} y2={y(t)} />
            <text className="cmp-ax" x={L - 6} y={y(t) + 3.5} textAnchor="end">{t}</text>
          </g>
        ))}
        {weeks.map((wk, i) => <text key={wk} className="cmp-ax" x={x(i)} y={h - 6} textAnchor="middle">W{wk}</text>)}
        {hover !== null && <line className="cmp-cross" x1={x(hover)} x2={x(hover)} y1={T} y2={h - B} />}
        {paths.map((d, s) => <path key={names[s] + s} className={`cmp-line s${s + 1}`} d={d} />)}
        {rows.map((r, s) => r.map((v, i) => typeof v === "number" ? <circle key={`${s}-${i}`} className={`cmp-dot s${s + 1}`} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 4} /> : null))}
      </svg>
      {hover !== null && (
        <div className={`cmp-tip${x(hover) > w / 2 ? " left" : ""}`} style={{ left: `${x(hover)}px` }} aria-hidden="true">
          <b>Week {weeks[hover]}</b>
          {names.map((n, s) => (
            <span key={n + s}><i className={`cmp-key s${s + 1}`} />{n}<em>{typeof rows[s][hover] === "number" ? (rows[s][hover] as number).toFixed(1) : rows[s][hover] === null ? "Bye" : "No data"}</em></span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- The sheet -----------------------------------------------------------------
export function SwapCompare({ subject, role, options, title, swapLabel, from, onClose }: {
  subject: CmpWho;
  /** What the subject is doing now: "Starting at FLEX", "On your bench". */
  role: string;
  /** The swap list, as SwapPicker shows it. Only these can be compared. */
  options: SwapOption[];
  title: string;
  swapLabel: string;
  /** The row that opened it, so a swap from here holds the page where the list would. */
  from: Element | null;
  onClose: () => void;
}) {
  useKickoffs(subject.week);
  const pool = options.filter((o): o is SwapOption & { cmp: CmpWho } => !!o.cmp);
  const [keys, setKeys] = useState<string[]>(() => pool.slice(0, 1).map((o) => o.key));
  const shown = keys.map((k) => pool.find((o) => o.key === k)).filter((o): o is (typeof pool)[number] => !!o);
  const rest = pool.filter((o) => !keys.includes(o.key));
  const full = shown.length >= MAX - 1;
  const weeks = recentWeeks();
  const all = [subject, ...shown.map((o) => o.cmp)];
  const series = all.map((c) => recentPts(c.id, c.nfl, c.pos, weeks));

  return (
    <DetailSheet className="cmp-sheet" label={`Compare ${subject.name}`} onClose={onClose}
      title={<div className="cmp-head"><h2 className="ds-h">Compare</h2><small>{title}</small></div>}>
      {(close) => (
        <div className="cmp-body">
          <div className="cmp-add" aria-label="Players to compare">
            <span className="cmp-lbl">From this swap list</span>
            {rest.length ? (
              <div className="cmp-chips">
                {rest.map((o) => (
                  <button key={o.key} type="button" className={`chip-btn cmp-chip${full ? " is-full" : ""}`} aria-disabled={full ? true : undefined}
                    onClick={(e) => (full ? deny(e.currentTarget, `Compare up to ${MAX} players at once. Remove one to add ${o.cmp.name}.`) : setKeys((k) => [...k, o.key]))}
                    aria-label={`Add ${o.cmp.name} to the comparison`}>
                    <Icon name="plus" size={14} />{o.cmp.name}
                  </button>
                ))}
              </div>
            ) : <span className="cmp-none">Everyone in the list is in the comparison.</span>}
          </div>

          <section className="cmp-sec" aria-label="Side by side this week">
            <h3 className="cmp-h">Side by side, {subject.week === WEEK ? "this week" : `Week ${subject.week}`}</h3>
            <div className="cmp-cols" style={{ gridTemplateColumns: `repeat(${all.length}, minmax(0, 1fr))` }}>
              {all.map((c, s) => {
                const o = s ? shown[s - 1] : null, bye = byeWeek(c);
                const who = (
                  <>
                    <Avatar p={c} size={36} text={c.avText} />
                    <span className="cmp-n"><b>{c.name}</b><small>{c.pos} · {c.nfl}</small></span>
                  </>
                );
                return (
                  <div key={c.id + s} className="cmp-col">
                    <div className="cmp-who">
                      {c.onInfo ? <button type="button" className="cmp-info" onClick={() => close(c.onInfo)} aria-label={`Player info for ${c.name}`}>{who}</button> : <span className="cmp-info">{who}</span>}
                      {o && <button type="button" className="cmp-x" onClick={() => setKeys((k) => k.filter((x) => x !== o.key))} aria-label={`Remove ${c.name} from the comparison`}><Icon name="x" size={14} /></button>}
                    </div>
                    <i className={`cmp-key s${s + 1}`} aria-hidden="true" />
                    <dl className="cmp-stats">
                      <div><dt>Proj</dt><dd className="cmp-num">{c.proj === null ? <span className="bad">Bye</span> : c.proj.toFixed(1)}
                        {o && !o.lock && <span className={`cmp-delta ${o.up ? "up" : "down"}`}>{fmt(o.delta)}</span>}</dd></div>
                      <div><dt>Game</dt><dd>{c.game ?? <span className="bad">Bye</span>}</dd></div>
                      <div><dt>Status</dt><dd>{c.status ? <><b className={c.status.tone}>{c.status.word}</b><small>{c.status.why}</small></> : <span className="good">Healthy</span>}</dd></div>
                      <div><dt>Bye</dt><dd className="cmp-num">{bye === null ? "None" : bye === c.week ? <span className="bad">This week</span> : `Week ${bye}`}</dd></div>
                    </dl>
                    {o ? (
                      <button type="button" className={`btn btn-sm cmp-swap${o.lock ? " is-locked" : ""}`} aria-disabled={o.lock ? true : undefined}
                        onClick={(e) => { if (o.lock) { deny(e.currentTarget, o.lock); return; } o.onPick(from && document.contains(from) ? from : e.currentTarget); close(); }}>
                        {o.lock ? <Icon name="lock" size={14} /> : <Icon name="switch" size={14} />}{swapLabel}
                      </button>
                    ) : <span className="cmp-role">{role}</span>}
                  </div>
                );
              })}
            </div>
            {!shown.length && <p className="cmp-none">Add a player from the list to compare.</p>}
          </section>

          <section className="cmp-sec" aria-label="Recent weeks">
            <h3 className="cmp-h">Recent weeks<small>Fantasy points</small></h3>
            {!weeks.length ? <p className="cmp-none">No games played yet this season.</p>
              : <>
                <ul className="cmp-legend">{all.map((c, s) => <li key={c.id + s}><i className={`cmp-key s${s + 1}`} aria-hidden="true" />{c.name}</li>)}</ul>
                <RecentChart names={all.map((c) => c.name)} weeks={weeks} rows={series} />
                <div className="cmp-table" role="table" aria-label="Fantasy points by week">
                  <div role="row" className="cmp-tr cmp-th" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${weeks.length}, 2.9em)` }}>
                    <span role="columnheader">Player</span>{weeks.map((wk) => <span key={wk} role="columnheader">W{wk}</span>)}
                  </div>
                  {all.map((c, s) => (
                    <div key={c.id + s} role="row" className="cmp-tr" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${weeks.length}, 2.9em)` }}>
                      <span role="rowheader"><i className={`cmp-key s${s + 1}`} aria-hidden="true" />{c.name}</span>
                      {series[s].map((v, i) => <span key={weeks[i]} role="cell" className={typeof v === "number" ? "" : "cmp-gap"}>{typeof v === "number" ? v.toFixed(1) : v === null ? "Bye" : "–"}</span>)}
                    </div>
                  ))}
                </div>
                <p className="cmp-src">{isDemo() ? "Sample points from the demo league, the same ones each player's game log shows." : "Points from Sleeper, scored with your league's settings."} A dash means no points on record that week.</p>
              </>}
          </section>
        </div>
      )}
    </DetailSheet>
  );
}

/** The Compare button in an open swap card's header row. Its own tap never toggles the row. */
export function CompareBtn({ name, onOpen }: { name: string; onOpen: (el: Element) => void }) {
  return (
    <button type="button" className="btn btn-sm sw-cmp" aria-label={`Compare ${name} with the swap options`}
      onClick={(e) => { e.stopPropagation(); onOpen(e.currentTarget); }}
      onKeyDown={(e) => e.stopPropagation()}>
      <Icon name="switch" size={14} />Compare
    </button>
  );
}
