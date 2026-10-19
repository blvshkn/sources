import { Trade, fmt, needsFor } from "./engine";
import { playerById, teamById, Pos } from "./data";

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
  const amount = t.marketGive - t.marketGet; // what they receive minus what they send
  const pct = t.marketGet > 0 ? (amount / t.marketGet) * 100 : 0;
  if (amount > 0 && pct >= 3) return { kind: "value", pct, amount };
  const them = teamById(t.partnerId), need = needsFor(them).need;
  if (t.give.some((id) => playerById(id).pos === need)) return { kind: "need", pos: need };
  return { kind: "none" };
}
/** The same selling point as a phrase for the message. */
function sellPhrase(sp: SellPoint): string {
  switch (sp.kind) {
    case "pts": return `${fmt(sp.delta)} a week for your starters`;
    case "value": return `about ${Math.round(sp.pct)}% more trade value than you send`;
    case "need": return `a real starter at ${sp.pos}`;
    default: return "";
  }
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
  const sp = sellPoint(t);
  const why = sellPhrase(sp);
  // "(... )" and ", that's ..." only when there's a selling point worth saying
  const paren = why ? ` (${why})` : "";

  if (audience === "group") {
    switch (tone) {
      case "straight":
        return `Trade offer on the table for @${them.manager}: my ${give} for their ${get}. ${why ? `${why[0].toUpperCase()}${why.slice(1)}.` : "Works for both of us."} Thoughts?`;
      case "friendly":
        return `Putting this out there so nobody says I hide my offers: @${them.manager} gets ${give} for ${get}. Fills their ${pos} spot${paren}. Group, tell them to take it.`;
      case "trash":
        return `Public service announcement: @${them.manager} has been starting nobody ${hook} for weeks. I'm offering ${give} for ${get}.${why ? ` That's ${why}.` : ""} If they say no, that's on them.`;
    }
  }
  switch (tone) {
    case "straight":
      return `Hey ${them.manager}, saw you're thin ${hook}. ${give} for ${get}?${why ? ` That's ${why}, and it helps me too.` : " It helps us both."} Let me know.`;
    case "friendly":
      return `${them.manager}! Saw you're thin ${hook}. ${give} for ${get} gets you help there${paren} and helps me at ${playerById(t.get[0]).pos}. Want to do it?`;
    case "trash":
      return `${them.manager}, I'm doing you a favor. You're hurting ${hook}. ${give} for ${get}.${why ? ` That's ${why}, and your lineup clearly needs it.` : " Your lineup clearly needs it."} Accept before I come to my senses.`;
  }
}
