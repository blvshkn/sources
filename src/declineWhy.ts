// Why an offer was declined, as the engine reads it. The reason lives on the offer (sentOffers.ts) so it syncs with
// the rest of Sent offers; the tags it implies are worked out here each time, never stored, so editing or removing a
// reason changes them everywhere at once. They reuse the tag kinds every note uses:
//   - "Thin at RB": he refuses to move a RB, so ideas and Ask stop asking him for one
//   - "Won't trade that player": he refuses to move that player
//   - "Didn't want the player I sent": he isn't interested in that player of yours
//   - "Other": the note is read like any typed note (parseTag), and tags only when it names a player or position
// "Wanted more value" and "Not trading now" are kept on the offer but don't tag anyone.
import { ManagerTag, POS_ORDER, Pos, TEAMS, playerById } from "./data";
import { needsFor, parseTag } from "./engine";
import type { DeclineWhy, SentOffer, WhyKind } from "./sentOffers";

const WEEK_MS = 7 * 864e5;
const nameOf = (id?: string) => (id ? playerById(id)?.name ?? id : "");
const lastName = (id?: string) => nameOf(id).split(" ").slice(-1)[0];

/** The quick picks, in the order the panel shows them. "thin" is one chip per position. */
export const WHY_PICKS: { kind: Exclude<WhyKind, "thin">; label: string; needs?: "give" | "get" }[] = [
  { kind: "value", label: "Wanted more value" },
  { kind: "unwanted", label: "Didn't want the player I sent", needs: "give" },
  { kind: "keeps", label: "Won't trade that player", needs: "get" },
  { kind: "notNow", label: "Not trading now" },
  { kind: "other", label: "Other" },
];

/** Positions to offer for "Thin at": the ones you asked him for, then where his starters run at least half a point
 *  a week below league average, shortest first. */
export function thinOptions(o: Pick<SentOffer, "partnerId" | "get">): Pos[] {
  const asked = o.get.map((id) => playerById(id)?.pos).filter((p): p is Pos => !!p && POS_ORDER.includes(p));
  const team = TEAMS.find((t) => t.id === o.partnerId);
  let short: Pos[] = [];
  if (team) {
    const n = needsFor(team);
    // Half a point a week under average counts as short; a hair under is noise
    short = POS_ORDER.filter((p) => n.groups[p] && n.groups[p].diff <= -0.5).sort((a, b) => n.groups[a].diff - n.groups[b].diff);
  }
  return [...new Set([...asked, ...short])];
}

/** "Thin at RB", "Won't trade McConkey", or the note for Other */
export function whyLabel(w: DeclineWhy): string {
  switch (w.kind) {
    case "thin": return `Thin at ${w.pos ?? "a position"}`;
    case "value": return "Wanted more value";
    case "unwanted": return w.playerId ? `Didn't want ${lastName(w.playerId)}` : "Didn't want the player I sent";
    case "keeps": return w.playerId ? `Won't trade ${lastName(w.playerId)}` : "Won't trade that player";
    case "notNow": return "Not trading now";
    default: return w.note ?? "Other";
  }
}

/** The tag a reason puts on the manager, without id or age. Null when it doesn't steer ideas. */
export function whyTag(w: DeclineWhy, partnerId: string): Omit<ManagerTag, "id" | "weeksOld"> | null {
  if (w.kind === "thin" && w.pos) return { teamId: partnerId, kind: "refuses", pos: w.pos, text: `Too thin at ${w.pos} to trade one` };
  if (w.kind === "keeps" && w.playerId) return { teamId: partnerId, kind: "refuses", playerId: w.playerId, text: `Won't move ${nameOf(w.playerId)}` };
  if (w.kind === "unwanted" && w.playerId) return { teamId: partnerId, kind: "notInterested", playerId: w.playerId, text: `Not interested in ${nameOf(w.playerId)}` };
  if (w.kind === "other" && w.note) {
    const p = parseTag(w.note, partnerId).tag;
    if (p && p.teamId === partnerId) return { teamId: p.teamId, kind: p.kind, playerId: p.playerId, pos: p.pos, text: p.text };
  }
  return null;
}

/** What a reason does to trade ideas, for the line under the row */
export function whyEffect(w: DeclineWhy, partnerId: string, who = "him"): string | null {
  const t = whyTag(w, partnerId);
  if (!t) return null;
  if (t.kind === "refuses") return t.playerId ? `Ideas leave ${lastName(t.playerId)} out` : `Ideas won't ask ${who} for his ${t.pos}s`;
  if (t.kind === "notInterested") return t.playerId ? `Ideas won't offer ${who} ${lastName(t.playerId)}` : `Ideas won't offer ${who} your ${t.pos}s`;
  return "Ideas follow it";
}

const tagKey = (t: Pick<ManagerTag, "teamId" | "kind" | "playerId" | "pos">) => `${t.teamId}|${t.kind}|${t.playerId ?? ""}|${t.pos ?? ""}`;

/**
 * Tags from the reasons on declined offers, newest first, one per manager and target. Their ids start "why-" and
 * carry the offer id, so clearing one clears the reason. `skip` holds tags you already wrote, which win.
 */
export function tagsFromSent(list: SentOffer[], skip: ManagerTag[] = [], now = Date.now()): ManagerTag[] {
  const seen = new Set(skip.map(tagKey));
  const out: ManagerTag[] = [];
  [...list].filter((o) => o.status === "declined" && o.why).sort((a, b) => b.why!.at - a.why!.at).forEach((o) => {
    const t = whyTag(o.why!, o.partnerId);
    if (!t || seen.has(tagKey(t))) return;
    seen.add(tagKey(t));
    out.push({ ...t, id: `why-${o.id}`, weeksOld: Math.max(0, Math.floor((now - o.why!.at) / WEEK_MS)), from: "declined" });
  });
  return out;
}

/** The offer id behind a tag from a reason, or null for a tag you wrote */
export const offerOfTag = (id: string) => (id.startsWith("why-") ? id.slice(4) : null);
