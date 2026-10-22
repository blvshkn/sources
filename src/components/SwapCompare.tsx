// Compare, from a swap card on Lineup or in the full matchup: the player in the row against the players in his swap list. Opens in the shared
// DetailSheet (a sheet on phones, a modal from 768px up). It starts with the first option in the list; more can be
// added from that same list only. Each compared option can be swapped in from here, the same swap the list makes.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { LEAGUE, PLAYERS, Player, SPECIAL_FREE_AGENTS, SpecialPlayer, WEEK, isDemo, onBye } from "../data";
import { fmt } from "../engine";
import { gameInAt, kickLine, useKickoffs } from "../kickoff";
import { WeekPlayer, lastWeek } from "../weeks";
import { demoFinal } from "../schedule";
import { LogRow, MissWhy, SeasonLog, Subject, loadLog, missWhy, peekLog } from "../gamelog";
import { gameIn } from "../weekMatch";
import { deny } from "../deny";
import { Avatar } from "./Avatar";
import { DetailSheet } from "./DetailSheet";
import { Icon } from "./ui";
import { Tooltip } from "./Tooltip";
import type { SwapOption } from "./SwapPicker";

/** One player as Compare shows him, for the week the swap is in. */
export interface CmpWho {
  id: string; name: string; pos: string; nfl: string;
  /** Text in place of a headshot (defenses in other weeks). */
  avText?: string;
  week: number;
  /** Projected points that week; null on a bye. */
  proj: number | null;
  /** "v ATL · Sun 1 PM"; null on a bye. */
  game: string | null;
  status: { word: string; why: string; tone: "bad" | "warn" } | null;
  /** Opens his player sheet. */
  onInfo?: () => void;
}

/** An open Compare sheet: the row's player, its swap list as shown, and the row that opened it. */
export type CmpOpen = { subject: CmpWho; role: string; options: SwapOption[]; title: string; swapLabel: string; from: Element | null };

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
/** The weeks played, up to six: the ones before this one, and this one too once the demo's final-week fixture has it final. */
const recentWeeks = () => { const last = demoFinal() ? WEEK : WEEK - 1, n = Math.min(6, last); return Array.from({ length: n }, (_, i) => last - n + 1 + i); };
/** One player's recent weeks: points, or the reason there are none (bye, out, IR, inactive, DNP, suspended, no team,
 *  no data). */
interface Recent { pts: (number | undefined)[]; why: (MissWhy | null)[]; log?: SeasonLog }
/** Who the game log loads for: the same Subject the player sheet's Game log uses, so both read one season. */
const subjectOf = (c: CmpWho): Subject => {
  const p = PLAYERS[c.id], sp = LEAGUE.specials?.[c.id] ?? SPECIAL_FREE_AGENTS.find((f) => f.id === c.id);
  return { id: c.id, name: c.name, pos: c.pos as Subject["pos"], nfl: c.nfl, proj: p?.proj ?? sp?.proj ?? 0, rookie: p?.rookie };
};
/**
 * Fantasy points per week from the player sheet's game log (loadLog in gamelog.ts): Sleeper's weekly stats for every
 * NFL player, scored with this league's settings, whether or not anyone in the league rostered him that week. (Compare
 * used to read only the league's matchup points, which Sleeper records only for players on a fantasy roster, so a
 * player picked up late showed nothing for weeks he played.) The demo reads its sample season through the same call.
 * A week with no points carries its reason. Nothing is filled in.
 */
function recentOf(log: SeasonLog | undefined, weeks: number[], failed: boolean): Recent {
  if (!log) {
    const na: MissWhy | null = failed ? { kind: "na", label: "–", word: "No data", detail: "Couldn't load stats from Sleeper." } : null;
    return { pts: weeks.map(() => undefined), why: weeks.map(() => na) };
  }
  const rows = weeks.map((w) => log.rows.find((r) => r.week === w));
  return {
    log,
    pts: rows.map((r) => (r && !r.bye ? r.pts : undefined)),
    why: rows.map((r, i) => (!r ? { kind: "na", label: "–", word: "No data", detail: `No Week ${weeks[i]} on record.` } : missWhy(r, log.team))),
  };
}
function useRecent(all: CmpWho[], weeks: number[]): { rows: Recent[]; loading: boolean } {
  const season = LEAGUE.season;
  const [, bump] = useState(0);
  const failed = useRef(new Set<string>());
  const subs = all.map(subjectOf);
  const ready = subs.map((x) => peekLog(x, season));
  useEffect(() => {
    let on = true;
    subs.forEach((x, i) => { if (!ready[i]) loadLog(x, season).then(() => on && bump((n) => n + 1), () => { failed.current.add(x.id); if (on) bump((n) => n + 1); }); });
    return () => { on = false; };
  }, [subs.map((x) => x.id).join(","), season]); // eslint-disable-line react-hooks/exhaustive-deps
  return { rows: subs.map((x, i) => recentOf(ready[i], weeks, failed.current.has(x.id))), loading: ready.some((r, i) => !r && !failed.current.has(subs[i].id)) };
}
/** "IR since Week 2", "Out Week 5", or each run in turn: why a player has no points anywhere in the range. */
function noneLine(name: string, r: Recent, weeks: number[]): string {
  const runs: { why: MissWhy; from: number; to: number }[] = [];
  r.why.forEach((y, i) => {
    if (!y) return;
    const last = runs[runs.length - 1];
    if (last && last.why.kind === y.kind && last.to === weeks[i] - 1) last.to = weeks[i]; else runs.push({ why: y, from: weeks[i], to: weeks[i] });
  });
  // A run that reaches the end of the range and started before it reads from the week it really started
  const lastRun = runs[runs.length - 1];
  if (lastRun && r.log && lastRun.to === weeks[weeks.length - 1]) {
    let w = lastRun.from - 1;
    const row = (n: number): LogRow | undefined => r.log!.rows.find((x) => x.week === n);
    while (w >= 1 && row(w) && missWhy(row(w)!, r.log.team)?.kind === lastRun.why.kind) w--;
    lastRun.from = w + 1;
  }
  const word = (k: MissWhy) => (k.kind === "bye" ? "Bye" : k.kind === "ir" ? "IR" : k.kind === "na" ? "No data" : k.word);
  const parts = runs.map((x) => x.why.kind !== "bye" && x.to === weeks[weeks.length - 1] && runs.length === 1
    ? `${word(x.why)} since Week ${x.from}` : `${word(x.why)} ${x.from === x.to ? `Week ${x.from}` : `Weeks ${x.from} to ${x.to}`}`);
  return `${name}: no games in this range${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

/** What each gap label means, for the note under the table. */
const KEY: Record<MissWhy["kind"], string> = { bye: "bye week", out: "ruled out", ir: "injured reserve", inactive: "inactive", dnp: "did not play", sus: "suspended", noteam: "not on a team", na: "no data" };

/** Up to four players: the row's player and three from his list. Series colors go by position in the comparison
 *  (never by rank): blue, amber, magenta, lavender (swap-card.css). No lime, no green or red. */
const MAX = 4;
/** "James Cook III" -> "Cook": the touch readout has room for a surname only */
const lastName = (n: string) => { const p = n.split(" ").filter((x) => !/^(Jr\.?|Sr\.?|II|III|IV|V)$/.test(x)); return p[p.length - 1] ?? n; };

function RecentChart({ names, weeks, rows, why, hide }: {
  names: string[]; weeks: number[]; rows: (number | undefined)[][];
  /** Why each gap is a gap; drawn as a small label at the foot of the gap in the series' color. */
  why: (MissWhy | null)[][];
  /** Series with no points in the whole range: left off the chart (a line under the legend says why). */
  hide: boolean[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  // Touch: a thumb covers whatever floats beside it, so the week's values read out in a strip above the plot instead,
  // and the pick stays after the thumb lifts (tap a week to read it)
  const [touch] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(220, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const h = w < 520 ? 232 : 180, L = 30, R = 12, T = 12, B = 24;
  const vals = rows.flat().filter((v): v is number => typeof v === "number");
  const top = Math.max(10, Math.ceil(Math.max(0, ...vals) / 10) * 10);
  const x = (i: number) => L + (weeks.length < 2 ? (w - L - R) / 2 : (i * (w - L - R)) / (weeks.length - 1));
  const y = (v: number) => T + (1 - v / top) * (h - T - B);
  // A week with no data breaks the line: each run of weeks with points is its own segment
  const paths = rows.map((r, si) => {
    if (hide[si]) return "";
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
      {touch && (
        <div className="cmp-read" aria-hidden="true">
          <b>{hover === null ? "Tap a week" : `Week ${weeks[hover]}`}</b>
          {names.map((n, s) => hide[s] ? null : (
            <span key={n + s}><i className={`cmp-key s${s + 1}`} /><span className="cmp-read-n">{lastName(n)}</span>
              <em className={hover !== null && typeof rows[s][hover] !== "number" ? "is-miss" : undefined}>{hover === null ? "" : typeof rows[s][hover] === "number" ? (rows[s][hover] as number).toFixed(1) : why[s][hover]?.label ?? "--"}</em></span>
          ))}
        </div>
      )}
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Fantasy points, weeks ${weeks[0]} to ${weeks[weeks.length - 1]}. The table below lists every value.`}
        onPointerMove={near} onPointerDown={near} onPointerLeave={() => { if (!touch) setHover(null); }}>
        {[0, top / 2, top].map((t) => (
          <g key={t}>
            <line className="cmp-grid-ln" x1={L} x2={w - R} y1={y(t)} y2={y(t)} />
            <text className="cmp-ax" x={L - 6} y={y(t) + 3.5} textAnchor="end">{t}</text>
          </g>
        ))}
        {weeks.map((wk, i) => <text key={wk} className="cmp-ax" x={x(i)} y={h - 6} textAnchor="middle">W{wk}</text>)}
        {hover !== null && <line className="cmp-cross" x1={x(hover)} x2={x(hover)} y1={T} y2={h - B} />}
        {paths.map((d, s) => <path key={names[s] + s} className={`cmp-line s${s + 1}`} d={d} />)}
        {rows.map((r, s) => r.map((v, i) => typeof v === "number" ? <circle key={`${s}-${i}`} className={`cmp-dot s${s + 1}`} cx={x(i)} cy={y(v)} r={hover === i ? 6 : 4.5} /> : null))}
        {/* Each gap names its reason at the foot of the chart, stacked by series, so a break in a line reads as a bye or an injury */}
        {weeks.map((_, i) => {
          const marks = rows.map((r, s) => (!hide[s] && typeof r[i] !== "number" && why[s][i] ? { s, w: why[s][i]! } : null)).filter((m): m is { s: number; w: MissWhy } => !!m);
          return marks.map((m, k) => (
            <g key={`gap-${m.s}-${i}`} className={`cmp-gapm s${m.s + 1}`} transform={`translate(${x(i).toFixed(1)} ${(h - B - 8 - k * 13).toFixed(1)})`}>
              <rect x={-14} y={-6} width={28} height={12} rx={3} />
              <text y={3} textAnchor="middle">{m.w.label}</text>
            </g>
          ));
        })}
      </svg>
      {!touch && hover !== null && (
        <div className={`cmp-tip${x(hover) > w / 2 ? " left" : ""}`} style={{ left: `${x(hover)}px` }} aria-hidden="true">
          <b>Week {weeks[hover]}</b>
          {names.map((n, s) => (
            <span key={n + s}><i className={`cmp-key s${s + 1}`} />{n}<em>{typeof rows[s][hover] === "number" ? (rows[s][hover] as number).toFixed(1) : why[s][hover]?.word ?? "No data"}</em></span>
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
  // Start with the first option who can actually play that week (not on bye, not ruled out); the list's first pick
  // otherwise. Opening on a bye week player compared nothing useful.
  const [keys, setKeys] = useState<string[]>(() => {
    const ok = pool.find((o) => o.cmp.proj !== null && o.cmp.status?.tone !== "bad") ?? pool[0];
    return ok ? [ok.key] : [];
  });
  const shown = keys.map((k) => pool.find((o) => o.key === k)).filter((o): o is (typeof pool)[number] => !!o);
  const rest = pool.filter((o) => !keys.includes(o.key));
  const full = shown.length >= MAX - 1;
  const weeks = recentWeeks();
  const all = [subject, ...shown.map((o) => o.cmp)];
  const recent = useRecent(all, weeks);
  const series = recent.rows.map((r) => r.pts);
  const reasons = recent.rows.map((r) => r.why);
  // Loaded, with no points anywhere in the range: one plain line instead of an empty series
  const empty = recent.rows.map((r) => !!r.why.length && r.why.every((y) => !!y) && r.pts.every((v) => typeof v !== "number"));
  const used = new Map<string, MissWhy>();
  reasons.flat().forEach((y) => { if (y && !used.has(y.label)) used.set(y.label, y); });

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
            {/* One row while the columns fit; three or four wrap to two columns on a phone (swap-card.css) */}
            <div className="cmp-cols" data-count={all.length}>
              {all.map((c, s) => {
                const o = s ? shown[s - 1] : null, bye = byeWeek(c);
                const who = (
                  <>
                    <Avatar p={c} size={36} text={c.avText} cut />
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
                <ul className="cmp-legend">{all.map((c, s) => empty[s] ? null : <li key={c.id + s}><i className={`cmp-key s${s + 1}`} aria-hidden="true" />{c.name}</li>)}</ul>
                {all.map((c, s) => empty[s] ? <p key={`none-${c.id}${s}`} className="cmp-nogames"><i className={`cmp-key s${s + 1}`} aria-hidden="true" />{noneLine(c.name, recent.rows[s], weeks)}</p> : null)}
                {recent.loading ? <div className="cmp-skel" aria-hidden="true" /> : <RecentChart names={all.map((c) => c.name)} weeks={weeks} rows={series} why={reasons} hide={empty} />}
                <div className="cmp-table" role="table" aria-label="Fantasy points by week">
                  <div role="row" className="cmp-tr cmp-th" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${weeks.length}, 2.9em)` }}>
                    <span role="columnheader">Player</span>{weeks.map((wk) => <span key={wk} role="columnheader">W{wk}</span>)}
                  </div>
                  {all.map((c, s) => (
                    <div key={c.id + s} role="row" className="cmp-tr" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${weeks.length}, 2.9em)` }}>
                      <span role="rowheader"><i className={`cmp-key s${s + 1}`} aria-hidden="true" />{c.name}</span>
                      {series[s].map((v, i) => {
                        const y = reasons[s][i];
                        if (typeof v === "number") return <span key={weeks[i]} role="cell">{v.toFixed(1)}</span>;
                        if (!y) return <span key={weeks[i]} role="cell" className="cmp-gap" aria-label={recent.loading ? "Loading" : "No data"}>{recent.loading ? "" : "–"}</span>;
                        return (
                          <span key={weeks[i]} role="cell" className="cmp-gap">
                            <Tooltip focusable content={<><b>{c.name}: {y.word}</b><br />{y.detail}</>}>
                              <span className={`miss-tag k-${y.kind}`} aria-label={`${y.word}. ${y.detail}`}>{y.label}</span>
                            </Tooltip>
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <p className="cmp-src">{isDemo() ? "Sample points from the demo league, the same ones each player's game log shows." : "Points from Sleeper's weekly stats, scored with your league's settings, the same ones each player's game log shows."}
                  {used.size > 0 && <> {[...used.values()].map((y) => `${y.label} ${KEY[y.kind]}`).join(", ")}. Hover or press a label for the detail.</>}</p>
              </>}
          </section>
        </div>
      )}
    </DetailSheet>
  );
}

/**
 * The Compare button in an open swap card's header row. Its own tap never toggles the row (Lineup's row only takes
 * keys aimed at itself, so Enter and Escape on the button pass through as usual). Labeled ("Compare") under
 * the player's info on phones and beside the points on desktop; on a tablet, where the lineup column is too narrow for
 * the label beside the points, a 40px round icon button there (Lucide columns-2) with a tip. swap-card.css picks.
 * data-tip is the tip's text; it only shows while the label is hidden (tooltips.ts).
 */
export function CompareBtn({ name, onOpen }: { name: string; onOpen: (el: Element) => void }) {
  return (
    <button type="button" className="btn btn-sm sw-cmp" aria-label={`Compare ${name} with the swap list`} data-tip="Compare with the swap list"
      onClick={(e) => { e.stopPropagation(); onOpen(e.currentTarget); }}>
      <span className="sw-cmp-ic" aria-hidden="true"><Icon name="columns2" size={16} /></span>
      <span className="sw-cmp-ic2" aria-hidden="true"><Icon name="columns2" size={24} /></span>
      <span className="sw-cmp-t">Compare</span>
    </button>
  );
}
