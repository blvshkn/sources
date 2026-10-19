import { useMemo, useState } from "react";
import { LEAGUE, WEEK, playerById } from "../data";
import { TeamNeeds, eff } from "../engine";
import { Icon, PosBadge, StatusPill } from "./ui";
import { Avatar } from "./Avatar";
import { TeamAvatar } from "./TeamPicker";
import { Trophy, championLabel } from "./Trophy";
import { Tooltip } from "./Tooltip";

const POS = ["QB", "RB", "WR", "TE"] as const;
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const pctText = (p: number) => (p >= 0.995 ? ">99%" : p > 0 && p < 0.01 ? "<1%" : `${Math.round(p * 100)}%`);
const tone = (p: number) => (p >= 0.7 ? "good" : p >= 0.4 ? "warn" : "bad");

/** Wins from a "W-L" or "W-L-T" record. */
export const winsOf = (record: string) => Number(record.split("-")[0]) || 0;
/** Standings order: wins, then points for. Shared by the table, the side panel and League Needs. */
export const byStandings = (a: { record: string; pf: number }, b: { record: string; pf: number }) => winsOf(b.record) - winsOf(a.record) || b.pf - a.pf;

/** Small seeded RNG so the odds don't jump around between renders. */
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Playoff odds by simulation. Each remaining regular-season week, teams are paired at random and score
 * around their projected weekly total. Seeds go by wins, then points for.
 */
function simulate(needs: TeamNeeds[], weeksLeft: number, spots: number, runs = 3000) {
  const n = needs.length;
  const rec = needs.map((x) => { const [w = 0, l = 0, t = 0] = x.team.record.split("-").map(Number); return { w: w + t / 2, l }; });
  const playoff = new Array(n).fill(0), top = new Array(n).fill(0);
  const rand = rng(n * 7919 + weeksLeft * 104729 + Math.round(needs.reduce((a, x) => a + x.lineup.total, 0)));
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
  for (let r = 0; r < runs; r++) {
    const wins = rec.map((x) => x.w), pf = needs.map((x) => x.team.pf);
    for (let wk = 0; wk < weeksLeft; wk++) {
      const order = [...Array(n).keys()].sort(() => rand() - 0.5);
      for (let i = 0; i + 1 < n; i += 2) {
        const a = order[i], b = order[i + 1];
        const sa = needs[a].lineup.total + gauss() * 22, sb = needs[b].lineup.total + gauss() * 22;
        pf[a] += sa; pf[b] += sb; wins[sa >= sb ? a : b] += 1;
      }
    }
    const seeds = [...Array(n).keys()].sort((a, b) => wins[b] - wins[a] || pf[b] - pf[a]);
    seeds.slice(0, spots).forEach((i) => (playoff[i] += 1));
    top[seeds[0]] += 1;
  }
  return needs.map((_, i) => ({ playoff: playoff[i] / runs, top: top[i] / runs }));
}

export function Standings({ needs }: { needs: TeamNeeds[] }) {
  const spots = LEAGUE.playoffTeams ?? 6;
  const start = LEAGUE.playoffStart ?? 15;
  const weeksLeft = Math.max(0, start - WEEK);
  const odds = useMemo(() => simulate(needs, weeksLeft, spots), [needs, weeksLeft, spots]);

  const rows = needs.map((x, i) => {
    const [w = 0, l = 0] = x.team.record.split("-").map(Number);
    return { x, w, l, ...odds[i], proj: x.team.pf + x.lineup.total * weeksLeft };
  }).sort((a, b) => byStandings(a.x.team, b.x.team));

  // Strongest and weakest starting position for each team, ranked against the league
  const rankOf = (pos: typeof POS[number], id: string) =>
    [...needs].sort((a, b) => b.groups[pos].pts - a.groups[pos].pts).findIndex((n) => n.team.id === id) + 1;
  const posRows = needs.map((x) => {
    const byDiff = [...POS].sort((a, b) => x.groups[b].diff - x.groups[a].diff);
    return { x, best: byDiff[0], worst: byDiff[byDiff.length - 1] };
  });

  // Depth: every rostered player at the position, starters and bench
  const depthPts = (x: TeamNeeds, pos: string) => x.team.roster.map(playerById).filter((p) => p.pos === pos).reduce((a, p) => a + eff(p), 0);
  const avgDepth = Object.fromEntries(POS.map((pos) => [pos, needs.reduce((a, x) => a + depthPts(x, pos), 0) / needs.length]));
  const depthRank = (pos: typeof POS[number], id: string) =>
    [...needs].sort((a, b) => depthPts(b, pos) - depthPts(a, pos)).findIndex((n) => n.team.id === id) + 1;
  const depthRows = needs.map((x) => {
    const byDiff = [...POS].sort((a, b) => (depthPts(x, b) - avgDepth[b]) - (depthPts(x, a) - avgDepth[a]));
    return { x, best: byDiff[0], worst: byDiff[byDiff.length - 1] };
  });
  const [open, setOpenRaw] = useState<string | null>(null);
  const setOpen = (id: string | null) => { setOpenRaw(id); requestAnimationFrame(() => document.querySelector(".page-head")?.scrollIntoView({ block: "start", behavior: "smooth" })); };
  const n = needs.length;
  const rankTone = (r: number) => (r <= Math.ceil(n * 0.3) ? "good" : r <= Math.ceil(n * 0.7) ? "warn" : "bad");

  const Bar = ({ p }: { p: number }) => <span className={`st-bar ${tone(p)}`} aria-hidden="true"><i style={{ width: `${Math.max(3, p * 100)}%` }} /></span>;

  const sel = open ? rows.find((r) => r.x.team.id === open) : null;
  if (sel) {
    const t = sel.x.team;
    const roster = t.roster.map(playerById).sort((a, b) => POS.indexOf(a.pos as typeof POS[number]) - POS.indexOf(b.pos as typeof POS[number]) || eff(b) - eff(a));
    return (
      <section className="card st st-detail" aria-label={`${t.name} details`}>
        <button className="st-back" onClick={() => setOpen(null)}><Icon name="chev" size={16} />Standings</button>
        <header className="st-dhead">
          <TeamAvatar t={t} size={44} />
          <span className="st-who"><b>{t.name}<Trophy teamId={t.id} focusable /></b><small>{sel.w}-{sel.l} · {t.you ? "You" : t.manager}</small></span>
        </header>
        <dl className="ti-stats st-odds">
          <div className="ti-stat"><dt>Make playoffs</dt><dd>{pctText(sel.playoff)}</dd></div>
          <div className="ti-stat"><dt>#1 seed</dt><dd>{pctText(sel.top)}</dd></div>
          <div className="ti-stat"><dt>Proj pts</dt><dd>{Math.round(sel.proj)}</dd></div>
        </dl>
        <div className="st-eval">
          <h3>Positional ranks</h3>
          <div className="st-grid" role="table" aria-label="Position ranks">
            <span role="columnheader" />
            {POS.map((pos) => <span key={pos} role="columnheader"><PosBadge pos={pos} /></span>)}
            <span className="st-gl" role="rowheader">Starters</span>
            {POS.map((pos) => { const r = rankOf(pos, t.id); return <span key={pos} className={`st-rk ${rankTone(r)}`} role="cell">{ord(r)}<i /></span>; })}
            <span className="st-gl" role="rowheader">Depth</span>
            {POS.map((pos) => { const r = depthRank(pos, t.id); return <span key={pos} className={`st-rk ${rankTone(r)}`} role="cell">{ord(r)}<i /></span>; })}
          </div>
        </div>
        <div className="st-roster">
          <h3>Roster</h3>
          {roster.map((p) => (
            <div key={p.id} className="st-pl">
              <Avatar p={p} size={34} />
              <span className="st-who"><b>{p.name}</b><small>{p.pos} · {p.nfl} <StatusPill p={p} /></small></span>
              <span className="st-pp">{eff(p).toFixed(1)}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="card st" aria-labelledby="st-title">
        <header className="st-head">
          <h2 className="section-title" id="st-title">Playoff picture</h2>
          <p>Top {spots} make it. {weeksLeft > 0 ? `${weeksLeft} ${weeksLeft === 1 ? "week" : "weeks"} left in the regular season.` : "Regular season is over."} Odds from 3,000 sims of the rest of the season.</p>
        </header>
        <div className="st-table" role="table" aria-label="Standings">
          <div className="st-row st-th st-po" role="row">
            <span role="columnheader"><span className="sr-only">Place</span></span>
            <span role="columnheader">Team</span>
            <span role="columnheader"><Tooltip focusable content={`Chance to finish in the top ${spots}, from 3,000 simulated rest-of-seasons`}><span className="tt-term">Playoff</span></Tooltip></span>
            <span role="columnheader"><Tooltip focusable content="Chance to finish first and get the top seed"><span className="tt-term">#1 seed</span></Tooltip></span>
            <span role="columnheader"><Tooltip focusable content="Points for so far plus projected points through the regular season"><span className="tt-term">Proj pts</span></Tooltip></span>
          </div>
          {rows.map((r, i) => (
            <button key={r.x.team.id} className={`st-row st-po st-tap${r.x.team.you ? " you" : ""}${i === spots - 1 ? " cut" : ""}`} role="row" onClick={() => setOpen(r.x.team.id)} aria-label={`${i + 1}. ${r.x.team.name}${championLabel(r.x.team.id) ? `, ${championLabel(r.x.team.id)}` : ""}, details`}>
              <span className="st-pl-n" role="cell">{i + 1}</span>
              <span className="st-team" role="cell">
                <TeamAvatar t={r.x.team} size={30} />
                <span className="st-who"><b>{r.x.team.name}<Trophy teamId={r.x.team.id} /></b><small>{r.w}-{r.l}{r.x.team.you ? " · You" : ` · ${r.x.team.manager}`}</small></span>
              </span>
              <span className="st-num" role="cell"><b>{pctText(r.playoff)}</b><Bar p={r.playoff} /></span>
              <span className="st-num" role="cell"><b className="lite">{pctText(r.top)}</b><Bar p={r.top} /></span>
              <span className="st-num" role="cell"><b className="lite">{Math.round(r.proj)}</b></span>
            </button>
          ))}
        </div>
        <p className="st-note">The line marks the playoff cut. Projections use each team's current best lineup.</p>
      </section>

      {([["st-pos", "Positions, starters", "Each team's best and worst starting spot, ranked against the league.", posRows, rankOf],
         ["st-dep", "Positions, depth", "Starters and bench together. Who can survive injuries and byes.", depthRows, depthRank]] as const).map(([id, title, sub, list, rk]) => (
        <section key={id} className="card st" aria-labelledby={id}>
          <header className="st-head">
            <h2 className="section-title" id={id}>{title}</h2>
            <p>{sub}</p>
          </header>
          <div className="st-table" role="table" aria-label={title}>
            <div className="st-row st-th st-pos" role="row">
              <span role="columnheader">Team</span>
              <span role="columnheader">Strength</span>
              <span role="columnheader">Weakness</span>
            </div>
            {list.map(({ x, best, worst }) => (
              <button key={x.team.id} className={`st-row st-pos st-tap${x.team.you ? " you" : ""}`} role="row" onClick={() => setOpen(x.team.id)} aria-label={`${x.team.name} details`}>
                <span className="st-team" role="cell"><TeamAvatar t={x.team} size={30} /><span className="st-who"><b>{x.team.name}<Trophy teamId={x.team.id} /></b></span></span>
                <span className="st-rank" role="cell"><PosBadge pos={best} /><small>{ord(rk(best, x.team.id))}</small></span>
                <span className="st-rank" role="cell"><PosBadge pos={worst} /><small>{ord(rk(worst, x.team.id))}</small></span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
