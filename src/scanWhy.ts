// Why a trade scan with one manager found nothing, in plain words. Everything here is read off the scan's own record
// (engine.ts ScanDiag) and the two rosters: a reason only shows when the numbers behind it are true.
import { TEAMS, YOU, Team, ManagerTag, MyTag, Pos, playerById } from "./data";
import { Price, ScanDiag, ScanMiss, ScanRejects, Trade, acceptance, evaluate, fmt, lineupFor, lineupTotal, marketValue, needsFor, round1, scored } from "./engine";

export interface WhyRow { key: keyof ScanRejects; label: string; n: number; share: number }
export interface WhyMiss { trade: Trade; title: string; nums: string; reason: string }
export interface WhyTip { text: string; trade?: Trade; teams?: Team[] }
export interface WhyNone { scored: number; lead: string[]; rows: WhyRow[]; misses: WhyMiss[]; tip: WhyTip | null }

const names = (ids: string[]) => ids.map((id) => playerById(id).name).join(" + ");
const poss = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** "RBs", or "RB" when there's one. */
const posN = (pos: Pos, n: number) => (n === 1 ? pos : `${pos}s`);
const short = (x: number) => round1(1 - x).toFixed(1);

/** Did this deal pass every test the scan runs? */
function works(t: Trade, them: Team): boolean {
  if (t.warnings.length || t.youDelta < 1 || t.themDelta < 1) return false;
  const a = acceptance(t, YOU, them);
  return !a.blockers.length && a.p >= 0.5;
}

/** The reason one near miss fails, from its own numbers. */
function missReason(m: ScanMiss, them: Team): string {
  const t = m.trade, a = m.accept, who = them.manager;
  if (m.fail === "both") return "Neither lineup gains the point a week both sides need";
  if (m.fail === "you") return `You're ${short(t.youDelta)} short of the +1.0 a week both sides need`;
  if (m.fail === "them") return `${who} is ${short(t.themDelta)} short of the +1.0 a week both sides need`;
  if (a.blockers.length) return cap(a.blockers[0]);
  return `About ${Math.round(a.p * 100)}% chance ${who} says yes`;
}

/** A small extra piece that turns a near miss into a deal that passes everything: one of your bench players when
 *  their side falls short, or one of theirs when yours does. The cheapest piece that works wins. */
function smallPiece(misses: ScanMiss[], them: Team, tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>): WhyTip | null {
  const yourStart = new Set(lineupFor(YOU.roster).slots.map((s) => s.player?.id));
  const theirStart = new Set(lineupFor(them.roster).slots.map((s) => s.player?.id));
  const cheap = (ids: string[]) => ids.slice().sort((a, b) => marketValue(playerById(a)) - marketValue(playerById(b)));
  for (const m of misses) {
    const t = m.trade;
    if (t.give.length + t.get.length >= 4) continue;
    const theirsShort = m.fail === "them" || m.fail === "theyPass" || (m.fail === "value" && t.marketGap > 0);
    const yoursShort = m.fail === "you" || m.fail === "youPass" || (m.fail === "value" && t.marketGap < 0);
    if (theirsShort) {
      for (const id of cheap(YOU.roster.filter((id) => !yourStart.has(id) && !t.give.includes(id)))) {
        const x = evaluate(YOU, them, [...t.give, id], t.get, tags, myTags, prices);
        if (works(x, them)) return { text: `Add ${playerById(id).name} on your side and ${names(t.give)} for ${names(t.get)} works for both: you ${fmt(x.youDelta)}, ${them.manager} ${fmt(x.themDelta)} a week.`, trade: x };
      }
    }
    if (yoursShort) {
      for (const id of cheap(them.roster.filter((id) => !theirStart.has(id) && !t.get.includes(id)))) {
        const x = evaluate(YOU, them, t.give, [...t.get, id], tags, myTags, prices);
        if (works(x, them)) return { text: `Ask for ${playerById(id).name} too and ${names(t.give)} for ${names(t.get)} works for both: you ${fmt(x.youDelta)}, ${them.manager} ${fmt(x.themDelta)} a week.`, trade: x };
      }
    }
  }
  return null;
}

/**
 * The answer to "why no trades with this manager?". `ideasByTeam` is the league scan the app already ran (each
 * team's ideas), so pointing at other teams costs nothing and only names teams where a deal really works.
 */
export function whyNone(them: Team, diag: ScanDiag, tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>, ideasByTeam: Record<string, Trade[]> = {}): WhyNone {
  const who = them.manager;
  const youBefore = lineupTotal(YOU.roster), themBefore = lineupTotal(them.roster);
  const yourLu = lineupFor(YOU.roster), theirLu = lineupFor(them.roster);
  const yourStart = new Set(yourLu.slots.map((s) => s.player?.id)), theirStart = new Set(theirLu.slots.map((s) => s.player?.id));
  // What one player does for the other lineup on his own, before anything goes back
  const liftYou = (id: string) => round1(lineupTotal([...YOU.roster, id]) - youBefore);
  const liftThem = (id: string) => round1(lineupTotal([...them.roster, id]) - themBefore);
  const helpYou = them.roster.filter((id) => liftYou(id) >= 1);
  const helpThem = YOU.roster.filter((id) => liftThem(id) >= 1);
  const myNeed = needsFor(YOU).need, theirNeed = needsFor(them).need;

  // Your side: can they give you anything that starts, without losing a starter?
  let mine: string | null = null, mineStarters = false, theirsStarters = false;
  const theirSpare = theirLu.bench.map((p) => p.id);
  if (!helpYou.length) mine = `Nobody on ${poss(who)} roster would add a point a week to your lineup.`;
  else if (!helpYou.some((id) => !theirStart.has(id))) {
    // Thin means fewer bench players than most teams in this league carry, not a fixed number
    const benches = TEAMS.filter((t) => !t.you && t.id !== them.id).map((t) => lineupFor(t.roster).bench.length).sort((a, b) => a - b);
    const typical = benches.length ? benches[Math.floor(benches.length / 2)] : theirSpare.length;
    const thin = theirSpare.length < typical;
    mineStarters = !thin;
    mine = thin
      ? `${poss(who)} bench is thin (${theirSpare.length} ${theirSpare.length === 1 ? "player" : "players"}, most teams carry ${typical}), so every upgrade for you costs them a starter.`
      : `Every player of ${poss(who)} who'd add a point a week for you also starts for ${who}, so each upgrade costs them a starter.`;
  } else {
    const spareNeed = theirSpare.filter((id) => playerById(id).pos === myNeed);
    if (!spareNeed.length) mine = `${who} has no ${myNeed} to spare, and ${myNeed} is what you need.`;
    else if (!spareNeed.some((id) => helpYou.includes(id))) mine = `${poss(who)} spare ${posN(myNeed, spareNeed.length)} (${list(spareNeed.map((id) => playerById(id).name))}) wouldn't add a point a week for you.`;
  }
  // Their side: can you give them anything that starts, without losing one of yours?
  let theirs: string | null = null;
  if (!helpThem.length) theirs = `None of your players would add a point a week for ${who}.`;
  else if (!helpThem.some((id) => !yourStart.has(id))) { theirsStarters = true; theirs = `Everyone you have who'd add a point a week for ${who} is one of your starters.`; }
  else {
    const yoursAt = YOU.roster.filter((id) => playerById(id).pos === theirNeed && !yourStart.has(id));
    if (!yoursAt.length) theirs = `${who} needs a ${theirNeed}, and you have none to spare.`;
    else if (!yoursAt.some((id) => helpThem.includes(id))) theirs = `Your spare ${posN(theirNeed, yoursAt.length)} (${list(yoursAt.map((id) => playerById(id).name))}) wouldn't add a point a week for ${who}.`;
  }
  // A hurt player who'd fill your need: the math counts long-term injuries as zero
  const worst = Math.min(...yourLu.slots.filter((s) => s.player?.pos === myNeed).map((s) => scored(s.player!)), Infinity);
  const hurtP = them.roster.map(playerById).find((p) => p.pos === myNeed && p.status === "O" && p.longTerm && scored(p) >= (worst === Infinity ? 0 : worst) + 1);
  const hurt = hurtP ? `${hurtP.name} would outscore your weakest ${myNeed}, but he's out long term, so he counts as zero for now.` : null;

  // Swaps that passed the points test and still failed. When there are any, what stopped them leads: the rosters
  // weren't the problem for those.
  const r = diag.reject;
  let lateLine: string | null = null;
  const late = (["value", "theyPass", "youPass", "notes"] as const).map((k) => [k, r[k]] as const).sort((a, b) => b[1] - a[1]);
  const total = late.reduce((s, x) => s + x[1], 0);
  if (total > 0) {
    const [k, n] = late[0], all = n === total, one = all && total === 1;
    const subject = one ? "it" : all ? "each one" : `${n.toLocaleString("en-US")} of them`;
    const sing = all; // "it asks" / "each one asks" vs "12 of them ask"
    const what = k === "value" ? `${sing ? "asks" : "ask"} one side to give up too much value`
      : k === "notes" ? `${sing ? "is" : "are"} ruled out by your notes or tags`
      : k === "theyPass" ? `${sing ? "is" : "are"} a likely pass for ${who}` : `${sing ? "is" : "are"} a likely pass for you`;
    lateLine = `${total.toLocaleString("en-US")} ${total === 1 ? "swap helps" : "swaps help"} both lineups by a point, but ${subject} ${what}.`;
  }

  // Otherwise the rosters are the reason. The side that turned down more swaps leads, and when the same thing blocks
  // both sides it's said once.
  const sides = (r.them > r.you ? [theirs, mine] : [mine, theirs]).filter((x): x is string => !!x);
  const lead: string[] = lateLine
    ? [lateLine, ...[...sides, hurt].filter((x): x is string => !!x).slice(0, 1)]
    : mineStarters && theirsStarters
      ? [`Every player who'd add a point a week for ${who} already starts for you, and the same goes the other way. Any upgrade costs someone a starter.`]
      : [...sides, hurt].filter((x): x is string => !!x).slice(0, 2);

  const label: Record<keyof ScanRejects, string> = {
    you: "No real gain for you", them: `No real gain for ${who}`, both: "No real gain for either side",
    notes: "Ruled out by your notes or tags", value: "Value too lopsided", theyPass: `${who} would likely pass`, youPass: "You'd likely pass",
  };
  const rows = (Object.keys(label) as (keyof ScanRejects)[])
    .map((key) => ({ key, label: label[key], n: r[key], share: diag.scored ? r[key] / diag.scored : 0 }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n);

  const misses = diag.misses.map((m) => ({
    trade: m.trade,
    title: `Your ${names(m.trade.give)} for their ${names(m.trade.get)}`,
    nums: `You ${fmt(m.trade.youDelta)}, ${who} ${fmt(m.trade.themDelta)} a week`,
    reason: missReason(m, them),
  }));

  let tip: WhyTip | null = smallPiece(diag.misses, them, tags, myTags, prices);
  if (!tip) {
    // Teams where deals already work, those that bring you your need first
    const teams = TEAMS.filter((t) => !t.you && t.id !== them.id && (ideasByTeam[t.id]?.length ?? 0) > 0)
      .map((team) => ({ team, n: ideasByTeam[team.id].length, fills: ideasByTeam[team.id].some((t) => t.get.some((p) => playerById(p).pos === myNeed)) }))
      .sort((a, b) => Number(b.fills) - Number(a.fills) || b.n - a.n).slice(0, 2);
    if (teams.length) {
      const allFill = teams.every((y) => y.fills), two = teams.length > 1;
      const nm = list(teams.map((y) => y.team.manager));
      tip = { text: `${nm} ${two ? "both have" : "has"} trades that work for both sides${allFill ? `, and they bring you a ${myNeed}` : ""}.`, teams: teams.map((y) => y.team) };
    }
  }
  return { scored: diag.scored, lead, rows, misses, tip };
}
