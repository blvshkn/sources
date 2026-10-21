import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { denyOn } from "../deny";
import type { ReactNode } from "react";
import { DEADLINES, Player, YOU, playerById } from "../data";
import { teamLock } from "../locks";
import { eff, fmt, Trade } from "../engine";
import { startersOf, matchNow, type Live } from "../live";
import { Icon, IconName } from "./ui";
import { Tooltip } from "./Tooltip";
import { AskIcon } from "./AskIcon";
import type { Nudge } from "./Wire";
import type { Check } from "../gameDay";
import { NewsItem, ago, requestPlayer } from "../news";
import { AiMark } from "./WorkingLoader";

/** One thing Sources wants you to see. Every item has the same parts: an icon, a short title, when it happened, an
 *  optional line of context (a deadline or a source), the body, and one move to make about it. */
export interface InboxItem {
  id: string;
  icon: IconName;
  /** Two or three words: what kind of thing this is ("Before lock", "Trade offer", "Waiver add") */
  title: string;
  /** When: "Now", "12 min ago", "Today". Sorts the item into Now, Today or Earlier this week. */
  time: string;
  /** Context under the title: a deadline ("Locks Sun 1:00 PM ET") or a source. Optional. */
  meta?: string;
  text: string;
  /** Time-sensitive: before lock, or waivers about to run. The only items that get the warm accent. */
  urgent?: boolean;
  ai?: boolean;
  action: { label: string; run: () => void };
  /** Nudges teach Sources what you don't want; game-day items just leave the list. */
  nudge?: Nudge;
  /** "Not right now" for a suggested player: skips him in suggestions this week only (the Overview briefing's pattern) */
  skip?: () => void;
  /** A suggested player: "Not interested" takes him out of every suggestion. */
  pass?: () => void;
  passName?: string;
}

export type InboxGroup = "now" | "today" | "week";
export const GROUPS: { id: InboxGroup; label: string }[] = [{ id: "now", label: "Now" }, { id: "today", label: "Today" }, { id: "week", label: "Earlier this week" }];
/** "Now", "Live", "12 min ago" and "5m" are now; "This week", "2d" and "Yesterday" are earlier; the rest is today. */
export const groupOf = (time: string): InboxGroup =>
  /^(now|live)$|^\d+\s*(m|min)\b/i.test(time.trim()) ? "now" : /this week|yesterday|^\d+\s*d\b|days? ago/i.test(time) ? "week" : "today";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
/** Waivers run within the next day: the day before the run, or the run day itself before 3 AM */
function waiversSoon(): boolean {
  const m = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*/i.exec(DEADLINES.waivers || "");
  if (!m) return false;
  const run = DAYS.indexOf(m[1].toLowerCase()), now = new Date(), d = now.getDay();
  return d === (run + 6) % 7 || (d === run && now.getHours() < 3);
}
const kindTitle: Record<Nudge["kind"], string> = { ir: "Injured reserve", need: "Trade idea", offer: "Trade offer", news: "League news", stale: "Tag check", lineup: "Before lock", waiver: "Waiver add", slot: "Slot report" };

/** Game-day alerts, live moments and the wire's nudges in one list, grouped by time and urgent first in each group.
 *  Built from the same data the Lineup and Wire screens use, so nothing here is invented for the feed. */
export function buildInbox({ nudges, checks, live, go, loadTrade, keepTag, news = [], pass, skip, partner }: {
  nudges: Nudge[];
  checks: Check[];
  live: Live;
  go: (dest: string) => void;
  loadTrade: (t: Trade) => void;
  keepTag: (id: string) => void;
  /** Your starters with a status story in the last day. */
  news?: { p: Player; n: NewsItem }[];
  pass?: (p: { id: string; name: string }) => void;
  /** "Not right now" on a suggested player: this week only */
  skip?: (p: { id: string; name: string }) => void;
  /** The team in the deal you're building: what they need, as one plain line. */
  partner?: { id: string; text: string; onNotes: () => void };
}): InboxItem[] {
  const out: InboxItem[] = [];
  // Game day: anything that still needs a move before lock. IR and the Sleeper swap come from the nudges below.
  // gameDayChecks already leaves out players whose games have started; this guards against a newer live read. Each
  // item shows its own player's kickoff, not the week's first.
  checks.filter((c) => !c.key.startsWith("ir")).forEach((c) => {
    const p = c.player;
    if (p && teamLock(live, p.nfl)) return;
    const lock = c.lockAt ? `Locks ${c.lockAt}` : undefined;
    const urgent = c.tone !== "info";
    out.push({
      id: `chk-${c.key}`, icon: c.icon, title: urgent ? "Before lock" : c.key === "flex" ? "Flex call" : c.key === "bench" ? "Bench" : "Lineup",
      time: "Now", meta: lock, text: c.text, urgent, ai: c.key === "flex",
      action: c.key === "flex" ? { label: "Compare them", run: () => go("roster:compare") }
        : c.key === "bench" ? { label: "Open waivers", run: () => go("waivers") }
        : { label: "Fix lineup", run: () => go("roster") },
    });
  });

  // Live moments: starters past their projection, then one running line for the finals. The lineup set in Sleeper.
  const starters = startersOf(YOU).map(playerById).filter((p): p is Player => !!p);
  starters.forEach((p) => {
    const pts = live.points[p.id], proj = eff(p, true);
    if (live.games[p.nfl] === "in_game" && pts !== undefined && proj > 0 && pts >= proj)
      out.push({ id: `fire-${p.id}`, icon: "activity", title: "On fire", time: "Live", text: `${p.name} has ${pts.toFixed(1)} already, past his ${proj.toFixed(1)} projection.`, action: { label: "Open matchup", run: () => go("matchup") } });
  });
  const done = starters.filter((p) => live.games[p.nfl] === "complete" && live.points[p.id] !== undefined);
  // Once both sides are done, one line with the result, the same one the Wire card and the matchup show
  const ms = matchNow(live);
  if (ms.result) {
    out.push({ id: `final-week`, icon: "check", title: "Final score", time: "Today", text: `${ms.result.long.charAt(0).toUpperCase()}${ms.result.long.slice(1)}.`,
      action: { label: "Open matchup", run: () => go("matchup") } });
  } else if (done.length) {
    const got = done.reduce((a, p) => a + (live.points[p.id] ?? 0), 0), want = done.reduce((a, p) => a + eff(p, true), 0);
    out.push({ id: `final-${done.length}`, icon: "check", title: "Games final", time: "Today",
      text: `${done.length} of your starters ${done.length === 1 ? "is" : "are"} final with ${got.toFixed(1)} pts, ${fmt(got - want)} against their projections.`,
      action: { label: "Open matchup", run: () => go("matchup") } });
  }

  // News: a starter's status changed. Opens his sheet on the Wire's news card.
  news.forEach(({ p, n }) => {
    out.push({ id: `pnews-${n.id}`, icon: "alert", title: "Player news", time: n.at ? ago(n.at) : "Today", meta: n.source,
      text: n.title.toLowerCase().includes(p.name.split(" ").slice(-1)[0].toLowerCase()) ? n.title : `${p.name}: ${n.title}`,
      action: { label: "Open player", run: () => { requestPlayer(p.id); go("wire:intel"); } } });
  });

  // The wire: offers, trade ideas, news, waivers, stale tags, patterns
  const soon = waiversSoon();
  nudges.forEach((n) => {
    const text = `${n.headline.charAt(0).toUpperCase()}${n.headline.slice(1)}${n.emph ? ` ${n.emph}` : ""}`;
    const meta = n.deadline ? n.deadline.replace(/^Trade deadline\s*/i, "Deadline ").replace(/^Lineups lock\s*/i, "Locks ") : undefined;
    const action = n.kind === "offer" && n.offer ? { label: "Review offer", run: () => loadTrade(n.offer!) }
      : n.trades[0] ? { label: "Open in builder", run: () => loadTrade(n.trades[0]) }
      : n.kind === "stale" && n.tagId ? { label: "Still true", run: () => keepTag(n.tagId!) }
      : n.kind === "slot" ? { label: "See slot report", run: () => go("roster:slots") }
      : n.kind === "lineup" ? { label: "Fix lineup", run: () => go("roster") }
      : n.go ? { label: n.go.label, run: () => go(n.go!.tab) }
      : { label: "Open Overview", run: () => go("wire:intel") };
    const icon: IconName = n.kind === "offer" ? "send" : n.kind === "need" ? "trade" : n.kind === "waiver" ? "waivers" : n.kind === "stale" ? "clock" : n.kind === "slot" ? "values" : n.kind === "lineup" ? "helmet" : "alert";
    const closing = n.kind === "waiver" && soon;
    out.push({ id: n.id, icon, title: closing ? "Waivers close soon" : kindTitle[n.kind], time: n.time, meta, text,
      urgent: n.kind === "lineup" || closing, ai: n.kind === "need" || n.kind === "news" || n.kind === "slot" || n.kind === "waiver", action, nudge: n,
      skip: n.pass && skip ? () => skip(n.pass!) : undefined,
      pass: n.pass && pass ? () => pass(n.pass!) : undefined, passName: n.pass?.name });
  });

  // The team you're dealing with, as a plain row like everything else
  if (partner) out.push({ id: `partner-${partner.id}`, icon: "trade", title: "Trading with", time: "Now", text: partner.text, action: { label: "Open notes", run: partner.onNotes } });

  // By time (Now, Today, Earlier this week), urgent first in each; otherwise the order above holds
  return GROUPS.flatMap((g) => {
    const xs = out.filter((x) => groupOf(x.time) === g.id);
    return [...xs.filter((x) => x.urgent), ...xs.filter((x) => !x.urgent)];
  });
}

/** "Locks Sun 1:00 PM ET" -> "Locks " + mono "Sun 1:00 PM ET". Dates and times are data, so they read in Geist Mono. */
function Meta({ s }: { s: string }) {
  const m = /^(.*?)((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Week)\b.*|\d.*)$/.exec(s);
  if (!m) return <>{s}</>;
  return <>{m[1]}<span className="ibx-mono">{m[2]}</span></>;
}

/** The feed itself, grouped Now, Today and Earlier this week. Docked as the right panel on wide screens (open or closed from the bell), a slide-over everywhere else. */
export function InboxPanel({ items, read, onRead, onReadAll, onDismiss, onAsk, onClose, context, open, focusTick = 0 }: {
  items: InboxItem[];
  read: string[];
  onRead: (id: string) => void;
  onReadAll: () => void;
  /** "Not right now": hides the item for this week, with an undo. Nothing is learned from it. */
  onDismiss: (it: InboxItem) => void;
  onAsk: (q: string) => void;
  onClose: () => void;
  /** Reserved slot above the list for a designed card. Kept empty on purpose: the inbox is notifications only,
   *  and this spot is held for a future sponsored placement. */
  context?: ReactNode;
  open: boolean;
  /** Goes up each time someone opens the inbox from the bell. A panel that's simply docked open never takes focus. */
  focusTick?: number;
}) {
  const unread = items.filter((x) => !read.includes(x.id)).length;
  const [q, setQ] = useState("");
  // Items already here when the panel first draws sit still; anything that arrives later slides in
  const seen = useRef<Set<string> | null>(null);
  if (!seen.current) seen.current = new Set(items.map((x) => x.id));
  const head = useRef<HTMLHeadingElement>(null);
  // Opening from the bell moves focus into the panel; closing hands it back to whatever opened it, or to the bell
  const back = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!focusTick) return;
    back.current = document.activeElement as HTMLElement | null;
    head.current?.focus({ preventScroll: true });
  }, [focusTick]);
  // Before paint, so focus moves while the panel is still visible (reduced motion hides it at once)
  useLayoutEffect(() => {
    if (open || !head.current?.closest("aside")?.contains(document.activeElement)) return;
    const bell = [...document.querySelectorAll<HTMLElement>("button[aria-controls='inbox']")].find((b) => b.offsetParent);
    const to = back.current?.isConnected && back.current.offsetParent ? back.current : bell;
    to?.focus({ preventScroll: true });
    back.current = null;
  }, [open]);
  return (
    <>
      <div className="ibx-head">
        <h2 className="ibx-title" ref={head} tabIndex={-1}>Inbox{unread > 0 && <span className="ibx-count" aria-label={`${unread} unread`}>{unread}</span>}</h2>
        {/* Always there, so the header never shifts; with nothing unread it dims and a tap says so (deny.ts) */}
        <button className="ibx-allread" aria-disabled={unread === 0 || undefined} onClick={unread > 0 ? onReadAll : denyOn("Nothing unread. You're caught up.")}>Mark all read</button>
        <button className="btn btn-icon btn-ghost ibx-close" aria-label="Close inbox" onClick={onClose}><Icon name="x" size={20} /></button>
      </div>
      {context}
      <div className="ibx-list" role="region" aria-label="Notifications">
        {items.length === 0 && (
          <div className="ibx-empty">
            <span className="ibx-empty-ic" aria-hidden="true"><Icon name="check" size={18} /></span>
            <b>You're all caught up.</b>
            <span>Lineup alerts, offers and waiver picks land here.</span>
          </div>
        )}
        {GROUPS.map((g) => {
          const xs = items.filter((x) => groupOf(x.time) === g.id);
          if (!xs.length) return null;
          return (
            <section key={g.id} className="ibx-sec" aria-labelledby={`ibx-sec-${g.id}`}>
              <h3 className="ibx-sec-h" id={`ibx-sec-${g.id}`}>{g.label}</h3>
              <ul className="ibx-sub">
                {xs.map((it) => {
                  const isRead = read.includes(it.id);
                  return (
                    <li key={it.id} className={`ibx-n${isRead ? " is-read" : ""}${it.urgent ? " is-urgent" : ""}${seen.current!.has(it.id) ? "" : " fresh"}`}>
                      <span className="ibx-n-ic" aria-hidden="true"><Icon name={it.icon} size={16} /></span>
                      <div className="ibx-n-main">
                        <div className="ibx-n-top">
                          <b className="ibx-n-title">{!isRead && <span className="sr-only">Unread: </span>}{it.title}</b>
                          {/* The group heading already says "Now", "Today" or "this week"; the time shows when it says more ("12 min ago", "Live") */}
                          {!/^(now|today|this week)$/i.test(it.time) && <span className="ibx-n-time">{it.time}</span>}
                          <i className="ibx-n-dot" aria-hidden="true" />
                        </div>
                        {(it.meta || it.ai) && (
                          <div className="ibx-n-meta">
                            {it.meta && <span><Meta s={it.meta} /></span>}
                            {it.ai && <Tooltip focusable content="Written by AI from this league's data. Worth a second look before you act."><span className="ibx-ai"><AiMark size={12} />AI</span></Tooltip>}
                          </div>
                        )}
                        <p className="ibx-n-text">{it.text}</p>
                        <div className="ibx-n-acts">
                          <button className="btn btn-sm ibx-cta" onClick={() => { onRead(it.id); it.action.run(); }}>{it.action.label}</button>
                          <button className="ibx-later" onClick={() => { onRead(it.id); if (it.skip) it.skip(); else onDismiss(it); }}
                            aria-label={`Not right now: ${it.title}`}>Not right now</button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {/* Sends the question to Ask Sources, where the work shows as a thinking trace */}
      <form className="ibx-ask" onSubmit={(e) => { e.preventDefault(); onAsk(q.trim()); setQ(""); }}>
        <AskIcon size={18} />
        <label htmlFor="ibx-q" className="sr-only">Ask your league anything</label>
        <input id="ibx-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your league anything" autoComplete="off" />
        <button className="btn btn-icon btn-sm ibx-send" type="submit" aria-label="Ask Sources"><Icon name="ask" size={16} /></button>
      </form>
    </>
  );
}
