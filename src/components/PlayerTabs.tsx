// Tabs for the player sheet and the waiver claim sheet: the sheet's own view, a game log and the team depth chart.
// The tab row sticks under the sheet's top and keeps its place on a switch; the incoming tab fades in over 160ms with
// no movement (player-hero.css), and so does a list replacing its loading skeleton. The last tab picked is remembered per sheet type for the session.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { teamNick } from "../data";
import { useLive } from "../live";
import { Depth, LogRow, SeasonLog, Stats, Subject, groupOf, loadDepth, loadLog, missWhy, peekDepth, peekLog, seasonsFor } from "../gamelog";
import { Tooltip } from "./Tooltip";
import { PageTabs, type IconName } from "./ui";
import { useBio } from "../playerBio";

// ---- Tab row --------------------------------------------------------------------------
export type SheetTab = "main" | "log" | "depth";
const mem: Record<string, SheetTab> = {};
/** The sheet's tab, remembered per sheet type for this session (sessionStorage, with an in-memory fallback). */
export function useSheetTab(kind: "player" | "waiver", allowed: SheetTab[]): [SheetTab, (t: SheetTab) => void] {
  const [t, setT] = useState<SheetTab>(() => {
    let v: string | null = mem[kind] ?? null;
    try { v = sessionStorage.getItem(`sources.sheetTab.${kind}`) ?? v; } catch { /* storage blocked */ }
    return v && allowed.includes(v as SheetTab) ? (v as SheetTab) : "main";
  });
  const set = (n: SheetTab) => { setT(n); mem[kind] = n; try { sessionStorage.setItem(`sources.sheetTab.${kind}`, n); } catch { /* ignore */ } };
  return [allowed.includes(t) ? t : "main", set];
}
/** The League page's tabs (icon and label pills, no track behind the row), sticky under the sheet's top. */
export function SheetTabs({ value, onChange, options }: { value: SheetTab; onChange: (t: SheetTab) => void; options: { v: SheetTab; label: string; icon?: IconName }[] }) {
  // The slot after the tabs takes the open tab's first line (SheetLead) on tablet and desktop, so the tabs sit at its right
  return <><PageTabs inSheet className="st-tabs" label="Sheet section" value={value} onChange={onChange} options={options} /><div className="st-lead" /></>;
}

const WIDE = "(min-width: 768px)";
/** A tab's first line (Zach, Oct 23). Tablet and desktop: moved up beside the tabs, which sit at the right and go back
 *  above it when the two don't fit on one line. Phones: left in place under the tabs. */
function SheetLead({ children }: { children: ReactNode }) {
  const here = useRef<HTMLSpanElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const mq = window.matchMedia(WIDE);
    const find = () => setSlot(mq.matches ? here.current?.closest(".ps")?.querySelector<HTMLElement>(".ph-stick > .st-lead") ?? null : null);
    find();
    mq.addEventListener("change", find);
    return () => mq.removeEventListener("change", find);
  }, []);
  return slot ? createPortal(children, slot) : <span ref={here} className="st-lead-home">{children}</span>;
}

// ---- Shared bits ------------------------------------------------------------------------
type Load<T> = { state: "loading" } | { state: "ready"; v: T } | { state: "none"; why: string };
const DASH = "–";
const Skel = ({ rows = 6 }: { rows?: number }) => <div className="gl-skel" aria-hidden="true">{Array.from({ length: rows }, (_, i) => <span key={i} />)}</div>;

// ---- Game log -----------------------------------------------------------------------------
type Col = { k: string; label: string; v: (s: Stats) => string; tip?: string };
/** Whole numbers for a game's line; a season average keeps one decimal (4.3 targets a game) */
const n0 = (v: number | undefined) => { const x = v ?? 0; return Number.isInteger(Math.round(x * 10) / 10) ? String(Math.round(x)) : x.toFixed(1); };
/** A ratio with one decimal, "–" when there's nothing to divide by. */
const per = (a: number | undefined, b: number | undefined) => (b ? ((a ?? 0) / b).toFixed(1) : DASH);
/** A stat Sleeper leaves off a played game's line is a zero (it only sends the stats that happened). */
const c = (k: string, label: string, tip?: string): Col => ({ k, label, tip, v: (s) => n0(s[k]) });
const PASS: Col[] = [{ k: "ca", label: "C/A", tip: "Completions / attempts", v: (s) => `${n0(s.pass_cmp)}/${n0(s.pass_att)}` }, c("pass_yd", "YD"), c("pass_td", "TD"), c("pass_int", "INT")];
const RUSH_FULL: Col[] = [c("rush_att", "ATT"), c("rush_yd", "YD"), { k: "rypc", label: "YPC", tip: "Yards per carry", v: (s) => per(s.rush_yd, s.rush_att) }, c("rush_td", "TD")];
const RUSH: Col[] = [c("rush_att", "ATT"), c("rush_yd", "YD"), c("rush_td", "TD")];
const REC: Col[] = [c("rec_tgt", "TAR"), c("rec", "REC"), c("rec_yd", "YD"), { k: "ypt", label: "YPT", tip: "Yards per target", v: (s) => per(s.rec_yd, s.rec_tgt) }, { k: "ypr", label: "YPC", tip: "Yards per catch", v: (s) => per(s.rec_yd, s.rec) }, c("rec_td", "TD")];
const FUM: Col[] = [c("fum", "FUM"), c("fum_lost", "LOST")];
/** Field goals from one distance: made / attempted when the line carries the misses from there, else just made. */
const fgFrom = (b: string, label: string): Col => ({ k: `fg_${b}`, label, tip: `Field goals from ${label} yards, made / attempted`,
  v: (s) => (s[`fgmiss_${b}`] === undefined ? n0(s[`fgm_${b}`]) : `${n0(s[`fgm_${b}`])}/${n0((s[`fgm_${b}`] ?? 0) + (s[`fgmiss_${b}`] ?? 0))}`) });
const KICK: Col[] = [{ k: "fg", label: "FG", tip: "Field goals made / attempted", v: (s) => `${n0(s.fgm)}/${n0(s.fga)}` }, fgFrom("40_49", "40-49"), fgFrom("50p", "50+"), { k: "xp", label: "XP", tip: "Extra points made / attempted", v: (s) => `${n0(s.xpm)}/${n0(s.xpa)}` }];
const DEF: Col[] = [c("pts_allow", "PA", "Points allowed"), c("sack", "SACK"), c("int", "INT"), c("fum_rec", "FR", "Fumbles recovered"), c("def_td", "TD")];
const GROUPS: Record<Subject["pos"], { label: string; cols: Col[] }[]> = {
  QB: [{ label: "Passing", cols: PASS }, { label: "Rushing", cols: RUSH }, { label: "Fumbles", cols: FUM }],
  RB: [{ label: "Rushing", cols: RUSH_FULL }, { label: "Receiving", cols: REC }, { label: "Fumbles", cols: FUM }],
  WR: [{ label: "Receiving", cols: REC }, { label: "Rushing", cols: RUSH }, { label: "Fumbles", cols: FUM }],
  TE: [{ label: "Receiving", cols: REC }, { label: "Rushing", cols: RUSH }, { label: "Fumbles", cols: FUM }],
  K: [{ label: "Kicking", cols: KICK }],
  DEF: [{ label: "Defense", cols: DEF }],
};
const oppLabel = (o: string | null) => (o ? o.replace(/^(v|@)\s*/, "") : DASH);
const away = (o: string | null) => !!o && o.startsWith("@");

/** Seasons shown before "More" */
const FIRST_YEARS = 6;
export function GameLogTab({ s }: { s: Subject }) {
  // Back to his rookie season (years in the league from his bio), each one loaded when picked and cached
  const bio = useBio(s);
  const seasons = seasonsFor(s.pos === "DEF" ? 5 : bio === "loading" ? undefined : bio.exp);
  const [season, setSeason] = useState(seasons[0]);
  const [allYears, setAllYears] = useState(false);
  const shownYears = allYears || seasons.length <= FIRST_YEARS + 1 ? seasons : seasons.slice(0, FIRST_YEARS);
  // A season picked from behind "More" keeps its pill visible
  const years = shownYears.includes(season) ? shownYears : [...shownYears, season];
  const [log, setLog] = useState<Load<SeasonLog>>(() => { const v = peekLog(s, seasons[0]); return v ? { state: "ready", v } : { state: "loading" }; });
  useEffect(() => {
    let on = true;
    const ready = peekLog(s, season);
    setLog(ready ? { state: "ready", v: ready } : { state: "loading" });
    if (!ready) loadLog(s, season).then((v) => on && setLog({ state: "ready", v }), () => on && setLog({ state: "none", why: "Couldn't load stats from Sleeper. Try again in a minute." }));
    return () => { on = false; };
  }, [s.id, season]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = useLive();
  const groups = GROUPS[s.pos];
  const skill = s.pos !== "K" && s.pos !== "DEF";
  const lead = skill ? 2 : 1; // PROJ, plus SNP% for skill players
  const span = lead + groups.reduce((a, g) => a + g.cols.length, 0);

  const played = log.state === "ready" ? log.v.rows.filter((r) => r.pts !== undefined && r.when === "past") : [];
  const avg = played.length ? played.reduce((a, r) => a + (r.pts ?? 0), 0) / played.length : null;
  const best = played.length ? Math.max(...played.map((r) => r.pts ?? 0)) : null;
  const beat = played.filter((r) => r.proj !== undefined && (r.pts ?? 0) >= r.proj).length;
  const withProj = played.filter((r) => r.proj !== undefined).length;

  // The season's Total and Avg rows under the weeks (Zach, Oct 23): every stat summed over the games he played, and
  // per game. Ratios (YPC, YPT) come from the summed stats, so they're the season's true rate.
  const lines = played.filter((r) => r.stats);
  const totals: Stats = {};
  for (const r of lines) for (const [k, v] of Object.entries(r.stats!)) if (typeof v === "number") totals[k] = (totals[k] ?? 0) + v;
  const avgs: Stats = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, (v ?? 0) / Math.max(1, lines.length)]));
  const projSum = lines.reduce((a, r) => a + (r.proj ?? 0), 0), projN = lines.filter((r) => r.proj !== undefined).length;
  const ptsSum = lines.reduce((a, r) => a + (r.pts ?? 0), 0);
  const snapAll = totals.off_snp !== undefined && totals.tm_off_snp ? `${Math.round((totals.off_snp / totals.tm_off_snp) * 100)}%` : DASH;
  const sumRow = (kind: "Total" | "Avg") => {
    const st = kind === "Total" ? totals : avgs, k = kind === "Total" ? 1 : 1 / Math.max(1, lines.length);
    return (
      <tr key={kind} className={`gl-sumrow gl-${kind.toLowerCase()}`}>
        <th scope="row" className="gl-s gl-wk" colSpan={2}>{kind}</th>
        <td className="gl-s gl-pts">{(ptsSum * k).toFixed(1)}</td>
        <td className="gl-proj">{projN ? (kind === "Total" ? projSum : projSum / projN).toFixed(1) : DASH}</td>
        {skill && <td>{snapAll}</td>}
        {groups.map((g) => g.cols.map((col, i) => <td key={`${g.label}${col.k}`} className={i === 0 ? "gl-g0" : undefined}>{col.v(st)}</td>))}
      </tr>
    );
  };

  const row = (r: LogRow) => {
    // This week: points so far once his game is on (the live feed), otherwise just the projection
    const st = live?.games[s.nfl];
    const nowPts = r.when === "now" && (st === "in_game" || st === "complete") ? live?.points[s.id] : undefined;
    const pts = r.when === "now" ? nowPts : r.pts;
    const tone = pts !== undefined && r.proj !== undefined && r.when === "past"
      ? (pts - r.proj >= Math.max(3, r.proj * 0.2) ? " good" : r.proj - pts >= Math.max(3, r.proj * 0.2) ? " bad" : "") : "";
    // A played week he has no points for says why, with the same label and detail Compare shows
    const why = r.when === "past" && pts === undefined ? missWhy(r, log.state === "ready" ? log.v.team : s.nfl) : null;
    const snap = r.stats && r.stats.off_snp !== undefined && r.stats.tm_off_snp ? `${Math.round((r.stats.off_snp / r.stats.tm_off_snp) * 100)}%` : DASH;
    const head = (
      <>
        <th scope="row" className="gl-s gl-wk">{r.week}{r.when === "now" && <i className="gl-now" aria-label=", this week" />}</th>
        <td className={`gl-s gl-opp${r.bye ? " bye" : ""}`}>{r.bye ? "BYE" : <>{away(r.opp) && <span className="gl-at">@</span>}{oppLabel(r.opp)}</>}</td>
        <td className={`gl-s gl-pts${tone}`}>{r.bye ? "" : pts !== undefined ? pts.toFixed(1) : why ? <Tooltip focusable content={why.detail}><span className={`miss-tag k-${why.kind}`} aria-label={`${why.word}. ${why.detail}`}>{why.label}</span></Tooltip> : r.when === "past" ? DASH : ""}</td>
      </>
    );
    if (r.bye) return <tr key={r.week} className="gl-bye">{head}<td colSpan={span} className="gl-rest">Bye week</td></tr>;
    if (r.when !== "past" || !r.stats) return (
      <tr key={r.week} className={r.when === "now" ? "gl-cur" : r.when === "future" ? "gl-fut" : "gl-miss"}>
        {head}
        <td className="gl-proj">{r.proj !== undefined ? r.proj.toFixed(1) : DASH}</td>
        <td colSpan={span - 1} className="gl-rest">{r.when === "now" ? (nowPts !== undefined ? (st === "complete" ? "Final" : "Live") : "This week") : r.when === "past" ? (r.missNote ?? why?.word ?? "Did not play") : ""}</td>
      </tr>
    );
    return (
      <tr key={r.week}>
        {head}
        <td className="gl-proj">{r.proj !== undefined ? r.proj.toFixed(1) : DASH}</td>
        {skill && <td>{snap}</td>}
        {groups.map((g) => g.cols.map((col, i) => <td key={`${g.label}${col.k}`} className={i === 0 ? "gl-g0" : undefined}>{col.v(r.stats!)}</td>))}
      </tr>
    );
  };

  return (
    <section className="gl" aria-label="Game log" aria-busy={log.state === "loading"}>
      <div className="gl-bar">
        {/* The season's numbers first, then the season pills (Zach); while it loads the row holds its place */}
        <SheetLead>
        {log.state === "loading" ? (
          <dl className="gl-sum" aria-hidden="true">
            {["Games", "Avg", "Best", "Beat proj"].map((k) => <div key={k}><dt>{k}</dt><dd className="sk-text">00.0</dd></div>)}
          </dl>
        ) : null}
        {log.state === "ready" && played.length > 0 && (
          <dl className="gl-sum">
            <div><dt>Games</dt><dd>{played.length}</dd></div>
            <div><dt>Avg</dt><dd>{avg!.toFixed(1)}</dd></div>
            <div><dt>Best</dt><dd>{best!.toFixed(1)}</dd></div>
            {withProj > 0 && <div><dt>Beat proj</dt><dd>{beat}/{withProj}</dd></div>}
          </dl>
        )}
        </SheetLead>
        <div className="page-tabs gl-years">
          <div className="seg" role="group" aria-label="Season">
            {years.map((y) => <button key={y} aria-pressed={season === y} onClick={() => setSeason(y)}>{y}</button>)}
            {years.length < seasons.length && <button className="gl-more" aria-pressed={false} onClick={() => setAllYears(true)} aria-label={`More seasons, back to ${seasons[seasons.length - 1]}`}>More</button>}
          </div>
        </div>
      </div>
      {log.state === "loading" ? <Skel rows={8} />
        : log.state === "none" ? <p className="ps-none">{log.why}</p>
        : log.v.empty || !log.v.rows.length ? <p className="ps-none">{log.v.empty ?? `No ${season} games on record yet.`}</p>
        : (
          <>
            <div className="gl-scroll" tabIndex={0} role="region" aria-label={`${s.name} ${season} game log, scrolls sideways`}>
              <table className="gl-tbl">
                <thead>
                  <tr className="gl-grp">
                    <th colSpan={3} className="gl-s gl-s3" aria-hidden="true" />
                    <th colSpan={lead} aria-hidden="true" />
                    {groups.map((g) => <th key={g.label} colSpan={g.cols.length} scope="colgroup" className="gl-g0">{g.label}</th>)}
                  </tr>
                  <tr>
                    <th scope="col" className="gl-s gl-wk">WK</th>
                    <th scope="col" className="gl-s gl-opp">OPP</th>
                    <th scope="col" className="gl-s gl-pts">FPTS</th>
                    <th scope="col" className="gl-proj">PROJ</th>
                    {skill && <th scope="col"><abbr title="Share of his team's offensive snaps">SNP%</abbr></th>}
                    {groups.map((g) => <Fragment key={g.label}>{g.cols.map((col, i) => <th key={col.k} scope="col" className={i === 0 ? "gl-g0" : undefined}>{col.tip ? <abbr title={col.tip}>{col.label}</abbr> : col.label}</th>)}</Fragment>)}
                  </tr>
                </thead>
                <tbody>{log.v.rows.map(row)}</tbody>
                {lines.length > 1 && <tfoot>{sumRow("Total")}{sumRow("Avg")}</tfoot>}
              </table>
            </div>
            <p className="pd-fine">
              {log.v.demo ? "Demo league stats, made up for the sample season. " : `From Sleeper's weekly stats and projections${log.v.team && log.v.team !== s.nfl ? ` (with ${log.v.team} that season)` : ""}, scored with your league's settings. `}
              {withProj > 0 ? "FPTS is green when he beat his projection by 20% or more, red when he missed it by 20%." : ""}
            </p>
          </>
        )}
    </section>
  );
}

// ---- Depth chart -------------------------------------------------------------------------
const INJ: Record<string, { cls: "Q" | "O"; word: string }> = {
  Questionable: { cls: "Q", word: "Questionable" }, Doubtful: { cls: "O", word: "Doubtful" }, Out: { cls: "O", word: "Out" },
  IR: { cls: "O", word: "IR" }, PUP: { cls: "O", word: "PUP" }, Sus: { cls: "O", word: "Suspended" }, NA: { cls: "O", word: "Out" },
};
export function DepthTab({ s, onOpen }: { s: Subject; onOpen?: (id: string) => void }) {
  const [d, setD] = useState<Load<Depth>>(() => { const v = peekDepth(s.nfl); return v ? { state: "ready", v } : { state: "loading" }; });
  useEffect(() => {
    let on = true;
    if (!peekDepth(s.nfl)) {
      setD({ state: "loading" });
      loadDepth(s.nfl).then((v) => on && setD({ state: "ready", v }), () => on && setD({ state: "none", why: "Couldn't load the depth chart from Sleeper. Try again in a minute." }));
    } else setD({ state: "ready", v: peekDepth(s.nfl)! });
    return () => { on = false; };
  }, [s.nfl]);
  const mineKey = d.state === "ready" ? groupOf(d.v, s.id) : undefined;
  return (
    <section className="dc" aria-label="Depth chart" aria-busy={d.state === "loading"}>
      <div className="ps-sub"><b>{teamNick(s.nfl).replace(/^the /, "")} depth chart</b><span>{s.nfl}</span></div>
      {d.state === "loading" ? <Skel rows={7} />
        : d.state === "none" ? <p className="ps-none">{d.why}</p>
        : !d.v.groups.length ? <p className="ps-none">Sleeper has no depth chart for {s.nfl} right now.</p>
        : (
          <>
            <dl className="dc-list">
              {d.v.groups.map((g) => (
                <div key={g.key} className={`dc-g${g.key === mineKey ? " his" : ""}`}>
                  <dt>{g.label}</dt>
                  <dd>
                    {!g.entries.length ? <p className="dc-none">No one at {g.label} in the demo league</p> : <ol>
                      {g.entries.map((e, i) => {
                        const inj = e.injury ? INJ[e.injury] : undefined;
                        const me = e.id === s.id;
                        const name: ReactNode = onOpen && e.tappable && !me
                          ? <button className="dc-n" onClick={() => onOpen(e.id)}>{e.name}</button>
                          : <span className="dc-n">{e.name}</span>;
                        return (
                          <li key={e.id} className={me ? "me" : undefined} aria-current={me || undefined}>
                            <span className="dc-o">{i + 1}</span>
                            {name}
                            {inj && <span className={`status status-${inj.cls}`}>{inj.word}</span>}
                            {e.owner && <span className={`dc-tag${e.owner.you ? " you" : ""}`}>{e.owner.label}</span>}
                          </li>
                        );
                      })}
                    </ol>}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="pd-fine">{d.v.demo ? "Demo depth chart, built from the demo league's players." : `From Sleeper's depth chart for ${s.nfl}. Teams shuffle it during the week, so check again before lock.`}</p>
          </>
        )}
    </section>
  );
}
