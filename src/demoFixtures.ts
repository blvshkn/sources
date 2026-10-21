// Demo league fixtures for features that read your own saved lists (Sent offers, the Waivers watchlist) rather than
// league data. A first-time visitor to the demo would otherwise see them empty. Everything here is the demo league's:
// its teams, its players, its week 7. Never used for a live league. See docs/demo-parity.md for the full checklist.
import type { SentOffer } from "./sentOffers";
import type { WatchSet } from "./watchMerge.js";

const DAY = 864e5, HOUR = 36e5;

/** Offers "you" sent in the demo this week: one still pending, and one declined for each quick reason, so the
 *  decline panel, its tag on the manager and its effect on ideas (lean his way, skip a position, leave a player out,
 *  pause until week 9) all show. None of them involve Mike, the demo's default trade partner. */
function demoSent(now: number): SentOffer[] {
  const o = (n: number, partnerId: string, give: string[], get: string[], pitch: string, agoH: number, via: string, extra: Partial<SentOffer> = {}): SentOffer => {
    const sentAt = now - agoH * HOUR;
    return { id: `demo-so-${n}`, deal: `demo-so-${n}`, leagueId: "demo", partnerId, give, get, pitch, sentAt, version: 1, via, week: 7, status: "pending", updatedAt: sentAt, ...extra };
  };
  const declined = (agoH: number, why: SentOffer["why"]): Partial<SentOffer> => ({ status: "declined", statusAt: now - agoH * HOUR, why, updatedAt: now - agoH * HOUR });
  return [
    o(1, "pat", ["romeo-doubs", "tank-bigsby"], ["tucker-kraft"], "Pat, Romeo Doubs and Tank Bigsby for Tucker Kraft? Two bench bats for your TE, and you get WR and RB depth for the bye weeks.", 5, "text"),
    o(2, "taylor", ["chuba-hubbard"], ["brock-bowers"], "Taylor, Chuba Hubbard for Brock Bowers? Hubbard gives you an RB2 next to McCaffrey, and Theo Johnson can hold TE.", 30, "share sheet",
      declined(26, { kind: "value", at: now - 26 * HOUR })),
    o(3, "kev", ["jalen-coker", "mike-gesicki"], ["isiah-pacheco"], "Kev, Jalen Coker and Mike Gesicki for Isiah Pacheco? Two pieces for one, and Coker's targets are climbing.", 2 * 24 + 4, "copied",
      declined(2 * 24, { kind: "thin", pos: "RB", at: now - 2 * DAY })),
    o(4, "chris", ["zay-flowers"], ["george-kittle"], "Chris, Zay Flowers for George Kittle? With Nabers out you need a WR more than a second TE spot.", 3 * 24 + 2, "text",
      declined(3 * 24, { kind: "keeps", playerId: "george-kittle", at: now - 3 * DAY })),
    o(5, "alex", ["jaylen-warren"], ["jake-ferguson"], "Alex, Jaylen Warren for Jake Ferguson? Warren's back from his bye next week, and Zach Ertz can hold TE.", 4 * 24 + 6, "share sheet",
      declined(4 * 24, { kind: "notNow", week: 7, at: now - 4 * DAY })),
  ];
}

/** Two waiver adds you're watching this week: a rookie stash and a TE for the bye-week hole. */
function demoWatch(now: number): WatchSet {
  return { "dont-e-thornton": { week: 7, at: now - 2 * DAY }, "chig-okonkwo": { week: 7, at: now - DAY } };
}

const SEEDED = "sources.demo.seeded.v1";
const SENT = "sources.demo.sentOffers.v1", WATCH = "sources.demo.watchlist";

/** Fills the demo's own saved lists once per browser, only where they're still empty, so a visitor who already
 *  changed them keeps their changes. Runs before the app reads storage. Clearing your data seeds them again.
 *  The demo league stays in week 7, so on later visits every saved time moves forward by the same amount: offers
 *  still read "5h ago" and "2d ago", a "Not trading now" pause still runs to week 9, "Wanted more value" never fades. */
export function seedDemo(now = Date.now()) {
  try {
    const seededAt = Number(localStorage.getItem(SEEDED));
    if (seededAt > 0) {
      const d = now - seededAt;
      if (d < DAY) return;
      const shift = (n: unknown) => (typeof n === "number" && n > 0 ? n + d : n);
      const sent = JSON.parse(localStorage.getItem(SENT) || "null");
      if (Array.isArray(sent)) localStorage.setItem(SENT, JSON.stringify(sent.map((o) => (!o || typeof o !== "object" ? o : {
        ...o, sentAt: shift(o.sentAt), statusAt: shift(o.statusAt), updatedAt: shift(o.updatedAt),
        ...(o.why && typeof o.why === "object" ? { why: { ...o.why, at: shift(o.why.at), resumedAt: shift(o.why.resumedAt) } } : {}),
      }))));
      const watch = JSON.parse(localStorage.getItem(WATCH) || "null");
      if (watch && typeof watch === "object" && !Array.isArray(watch)) localStorage.setItem(WATCH, JSON.stringify(Object.fromEntries(Object.entries(watch).map(([id, e]) => [id, e && typeof e === "object" ? { ...e, at: shift((e as { at?: number }).at) } : e]))));
      localStorage.setItem(SEEDED, String(now));
      return;
    }
    const empty = (k: string) => {
      const v = localStorage.getItem(k);
      if (!v) return true;
      try { const j = JSON.parse(v); return Array.isArray(j) ? !j.length : !!j && typeof j === "object" && !Object.keys(j).length; } catch { return true; }
    };
    if (empty(SENT)) localStorage.setItem(SENT, JSON.stringify(demoSent(now)));
    if (empty(WATCH) && empty("sources.demo.watch")) localStorage.setItem(WATCH, JSON.stringify(demoWatch(now)));
    localStorage.setItem(SEEDED, String(now));
  } catch { /* storage blocked or unreadable: the demo shows its lists as they are */ }
}
