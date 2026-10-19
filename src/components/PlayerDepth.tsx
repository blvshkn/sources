// The player sheet's decision blocks: this week's outcome range, the lineup call, recent usage and the matchup,
// plus the trimmed news row. Everything is computed from league data the app already has; the words are ours.
import { useEffect, useState } from "react";
import { LEAGUE, Player, Pos, SLEEPER_SET, TEAMS, Team, WEEK, YOU, gameState, onBye, teamNick } from "../data";
import { Lineup, eff, fits, lineupFor, round1, sleeperDiff, type SlotName } from "../engine";
import { SWING } from "../live";
import { NewsItem, byNewest, sourcesLine, usePlayerNews } from "../news";
import { seasonFor } from "../schedule";
import { Defense, Usage, defenseVs, loadPosWeeks, oppTeam, usageFor } from "../usage";
import { StoryCard } from "./News";
import { Tooltip } from "./Tooltip";
import { Icon } from "./ui";

// ---- Small helpers ------------------------------------------------------------
const f1 = (n: number) => n.toFixed(1);
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
/** Standard normal CDF (Abramowitz and Stegun, as in live.ts). */
function phi(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x)), n = 0.3989423 * Math.exp(-x * x / 2);
  const tail = n * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - tail : tail;
}
const Term = ({ t, tip }: { t: string; tip: string }) => <Tooltip focusable content={tip}><span className="tt-term">{t}</span></Tooltip>;
const POS_PLURAL: Record<string, string> = { QB: "QBs", RB: "RBs", WR: "WRs", TE: "TEs" };
const dayOf = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }) : "");
const dateOf = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "");
const kicked = (nfl: string) => { const g = gameState(nfl); return g === "in_game" || g === "complete"; };

// ---- Status line ---------------------------------------------------------------
const STATUS_WORDS = /^(Questionable|Doubtful|Out|IR|PUP|Sus|NA|DNR|COV)\b,?\s*/i;
/** One clean injury line: "Questionable (back)", "Questionable, injury not disclosed", "Out (knee) indefinitely". */
export function statusLine(p: Player): string | null {
  if (!p.status && !p.injury && !p.note) return null;
  const raw = p.injury && /^(Questionable|Doubtful|Out)$/i.test(p.injury) ? p.injury : null;
  const word = p.injury === "IR" ? "On IR" : p.injury === "PUP" ? "On the PUP list" : p.injury === "Sus" ? "Suspended" : p.injury === "NA" ? "Not with the team"
    : raw ? raw[0].toUpperCase() + raw.slice(1).toLowerCase() : p.status === "O" ? "Out" : p.status === "Q" ? "Questionable" : "";
  const rest = (p.note ?? "").replace(STATUS_WORDS, "").trim();
  const [partRaw, ...more] = rest.split(/,\s*/);
  const part = partRaw && !/^(undisclosed|unknown|n\/a|na|none)$/i.test(partRaw) ? (/^[A-Z][a-z]/.test(partRaw) ? partRaw.toLowerCase() : partRaw) : "";
  const extra = more.join(", ");
  if (!word) return rest || null;
  const head = part ? `${word} (${part})` : `${word}, injury not disclosed`;
  if (!extra) return head;
  // "Out (knee) indefinitely" rather than "Out (knee), out indefinitely"
  const lead = new RegExp(`^${word.split(" ").pop()}\\s+`, "i");
  return lead.test(extra) ? `${head} ${extra.replace(lead, "")}` : `${head}, ${extra}`;
}

// ---- Game log ------------------------------------------------------------------
export interface LogGame { w: number; pts: number; started: boolean }
/** His weekly points: your matchups when he was on your team, otherwise every league matchup Sleeper has on record
 *  (or the demo season). Bench weeks are only marked when we know your lineup. */
export function gameLog(p: Player): { games: LogGame[]; yours: boolean } {
  const h = LEAGUE.history ?? {};
  const mine = Object.keys(h).map(Number).filter((w) => w < WEEK).sort((a, b) => a - b)
    .map((w) => ({ w, pts: h[w].points[p.id], started: h[w].starters.includes(p.id) }))
    .filter((x): x is LogGame => typeof x.pts === "number");
  if (mine.length) return { games: mine, yours: true };
  const games = seasonFor(p).filter((c) => c.past && c.pts !== undefined).map((c) => ({ w: c.week, pts: c.pts!, started: true }));
  return { games, yours: false };
}

// ---- Outcome range ---------------------------------------------------------------
export interface Outcome { proj: number; floor: number; ceiling: number; sigma: number; widened: boolean; chance: (x: number) => number }
/** This week's spread. The app's swing model (SWING in live.ts: how much a score moves, as a share of the projection,
 *  by position) sets the width; a player whose own weeks have swung harder gets a wider range. Scores skew right, so
 *  the spread is log-normal around the projection: the projection is the median, floor and ceiling are the 20th and
 *  80th percentiles. */
export function outcomeFor(p: Player, log: number[]): Outcome | null {
  const proj = eff(p, true);
  if (!proj) return null;
  let cv = SWING[p.pos] ?? 0.85, widened = false;
  if (log.length >= 4) {
    const m = log.reduce((a, b) => a + b, 0) / log.length;
    const sd = Math.sqrt(log.reduce((a, b) => a + (b - m) ** 2, 0) / (log.length - 1));
    if (m > 0 && sd / m > cv) { cv = (cv + sd / m) / 2; widened = true; }
  }
  const sigma = Math.sqrt(Math.log(1 + cv * cv));
  const q = (z: number) => round1(proj * Math.exp(z * sigma));
  return { proj, floor: q(-0.8416), ceiling: q(0.8416), sigma, widened, chance: (x: number) => 1 - phi(Math.log(x / proj) / sigma) };
}
/** Chance A outscores B, treating each as his own spread (differences of log-normals, approximated as normal). */
function beats(a: Player, b: Player) {
  const pa = eff(a, true), pb = eff(b, true);
  if (!pa) return 0; if (!pb) return 1;
  const va = ((SWING[a.pos] ?? 0.85) * pa) ** 2, vb = ((SWING[b.pos] ?? 0.85) * pb) ** 2;
  return phi((pa - pb) / Math.sqrt(va + vb));
}
const THRESH: Record<Pos, number[]> = { QB: [15, 20, 25], RB: [10, 15, 20], WR: [10, 15, 20], TE: [8, 12, 16] };

export function OutcomeRange({ p, o }: { p: Player; o: Outcome }) {
  const max = Math.max(o.ceiling * 1.18, THRESH[p.pos][2] * 1.05);
  const at = (v: number) => `${Math.min(100, (v / max) * 100).toFixed(2)}%`;
  const odds = THRESH[p.pos].map((t) => ({ t, c: Math.round(o.chance(t) * 100) }));
  // Lead with the line closest to a coin flip; that's the one that tells you something
  const lead = [...odds].sort((a, b) => Math.abs(a.c - 50) - Math.abs(b.c - 50))[0];
  return (
    <div className="pd-range" aria-label={`Projection range: floor ${f1(o.floor)}, median ${f1(o.proj)}, ceiling ${f1(o.ceiling)}`}>
      <div className="pd-range-nums">
        <span><Term t="Floor" tip="His 20th percentile. About 1 week in 5 he scores less than this." /><b>{f1(o.floor)}</b></span>
        <span className="mid"><Term t="Median" tip="His projection this week. Half the time he beats it, half the time he doesn't." /><b>{f1(o.proj)}</b></span>
        <span><Term t="Ceiling" tip="His 80th percentile. About 1 week in 5 he scores more than this." /><b>{f1(o.ceiling)}</b></span>
      </div>
      <div className="pd-range-bar" aria-hidden="true">
        <i className="band" style={{ left: at(o.floor), width: `calc(${at(o.ceiling)} - ${at(o.floor)})` }} />
        <i className="med" style={{ left: at(o.proj) }} />
        {odds.map((x) => <i key={x.t} className="tick" style={{ left: at(x.t) }} data-t={x.t} />)}
      </div>
      <div className="pd-odds">
        <span className="pd-k">Chance of scoring</span>
        {odds.map((x) => <span key={x.t} className={`pd-odd${x.t === lead.t ? " lead" : ""}`} aria-label={`${x.c}% chance of ${x.t} or more points`}>{x.t}+ <b>{x.c}%</b></span>)}
      </div>
      <p className="pd-fine">
        Projection range, not a guarantee. <Tooltip focusable content={`Width comes from how much ${POS_PLURAL[p.pos]} swing week to week in Sleeper's matchups${o.widened ? ", widened because his own weeks have swung more than that" : ""}. Scores skew high, so the ceiling sits further from the median than the floor.`}><span className="tt-term">How it's built</span></Tooltip>
      </p>
    </div>
  );
}

// ---- Lineup call -------------------------------------------------------------------
const allOf = (t: Team) => [...t.roster, ...(t.ir ?? []), ...(t.taxi ?? [])];
const slotNames = (lu: Lineup) => {
  const counts: Record<string, number> = {}, totals: Record<string, number> = {};
  lu.slots.forEach((s) => (totals[s.slot] = (totals[s.slot] ?? 0) + 1));
  return lu.slots.map((s) => { counts[s.slot] = (counts[s.slot] ?? 0) + 1; return s.slot === "SF" ? "SUPERFLEX" : totals[s.slot] > 1 && s.slot !== "FLEX" ? `${s.slot}${counts[s.slot]}` : s.slot; });
};
type Tone = "good" | "bad" | "warn" | "info";
interface Call { tone: Tone; head: string; line: string; slot?: string; alts: { p: Player; tag?: string }[]; changes: string[]; owner: "you" | "them" | "fa" | "ir" }

export function lineupCall(p: Player): Call {
  const owner = TEAMS.find((t) => allOf(t).includes(p.id));
  const yours = owner?.id === YOU.id;
  const onIr = !!owner && ((owner.ir ?? []).includes(p.id) || (owner.taxi ?? []).includes(p.id));
  const pool = owner && !onIr ? owner.roster : [...YOU.roster, p.id];
  const lu = lineupFor(pool, true);
  const names = slotNames(lu);
  const idx = lu.slots.findIndex((s) => s.player?.id === p.id);
  const me = eff(p, true);
  const who = yours || !owner || onIr ? "you" : owner.manager;
  const changes: string[] = [];
  const ok = (x: Player) => eff(x, true) > 0;

  // Which slot we're talking about: his own, or the one he'd most likely take
  let slot: SlotName | undefined = idx >= 0 ? lu.slots[idx].slot : undefined;
  let slotName = idx >= 0 ? names[idx] : undefined;
  const weakest = lu.slots.map((s, i) => ({ ...s, name: names[i] }))
    .filter((s): s is { slot: SlotName; player: Player; name: string } => !!s.player && s.player.id !== p.id && fits(s.slot, p.pos))
    .sort((a, b) => eff(a.player, true) - eff(b.player, true))[0];
  if (!slot && weakest) { slot = weakest.slot; slotName = weakest.name; }
  const benchFits = slot ? lu.bench.filter((b) => b.id !== p.id && fits(slot!, b.pos)) : [];
  const nextUp = benchFits.filter(ok).sort((a, b) => eff(b, true) - eff(a, true))[0];

  // Ranked options at that slot: him, the bench players who could fill it, and the starter he'd have to pass
  const alts = [p, ...benchFits, ...(idx < 0 && weakest ? [weakest.player] : [])]
    .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
    .sort((a, b) => eff(b, true) - eff(a, true)).slice(0, 5)
    .map((x) => ({ p: x, tag: x.id === p.id ? "This player" : idx < 0 && weakest && x.id === weakest.player.id ? "Starting" : undefined }));

  let call: Omit<Call, "alts" | "changes" | "owner">;
  const slotLabel = slotName === "FLEX" ? "FLEX" : slotName ?? p.pos;
  if (onIr || !owner) {
    const tag = onIr ? "On your IR. " : "";
    if (onIr && (p.status === "O" || p.injury === "IR")) call = { tone: "info", head: "Not available", line: `${tag}He can't go in your lineup until he's activated.` };
    else if (idx >= 0) {
      // The starter he'd push out of your current lineup
      const bumped = lu.bench.find((b) => lineupFor(YOU.roster, true).slots.some((s) => s.player?.id === b.id));
      call = { tone: "good", head: `Would start for you at ${slotLabel}`, slot: slotLabel, line: `${tag}He projects ${f1(me)}${bumped ? `, ahead of ${bumped.name} at ${f1(eff(bumped, true))}` : ""}.` };
    } else call = { tone: "info", head: "Wouldn't start for you", slot: slotLabel, line: weakest ? `${tag}${weakest.player.name} holds ${slotLabel} at ${f1(eff(weakest.player, true))}. He projects ${f1(me)}, ${f1(eff(weakest.player, true) - me)} short.` : `${tag}No open slot fits a ${p.pos}.` };
  } else if (onBye(p.nfl) || !me) {
    const why = onBye(p.nfl) ? "He's on bye" : p.status === "O" ? "He's out this week" : "He isn't projected to play";
    const set = yours && Object.values(SLEEPER_SET).flat().includes(p.id);
    // The best lineup's replacement for him, from the same start/sit diff the Lineup page shows
    const swap = set ? sleeperDiff(lu).find((d) => d.benched?.id === p.id) : undefined;
    const inFor = swap?.start ?? nextUp;
    call = { tone: set ? "bad" : "info", head: set ? "Take him out of your lineup" : "Sits this week", slot: swap?.slot ?? slotLabel,
      line: `${why}.${set && inFor ? ` Start ${inFor.name} (${f1(eff(inFor, true))}) in his ${swap?.slot ?? slotLabel} spot before lock.` : set ? " Sleeper still has him in your lineup." : nextUp ? ` ${nextUp.name} is next up at ${slotLabel} (${f1(eff(nextUp, true))}).` : ""}` };
  } else if (yours) {
    const diff = sleeperDiff(lu);
    const benchMe = diff.find((d) => d.benched?.id === p.id), startMe = diff.find((d) => d.start.id === p.id);
    if (benchMe) call = { tone: "bad", head: `Swap him out for ${benchMe.start.name}`, slot: benchMe.slot, line: `${benchMe.start.name} projects ${f1(eff(benchMe.start, true))} to his ${f1(me)}. That's ${f1(benchMe.gain)} points you'd leave on the bench. Make the swap in Sleeper.` };
    else if (startMe) {
      const b = startMe.benched, bz = eff(b, true) === 0;
      const why = onBye(b.nfl) ? "is on bye" : b.status === "O" ? "is out" : bz ? "isn't projected to play" : "";
      call = { tone: "good", head: `Start him over ${b.name}`, slot: slotLabel, line: why
        ? `${b.name} ${why} but is still in your ${startMe.slot} slot in Sleeper. He projects ${f1(me)}. Make the swap before lock.`
        : `Sleeper has ${b.name} in at ${startMe.slot} (${f1(eff(b, true))}). He projects ${f1(me)}, ${f1(startMe.gain)} more. Make the swap in Sleeper.` };
    }
    else if (idx >= 0) {
      const over = nextUp;
      const gap = over ? me - eff(over, true) : 0;
      call = { tone: over && gap < 1.5 ? "warn" : "good", head: `Starts at ${slotLabel}`, slot: slotLabel,
        line: over ? `Over ${over.name}, ${f1(me)} to ${f1(eff(over, true))}${gap < 1.5 ? ". A close call" : ""}. He outscores ${over.name.split(" ").slice(-1)[0]} about ${Math.round(beats(p, over) * 100)}% of the time.` : `No one on your bench can fill ${slotLabel} this week.` };
    } else call = { tone: "info", head: "Stays on the bench", slot: slotLabel,
      line: weakest ? `${weakest.player.name} holds ${slotLabel} at ${f1(eff(weakest.player, true))}. He projects ${f1(me)}, ${f1(eff(weakest.player, true) - me)} short. He'd outscore him about ${Math.round(beats(p, weakest.player) * 100)}% of the time.` : `No starting slot fits a ${p.pos}.` };
  } else {
    // Someone else's player: read their lineup the same way
    const over = nextUp;
    call = idx >= 0
      ? { tone: "info", head: `${owner.manager} starts him at ${slotLabel}`, slot: slotLabel, line: over ? `Ahead of ${over.name} on their bench: ${f1(me)} vs ${f1(eff(over, true))}.` : `They have no one behind him at ${slotLabel}.` }
      : { tone: "info", head: `On ${owner.manager}'s bench`, slot: slotLabel, line: weakest ? `${weakest.player.name} starts at ${slotLabel} ahead of him, ${f1(eff(weakest.player, true))} to ${f1(me)}.` : "No starting slot fits him." };
  }

  // What would change the call
  if (owner && !onIr && me > 0) {
    // If he can't go: rebuild the lineup without him and see who comes in, and what it costs
    const without = idx >= 0 ? lineupFor(pool.filter((id) => id !== p.id), true) : null;
    const startIds = new Set(lu.slots.map((x) => x.player?.id));
    const fill = without?.slots.map((x) => x.player).find((x): x is Player => !!x && !startIds.has(x.id) && eff(x, true) > 0);
    if (p.status === "Q" && without) {
      const slid = fill && !fits(lu.slots[idx].slot, fill.pos) ? without.slots.find((x, i) => i === idx)?.player : undefined;
      changes.push(fill
        ? `He's questionable. If he's ruled out, ${fill.name} comes into ${who === "you" ? "your" : "their"} lineup${slid && slid.id !== fill.id ? ` and ${slid.name} slides to ${slotLabel}` : ""}. That's ${f1(lu.total - without.total)} fewer projected points.`
        : `He's questionable, and ${who === "you" ? "you have" : "they have"} no healthy fill-in.`);
    }
    if (p.gameDate && !kicked(p.nfl)) {
      const early = fill?.gameDate && fill.gameDate < p.gameDate;
      changes.push(`Plays ${dateOf(p.gameDate)}. Sleeper locks him at kickoff${p.status === "Q" ? "; inactives come out 90 minutes before" : ""}.`);
      if (p.status === "Q" && fill && early) changes.push(`${fill.name} plays first (${dayOf(fill.gameDate)}). If you wait on his status, ${fill.name} will already be locked. Pick a fallback who plays ${dayOf(p.gameDate)} or later.`);
    } else if (kicked(p.nfl)) changes.push("His game has kicked off. Sleeper has locked him in.");
    const nextBye = seasonFor(p).find((c) => !c.past && c.week > WEEK && !c.opp);
    if (nextBye && nextBye.week - WEEK <= 2) changes.push(`Bye in Week ${nextBye.week}.${nextUp ? ` ${nextUp.name} is next up at ${slotLabel}.` : ` ${who === "you" ? "You have" : "They have"} no one else at ${slotLabel}; plan a pickup.`}`);
  }
  return { ...call, alts, changes, owner: onIr ? "ir" : !owner ? "fa" : yours ? "you" : "them" };
}

export function LineupCall({ p }: { p: Player }) {
  const c = lineupCall(p);
  return (
    <section className={`pd-blk pd-call t-${c.tone}`} aria-label="Lineup call">
      <div className="ps-sub"><b>Lineup call</b>{c.slot && <span className="pd-slot">{c.slot}</span>}</div>
      <div className="pd-verdict">
        <i aria-hidden="true"><Icon name={c.tone === "bad" ? "alert" : c.tone === "good" ? "check" : c.tone === "warn" ? "switch" : "helmet"} size={14} /></i>
        <span><b>{c.head}</b><span>{c.line}</span></span>
      </div>
      {c.alts.length > 1 && (
        <div className="pd-alts">
          <span className="pd-k">{c.owner === "them" ? "Their options" : "Your options"}{c.slot ? ` at ${c.slot}` : ""}</span>
          <ol>
            {c.alts.map((a, i) => (
              <li key={a.p.id} className={a.p.id === p.id ? "me" : ""}>
                <span className="pd-rank">{i + 1}</span>
                <span className="pd-alt-n">{a.p.name}<small>{a.p.pos} · {a.p.nfl}{onBye(a.p.nfl) ? " · Bye" : a.p.status === "O" ? " · Out" : a.p.status === "Q" ? " · Q" : ""}{a.tag && a.p.id !== p.id ? ` · ${a.tag}` : ""}</small></span>
                <b>{f1(eff(a.p, true))}</b>
              </li>
            ))}
          </ol>
        </div>
      )}
      {c.changes.length > 0 && (
        <div className="pd-changes">
          <span className="pd-k">What would change the call</span>
          <ul>{c.changes.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

// ---- Usage and matchup (share one stats load) ------------------------------------------
type Load<T> = { state: "loading" } | { state: "ready"; v: T } | { state: "none"; why: string };
function useDepth(p: Player): { usage: Load<Usage>; def: Load<Defense> } {
  const [s, setS] = useState<{ usage: Load<Usage>; def: Load<Defense> }>({ usage: { state: "loading" }, def: { state: "loading" } });
  useEffect(() => {
    let live = true;
    const opp = oppTeam(p.opp);
    loadPosWeeks(p.pos).then((d) => {
      if (!live) return;
      const u = usageFor(p, d), df = opp ? defenseVs(p.pos, opp, d) : null;
      setS({
        usage: u ? { state: "ready", v: u } : { state: "none", why: WEEK <= 1 ? "No games played yet this season." : `No stat lines from Sleeper for ${p.name} yet.` },
        def: df ? { state: "ready", v: df } : { state: "none", why: "" },
      });
    }).catch(() => live && setS({ usage: { state: "none", why: "Couldn't load stats from Sleeper. Try again in a minute." }, def: { state: "none", why: "" } }));
    return () => { live = false; };
  }, [p.id, p.pos, p.opp]);
  return s;
}

const show = (v: number, pct?: boolean, dec?: number) => (pct ? `${Math.round(v * 100)}%` : v.toFixed(dec ?? 1));

export function UsageBlock({ p, usage }: { p: Player; usage: Load<Usage> }) {
  return (
    <section className="pd-blk pd-usage" aria-label="Usage and role" aria-busy={usage.state === "loading"}>
      <div className="ps-sub"><b>Usage</b><span>{usage.state === "ready" ? `${usage.v.games} ${usage.v.games === 1 ? "game" : "games"}` : ""}</span></div>
      {usage.state === "loading" ? <div className="pd-skel" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <span key={i} />)}</div>
        : usage.state === "none" ? <p className="ps-none">{usage.why}</p>
        : (
          <>
            <table className="pd-tbl">
              <thead><tr><th scope="col"><span className="sr-only">Stat</span></th><th scope="col">Last 3</th><th scope="col">Season</th><th scope="col"><Term t="Rank" tip={`Where his season average ranks among ${POS_PLURAL[p.pos]} with a real role${usage.v.demo ? " in the demo league" : ""}. 1 is the most.`} /></th></tr></thead>
              <tbody>
                {usage.v.rows.map((r) => {
                  const d = r.season ? (r.last3 - r.season) / r.season : 0;
                  const dir = Math.abs(d) < 0.1 ? "" : d > 0 ? " up" : " down";
                  return (
                    <tr key={r.key}>
                      <th scope="row">{r.tip ? <Term t={r.label} tip={r.tip} /> : r.label}</th>
                      <td className={`l3${dir}`}>{show(r.last3, r.pct, r.dec)}{dir && <span className="sr-only">{dir === " up" ? ", up on his season" : ", down on his season"}</span>}</td>
                      <td>{show(r.season, r.pct, r.dec)}</td>
                      <td className="rk">{r.rank ? `${p.pos}${r.rank}` : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="pd-fine">{usage.v.demo ? "Demo stats, built to look like a real season." : `From Sleeper's weekly stats, Weeks ${usage.v.first} to ${usage.v.last}.`} Last 3 is green when it's 10% or more above his season, red when it's 10% below.</p>
          </>
        )}
    </section>
  );
}

export function MatchupBlock({ p, def }: { p: Player; def: Load<Defense> }) {
  const opp = oppTeam(p.opp);
  const cell = seasonFor(p).find((c) => c.week === WEEK);
  if (onBye(p.nfl) || !opp) return (
    <section className="pd-blk pd-match" aria-label="Matchup"><div className="ps-sub"><b>Matchup</b></div><p className="ps-none">{onBye(p.nfl) ? "On bye this week." : "No game found for this week."}</p></section>
  );
  const home = /^vs\b/.test(p.opp ?? "") ? "Home" : /^@/.test(p.opp ?? "") ? "Away" : "";
  const ahead = seasonFor(p).filter((c) => !c.past && c.proj !== undefined && c.proj > 0).map((c) => c.proj!);
  const avg = ahead.length ? ahead.reduce((a, b) => a + b, 0) / ahead.length : 0;
  const d = def.state === "ready" ? def.v : null;
  const third = d ? Math.ceil(d.of / 3) : 0;
  const dTone = d ? (d.rank <= third ? "good" : d.rank > d.of - third ? "tough" : "ok") : null;
  const tone = cell?.tone;
  return (
    <section className="pd-blk pd-match" aria-label="Matchup">
      <div className="ps-sub"><b>Matchup</b><span>{[dayOf(p.gameDate), home].filter(Boolean).join(" · ")}</span></div>
      <div className="pd-opp">
        <span className="pd-opp-t"><b>{/^@/.test(p.opp ?? "") ? "at" : "vs"} {opp}</b><small>{teamNick(opp).replace(/^the /, "")} defense</small></span>
        {d && dTone ? <span className={`pd-tone t-${dTone}`}>{dTone === "good" ? `Soft on ${POS_PLURAL[p.pos]}` : dTone === "tough" ? `Tough on ${POS_PLURAL[p.pos]}` : `Average on ${POS_PLURAL[p.pos]}`}</span>
          : tone ? <span className={`pd-tone t-${tone}`}>{tone === "good" ? "Good matchup" : tone === "tough" ? "Tough matchup" : "Even matchup"}</span> : null}
      </div>
      <dl className="pd-mx">
        {def.state === "loading" ? <div className="pd-skel" aria-hidden="true"><span /><span /></div> : d ? (
          <div>
            <dt><Term t={`Allows to ${POS_PLURAL[p.pos]}`} tip={`Fantasy points per game ${opp} has given up to every ${p.pos} it has faced${d.demo ? " (demo estimate)" : `, from Sleeper's weekly stats over ${d.games} ${d.games === 1 ? "game" : "games"}`}. League average is ${f1(d.leagueAvg)}.`} /></dt>
            <dd><b>{f1(d.perGame)}</b><span className={`pd-rk${dTone ? ` t-${dTone}` : ""}`}>{d.rank <= d.of / 2 ? `${ord(d.rank)} most` : `${ord(d.of + 1 - d.rank)} fewest`}</span></dd>
          </div>
        ) : null}
        {cell?.proj !== undefined && avg > 0 && (
          <div>
            <dt><Term t="Schedule mark" tip="The good, even or tough mark on his season schedule: his projection for this game against his average projection for the rest of the season. 10% above is good, 10% below is tough." /></dt>
            <dd><b>{f1(cell.proj)}</b><span>vs {f1(avg)} avg ahead</span>{tone && <span className={`pd-rk t-${tone}`}>{tone === "good" ? "Good" : tone === "tough" ? "Tough" : "Even"}</span>}</dd>
          </div>
        )}
      </dl>
      {!d && def.state !== "loading" && <p className="pd-fine">Points allowed by position aren't available, so the mark comes from his projection for this game against his average ahead.</p>}
    </section>
  );
}

/** Usage and matchup together, so they share one stats request. */
export function UsageAndMatchup({ p }: { p: Player }) {
  const { usage, def } = useDepth(p);
  return <><UsageBlock p={p} usage={usage} /><MatchupBlock p={p} def={def} /></>;
}

// ---- News, de-emphasized ---------------------------------------------------------------
export function SheetNews({ p, open: startOpen }: { p: Player; open?: boolean }) {
  const { items, loading } = usePlayerNews(p);
  const list: NewsItem[] = byNewest(items);
  const [open, setOpen] = useState(!!startOpen);
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, 2);
  const newest = list[0];
  return (
    <section className="pd-blk pd-news" id="ps-news" aria-label={`News on ${p.name}`} aria-busy={loading}>
      <button type="button" className="pd-news-row" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={!loading && !list.length}>
        <span className="pd-news-k"><b>Latest news</b><small>{loading ? "Checking sources" : list.length ? (open ? `${list.length} ${list.length === 1 ? "story" : "stories"}` : newest?.title) : `Nothing recent. We check ${sourcesLine()}.`}</small></span>
        {list.length > 0 && <Icon name="chev" size={16} />}
      </button>
      {open && list.length > 0 && (
        <>
          <div className="nx-list">{shown.map((n) => <StoryCard key={n.id ?? n.url} n={n} />)}</div>
          {list.length > 2 && <button type="button" className="nx-more" aria-expanded={all} onClick={() => setAll((a) => !a)}>{all ? "Show newest 2" : `Show all (${list.length})`}<Icon name="chev" size={14} /></button>}
        </>
      )}
    </section>
  );
}
