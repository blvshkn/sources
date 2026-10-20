import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { denyOn } from "../deny";
import type { ReactNode } from "react";
import { Player, DEADLINES, YOU, playerById } from "../data";
import { eff, fmt, Trade } from "../engine";
import { startersOf, matchNow, type Live } from "../live";
import { Icon, IconName } from "./ui";
import { Tooltip } from "./Tooltip";
import type { Nudge } from "./Wire";
import type { Check } from "./Roster";
import { NewsItem, ago, requestPlayer } from "../news";

/** One thing Sources wants you to see: what happened, when, and the one move to make about it. */
export interface InboxItem {
  id: string;
  icon: IconName;
  text: string;
  meta: string;
  urgent?: boolean;
  ai?: boolean;
  action: { label: string; run: () => void };
  /** Nudges teach Sources what you don't want; game-day items just leave the list. */
  nudge?: Nudge;
  /** A suggested player: "Not interested" takes him out of every suggestion. */
  pass?: () => void;
  passName?: string;
}

const lockShort = () => DEADLINES.lock.replace(/^Lineups lock\s*/i, "Locks ");

/** Game-day alerts, live moments and the wire's nudges in one list, urgent first. Built from the same data the
 *  Lineup and Wire screens use, so nothing here is invented for the feed. */
export function buildInbox({ nudges, checks, live, go, loadTrade, keepTag, news = [], pass, partner }: {
  nudges: Nudge[];
  checks: Check[];
  live: Live;
  go: (dest: string) => void;
  loadTrade: (t: Trade) => void;
  keepTag: (id: string) => void;
  /** Your starters with a status story in the last day. */
  news?: { p: Player; n: NewsItem }[];
  pass?: (p: { id: string; name: string }) => void;
  /** The team in the deal you're building: what they need, as one plain line. */
  partner?: { id: string; text: string; onNotes: () => void };
}): InboxItem[] {
  const out: InboxItem[] = [];
  const lock = DEADLINES.lock ? lockShort() : "Before lock";

  // Game day: anything that still needs a move before lock. IR and the Sleeper swap come from the nudges below.
  checks.filter((c) => !c.key.startsWith("ir")).forEach((c) => {
    const p = c.player;
    const state = p ? live.games[p.nfl] : undefined;
    if (p && (state === "in_game" || state === "complete")) return;
    out.push({
      id: `chk-${c.key}`, icon: c.icon, text: c.text, meta: lock, urgent: c.tone !== "info", ai: c.key === "flex",
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
      out.push({ id: `fire-${p.id}`, icon: "activity", text: `${p.name} is on fire: ${pts.toFixed(1)} already, past his ${proj.toFixed(1)} projection.`, meta: "Live", action: { label: "Open matchup", run: () => go("matchup") } });
  });
  const done = starters.filter((p) => live.games[p.nfl] === "complete" && live.points[p.id] !== undefined);
  // Once both sides are done, one line with the result, the same one the Wire card and the matchup show
  const ms = matchNow(live);
  if (ms.result) {
    out.push({ id: `final-week`, icon: "check", meta: "Final", text: `Final: ${ms.result.long.charAt(0).toLowerCase()}${ms.result.long.slice(1)}.`,
      action: { label: "Open matchup", run: () => go("matchup") } });
  } else if (done.length) {
    const got = done.reduce((a, p) => a + (live.points[p.id] ?? 0), 0), want = done.reduce((a, p) => a + eff(p, true), 0);
    out.push({ id: `final-${done.length}`, icon: "check", meta: "Final",
      text: `${done.length} of your starters ${done.length === 1 ? "is" : "are"} final with ${got.toFixed(1)} pts, ${fmt(got - want)} against their projections.`,
      action: { label: "Open matchup", run: () => go("matchup") } });
  }

  // News: a starter's status changed. Opens his sheet on the Wire's news card.
  news.forEach(({ p, n }) => {
    out.push({ id: `pnews-${n.id}`, icon: "alert", text: n.title.toLowerCase().includes(p.name.split(" ").slice(-1)[0].toLowerCase()) ? n.title : `${p.name}: ${n.title}`, meta: `${n.source}${n.at ? ` · ${ago(n.at)}` : ""}`,
      action: { label: "Open player", run: () => { requestPlayer(p.id); go("wire:intel"); } } });
  });

  // The wire: offers, trade ideas, news, waivers, stale tags, patterns
  nudges.forEach((n) => {
    const text = `${n.headline.charAt(0).toUpperCase()}${n.headline.slice(1)}${n.emph ? ` ${n.emph}` : ""}`;
    const meta = n.deadline ? `${n.time} · ${n.deadline.replace(/^Trade deadline\s*/i, "Deadline ")}` : n.time;
    const action = n.kind === "offer" && n.offer ? { label: "Review offer", run: () => loadTrade(n.offer!) }
      : n.trades[0] ? { label: "Open in builder", run: () => loadTrade(n.trades[0]) }
      : n.kind === "stale" && n.tagId ? { label: "Still true", run: () => keepTag(n.tagId!) }
      : n.kind === "slot" ? { label: "See slot report", run: () => go("roster:slots") }
      : n.kind === "lineup" ? { label: "Fix lineup", run: () => go("roster") }
      : n.go ? { label: n.go.label, run: () => go(n.go!.tab) }
      : { label: "Open the wire", run: () => go("wire:intel") };
    const icon: IconName = n.kind === "offer" ? "send" : n.kind === "need" ? "trade" : n.kind === "waiver" ? "waivers" : n.kind === "stale" ? "clock" : n.kind === "slot" ? "values" : n.kind === "lineup" ? "helmet" : "alert";
    out.push({ id: n.id, icon, text, meta, urgent: n.kind === "ir" || n.kind === "lineup", ai: n.kind === "need" || n.kind === "news" || n.kind === "slot" || n.kind === "waiver", action, nudge: n,
      pass: n.pass && pass ? () => pass(n.pass!) : undefined, passName: n.pass?.name });
  });

  // The team you're dealing with, as a plain row like everything else
  if (partner) out.push({ id: `partner-${partner.id}`, icon: "trade", text: partner.text, meta: "Trading with", action: { label: "Open notes", run: partner.onNotes } });

  // Urgent first; otherwise the order above (live, then newest wire items) holds
  return [...out.filter((x) => x.urgent), ...out.filter((x) => !x.urgent)];
}

/** The feed itself. Docked as the right panel on wide screens (open or closed from the bell), a slide-over everywhere else. */
export function InboxPanel({ items, read, onRead, onReadAll, onDismiss, onAsk, onClose, context, open, focusTick = 0 }: {
  items: InboxItem[];
  read: string[];
  onRead: (id: string) => void;
  onReadAll: () => void;
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
      <ul className="ibx-list" aria-label="Inbox">
        {items.length === 0 && <li className="ibx-empty">You're caught up. Sources will post here when something changes.</li>}
        {items.map((it) => {
          const isRead = read.includes(it.id);
          return (
            <li key={it.id} className={`ibx-item${isRead ? " read" : ""}${it.urgent ? " urgent" : ""}${seen.current!.has(it.id) ? "" : " fresh"}`}>
              <i className="ibx-dot" aria-hidden="true" />
              <span className="ibx-ic" aria-hidden="true"><Icon name={it.icon} size={16} /></span>
              <div className="ibx-body">
                <span className="ibx-meta">
                  {!isRead && <span className="sr-only">Unread.</span>}
                  {it.urgent && <b className="ibx-flag">Before lock</b>}
                  <span>{it.meta}</span>
                  {it.ai && <Tooltip focusable content="Written by AI from this league's data. Worth a second look before you act."><span className="ibx-ai"><Icon name="spark" size={11} />AI</span></Tooltip>}
                </span>
                <p className="ibx-text">{it.text}</p>
                <span className="ibx-acts">
                  <button className="btn btn-sm ibx-go" onClick={() => { onRead(it.id); it.action.run(); }}>{it.action.label}</button>
                  {it.pass && <button className="linkish ps-ibx-pass" onClick={() => { onRead(it.id); it.pass!(); }} aria-label={`Not interested in ${it.passName}`}>Not interested</button>}
                  <button className="ibx-x" onClick={() => onDismiss(it)} aria-label={`Dismiss: ${it.text}`}><Icon name="x" size={14} /></button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <form className="ibx-ask" onSubmit={(e) => { e.preventDefault(); onAsk(q.trim()); setQ(""); }}>
        <Icon name="spark" size={18} />
        <label htmlFor="ibx-q" className="sr-only">Ask your league anything</label>
        <input id="ibx-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your league anything" autoComplete="off" />
        <button className="btn btn-icon btn-sm ibx-send" type="submit" aria-label="Ask Sources"><Icon name="send" size={16} /></button>
      </form>
    </>
  );
}
