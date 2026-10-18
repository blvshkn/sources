import { Trade, fmt, needsFor } from "./engine";
import { playerById, teamById, Pos } from "./data";

export type Tone = "straight" | "friendly" | "trash";
export type Audience = "dm" | "group";

const names = (ids: string[]) => ids.map((id) => playerById(id).name).join(" + ");

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
  const gain = fmt(t.themDelta);
  const me = fmt(t.youDelta);

  if (audience === "group") {
    switch (tone) {
      case "straight":
        return `Trade offer on the table for @${them.manager}: my ${give} for their ${get}. Their starters go ${gain} a week, mine ${me}. Fair for both. Thoughts?`;
      case "friendly":
        return `Putting this out there so nobody says I hide my offers: @${them.manager} gets ${give} for ${get}. Fills their ${pos} spot (${gain} a week). Group, tell them to take it.`;
      case "trash":
        return `Public service announcement: @${them.manager} has been starting nobody ${hook} for weeks. I'm offering ${give} for ${get}. ${gain} a week for them. If they say no, that's on them.`;
    }
  }
  switch (tone) {
    case "straight":
      return `Hey ${them.manager}, saw you're thin ${hook}. ${give} for ${get}? It projects ${gain} a week for your starting lineup and helps me too. Let me know.`;
    case "friendly":
      return `${them.manager}! Saw you're thin ${hook}. ${give} for ${get} gets you a starter there (${gain} a week by my math) and helps me at ${playerById(t.get[0]).pos}. Want to do it?`;
    case "trash":
      return `${them.manager}, I'm doing you a favor. You're hurting ${hook}. ${give} for ${get}. That's ${gain} a week for a lineup that clearly needs it. Accept before I come to my senses.`;
  }
}
