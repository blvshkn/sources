import { Player, YOU, playerById } from "../data";
import { NewsItem, ago, newsFor, useNews } from "../news";
import { Avatar } from "./Avatar";
import { Icon } from "./ui";

function Story({ n, p }: { n: NewsItem; p?: Player }) {
  return (
    <a className="nw" href={n.url} target="_blank" rel="noreferrer">
      {p && <Avatar p={p} size={36} />}
      <span className="nw-body">
        <span className="nw-meta"><b>{n.source}</b>{n.at ? <> · {ago(n.at)}</> : null}{p ? <> · {p.name}</> : null}</span>
        <span className="nw-title">{n.title}</span>
        {n.summary && <span className="nw-sum">{n.summary}</span>}
      </span>
      <Icon name="share" size={14} />
    </a>
  );
}

/** Latest stories naming one player. */
export function PlayerNews({ p }: { p: Player }) {
  const items = newsFor(useNews(), p).slice(0, 4);
  if (!items.length) return null;
  return <div className="nw-list">{items.map((n) => <Story key={n.url} n={n} />)}</div>;
}

/** Stories about anyone on your roster, newest first. */
export function RosterNews() {
  const all = useNews();
  const hits = YOU.roster.map(playerById).flatMap((p) => newsFor(all, p).map((n) => ({ n, p })))
    .filter((x, i, a) => a.findIndex((y) => y.n.url === x.n.url) === i)
    .sort((a, b) => (b.n.at ?? 0) - (a.n.at ?? 0)).slice(0, 8);
  return (
    <section className="card wk" aria-label="News on your players">
      <div className="wk-head"><h2 className="section-title">News on your players</h2><span className="tiny muted">RotoWire · ESPN · FantasyPros</span></div>
      {hits.length ? <div className="nw-list">{hits.map(({ n, p }) => <Story key={n.url} n={n} p={p} />)}</div>
        : <p className="small muted">{all.length ? "No fresh stories on your players right now." : "Loading the latest news…"}</p>}
    </section>
  );
}
