import { Trade, fmt, needsFor, groupPoints, lineupFor, leagueAvg, Group } from "./engine";
import { playerById, teamById, Pos } from "./data";
import type { Steps } from "./steps";

export type Tone = "straight" | "friendly" | "trash";
export type Audience = "dm" | "group";

const names = (ids: string[]) => ids.map((id) => playerById(id).name).join(" + ");

/** What we lead with when we pitch: their lineup gain if it's real, otherwise the market value they pick up,
 *  otherwise the need it fills. A number that's bad for them never goes in the pitch or on the card. */
export type SellPoint =
  | { kind: "pts"; delta: number }
  | { kind: "value"; pct: number; amount: number }
  | { kind: "need"; pos: Pos }
  | { kind: "none" };
export function sellPoint(t: Trade): SellPoint {
  if (t.themDelta >= 0.5) return { kind: "pts", delta: t.themDelta };
  const amount = t.marketGive - t.marketGet; // what they receive minus what they send, as a calculator sums it
  const pct = t.marketGet > 0 ? (amount / t.marketGet) * 100 : 0;
  // Only claim a value edge that survives the consolidation adjustment too
  if (amount > 0 && pct >= 3 && t.adjGive > t.adjGet) return { kind: "value", pct, amount };
  const them = teamById(t.partnerId), need = needsFor(them).need;
  if (t.give.some((id) => playerById(id).pos === need)) return { kind: "need", pos: need };
  return { kind: "none" };
}
/** One concrete reason to say yes, from the receiver's side. */
export interface Reason { big: string; line: string; detail?: string }
const SLOT_NAME: Record<Group, string> = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", FLEX: "flex", SF: "superflex" };
const n1 = (n: number) => n.toFixed(1);
/** Every real reason this deal is good for THEM, best first. Never a number that's bad for them. */
export function reasonsFor(t: Trade): Reason[] {
  const them = teamById(t.partnerId);
  const after = [...them.roster.filter((id) => !t.get.includes(id)), ...t.give];
  const gb = groupPoints(lineupFor(them.roster)), ga = groupPoints(lineupFor(after)), avg = leagueAvg();
  const need = needsFor(them).need as Group;
  const out: Reason[] = [];
  if (t.themDelta >= 0.5) out.push({ big: fmt(t.themDelta), line: "points a week for your starting lineup", detail: `${n1(t.themBefore)} to ${n1(t.themAfter)} projected` });
  // The slot that gets better, and who fills it
  const slots = (Object.keys(gb) as Group[]).filter((k) => ga[k] - gb[k] >= 0.5).sort((a, b) => (ga[b] - gb[b]) - (ga[a] - gb[a]));
  slots.slice(0, 2).forEach((k) => {
    const incoming = t.give.map(playerById).find((p) => k === "FLEX" ? ["RB", "WR", "TE"].includes(p.pos) : k === "SF" ? true : p.pos === k);
    const weak = k === need || gb[k] < avg[k];
    out.push({
      big: `+${n1(ga[k] - gb[k])}`,
      line: `a week at ${SLOT_NAME[k]}${incoming ? `, with ${incoming.name} starting there` : ""}`,
      detail: `${n1(gb[k])} to ${n1(ga[k])}${weak ? `, ${k === need ? "your weakest spot" : "below the league average today"}` : ""}`,
    });
  });
  const amount = t.marketGive - t.marketGet, pct = t.marketGet > 0 ? (amount / t.marketGet) * 100 : 0;
  if (amount > 0 && pct >= 3 && t.adjGive > t.adjGet) out.push({ big: `+${Math.round(pct)}%`, line: "more trade value than you send", detail: `${Math.round(t.marketGive).toLocaleString()} for ${Math.round(t.marketGet).toLocaleString()}` });
  return out;
}

/** Drafts the pitch around THEIR need. Numbers come from the trade engine. */
export function draftPitch(t: Trade, tone: Tone, audience: Audience = "dm"): string {
  const them = teamById(t.partnerId);
  const give = names(t.give);
  const get = names(t.get);
  const need: Pos = needsFor(them).need;
  const fills = t.give.some((id) => playerById(id).pos === need);
  const pos: Pos = fills ? need : playerById(t.give[0]).pos;
  const out = them.roster.map(playerById).find((p) => p.pos === pos && (p.status === "O"));
  const hook = out ? `with ${out.name.split(" ").slice(-1)[0]} out` : `at ${pos}`;

  const rs = reasonsFor(t);
  const top = rs[0];
  // The reason in words: "+8.2 a week at QB, with Josh Allen starting there (14.0 to 22.2)"
  const said = top ? `${top.big} ${top.line}${top.detail ? ` (${top.detail})` : ""}` : "";
  const also = rs[1] ? ` On top of that, ${rs[1].big} ${rs[1].line}.` : "";
  const thin = need && rs.some((r) => r.detail?.includes("weakest")) ? `Your ${need} spot is your weakest right now. ` : out ? `With ${out.name.split(" ").slice(-1)[0]} out, ` : "";

  if (audience === "group") {
    switch (tone) {
      case "straight":
        return `Offer for @${them.manager}: ${give} for ${get}.${said ? ` For them that's ${said}.` : ""} Thoughts?`;
      case "friendly":
        return `Putting this out there so nobody says I hide my offers: @${them.manager} gets ${give} for ${get}.${said ? ` That's ${said}.` : ""} Group, tell them to take it.`;
      case "trash":
        return `Public service announcement: @${them.manager} has been starting nobody ${hook} for weeks. I'm offering ${give} for ${get}.${said ? ` That's ${said}.` : ""} If they say no, that's on them.`;
    }
  }
  switch (tone) {
    case "straight":
      return `Hey ${them.manager}, ${thin ? thin.charAt(0).toLowerCase() + thin.slice(1) : ""}${give} for ${get}?${said ? ` For you that's ${said}.` : ""}${also} Let me know.`;
    case "friendly":
      return `${them.manager}! ${thin}Here's an idea: ${give} for ${get}.${said ? ` You'd get ${said}.` : ""}${also} Want to do it?`;
    case "trash":
      return `${them.manager}, I'm doing you a favor. ${thin}${give} for ${get}.${said ? ` That's ${said}.` : ""}${also} Accept before I come to my senses.`;
  }
}

const TONE_WORD: Record<Tone, string> = { straight: "straight", friendly: "friendly", trash: "trash talk" };
const poss = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

/** draftPitch as the steps it takes (steps.ts): their need, the reasons the deal is good for them, then the words. */
export function* draftPitchSteps(t: Trade, tone: Tone, audience: Audience = "dm"): Steps<string> {
  const them = teamById(t.partnerId);
  yield { t: "think", text: `Writing a ${TONE_WORD[tone]} ${audience === "group" ? "post for the group chat" : "message"} to ${them.manager}. I'll find what ${them.manager} needs most, work out what this deal does for their lineup, and lead with the best reason to say yes.` };
  yield { t: "step", doing: `Reading ${poss(them.manager)} lineup`, done: `Read ${poss(them.manager)} lineup` };
  const n = needsFor(them);
  yield { t: "n", n: 0, chip: { label: `Needs ${n.need}`, kind: "pos" } };
  yield { t: "step", doing: `Finding reasons for ${them.manager} to say yes`, done: "Found {n} reasons to say yes", n: 0 };
  const rs = reasonsFor(t);
  for (let i = 0; i < rs.length; i++) yield { t: "n", n: i + 1, chip: { label: `${rs[i].big} ${rs[i].line.replace(/,.*$/, "")}`, kind: "feed" } };
  yield { t: "step", doing: `Writing it ${tone === "trash" ? "with some trash talk" : `in a ${TONE_WORD[tone]} voice`}`, done: "Wrote {n} words", n: 0 };
  const text = draftPitch(t, tone, audience);
  yield { t: "n", n: text.trim().split(/\s+/).length };
  return text;
}
