import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Player } from "../data";
import { KIND_LABEL, NEWS_SOURCES, NewsItem, ago, byImpact, byNewest, sourcesLine, usePlayerNews, usePlayerRequest, useRosterNews } from "../news";
import { PlayerContext, contextFor, impactFor, playerWeight, roleLabel, yourPlayers } from "../impact";
import { Avatar } from "./Avatar";
import { PlayerSheet } from "./PlayerSheet";
import { Tooltip } from "./Tooltip";
import { Icon, StatusPill } from "./ui";

// Lettermarks stand in for source logos (we don't use third-party marks)
const MARK: Record<string, string> = { RotoWire: "RW", RotoBaller: "RB", ESPN: "E" };
const mark = (s: string) => MARK[s] ?? (s.replace(/[^A-Z]/g, "").slice(0, 2) || s.slice(0, 2).toUpperCase());

/** Excerpt clamped to three lines, with a toggle only when it actually overflows. */
function Excerpt({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    // Re-measure when the card's width changes (sheet sliding in, rotation, desktop columns)
    const check = () => setOver(el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);
  return (
    <>
      <p ref={ref} className={`nx-ex${open ? " open" : ""}`}>{text}</p>
      {(over || open) && <button type="button" className="nx-exp" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Less" : "More"}</button>}
    </>
  );
}

/** Story age, with the full date and time in a branded tip. */
function When({ d, at }: { d: Date; at: number | null }) {
  const full = d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return <Tooltip focusable content={full}><time dateTime={d.toISOString()} aria-label={full}>{ago(at)}</time></Tooltip>;
}

// RotoWire blurbs that reach us through ESPN have no per-article link; they point at his RotoWire page instead
const RW_PAGE = "https://www.rotowire.com/football/player.php";
function ReadLink({ n }: { n: NewsItem }) {
  // A RotoWire blurb carried by ESPN, with no RotoWire id to build his page from, still links to ESPN: say so
  const where = n.via && !/rotowire\.com/.test(n.url) && /rotowire/i.test(n.source) ? n.via : n.source;
  const a = <a className="nx-read" href={n.url} target="_blank" rel="noopener noreferrer">Read on {where}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span></a>;
  return n.url.startsWith(RW_PAGE) ? <Tooltip content="Opens his RotoWire page, where this update is listed">{a}</Tooltip> : a;
}

/** One story: source and age, headline, excerpt, our read on it, and the link out. */
export function StoryCard({ n, impact }: { n: NewsItem; impact?: string | null }) {
  const when = n.at ? new Date(n.at) : null;
  return (
    <article className="nx">
      <div className="nx-src">
        <span className="nx-mark" aria-hidden="true">{mark(n.source)}</span>
        <b>{n.source}</b>
        {n.via && <span className="nx-via">via {n.via}</span>}
        {when && <When d={when} at={n.at} />}
        {n.kind && n.kind !== "feature" && <span className={`nx-kind k-${n.kind}`}>{KIND_LABEL[n.kind]}</span>}
      </div>
      <h4 className="nx-h">{n.title}</h4>
      {n.summary && <Excerpt text={n.summary} />}
      {impact && (
        <div className="nx-imp">
          <div className="nx-imp-k">
            <i aria-hidden="true" />What it means for you
            <Tooltip focusable content="Sources' own read, from your league's lineups, projections and schedule. Not from the article.">
              <span className="nx-imp-by"><Icon name="spark" size={11} />Sources</span>
            </Tooltip>
          </div>
          <p>{impact}</p>
        </div>
      )}
      <ReadLink n={n} />
    </article>
  );
}

/** Impact lines for a list. One read per player is enough; a later status story gets its own only when the
 *  first read was about something else, so the same point never shows twice. */
function impacts(p: Player, items: NewsItem[], c: PlayerContext): (string | null)[] {
  let general = false, status = false;
  return items.map((n) => {
    const isStatus = n.kind === "status" || n.kind === "move";
    if ((isStatus && status) || (!isStatus && (general || status)) || (isStatus && general && !p.status)) return null;
    const t = impactFor(p, n, c);
    if (t) { if (isStatus) status = true; else general = true; }
    return t;
  });
}

function Skeleton({ n = 2, who }: { n?: number; who?: boolean }) {
  return (
    <div className="nx-list" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="nx-skel">
          {who && <span className="nx-sk-who"><i /><span><b /><b /></span></span>}
          <span className="nx-sk-card"><b className="s" /><b className="h" /><b /><b /><b className="m" /></span>
        </div>
      ))}
    </div>
  );
}

/** The player sheet's news: newest first, three to start. */
export function PlayerNews({ p }: { p: Player }) {
  const { items, loading } = usePlayerNews(p);
  const c = useMemo(() => contextFor(p), [p.id]);
  const list = byNewest(items);
  const [more, setMore] = useState(false);
  const shown = more ? list : list.slice(0, 3);
  const lines = impacts(p, shown, c);
  return (
    <section className="ps-games ps-news" id="ps-news" aria-label={`News on ${p.name}`} aria-busy={loading}>
      <div className="ps-sub"><b>News</b><span>{loading ? "Checking sources" : list.length ? `${list.length} ${list.length === 1 ? "story" : "stories"}` : NEWS_SOURCES.join(" · ")}</span></div>
      {loading ? <Skeleton n={2} />
        : list.length ? <div className="nx-list">{shown.map((n, i) => <StoryCard key={n.id ?? n.url} n={n} impact={lines[i]} />)}</div>
        : <p className="nx-empty">No recent news on {p.name}. We check {sourcesLine()} every 10 minutes.</p>}
      {list.length > 3 && <button type="button" className="nx-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>{more ? "Show less" : `Show ${list.length - 3} more`}<Icon name="chev" size={14} /></button>}
    </section>
  );
}

const whereFor = (c: PlayerContext) => c.role === "starter" ? `Starting${c.slot ? ` at ${c.slot === "SF" ? "superflex" : c.slot === "FLEX" ? "flex" : c.slot}` : ""}` : c.role === "bench" ? "On your bench" : c.role === "ir" ? "On your IR" : "On your taxi squad";

/** One story as a compact row in a divided list: meta line, headline, excerpt, our read (top story only), link out. */
function StoryRow({ n, impact }: { n: NewsItem; impact?: string | null }) {
  const when = n.at ? new Date(n.at) : null;
  return (
    <article className="nxs">
      <div className="nx-src">
        <span className="nx-mark" aria-hidden="true">{mark(n.source)}</span>
        <b>{n.source}</b>
        {n.via && <span className="nx-via">via {n.via}</span>}
        {when && <When d={when} at={n.at} />}
        {n.kind && n.kind !== "feature" && <span className={`nx-kind k-${n.kind}`}>{KIND_LABEL[n.kind]}</span>}
      </div>
      <h4 className="nx-h">{n.title}</h4>
      {n.summary && <p className="nxs-ex">{n.summary}</p>}
      {impact && (
        <div className="nx-imp">
          <div className="nx-imp-k">
            <i aria-hidden="true" />What it means for you
            <Tooltip focusable content="Sources' own read, from your league's lineups, projections and schedule. Not from the article.">
              <span className="nx-imp-by"><Icon name="spark" size={11} />Sources</span>
            </Tooltip>
          </div>
          <p>{impact}</p>
        </div>
      )}
      <ReadLink n={n} />
    </article>
  );
}

// How many stories each player shows, kept for the session so a re-render or a tab switch doesn't fold them back up
const STEP = 3;
const OPEN_KEY = "sources.news.open";
const openCounts: Record<string, number> = (() => {
  try { const v = JSON.parse(sessionStorage.getItem(OPEN_KEY) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
})();
function rememberOpen(id: string, count: number) {
  if (count <= STEP) delete openCounts[id]; else openCounts[id] = count;
  try { sessionStorage.setItem(OPEN_KEY, JSON.stringify(openCounts)); } catch { /* blocked */ }
}
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

/** One player: header (opens his sheet), up to three stories, then more inline, three at a time. */
function PlayerGroup({ p, c, items, onOpen }: { p: Player; c: PlayerContext; items: NewsItem[]; onOpen: () => void }) {
  const [count, setCount] = useState(() => Math.min(items.length, Math.max(STEP, openCounts[p.id] ?? STEP)));
  const listRef = useRef<HTMLDivElement>(null);
  const from = useRef<number | null>(null);
  const before = useRef(0);
  const anim = useRef<Animation | null>(null);
  const shown = items.slice(0, count);
  const left = Math.max(0, items.length - count);
  const impact = useMemo(() => (items[0] ? impactFor(p, items[0], c) : null), [p.id, items[0]?.id, items[0]?.kind]);
  const label = roleLabel(c);
  const listId = `nxs-${p.id}`;

  // Grow from the old height to the new one after the extra rows render
  useLayoutEffect(() => {
    const el = listRef.current, h0 = from.current;
    from.current = null;
    if (!el || h0 == null || reduced() || typeof el.animate !== "function") return;
    const h1 = el.offsetHeight;
    if (h1 === h0) return;
    anim.current?.cancel();
    el.style.overflow = "hidden";
    const a = el.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 220, easing: EASE });
    anim.current = a;
    const done = () => { if (anim.current === a) { el.style.overflow = ""; anim.current = null; } };
    a.onfinish = done; a.oncancel = done;
    // New rows fade in as the space opens
    Array.from(el.children).slice(before.current).forEach((r) => r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE }));
  }, [count]);

  const setTo = (next: number) => { rememberOpen(p.id, next); setCount(next); };
  const more = () => {
    anim.current?.cancel();
    from.current = listRef.current?.offsetHeight ?? null;
    before.current = count;
    setTo(Math.min(items.length, count + STEP));
  };
  const fewer = () => {
    const el = listRef.current;
    const keep = el?.children[STEP] as HTMLElement | undefined;
    const fold = () => {
      setTo(STEP);
      // If folding left the player's header above the fold, bring it back so you don't lose your place
      const g = el?.closest(".nxr-g") as HTMLElement | null;
      if (g && g.getBoundingClientRect().top < 0) g.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
    };
    if (!el || !keep || reduced() || typeof el.animate !== "function") return fold();
    // Shrink to where the fourth row starts, then drop the extra rows
    anim.current?.cancel();
    const h0 = el.offsetHeight, h1 = keep.offsetTop - el.offsetTop;
    el.style.overflow = "hidden";
    const a = el.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 220, easing: EASE, fill: "forwards" });
    anim.current = a;
    a.onfinish = () => { a.cancel(); el.style.overflow = ""; anim.current = null; fold(); };
  };

  return (
    <div className="nxr-g">
      <button type="button" className="nxr-who" onClick={onOpen} aria-label={`${p.name}, player details`}>
        <Avatar p={p} size={36} />
        <span className="nxr-name"><b>{p.name}</b><small>{p.pos} · {p.nfl}{label && <> · <span className={c.role === "starter" ? "on" : ""}>{label}</span></>}</small></span>
        <StatusPill p={p} />
        <Icon name="chev" size={16} />
      </button>
      <div className="nxs-list" id={listId} ref={listRef}>
        {shown.map((n, i) => <StoryRow key={n.id ?? n.url} n={n} impact={i === 0 ? impact : null} />)}
      </div>
      {items.length > STEP && (
        <button type="button" className="nxs-more" aria-controls={listId} aria-expanded={left === 0} onClick={left > 0 ? more : fewer}>
          {left > 0 ? <>Show {Math.min(STEP, left)} more{left > STEP && <span className="nxs-left"> ({left} left)</span>}</> : "Show fewer"}
          <Icon name="chev" size={14} />
        </button>
      )}
    </div>
  );
}

function RosterSkeleton() {
  return (
    <div className="nxr-list" aria-hidden="true">
      {[0, 1].map((g) => (
        <div key={g} className="nxr-g nxs-skel">
          <span className="nx-sk-who"><i /><span><b /><b /></span></span>
          <div className="nxs-list">{[0, 1].map((r) => <span key={r} className="nxs nxs-sk"><b className="s" /><b className="h" /><b /><b className="m" /></span>)}</div>
        </div>
      ))}
    </div>
  );
}

/** The Wire's news card: every player on your roster, ranked by what the news means for your lineup. */
export function RosterNews() {
  const players = yourPlayers();
  const { byId, loading } = useRosterNews(players);
  const [all, setAll] = useState(false);
  const [sheet, setSheet] = useState<{ p: Player; c: PlayerContext; news?: boolean } | null>(null);

  // Starters and status changes first
  const groups = players.flatMap((p) => {
    const items = byImpact(byId.get(p.id) ?? []);
    if (!items.length) return [];
    const c = contextFor(p);
    const top = items[0];
    return [{ p, c, items, weight: (top.score ?? 0) + playerWeight(p, c) + (top.kind === "status" ? 15 : 0) }];
  }).sort((a, b) => b.weight - a.weight);
  const shown = all ? groups : groups.slice(0, 5);

  // The inbox can ask for a player's news; open his sheet when it does
  const [want, clearWant] = usePlayerRequest();
  useEffect(() => {
    if (!want) return;
    const p = players.find((x) => x.id === want);
    clearWant();
    if (p) setSheet({ p, c: contextFor(p), news: true });
  }, [want]);

  return (
    <section className="card wk nxr" aria-label="News on your players" aria-busy={loading}>
      <div className="wk-head"><h2 className="section-title">News on your players</h2><span className="tiny muted nxr-src">{NEWS_SOURCES.join(" · ")}</span></div>
      {loading && !groups.length ? <RosterSkeleton />
        : groups.length ? (
          <div className="nxr-list">
            {shown.map(({ p, c, items }) => <PlayerGroup key={p.id} p={p} c={c} items={items} onOpen={() => setSheet({ p, c })} />)}
          </div>
        ) : <p className="nx-empty">No recent news on your players. We check {sourcesLine()} every 10 minutes.</p>}
      {groups.length > 5 && <button type="button" className="nx-more nxr-all" aria-expanded={all} onClick={() => setAll((a) => !a)}>{all ? "Show top 5 players" : `Show all players (${groups.length})`}<Icon name="chev" size={14} /></button>}
      {sheet && <PlayerSheet p={sheet.p} where={whereFor(sheet.c)} focus={sheet.news ? "news" : undefined} onClose={() => setSheet(null)} />}
    </section>
  );
}

/** Your starters with a status story in the last day, for the inbox. */
export function urgentNews(players: Player[], byId: Map<string, NewsItem[]>): { p: Player; n: NewsItem }[] {
  return players.filter((p) => contextFor(p).role === "starter").flatMap((p) => {
    const n = byImpact(byId.get(p.id) ?? []).find((x) => x.kind === "status" && x.at && Date.now() - x.at < 864e5);
    return n ? [{ p, n }] : [];
  });
}
