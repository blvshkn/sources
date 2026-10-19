import { useEffect, useMemo, useRef, useState } from "react";
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

/** One story: source and age, headline, excerpt, our read on it, and the link out. */
export function StoryCard({ n, impact }: { n: NewsItem; impact?: string | null }) {
  const when = n.at ? new Date(n.at) : null;
  return (
    <article className="nx">
      <div className="nx-src">
        <span className="nx-mark" aria-hidden="true">{mark(n.source)}</span>
        <b>{n.source}</b>
        {n.via && <span className="nx-via">via {n.via}</span>}
        {when && <time dateTime={when.toISOString()} title={when.toLocaleString()}>{ago(n.at)}</time>}
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
      <a className="nx-read" href={n.url} target="_blank" rel="noopener noreferrer">Read on {n.source}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span></a>
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

/** The Wire's news card: every player on your roster, ranked by what the news means for your lineup. */
export function RosterNews() {
  const players = yourPlayers();
  const { byId, loading } = useRosterNews(players);
  const [all, setAll] = useState(false);
  const [sheet, setSheet] = useState<{ p: Player; c: PlayerContext; news?: boolean } | null>(null);

  const groups = players.flatMap((p) => {
    const items = byImpact(byId.get(p.id) ?? []);
    if (!items.length) return [];
    const c = contextFor(p);
    const top = items[0];
    // Second story only when it is real news too, not a feature or a stale preview
    const show = items.slice(0, 2).filter((n, i) => i === 0 || (n.kind !== "feature" && n.kind !== "outlook" && (n.score ?? 0) >= 40));
    return [{ p, c, items, show, weight: (top.score ?? 0) + playerWeight(p, c) + (top.kind === "status" ? 15 : 0) }];
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

  const open = (p: Player, c: PlayerContext, news?: boolean) => setSheet({ p, c, news });

  return (
    <section className="card wk nxr" aria-label="News on your players" aria-busy={loading}>
      <div className="wk-head"><h2 className="section-title">News on your players</h2><span className="tiny muted nxr-src">{NEWS_SOURCES.join(" · ")}</span></div>
      {loading && !groups.length ? <Skeleton n={2} who />
        : groups.length ? (
          <div className="nxr-list">
            {shown.map(({ p, c, items, show }) => {
              const lines = impacts(p, show, c);
              const rest = items.length - show.length;
              const label = roleLabel(c);
              return (
                <div key={p.id} className="nxr-g">
                  <button type="button" className="nxr-who" onClick={() => open(p, c)} aria-label={`Open ${p.name}`}>
                    <Avatar p={p} size={36} />
                    <span className="nxr-name"><b>{p.name}</b><small>{p.pos} · {p.nfl}{label && <> · <span className={c.role === "starter" ? "on" : ""}>{label}</span></>}</small></span>
                    <StatusPill p={p} />
                    <Icon name="chev" size={16} />
                  </button>
                  <div className="nx-list">{show.map((n, i) => <StoryCard key={n.id ?? n.url} n={n} impact={lines[i]} />)}</div>
                  {rest > 0 && <button type="button" className="nxr-more" onClick={() => open(p, c, true)}>More on {p.name} ({rest})<Icon name="chev" size={14} /></button>}
                </div>
              );
            })}
          </div>
        ) : <p className="nx-empty">No recent news on your players. We check {sourcesLine()} every 10 minutes.</p>}
      {groups.length > 5 && <button type="button" className="nx-more nxr-all" aria-expanded={all} onClick={() => setAll((a) => !a)}>{all ? "Show top 5" : `Show all players (${groups.length})`}<Icon name="chev" size={14} /></button>}
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
