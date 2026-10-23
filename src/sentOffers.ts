// Sent offers. Sleeper's public API can't see pending trade offers, so Source keeps its own list: every time a pitch
// is shared or copied (or marked as sent), the deal is saved here. Kept per league in this browser under a
// versioned key (App.tsx persists it as `sources.<league>.sentOffers.v1`, wrapped in try/catch like every other key).
// In a live league the list also syncs to the Sleeper user across devices (offerSync.ts, api/offers.js).
// A deal can be sent again after a tweak: each send is a version, and earlier versions stay with the latest one.

import type { Pos } from "./data";

export type SentStatus = "pending" | "declined" | "accepted" | "replaced";

/** Why a declined offer didn't go: the quick pick, the position or player it names, and any note in his words.
 *  declineWhy.ts turns it into a tag on the manager, so ideas and Ask follow it. */
export type WhyKind = "thin" | "value" | "unwanted" | "keeps" | "notNow" | "other";
export interface DeclineWhy {
  kind: WhyKind;
  /** "thin": the position he's short at */
  pos?: Pos;
  /** "unwanted": your player he passed on. "keeps": his player he won't move */
  playerId?: string;
  note?: string;
  /** ms since epoch, when it was set */
  at: number;
  /** "notNow": the league week it was saved in. Ideas with him pause through the week after (declineWhy.ts pauseOf).
   *  Unset when the week wasn't known, and then the pause runs 14 days from `at`. */
  week?: number;
  /** "notNow": ms since epoch, when you resumed ideas with him early. The reason stays; the pause ends. */
  resumedAt?: number;
}

export interface SentOffer {
  /** This version */
  id: string;
  /** Every version of one deal shares this */
  deal: string;
  leagueId: string;
  partnerId: string;
  /** Your players out, theirs in */
  give: string[];
  get: string[];
  pitch: string;
  /** ms since epoch, the last time this version went out */
  sentAt: number;
  version: number;
  /** How it went: "share sheet", "text", "email", "copied", "marked" and so on */
  via: string;
  /** The league week it went out, so the trade check knows which weeks to read */
  week: number;
  status: SentStatus;
  statusAt?: number;
  /** Why it was declined, once you say */
  why?: DeclineWhy;
  /** ms since epoch, the last change to this record on any device. Sync's merge keeps the newest (see offerSync.ts) */
  updatedAt?: number;
  /** Source's read when it went out (Zach, Oct 23): market value each side (0 to 10,000 scale, summed and adjusted)
   *  and the acceptance odds (0 to 1). Kept next to the outcome so the acceptance curve can be fit to real answers. */
  read?: OfferRead;
}

export interface OfferRead { give: number; get: number; adjGive: number; adjGet: number; odds: number }

export const SENT_KEY = "sentOffers.v1";

/** Whatever came out of storage, as a list of offers. Anything malformed is dropped rather than trusted. */
export function readSent(saved: unknown): SentOffer[] {
  if (!Array.isArray(saved)) return [];
  return saved.filter((o): o is SentOffer => !!o && typeof o === "object" && typeof (o as SentOffer).id === "string"
    && typeof (o as SentOffer).deal === "string" && typeof (o as SentOffer).partnerId === "string"
    && Array.isArray((o as SentOffer).give) && Array.isArray((o as SentOffer).get) && typeof (o as SentOffer).sentAt === "number");
}

const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
export const sameDeal = (o: Pick<SentOffer, "partnerId" | "give" | "get">, t: Pick<SentOffer, "partnerId" | "give" | "get">) =>
  o.partnerId === t.partnerId && same(o.give, t.give) && same(o.get, t.get);

/** One deal: the latest version on top, earlier ones under it (newest first). */
export interface SentDeal { head: SentOffer; earlier: SentOffer[] }
export function sentDeals(list: SentOffer[]): SentDeal[] {
  const by = new Map<string, SentOffer[]>();
  list.forEach((o) => { const g = by.get(o.deal); if (g) g.push(o); else by.set(o.deal, [o]); });
  return [...by.values()].map((g) => {
    const s = [...g].sort((a, b) => b.version - a.version || b.sentAt - a.sentAt);
    return { head: s[0], earlier: s.slice(1) };
  }).sort((a, b) => b.head.sentAt - a.head.sentAt);
}

/**
 * Save a send. Sending the same deal again (another share, then a copy) updates that version instead of adding one.
 * When the deal was reopened from Sent offers (`reopened` is its deal id) and the players changed, it becomes the next
 * version of that deal and the one before it is marked replaced. Anything else is a new deal at version 1.
 */
export function recordSent(list: SentOffer[], o: { leagueId: string; partnerId: string; give: string[]; get: string[]; pitch: string; via: string; week: number; now: number; reopened?: string | null; read?: OfferRead }): { list: SentOffer[]; offer: SentOffer } {
  const deals = sentDeals(list);
  const fromReopen = o.reopened ? deals.find((d) => d.head.deal === o.reopened && d.head.partnerId === o.partnerId) : undefined;
  const target = fromReopen ?? deals.find((d) => d.head.status === "pending" && sameDeal(d.head, o));
  if (target && sameDeal(target.head, o)) {
    const offer: SentOffer = { ...target.head, pitch: o.pitch, via: o.via, sentAt: o.now, week: o.week, status: target.head.status === "replaced" ? "pending" : target.head.status, ...(o.read ? { read: o.read } : {}) };
    return { list: list.map((x) => (x.id === offer.id ? offer : x)), offer };
  }
  const id = `so${o.now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const offer: SentOffer = {
    id, deal: target ? target.head.deal : id, leagueId: o.leagueId, partnerId: o.partnerId, give: [...o.give], get: [...o.get],
    pitch: o.pitch, sentAt: o.now, version: target ? target.head.version + 1 : 1, via: o.via, week: o.week, status: "pending", ...(o.read ? { read: o.read } : {}),
  };
  const rest = target ? list.map((x) => (x.deal === target.head.deal && x.status === "pending" ? { ...x, status: "replaced" as const, statusAt: o.now } : x)) : list;
  return { list: [offer, ...rest], offer };
}

/** "just now", "10m ago", "2h ago", "3d ago" */
export function ago(ts: number, now = Date.now()): string {
  const m = Math.max(0, Math.floor((now - ts) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** The fields of a Sleeper transaction the trade check reads */
export interface TradeTxn { type: string; status: string; roster_ids: (number | string)[]; adds: Record<string, number | string> | null; created?: number; status_updated?: number }

/**
 * Offers a completed trade in the league matches: same partner, every player you sent went to them and every player
 * you asked for came to you, finished after the offer went out (a minute of slack for clocks). Sleeper's team ids are
 * roster ids, which is what Source uses as team ids in a live league. Returns the ids of the versions to mark accepted.
 */
export function acceptedFrom(list: SentOffer[], txns: TradeTxn[], youId: string): { id: string; at: number }[] {
  const out: { id: string; at: number }[] = [];
  sentDeals(list).forEach(({ head, earlier }) => {
    if ([head, ...earlier].some((o) => o.status === "accepted")) return;
    // The trade that went through might be the latest version or one he sent before it
    for (const o of [head, ...earlier]) {
      const hit = txns.find((t) => t.type === "trade" && t.status === "complete" && t.adds
        && t.roster_ids.map(String).includes(youId) && t.roster_ids.map(String).includes(o.partnerId)
        && (t.status_updated ?? t.created ?? 0) >= o.sentAt - 60000
        && o.give.every((id) => String(t.adds![id]) === o.partnerId) && o.get.every((id) => String(t.adds![id]) === youId));
      if (hit) { out.push({ id: o.id, at: hit.status_updated ?? hit.created ?? Date.now() }); return; }
    }
  });
  return out;
}
