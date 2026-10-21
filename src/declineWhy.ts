// Why an offer was declined, as the engine reads it. The reason lives on the offer (sentOffers.ts) so it syncs with
// the rest of Sent offers; the tags it implies are worked out here each time, never stored, so editing or removing a
// reason changes them everywhere at once. They reuse the tag kinds every note uses:
//   - "Thin at RB": he refuses to move a RB, so ideas and Ask stop asking him for one
//   - "Won't trade that player": he refuses to move that player
//   - "Didn't want the player I sent": he isn't interested in that player of yours
//   - "Other": the note is read like any typed note (parseTag), and tags only when it names a player or position
// Two reasons don't tag anyone, and steer ideas another way:
//   - "Wanted more value": ideas with him lean his way. The engine's value test needs him to come out ahead
//     (valueAsks here, engine.ts applyValueAsks), and it fades like a tag does
//   - "Not trading now": ideas with him pause for two league weeks (pauseOf). Resume ends it early and keeps the reason
import { ManagerTag, POS_ORDER, Pos, TEAMS, playerById } from "./data";
import { FadeWeeks, needsFor, parseTag } from "./engine";
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

/** What a reason does to trade ideas, for the line under the row. A pause reads its end from `pause`. */
export function whyEffect(w: DeclineWhy, partnerId: string, who = "him", pause?: WhyPause | null): string | null {
  if (w.kind === "value") return `Ideas with ${who} now offer more value`;
  if (w.kind === "notNow") return pause ? `Ideas with ${who} paused until ${pause.until}` : w.resumedAt ? `Ideas with ${who} are back on` : null;
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

// ---- Not trading now: a two week pause ---------------------------------------

/** A pause on ideas with one manager, from a "Not trading now" reason */
export interface WhyPause {
  teamId: string;
  /** The offer the reason is on, for Resume */
  offerId: string;
  /** When ideas come back, as shown: "Week 9", or a date like "Nov 4" when the week wasn't known */
  until: string;
}
const DAY_MS = 864e5;
/** How long a pause runs when the league week can't be read */
const PAUSE_DAYS = 14;

/**
 * Whether a reason pauses ideas right now. Saved in week 7, ideas stay paused through week 8 and come back in week 9.
 * Without a week (or a league week to compare it with) it runs 14 days from when it was saved. Resume ends it.
 */
export function pauseOf(o: SentOffer, week: number, now = Date.now()): WhyPause | null {
  const w = o.why;
  if (o.status !== "declined" || !w || w.kind !== "notNow" || w.resumedAt) return null;
  if (w.week && w.week >= 1 && week >= 1) {
    const back = w.week + 2;
    return week < back ? { teamId: o.partnerId, offerId: o.id, until: `Week ${back}` } : null;
  }
  const end = w.at + PAUSE_DAYS * DAY_MS;
  return now < end ? { teamId: o.partnerId, offerId: o.id, until: new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" }) } : null;
}

/** Every manager paused right now, by team id. The newest reason wins when there's more than one. */
export function pausesFromSent(list: SentOffer[], week: number, now = Date.now()): Record<string, WhyPause> {
  const out: Record<string, WhyPause> = {};
  [...list].sort((a, b) => (a.why?.at ?? 0) - (b.why?.at ?? 0)).forEach((o) => { const p = pauseOf(o, week, now); if (p) out[p.teamId] = p; });
  return out;
}

/** Managers who passed for wanting more value, while the reason is inside the tag fade window */
export function valueAsks(list: SentOffer[], fade: FadeWeeks, now = Date.now()): string[] {
  return [...new Set(list.filter((o) => o.status === "declined" && o.why?.kind === "value" && Math.floor((now - o.why.at) / WEEK_MS) < fade).map((o) => o.partnerId))];
}
