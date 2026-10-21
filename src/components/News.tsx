import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Player } from "../data";
import { KIND_LABEL, NEWS_SOURCES, NewsItem, ago, byImpact, byNewest, sourcesLine, usePlayerNews, usePlayerRequest, useRosterNews } from "../news";
import { PlayerContext, contextFor, impactFor, playerWeight, roleLabel, yourPlayers } from "../impact";
import { Avatar } from "./Avatar";
import { PlayerSheet } from "./lazy";
import { Tooltip } from "./Tooltip";
import { Icon, StatusPill } from "./ui";
import { AiMark } from "./WorkingLoader";
import { strokeFor } from "./iconStroke";

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
      {(over || open) && <button /* dismiss-exempt: inline "More" on a story excerpt, not an overlay */ type="button" className="nx-exp" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Less" : "More"}</button>}
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
  const a = <a className="nx-read" href={n.url} target="_blank" rel="noopener noreferrer">Read on {where}<span className="nx-arr" aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>;
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
              <span className="nx-imp-by"><AiMark size={14} />Sources</span>
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
      {list.length > 3 && <button /* dismiss-exempt: inline show-more list toggle, not an overlay */ type="button" className="nx-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>{more ? "Show less" : `Show ${list.length - 3} more`}<Icon name="chev" size={14} /></button>}
    </section>
  );
}

const whereFor = (c: PlayerContext) => c.role === "starter" ? `Starting${c.slot ? ` at ${c.slot === "SF" ? "superflex" : c.slot === "FLEX" ? "flex" : c.slot}` : ""}` : c.role === "bench" ? "On your bench" : c.role === "ir" ? "On your IR" : "On your taxi squad";

/** One story as a row in a divided list. The whole row opens the article: the link on the right stretches over it. */
function StoryRow({ n }: { n: NewsItem }) {
  const when = n.at ? new Date(n.at) : null;
  return (
    <article className="nxs">
      <div className="nx-src">
        <span className="nx-mark" aria-hidden="true">{mark(n.source)}</span>
        <b>{n.source}</b>
        {n.via && <span className="nx-via">via {n.via}</span>}
        {when && <When d={when} at={n.at} />}
      </div>
      {n.kind && n.kind !== "feature" && <span className={`nx-kind k-${n.kind}`}>{KIND_LABEL[n.kind]}</span>}
      <h4 className="nx-h">{n.title}</h4>
      {n.summary && <p className="nxs-ex">{n.summary}</p>}
      <a className="nxs-hit" href={n.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true" />
      <ReadLink n={n} />
    </article>
  );
}

/** Our read on a player, from his top story. */
function Intel({ text }: { text: string }) {
  return (
    <div className="nx-imp nxr-intel">
      <div className="nx-imp-k">
        <i aria-hidden="true" />What it means for you
        <Tooltip focusable content="Sources' own read, from your league's lineups, projections and schedule. Not from the article.">
          <span className="nx-imp-by"><AiMark size={14} />Sources</span>
        </Tooltip>
      </div>
      <p>{text}</p>
    </div>
  );
}

// Bar chart mark for the Stats button: Lucide chart-no-axes-column (ISC), on the icon family's line
const StatsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeFor(14)} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 21v-6" /><path d="M12 21V3" /><path d="M19 21V9" />
  </svg>
);

// How many stories each player shows, and which players are open, kept for the session so a re-render or a tab
// switch doesn't fold them back up
const STEP = 3;
const OPEN_KEY = "sources.news.open";
const EXP_KEY = "sources.news.exp";
const load = (k: string): Record<string, any> => {
  try { const v = JSON.parse(sessionStorage.getItem(k) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
};
const save = (k: string, v: object) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } };
const openCounts: Record<string, number> = load(OPEN_KEY);
const expanded: Record<string, boolean> = load(EXP_KEY);
function rememberOpen(id: string, count: number) {
  if (count <= STEP) delete openCounts[id]; else openCounts[id] = count;
  save(OPEN_KEY, openCounts);
}
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

/** One player, collapsible. Closed: who he is, his newest headline and a story count. Open: our read, then his
 *  stories three at a time. "Stats" opens his sheet. */
function PlayerGroup({ p, c, items, first, onOpen }: { p: Player; c: PlayerContext; items: NewsItem[]; first: boolean; onOpen: () => void }) {
  const [open, setOpen] = useState(() => expanded[p.id] ?? first);
  const [count, setCount] = useState(() => Math.min(items.length, Math.max(STEP, openCounts[p.id] ?? STEP)));
  const listRef = useRef<HTMLDivElement>(null);
  const from = useRef<number | null>(null);
  const before = useRef(0);
  const anim = useRef<Animation | null>(null);
  const shown = items.slice(0, count);
  const left = Math.max(0, items.length - count);
  const impact = useMemo(() => (items[0] ? impactFor(p, items[0], c) : null), [p.id, items[0]?.id, items[0]?.kind]);
  const newest = useMemo(() => items.reduce((a, b) => ((b.at ?? 0) > (a.at ?? 0) ? b : a), items[0]), [items]);
  // "Starter · WR" repeats the position the line already shows; the slot only adds something when it differs (FLEX, SF)
  const label = c.role === "starter" && c.slot === p.pos ? "Starter" : roleLabel(c);
  const bodyId = `nxr-b-${p.id}`;
  const listId = `nxs-${p.id}`;

  const toggle = () => setOpen((o) => { expanded[p.id] = !o; save(EXP_KEY, expanded); return !o; });

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
    <div className={`nxr-g${open ? " open" : ""}`}>
      <div className="nxr-head">
        <button /* dismiss-exempt: inline accordion, not an overlay */ type="button" className="nxr-tog" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <Avatar p={p} size={36} />
          <span className="nxr-name">
            <span className="nxr-line"><b>{p.name}</b><span className="nxr-pill nxr-pill-n"><StatusPill p={p} /></span></span>
            <small>{p.pos} · {p.nfl}{label && <> · <span className={c.role === "starter" ? "on" : ""}>{label}</span></>}</small>
            {newest && <span className="nxr-peek">{newest.title}</span>}
          </span>
          <span className="nxr-pill nxr-pill-w"><StatusPill p={p} /></span>
          <span className="nxr-count"><b>{items.length}</b> {items.length === 1 ? "story" : "stories"}</span>
        </button>
        <button type="button" className="nxr-stats" onClick={onOpen} aria-label={`${p.name} stats`}><StatsIcon />Stats</button>
        <span className="nxr-chev" aria-hidden="true"><Icon name="chev" size={16} /></span>
      </div>
      <div className="nxr-body" id={bodyId} role="region" aria-label={`News on ${p.name}`}>
        <div className="nxr-inner">
          {impact && <Intel text={impact} />}
          <div className="nxs-list" id={listId} ref={listRef}>
            {shown.map((n) => <StoryRow key={n.id ?? n.url} n={n} />)}
          </div>
          {items.length > STEP && (
            <button /* dismiss-exempt: inline show-more list toggle, not an overlay */ type="button" className="nxs-more" aria-controls={listId} aria-expanded={left === 0} onClick={left > 0 ? more : fewer}>
              {left > 0
                ? <span>Show <b>{Math.min(STEP, left)}</b> more{left > STEP && <span className="nxs-left"> · <b>{left}</b> left</span>}</span>
                : <span>Show less</span>}
              <Icon name="chev" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RosterSkeleton() {
  return (
    <div className="nxr-list" aria-hidden="true">
      {[0, 1].map((g) => (
        <div key={g} className="nxr-g nxs-skel">
          <span className="nx-sk-who"><i /><span><b /><b /></span></span>
          <div className="nxs-list">{[0, 1].map((r) => <span key={r} className="nxs-sk"><b className="s" /><b className="h" /><b /><b className="m" /></span>)}</div>
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
            {shown.map(({ p, c, items }, i) => <PlayerGroup key={p.id} p={p} c={c} items={items} first={i === 0} onOpen={() => setSheet({ p, c })} />)}
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
