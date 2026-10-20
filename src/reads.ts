// The Trade page's AI work as real steps (steps.ts): the read on a deal, and the search for trade ideas with one
// manager. Each step runs the engine call it names and reports what that call returned.
import { YOU, Team, ManagerTag, MyTag, playerById } from "./data";
import { Acceptance, Price, Trade, acceptance, evaluate, fmt, needsFor, offerRead, packageValue, scanTrades, sumValue, verdict } from "./engine";
import type { Steps } from "./steps";

const names = (ids: string[]) => ids.map((id) => playerById(id).name).join(" + ");
const poss = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface Read { trade: Trade; v: { label: string; tone: "good" | "warn" | "bad"; line: string }; accept: Acceptance | null }

/** The read on one two-team deal. `received` judges it as an offer they sent you. */
export function* readSteps(them: Team, give: string[], get: string[], tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>, received: boolean): Steps<Read> {
  const notes = tags.filter((t) => t.teamId === them.id);
  yield { t: "think", text: received
    ? `${them.manager} offered ${names(get)} for your ${names(give)}. I'll rebuild your starting lineup with and without them, price both sides on the market, and say whether to take it.`
    : `You're offering ${names(give)} for ${names(get)}. I'll rebuild both starting lineups with and without these players, price both sides on the market, and check whether ${them.manager} would say yes.` };

  yield { t: "step", doing: "Rebuilding both starting lineups", done: "Rebuilt both starting lineups" };
  const t = evaluate(YOU, them, give, get, tags, myTags, prices);
  yield { t: "n", n: 0, done: `Rebuilt both lineups: you ${fmt(t.youDelta)}, ${them.manager} ${fmt(t.themDelta)} a week` };

  const n = give.length + get.length;
  yield { t: "step", doing: `Pricing ${plural(n, "player")} on the market`, done: `Priced ${plural(n, "player")}: ${Math.round(sumValue(give)).toLocaleString("en-US")} out, ${Math.round(sumValue(get)).toLocaleString("en-US")} in`,
    chips: give.length > 1 || get.length > 1 ? [{ label: `Adjusted ${Math.round(packageValue(give)).toLocaleString("en-US")} for ${Math.round(packageValue(get)).toLocaleString("en-US")}`, kind: "feed" }] : [] };

  yield { t: "step", doing: `Checking ${plural(notes.length, "note")} on ${them.manager} and your tags`,
    done: t.warnings.length ? `Found ${plural(t.warnings.length, "conflict")} with your notes and tags` : `Checked ${plural(notes.length, "note")} on ${them.manager}: nothing blocks it`,
    chips: notes.slice(0, 3).map((x) => ({ label: x.text, kind: "team" as const })) };

  if (received) {
    const v = offerRead(t);
    yield { t: "step", doing: "Weighing the offer", done: `Read: ${v.label}` };
    return { trade: t, v, accept: null };
  }
  yield { t: "step", doing: `Asking whether ${them.manager} says yes`, done: "Asked whether they'd say yes" };
  const a = acceptance(t, YOU, them);
  yield { t: "n", n: Math.round(a.p * 100), done: `${a.label}: {n}% from ${poss(them.manager)} needs, notes and trades` };
  return { trade: t, v: verdict(t), accept: a };
}

/** Trade ideas with one manager: reads your notes on them, both teams' needs, then scores every swap. */
export function* ideaSteps(them: Team, tags: ManagerTag[], myTags: Record<string, MyTag>, prices: Record<string, Price>, limit = 3): Steps<Trade[]> {
  const notes = tags.filter((t) => t.teamId === them.id);
  yield { t: "think", text: `Looking for trades with ${them.manager}. I'll read your notes on them, line up what both teams need, score every one and two player swap between the rosters, and keep the ones where both lineups gain.` };
  yield { t: "step", doing: `Reading your notes on ${them.manager}`, done: notes.length ? `Read ${plural(notes.length, "note")} on ${them.manager}` : `No notes on ${them.manager} yet, so league needs lead`,
    chips: notes.slice(0, 4).map((x) => ({ label: x.text, kind: "team" as const })) };
  yield { t: "step", doing: "Checking what both lineups need", done: "Checked what both lineups need" };
  const mine = needsFor(YOU), theirs = needsFor(them);
  yield { t: "n", n: 0, chip: { label: `You need ${mine.need}`, kind: "pos" } };
  yield { t: "n", n: 0, chip: { label: `${them.manager} needs ${theirs.need}`, kind: "pos" } };
  yield { t: "step", doing: "Scoring {n} trade combos", done: "Scored {n} trade combos", n: 0 };
  const found = yield* scanTrades(YOU, them, tags, myTags, prices, limit);
  yield { t: "step", doing: "Keeping trades where both sides gain", done: found.length ? `Kept ${plural(found.length, "trade")} where both sides gain` : "No trade gains for both sides",
    chips: found.map((x) => ({ label: `${names(x.give)} for ${names(x.get)}`, kind: "player" as const })) };
  return found;
}
