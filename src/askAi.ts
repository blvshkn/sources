// Ask, answered by Sources AI (api/ask.js) from a compact snapshot of the league as loaded. The rule engine still
// runs first for the questions it computes exactly (who has, cost to get, needs, start/sit, waivers, trade
// partners, team reads): its result goes to the model as computed facts and its inline content (the deal, the
// swaps, the waiver card, the links) stays on the answer. When the model can't be reached, the engine's answer is
// the answer, so Ask never breaks.
import {
  COMPLETED_TRADES, FREE_AGENTS, LEAGUE, OPPONENT_ID, PLAYERS, TEAMS, WEEK, YOU, isDemo, onBye, playerById, teamById,
  type Player, type Team,
} from "./data";
import { Answer, acceptance, currentFormat, eff, formatLabel, needsFor, round1, scored, tendencies } from "./engine";
import { scoreMatch, sideScore, startersOf, type Live } from "./live";
import type { Steps, TraceEv } from "./steps";
import type { Tracer } from "./think";
import { optimalJob, type OptimalResult } from "./optimalLineup";
import { aiHeaders, offReason, type AiOff } from "./aiClient";

/** One finished turn, sent back with the next question so "what about him?" works. */
export interface AskTurnLog { q: string; a: string }

/** About this much JSON at most. Bigger leagues lose detail (bench rest-of-season numbers, then IR and taxi) first. */
export const CONTEXT_BUDGET = 25_000;

type CtxPlayer = { id: string; name: string; pos: string; nfl: string; proj?: number | string; ros?: number; status?: string; bye?: true; starter?: true; pts?: number };

/** What Ask says for a player with no projection this week, in the context and in any reply. */
export const NO_PROJ = "no projection this week";
/** A reply never shows a raw null for a projection, whatever the model wrote. */
export const noNulls = (s: string) => s
  .replace(/\b(?:proj(?:ected|ection)?|projects?)\b\.?:?\s*(?:of\s*|at\s*|is\s*)?null\b(?:\s+this week)?/gi, NO_PROJ)
  .replace(/\bnull\s+(?:proj(?:ected|ection)?|projection)\b/gi, NO_PROJ)
  .replace(/\bnull\b/gi, "none");

const bytes = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).length;

function playerRow(p: Player, live: Live | undefined, starter: boolean, lean: boolean): CtxPlayer {
  const row: CtxPlayer = { id: p.id, name: p.name, pos: p.pos, nfl: p.nfl };
  // This week's projection, and rest-of-season points a week. Bye comes from the NFL schedule only. A player with a
  // game and no projection says so in words: he isn't on bye or out because of it, and a bare null once came back in
  // the answer as "proj null".
  if (onBye(p.nfl)) { row.bye = true; row.proj = 0; }
  else row.proj = p.wk === null ? NO_PROJ : eff(p, true);
  if (!lean || starter) row.ros = round1(scored(p));
  const status = p.injury ?? (p.status === "O" ? "Out" : p.status === "Q" ? "Questionable" : undefined);
  if (status) row.status = p.note ? `${status} (${p.note})` : status;
  if (starter) row.starter = true;
  const pts = live?.points[p.id];
  if (typeof pts === "number" && live?.games[p.nfl] && live.games[p.nfl] !== "pre_game") row.pts = round1(pts);
  return row;
}

function standings(): Team[] {
  const wins = (t: Team) => { const [w = 0, l = 0, tie = 0] = t.record.split("-").map(Number); return w + tie / 2 - l / 1000; };
  return [...TEAMS].sort((a, b) => wins(b) - wins(a) || b.pf - a.pf);
}

/** This week's matchups: pairs from Sleeper's matchup rows, or just yours when that's all we know (the demo). */
function matchups(live: Live | undefined) {
  if (!live) return undefined;
  const pairs: [string, string][] = [];
  const rows = LEAGUE.weekMatchups ?? [];
  const byMatch = new Map<number, string[]>();
  for (const r of rows) if (r.matchup_id) byMatch.set(r.matchup_id, [...(byMatch.get(r.matchup_id) ?? []), String(r.roster_id)]);
  for (const ids of byMatch.values()) if (ids.length === 2 && ids.every((id) => TEAMS.some((t) => t.id === id))) pairs.push([ids[0], ids[1]]);
  if (!pairs.length && OPPONENT_ID) pairs.push([YOU.id, OPPONENT_ID]);
  if (!pairs.length) return undefined;
  return pairs.map(([a, b]) => {
    const ta = teamById(a), tb = teamById(b);
    const m = scoreMatch(sideScore(live, ta), sideScore(live, tb), live.past);
    const started = m.me.count.done + m.me.count.live + m.opp!.count.done + m.opp!.count.live > 0;
    return {
      teams: [a, b],
      state: m.final ? "final" : started ? "live" : "not started",
      score: started ? [round1(m.me.scored), round1(m.opp!.scored)] : undefined,
      projected: [round1(m.me.proj), round1(m.opp!.proj)],
      winChance: m.chance !== null ? [Math.round(m.chance), 100 - Math.round(m.chance)] : undefined,
    };
  });
}

/** The league as loaded, compact. Only real data: anything not loaded is left out. */
export function leagueContext(live?: Live): Record<string, unknown> {
  const build = (lean: 0 | 1 | 2) => {
    const order = standings();
    const teams = order.map((t, i) => {
      const set = new Set(startersOf(t));
      const n = needsFor(t);
      const td = tendencies(t.id);
      const ps = (ids: string[] | undefined, starter: boolean) => (ids ?? []).map(playerById).filter(Boolean).map((p) => playerRow(p, live, starter && set.has(p.id), lean > 0));
      return {
        id: t.id, name: t.name, manager: t.manager, ...(t.you ? { you: true } : {}),
        standing: i + 1, record: t.record, pf: round1(t.pf), ...(t.pa !== undefined ? { pa: round1(t.pa) } : {}),
        outlook: n.mode, biggestNeed: n.need, ...(n.surplusPlayer ? { spare: n.surplusPlayer.name } : {}),
        needVsAvg: Object.fromEntries((["QB", "RB", "WR", "TE"] as const).map((g) => [g, n.groups[g].diff])),
        trades: td.trades, ...(td.offers !== null ? { offersReceived: td.offers } : {}), ...(td.buys.length ? { usuallyBuys: td.buys } : {}),
        tradeRead: td.summary,
        roster: ps(t.roster, true),
        ...(lean < 2 && t.ir?.length ? { ir: ps(t.ir, false) } : {}),
        ...(lean < 2 && t.taxi?.length ? { taxi: ps(t.taxi, false) } : {}),
      };
    });
    const trades = COMPLETED_TRADES.slice(0, lean ? 10 : 20).map((x) => ({
      when: x.week, teams: [x.a, x.b], [`${x.a}Got`]: x.aGot.map((g) => g.name), [`${x.b}Got`]: x.bGot.map((g) => g.name),
    }));
    const activity = (LEAGUE.activity ?? []).slice(0, lean ? 8 : 15).map((a) => ({
      kind: a.kind, teams: a.teamIds, ...(a.adds.length ? { added: a.adds.map((p) => `${p.name} (${p.teamId})`) } : {}),
      ...(a.drops.length ? { dropped: a.drops.map((p) => `${p.name} (${p.teamId})`) } : {}), ...(a.bid !== undefined ? { bid: a.bid } : {}),
      daysAgo: Math.max(0, Math.round((Date.now() - a.at) / 864e5)),
    }));
    const fa = FREE_AGENTS.slice(0, lean ? 6 : 10).map((f) => ({ id: f.id, name: f.name, pos: f.pos, nfl: f.nfl, ros: f.proj, ...(f.rostered !== undefined ? { rosteredPct: f.rostered } : {}) }));
    const mu = matchups(live);
    return {
      league: { name: LEAGUE.name, season: LEAGUE.season, week: WEEK, scoring: formatLabel(currentFormat()), ...(LEAGUE.type ? { type: LEAGUE.type } : {}), teams: TEAMS.length, ...(isDemo() ? { demo: true } : {}) },
      ...(LEAGUE.champion ? { lastChampion: LEAGUE.champion } : {}),
      deadlines: LEAGUE.deadlines,
      ...(LEAGUE.byeTeams?.length ? { byeTeams: LEAGUE.byeTeams } : {}),
      teams,
      ...(mu ? { matchups: mu } : {}),
      ...(trades.length ? { completedTrades: trades } : {}),
      ...(activity.length ? { recentTransactions: activity } : {}),
      ...(fa.length ? { freeAgents: fa } : {}),
    };
  };
  let out = build(0);
  if (bytes(out) > CONTEXT_BUDGET) out = build(1);
  if (bytes(out) > CONTEXT_BUDGET) out = build(2);
  return out;
}

/** What the engine computed, as facts for the model to phrase. Names, not ids, except where the answer can link. */
export function factsOf(a: Answer): Record<string, unknown> {
  const deal = a.links.find((l) => l.trade)?.trade;
  const nm = (id: string) => playerById(id)?.name ?? id;
  const f: Record<string, unknown> = { engineAnswer: a.text, enginePoints: a.points };
  if (deal) {
    const them = teamById(deal.partnerId);
    const acc = deal.accept ?? (them ? acceptance(deal, YOU, them) : null);
    f.deal = {
      with: them?.manager, youGive: deal.give.map(nm), youGet: deal.get.map(nm), yourStartersPerWeek: deal.youDelta, theirStartersPerWeek: deal.themDelta,
      ...(acc ? { chanceTheyAccept: `${Math.round(acc.p * 100)}%` } : {}), ...(deal.youDrop.length ? { youDrop: deal.youDrop.map(nm) } : {}),
    };
  }
  if (a.offers?.length) {
    // Ask shows each of these as its own trade card. The words should point at them by approach, not repeat them.
    f.offersShownAsCards = a.offers.map((o) => {
      const them = teamById(o.trade.partnerId);
      return {
        approach: o.label, works: o.works, with: them?.manager, youGive: o.trade.give.map(nm), youGet: o.trade.get.map(nm),
        yourStartersPerWeek: o.trade.youDelta, theirStartersPerWeek: o.trade.themDelta,
        ...(o.trade.accept ? { chanceTheyAccept: `${Math.round(o.trade.accept.p * 100)}%` } : {}),
        ...(o.trade.youDrop.length ? { youDrop: o.trade.youDrop.map(nm) } : {}),
      };
    });
  }
  if (a.acq) { f.target = nm(a.acq.target); if (a.acq.exclude.length) f.userWontTrade = a.acq.exclude.map(nm); }
  const s = a.show;
  if (s?.kind === "player") f.player = { id: s.id, name: nm(s.id) };
  if (s?.kind === "swaps") f.lineupSwaps = s.rows.map((r) => ({ start: nm(r.start), bench: nm(r.bench), slot: r.slot, gain: r.gain }));
  if (s?.kind === "waiver") f.waiverAdd = { name: s.fa.name, pos: s.fa.pos, gain: s.gain, ...(s.bid ? { bid: s.bid } : {}), ...(s.drop ? { drop: s.drop } : {}) };
  return f;
}

/** A finished answer as plain text, for the next question's history. */
export const turnText = (a: Answer) => [a.text, ...a.points,
  ...(a.offers ?? []).map((o) => `${o.label}: ${o.trade.give.map((id) => playerById(id)?.name ?? id).join(" + ")} for ${o.trade.get.map((id) => playerById(id)?.name ?? id).join(" + ")}.`),
  a.quip ?? ""].filter(Boolean).join(" ");

export type AiReply = { text: string; points: string[]; playerIds?: string[]; teamId?: string; quip?: string };

/** Ask the server. Resolves to the reply, or null when Sources AI is unavailable for any reason (`onOff` hears why). */
export async function askServer(question: string, context: Record<string, unknown>, history: AskTurnLog[], signal?: AbortSignal, onOff?: (why: AiOff) => void): Promise<AiReply | null> {
  let r: Response | null = null;
  try {
    r = await fetch("/api/ask", {
      method: "POST", headers: aiHeaders(),
      body: JSON.stringify({ question: question.slice(0, 500), context, history: history.slice(-3) }),
      signal: signal ?? AbortSignal.timeout(25_000),
    });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) { onOff?.(await offReason(r)); return null; }
    const d = await r.json() as { answer?: AiReply };
    const a = d?.answer;
    if (!a || typeof a.text !== "string" || !a.text.trim()) return null;
    return {
      text: noNulls(a.text), points: Array.isArray(a.points) ? a.points.filter((p) => typeof p === "string").slice(0, 3).map(noNulls) : [],
      playerIds: Array.isArray(a.playerIds) ? a.playerIds.filter((id) => typeof id === "string" && !!PLAYERS[id]).slice(0, 4) : undefined,
      teamId: typeof a.teamId === "string" && TEAMS.some((t) => t.id === a.teamId) ? a.teamId : undefined,
      quip: typeof a.quip === "string" && a.quip.trim() ? noNulls(a.quip.trim()) : undefined,
    };
  } catch {
    onOff?.("offline");
    return null;
  }
}

/** The AI's reply over the engine's answer: the AI's words, the engine's inline content and links. */
export function merge(ai: AiReply, base: Answer | null, q = ""): Answer {
  // A heads up from the engine (he isn't trading right now) stays first, whatever the AI wrote
  const n = base?.notice;
  if (n && !ai.points.includes(n)) ai = { ...ai, points: [n, ...ai.points].slice(0, 4) };
  // Offers carry their own players, numbers and ways out: the AI's words sit above them with nothing else added
  if (base?.offers?.length) return { text: ai.text, points: ai.points, links: base.links, offers: base.offers, acq: base.acq, quip: ai.quip, by: "ai" };
  const show = base?.show ?? (ai.playerIds?.length ? (ai.playerIds.length === 1 ? { kind: "player" as const, id: ai.playerIds[0] } : { kind: "players" as const, ids: ai.playerIds }) : undefined);
  let links = base?.links ?? [];
  // A way out to Trade or Lineup only when the question was about a move; otherwise the answer stays in Ask
  if (!links.length && ai.teamId && /\b(trade|deal|swap|offer|acquire|get|buy|sell|partner|start|sit|lineup)\b/i.test(q)) {
    const t = teamById(ai.teamId);
    links = t.you ? [{ label: "Open your lineup", tab: "roster" }] : [{ label: `Build a trade with ${t.manager}`, tab: "trade", teamId: t.id }];
  }
  return { text: ai.text, points: ai.points, links, show, quip: ai.quip, by: "ai", ...(base?.acq ? { acq: base.acq } : {}) };
}

/** A start/sit answer from Set optimal lineup's result: its moves (with reasons) as Ask's inline swaps. */
export function lineupAnswer(r: OptimalResult, base: Answer): Answer {
  const nm = (id: string) => playerById(id)?.name ?? id;
  const first = r.swaps[0];
  const text = !first ? `Your lineup in Sleeper is already optimal at ${r.total.toFixed(1)} projected.`
    : r.by === "ai" && r.summary ? r.summary
      : `Swap ${nm(first.start)} in for ${nm(first.bench)}. ${first.why}.`;
  return {
    text,
    points: first ? [`Make ${r.swaps.length > 1 ? "these moves" : "this move"} in Sleeper. Your lineup projects ${r.total.toFixed(1)} after.`] : base.points,
    links: base.links,
    show: first ? { kind: "swaps", rows: r.swaps.map((w) => ({ start: w.start, bench: w.bench, slot: w.slot, gain: w.gain, why: w.why })) } : undefined,
    by: r.by,
    ...(r.offWhy ? { offWhy: r.offWhy } : {}),
  };
}

/** Runs the engine's generator through the tracer, starting from an event already read. */
async function play(g: Steps<Answer>, first: IteratorResult<TraceEv, Answer>, tr: Tracer): Promise<Answer> {
  let r = first;
  for (;;) {
    if (r.done) return r.value;
    const e = r.value;
    if (e.t === "think") await tr.think(e.text);
    else if (e.t === "step") await tr.step(e.doing, e.done, { n: e.n, chips: e.chips });
    else await tr.n(e.n, e.chip, e.done);
    r = g.next();
  }
}

/**
 * One Ask turn as real work: read the league, run the engine when it has a rule for the question, ask Sources AI,
 * and fall back to the engine's answer if the AI is unavailable. Each step reports its real counts.
 */
export function askJob(q: string, engine: (q: string) => Steps<Answer>, history: AskTurnLog[], live?: Live) {
  return async (tr: Tracer): Promise<Answer> => {
    const g = engine(q);
    // The engine's first event is its plan; its second tells us whether it has a rule for this question at all
    const first = g.next();
    const second = first.done ? first : g.next();
    const ruled = !(second.done && second.value.generic);
    const plan = !first.done && first.value.t === "think" ? first.value.text : "";
    await tr.think(ruled && plan ? plan : "I'll read your whole league, then ask Sources AI to answer from it.");
    const playerCount = TEAMS.reduce((n, t) => n + t.roster.length + (t.ir?.length ?? 0) + (t.taxi?.length ?? 0), 0);
    await tr.step("Reading your league", `Read your league (${TEAMS.length} teams, ${playerCount} players)`, { chips: [{ label: LEAGUE.name, kind: "team" }] });
    const league = leagueContext(live);
    const base = ruled ? await play(g, second, tr) : (second.done ? second.value : null);
    // Start/sit: the same signals and AI check as Set optimal lineup, so both give the same moves and reasons
    if (base?.lineup && live) return lineupAnswer(await optimalJob(live, { intro: false })(tr), base);
    await tr.step("Asking Sources AI", "Asked Sources AI");
    let offWhy = "offline" as AiOff;
    const ai = await askServer(q, ruled && base ? { league, facts: factsOf(base) } : { league }, history, undefined, (why) => { offWhy = why; });
    if (!ai) {
      tr.state.steps[tr.state.steps.length - 1].done = offWhy === "cap" ? "Sources AI is resting for today, used the built-in answer" : "Sources AI is unavailable, used the built-in answer";
      await tr.finish();
      return { ...(base ?? { text: "", points: [], links: [] }), by: "off", offWhy };
    }
    await tr.finish();
    return merge(ai, ruled ? base : null, q);
  };
}
