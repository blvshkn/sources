// Set optimal lineup. The engine sets the floor: the projection-best lineup that leaves locked players where they are
// (lineupWhatIf.bestUnderLocks, the same one Use optimal lineup applies). Then the app gathers this week's signals
// (api/lineup-signals.js: news, injuries, Vegas lines, weather, licensed rankings when configured), asks Sources AI
// (api/lineup.js) whether any of them should change a call, and checks every slot of what comes back before showing it.
// If the AI is unavailable or its lineup fails a check, the engine's lineup is the answer with the engine's reasons.
// Nothing here writes to Sleeper: the result is a list of moves to make there.
import { LEAGUE, WEEK, YOU, onBye, playerById, type Player, type Pos } from "./data";
import { eff, fits, fmt, isOut, round1, type SlotName } from "./engine";
import { bestUnderLocks, sleeperNow, type SkillSlot } from "./lineupWhatIf";
import { kickoffOf } from "./kickoff";
import type { Live } from "./live";
import type { Tracer } from "./think";
import type { Chip } from "./steps";

export type SignalKind = "news" | "injury" | "odds" | "weather" | "rankings";
export const SIGNAL_KINDS: SignalKind[] = ["news", "injury", "odds", "weather", "rankings"];
export type Why = SignalKind | "projection" | "out" | "bye";

export interface OptSwap { start: string; bench: string; slot: SlotName; gain: number; why: string; signal: Why }
export interface OptimalResult {
  league: string; week: number;
  /** "ai" when Sources AI checked the lineup, "off" when this is the engine's lineup alone. */
  by: "ai" | "off";
  /** Why it's the engine's lineup, shown small and muted. */
  note?: string;
  slots: SkillSlot[]; swaps: OptSwap[];
  total: number; currentTotal: number; summary: string;
}

/** The AI's reply as the server sends it (api/lineup.js). */
export interface AiLineup { starters: { slot: string; id: string | null }[]; swaps: { start: string; bench: string; slot: string; why: string; signal: string }[]; summary: string }

/** A projection this far below the engine's pick, with no signal cited for it, puts the engine's pick back. */
export const REVERT_PTS = 2;

// ---- Locks ---------------------------------------------------------------------

/** A player whose game has kicked off (or a week that's over) can't move in Sleeper. */
export const lockedIn = (live: Live) => (id: string) => {
  if (live.past) return true;
  const st = live.games[playerById(id)?.nfl ?? ""];
  return st === "in_game" || st === "complete";
};

// ---- Validation ------------------------------------------------------------------

export interface CheckCtx {
  current: SkillSlot[];
  base: SkillSlot[];
  roster: string[];
  locked: (id: string) => boolean;
  proj: (id: string) => number;
  out: (id: string) => boolean;
  pos: (id: string) => Pos;
}

/**
 * The AI's starters as a legal lineup, or why not. Every player must be on the roster, once, in a slot he can play,
 * not out or on bye; locked players stay exactly where Sleeper has them; no slot the engine fills may go empty. Then,
 * slot by slot, a pick that projects REVERT_PTS or more below the engine's with no signal behind it goes back to the
 * engine's pick.
 */
export function checkAi(ai: AiLineup, ctx: CheckCtx): { slots: SkillSlot[]; reverted: number } | { error: string } {
  const { base, current, roster, locked, proj, out, pos } = ctx;
  // Line the AI's starters up with the league's slot order (it may list them in another order)
  const left = ai.starters.map((s) => ({ ...s }));
  const slots: SkillSlot[] = [];
  for (const b of base) {
    const k = left.findIndex((s) => s.slot === b.slot);
    if (k < 0) return { error: `no ${b.slot} in the lineup` };
    const [s] = left.splice(k, 1);
    slots.push({ slot: b.slot, id: s.id });
  }
  if (left.length) return { error: "extra starters" };
  const seen = new Set<string>();
  for (let i = 0; i < slots.length; i++) {
    const id = slots[i].id;
    if (!id) { if (base[i].id) return { error: `empty ${slots[i].slot}` }; continue; }
    if (!roster.includes(id)) return { error: `${id} isn't on your roster` };
    if (seen.has(id)) return { error: `${id} starts twice` };
    seen.add(id);
    if (!fits(slots[i].slot, pos(id))) return { error: `${id} can't play ${slots[i].slot}` };
    if (out(id)) return { error: `${id} is out or on bye` };
  }
  for (let i = 0; i < current.length; i++) {
    const c = current[i].id;
    if (c && locked(c) && slots[i]?.id !== c) return { error: `${c} is locked` };
  }
  for (const id of seen) if (locked(id) && !current.some((c) => c.id === id)) return { error: `${id} is locked on the bench` };

  // Much worse than the engine's pick with nothing cited: the engine's pick goes back in that slot
  const cited = new Set(ai.swaps.filter((w) => SIGNAL_KINDS.includes(w.signal as SignalKind) && w.why).map((w) => w.start));
  let reverted = 0;
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i].id, b = base[i].id;
    if (!a || !b || a === b || cited.has(a) || proj(a) > proj(b) - REVERT_PTS) continue;
    const j = slots.findIndex((s) => s.id === b);
    if (j < 0) { slots[i] = { ...slots[i], id: b }; reverted++; continue; }
    // The engine's pick is starting elsewhere: trade places if each fits the other's slot and neither is locked
    if (fits(slots[j].slot, pos(a)) && !locked(a) && !locked(b)) { slots[j] = { ...slots[j], id: a }; slots[i] = { ...slots[i], id: b }; reverted++; continue; }
    return { error: "couldn't put the projection pick back" };
  }
  return { slots, reverted };
}

// ---- Swaps -------------------------------------------------------------------------

/** The engine's own reason for a swap. */
export function engineWhy(start: Player, bench: Player, gain: number): { why: string; signal: Why } {
  if (onBye(bench.nfl)) return { why: `${bench.name} is on bye`, signal: "bye" };
  if (isOut(bench, true)) {
    const detail = (bench.note ?? "").replace(/^(Out|IR|PUP|Sus|NA|Doubtful|Questionable)\b,?\s*/i, "");
    return { why: `${bench.name} is out${detail ? ` (${detail})` : ""}`, signal: "out" };
  }
  return { why: gain > 0 ? `Projects ${gain.toFixed(1)} more than ${bench.name}` : `Projects ${eff(start, true).toFixed(1)}`, signal: "projection" };
}

/**
 * The moves from Sleeper's lineup to `fin`: who comes in, who goes out, paired so each start takes a bench spot he can
 * fill (same position first). `reason` gives the AI's line for a start when it has one.
 */
export function swapsBetween(current: SkillSlot[], fin: SkillSlot[], reason?: (start: string, bench: string) => { why: string; signal: Why } | null): OptSwap[] {
  const curIds = current.map((s) => s.id).filter((x): x is string => !!x);
  const finIds = fin.map((s) => s.id).filter((x): x is string => !!x);
  const ins = finIds.filter((id) => !curIds.includes(id)).map(playerById);
  const outs = curIds.filter((id) => !finIds.includes(id)).map(playerById);
  const slotOfCur = (id: string) => current.find((s) => s.id === id)?.slot ?? "FLEX";
  const out: OptSwap[] = [];
  const used = new Set<string>();
  // Same position first, then anyone whose Sleeper slot he can play, then whoever is left
  const order = [...ins].sort((a, b) => Number(!outs.some((o) => o.pos === a.pos)) - Number(!outs.some((o) => o.pos === b.pos)));
  for (const p of order) {
    const sit = outs.find((o) => !used.has(o.id) && o.pos === p.pos) ?? outs.find((o) => !used.has(o.id) && fits(slotOfCur(o.id), p.pos)) ?? outs.find((o) => !used.has(o.id));
    if (!sit) continue;
    used.add(sit.id);
    const slot = fin.find((s) => s.id === p.id)?.slot ?? slotOfCur(sit.id);
    const gain = round1(eff(p, true) - eff(sit, true));
    const r = reason?.(p.id, sit.id) ?? engineWhy(p, sit, gain);
    out.push({ start: p.id, bench: sit.id, slot, gain, why: r.why, signal: r.signal });
  }
  return out;
}

const totalOf = (xs: SkillSlot[]) => round1(xs.reduce((s, x) => s + (x.id ? eff(playerById(x.id), true) : 0), 0));
const tidyWhy = (s: string) => s.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim().replace(/[.]+$/, "");

/** The finished result from a final lineup. */
export function resultFor(current: SkillSlot[], fin: SkillSlot[], by: "ai" | "off", ai?: AiLineup | null, note?: string): OptimalResult {
  const aiWhy = (start: string, bench: string) => {
    const w = ai?.swaps.find((x) => x.start === start && x.bench === bench) ?? ai?.swaps.find((x) => x.start === start);
    return w?.why ? { why: tidyWhy(w.why), signal: (SIGNAL_KINDS.includes(w.signal as SignalKind) ? w.signal : "projection") as Why } : null;
  };
  const swaps = swapsBetween(current, fin, by === "ai" ? aiWhy : undefined);
  const total = totalOf(fin), currentTotal = totalOf(current);
  const engineSummary = swaps.length
    ? `${swaps.length} ${swaps.length === 1 ? "move" : "moves"} from your Sleeper lineup, ${fmt(round1(total - currentTotal))} projected.`
    : "Your Sleeper lineup is already optimal.";
  // The AI's sentence only when it describes exactly the moves shown (none were dropped or put back by the checks)
  const summary = by === "ai" && ai?.summary && swaps.length && ai.swaps.length === swaps.length ? tidyWhy(ai.summary) + "." : engineSummary;
  return { league: LEAGUE.id, week: WEEK, by, note, slots: fin, swaps, total, currentTotal, summary };
}

// ---- Signals -------------------------------------------------------------------------

type Part = "news" | "injuries" | "odds" | "weather" | "rankings";
export interface SignalReply { part: Part; status: "ok" | "off" | "error"; [k: string]: unknown }

const oppTeam = (opp?: string) => (opp ?? "").replace(/^(vs|v|@)\s+/i, "").trim().toUpperCase() || undefined;
const homeOf = (opp?: string) => (!opp ? undefined : /^(vs|v)\s/i.test(opp) ? true : /^@\s?/.test(opp) ? false : undefined);

/** What the signal calls need: your players still to play, and their games. */
export function signalBody(players: Player[]) {
  const games = new Map<string, { team: string; opp?: string; home?: boolean; at?: string }>();
  for (const p of players) {
    if (games.has(p.nfl) || !p.opp) continue;
    const at = kickoffOf(p.nfl, WEEK, p.opp);
    games.set(p.nfl, { team: p.nfl, opp: oppTeam(p.opp), ...(homeOf(p.opp) !== undefined ? { home: homeOf(p.opp) } : {}), ...(at ? { at } : {}) });
  }
  return {
    season: LEAGUE.season, week: WEEK,
    players: players.map((p) => ({ id: p.id, name: p.name, pos: p.pos, nfl: p.nfl, ...(p.injury || p.status ? { status: p.injury ?? (p.status === "O" ? "Out" : "Questionable") } : {}) })),
    games: [...games.values()],
  };
}

async function fetchPart(part: Part, body: object): Promise<SignalReply | null> {
  try {
    const r = await fetch("/api/lineup-signals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, part }), signal: AbortSignal.timeout(15_000) });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return null;
    const d = await r.json() as SignalReply;
    return d && typeof d === "object" && d.status ? d : null;
  } catch { return null; }
}

/** Ask Sources AI. Resolves the lineup, or null when it's unavailable for any reason. */
export async function askLineup(body: object): Promise<AiLineup | null> {
  try {
    const r = await fetch("/api/lineup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return null;
    const d = await r.json() as { lineup?: AiLineup };
    const l = d?.lineup;
    if (!l || !Array.isArray(l.starters)) return null;
    return { starters: l.starters, swaps: Array.isArray(l.swaps) ? l.swaps : [], summary: typeof l.summary === "string" ? l.summary : "" };
  } catch { return null; }
}

const arr = (x: unknown) => (Array.isArray(x) ? x : []) as Record<string, unknown>[];
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

// ---- The job ---------------------------------------------------------------------------

/**
 * The whole run as real steps with real counts. `intro: false` skips the plan and the roster and projection steps,
 * for Ask, where the engine has just reported those.
 */
export function optimalJob(live: Live, { intro = true }: { intro?: boolean } = {}) {
  return async (tr: Tracer): Promise<OptimalResult> => {
    const locked = lockedIn(live);
    const current = sleeperNow().mine;
    const roster = YOU.roster.map(playerById).filter(Boolean);
    if (intro) {
      await tr.think("I'll start from your best projected lineup, then check news, injury reports, Vegas lines and weather, and ask Sources AI whether any of it should change a call.");
      await tr.step("Reading your roster", `Read your roster (${roster.length} players)`, { chips: [{ label: YOU.name, kind: "team" }] });
    }
    const base = bestUnderLocks(current, locked);
    if (intro) await tr.step(`Projecting ${roster.length} players for week ${WEEK}`, `Best projected lineup: ${totalOf(base).toFixed(1)}`);

    // Players who can still move, and who aren't on bye: the only ones a signal could matter for
    const open = roster.filter((p) => !locked(p.id) && !onBye(p.nfl));
    const body = signalBody(open);
    // All sources start at once; each step waits on its own source, so a step is on screen as long as its fetch runs
    const ask = (part: Part) => (open.length ? fetchPart(part, body) : Promise.resolve(null));
    const parts = { news: ask("news"), injuries: ask("injuries"), odds: ask("odds"), weather: ask("weather"), rankings: ask("rankings") };
    const name = (id: unknown) => playerById(String(id))?.name ?? String(id);
    const chipsOf = (rows: Record<string, unknown>[]): Chip[] => [...new Set(rows.map((r) => String(r.playerId)))].slice(0, 3).map((id) => ({ label: name(id), kind: "player" as const }));

    const say = (done: string) => { tr.state.steps[tr.state.steps.length - 1].done = done; };
    await tr.step("Checking the news", "Checked the news");
    const news = await parts.news;
    const scanned = Number(news?.scanned ?? 0), newsRows = arr(news?.items);
    say(news?.status === "ok" ? `Checked ${plural(scanned, "news item")}, ${newsRows.length} about your players` : "Couldn't reach the news feeds");
    for (const c of chipsOf(newsRows)) await tr.n(scanned, c);

    await tr.step("Reading injury reports", "Read injury reports");
    const inj = await parts.injuries;
    const injRows = arr(inj?.items);
    say(inj?.status === "ok" ? (injRows.length ? `Read ${plural(injRows.length, "injury report")}` : "No injury reports for your players") : "Couldn't reach injury reports");
    for (const c of chipsOf(injRows)) await tr.n(injRows.length, c);

    // Every reply says which optional sources are set up, so one that isn't never gets a step
    const configured = (news?.configured ?? inj?.configured) as { odds?: boolean; rankings?: boolean } | undefined;
    const isOn = async (part: "odds" | "rankings") => (configured ? !!configured[part] : (await parts[part])?.status !== "off");

    let oddsRows: Record<string, unknown>[] = [];
    if (await isOn("odds")) {
      await tr.step("Getting Vegas lines", "Got Vegas lines");
      const o = await parts.odds;
      oddsRows = arr(o?.games);
      say(o?.status === "ok" ? `Got odds for ${plural(oddsRows.length, "game")}` : "Couldn't reach Vegas lines");
    }

    await tr.step("Checking stadium weather", "Checked stadium weather");
    const wx = await parts.weather;
    const wxRows = arr(wx?.games), domes = Number(wx?.domes ?? 0);
    say(wx?.status === "ok"
      ? `Checked weather for ${plural(wxRows.length, "outdoor game")}${domes ? `, skipped ${domes} in ${domes === 1 ? "a dome" : "domes"}` : ""}`
      : "Couldn't reach the weather service");

    let rkRows: Record<string, unknown>[] = [];
    if (await isOn("rankings")) {
      await tr.step("Reading expert rankings", "Read expert rankings");
      const r = await parts.rankings;
      rkRows = arr(r?.items);
      say(r?.status === "ok" ? `Read rankings for ${rkRows.length} of your players` : "Couldn't reach the rankings feed");
    }

    await tr.step("Asking Sources AI", "Asked Sources AI");
    const ai = await askLineup({
      week: WEEK,
      slots: base.map((s) => s.slot),
      roster: roster.map((p) => ({
        id: p.id, name: p.name, pos: p.pos, nfl: p.nfl, proj: eff(p, true),
        ...(p.injury || p.status ? { status: p.note ?? p.injury ?? (p.status === "O" ? "Out" : "Questionable") } : {}),
        ...(onBye(p.nfl) ? { bye: true } : {}), ...(locked(p.id) ? { locked: true } : {}), ...(p.opp ? { opp: p.opp } : {}),
      })),
      current, baseline: base,
      signals: {
        ...(news?.status === "ok" ? { news: newsRows } : {}),
        ...(inj?.status === "ok" ? { injuries: injRows } : {}),
        ...(oddsRows.length ? { odds: oddsRows } : {}),
        ...(wxRows.length ? { weather: wxRows } : {}),
        ...(rkRows.length ? { rankings: rkRows } : {}),
      },
    });
    if (!ai) {
      say("Sources AI is offline, used your projections");
      await tr.finish();
      return resultFor(current, base, "off", null, "Sources AI is offline right now, so this is your best lineup by projection.");
    }

    await tr.step("Validating the lineup", "Validated the lineup");
    const checked = checkAi(ai, {
      current, base, roster: YOU.roster, locked,
      proj: (id) => eff(playerById(id), true), out: (id) => isOut(playerById(id), true), pos: (id) => playerById(id).pos,
    });
    if ("error" in checked) {
      say("Sources AI's lineup failed a check, used your projections");
      await tr.finish();
      return resultFor(current, base, "off", null, "Sources AI's lineup didn't pass the checks, so this is your best lineup by projection.");
    }
    say(checked.reverted
      ? `Checked every slot, kept the projection pick in ${plural(checked.reverted, "slot")}`
      : `Checked ${plural(checked.slots.length, "slot")} for byes, injuries and locks`);
    await tr.finish();
    return resultFor(current, checked.slots, "ai", ai);
  };
}

// ---- Kept between visits -------------------------------------------------------------

let last: OptimalResult | null = null;
/** The last result for this league and week, so leaving the tab and coming back shows it again. */
export const lastOptimal = () => (last && last.league === LEAGUE.id && last.week === WEEK ? last : null);
export const keepOptimal = (r: OptimalResult | null) => { last = r; };
