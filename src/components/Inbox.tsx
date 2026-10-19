import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Player, DEADLINES } from "../data";
import { eff, fmt, Lineup, Trade } from "../engine";
import type { Live } from "../live";
import { Icon, IconName } from "./ui";
import type { Nudge } from "./Wire";
import type { Check } from "./Roster";

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
}

const lockShort = () => DEADLINES.lock.replace(/^Lineups lock\s*/i, "Locks ");

/** Game-day alerts, live moments and the wire's nudges in one list, urgent first. Built from the same data the
 *  Lineup and Wire screens use, so nothing here is invented for the feed. */
export function buildInbox({ nudges, checks, lineup, live, go, loadTrade, keepTag }: {
  nudges: Nudge[];
  checks: Check[];
  lineup: Lineup;
  live: Live;
  go: (dest: string) => void;
  loadTrade: (t: Trade) => void;
  keepTag: (id: string) => void;
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

  // Live moments: starters past their projection, then one running line for the finals
  const starters = lineup.slots.map((x) => x.player).filter((p): p is Player => !!p);
  starters.forEach((p) => {
    const pts = live.points[p.id], proj = eff(p, true);
    if (live.games[p.nfl] === "in_game" && pts !== undefined && proj > 0 && pts >= proj)
      out.push({ id: `fire-${p.id}`, icon: "activity", text: `${p.name} is on fire: ${pts.toFixed(1)} already, past his ${proj.toFixed(1)} projection.`, meta: "Live", action: { label: "Open matchup", run: () => go("matchup") } });
  });
  const done = starters.filter((p) => live.games[p.nfl] === "complete" && live.points[p.id] !== undefined);
  if (done.length) {
    const got = done.reduce((a, p) => a + (live.points[p.id] ?? 0), 0), want = done.reduce((a, p) => a + eff(p, true), 0);
    out.push({ id: `final-${done.length}`, icon: "check", meta: "Final",
      text: `${done.length} of your starters ${done.length === 1 ? "is" : "are"} final with ${got.toFixed(1)} pts, ${fmt(got - want)} against their projections.`,
      action: { label: "Open matchup", run: () => go("matchup") } });
  }

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
    out.push({ id: n.id, icon, text, meta, urgent: n.kind === "ir" || n.kind === "lineup", ai: n.kind === "need" || n.kind === "news" || n.kind === "slot", action, nudge: n });
  });

  // Urgent first; otherwise the order above (live, then newest wire items) holds
  return [...out.filter((x) => x.urgent), ...out.filter((x) => !x.urgent)];
}

/** The feed itself. Docked as the right panel on wide screens, a slide-over everywhere else. */
export function InboxPanel({ items, read, onRead, onReadAll, onDismiss, onAsk, onClose, context, open }: {
  items: InboxItem[];
  read: string[];
  onRead: (id: string) => void;
  onReadAll: () => void;
  onDismiss: (it: InboxItem) => void;
  onAsk: (q: string) => void;
  onClose: () => void;
  context?: ReactNode;
  open: boolean;
}) {
  const unread = items.filter((x) => !read.includes(x.id)).length;
  const [q, setQ] = useState("");
  // Items already here when the panel first draws sit still; anything that arrives later slides in
  const seen = useRef<Set<string> | null>(null);
  if (!seen.current) seen.current = new Set(items.map((x) => x.id));
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (open) head.current?.focus({ preventScroll: true }); }, [open]);
  return (
    <>
      <div className="ibx-head">
        <h2 className="ibx-title" ref={head} tabIndex={-1}>Inbox{unread > 0 && <span className="ibx-count" aria-label={`${unread} unread`}>{unread}</span>}</h2>
        {unread > 0 && <button className="ibx-allread" onClick={onReadAll}>Mark all read</button>}
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
                  {it.ai && <span className="ibx-ai"><Icon name="spark" size={11} />AI</span>}
                </span>
                <p className="ibx-text">{it.text}</p>
                <span className="ibx-acts">
                  <button className="btn btn-sm ibx-go" onClick={() => { onRead(it.id); it.action.run(); }}>{it.action.label}</button>
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
