import { useMemo } from "react";
import { BoardRow, LEAGUE, PLAYERS, TEAMS, FREE_AGENTS } from "../data";
import { marketValue } from "../engine";
import { Avatar } from "./Avatar";
import { useSticky } from "./ui";
import { Select } from "./Select";
import { Tooltip } from "./Tooltip";

// Demo leagues have no market feed, so build the board from projection-based values.
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
function demoBoard(): BoardRow[] {
  const owner = new Map<string, string>();
  TEAMS.forEach((t) => [...t.roster, ...(t.ir ?? [])].forEach((id) => owner.set(id, t.id)));
  const ids = new Set([...Object.keys(PLAYERS), ...FREE_AGENTS.map((f) => f.id)]);
  const rows = [...ids].map((id) => PLAYERS[id] ?? FREE_AGENTS.find((f) => f.id === id)!).filter(Boolean).map((p) => {
    const value = marketValue({ ...p, value: undefined } as never);
    return { id: p.id, name: p.name, pos: p.pos, nfl: p.nfl, value, trend: Math.round((hash(p.id) - 0.45) * value * 0.35), ownerId: owner.get(p.id) };
  }).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const k = 10000 / (rows[0]?.value || 1);
  return rows.map((r) => ({ ...r, value: Math.round(r.value * k), trend: Math.round(r.trend * k) }));
}

const POS = ["ALL", "QB", "RB", "WR", "TE"] as const;

/** Where the production model and the trade market disagree by a lot, there's an edge. */
function split(r: BoardRow) {
  if (!r.market || !r.model) return null;
  const d = r.model / r.market - 1;
  if (d > 0.25) return <Tooltip content={<>Production model <b>{Math.round(d * 100)}%</b> above the market</>}><span className="vb-split up">Buy low</span></Tooltip>;
  if (d < -0.25) return <Tooltip content={<>Production model <b>{Math.round(-d * 100)}%</b> below the market</>}><span className="vb-split down">Sell high</span></Tooltip>;
  return null;
}
const tier = (v: number) => v >= 8000 ? "Tier 1" : v >= 6000 ? "Tier 2" : v >= 4000 ? "Tier 3" : v >= 2500 ? "Tier 4" : "Depth";

/** League-aware market board: every player's trade value, who owns him in your league, and who's moving. */
export function Values({ onTarget }: { onTarget?: (playerId: string, ownerId: string) => void }) {
  const [pos, setPos] = useSticky<(typeof POS)[number]>("values.pos", "ALL", POS);
  const [own, setOwn] = useSticky<"all" | "fa" | "mine">("values.own", "all", ["all", "fa", "mine"]);
  const board = useMemo(() => LEAGUE.board?.length ? LEAGUE.board : demoBoard(), []);
  const max = board[0]?.value || 1;
  const mine = TEAMS.find((t) => t.you)?.id;
  const rows = board.filter((r) => (pos === "ALL" || r.pos === pos) && (own === "all" || (own === "fa" ? !r.ownerId : r.ownerId === mine)));
  const owned = board.filter((r) => r.ownerId);
  const risers = [...owned].sort((a, b) => b.trend - a.trend).slice(0, 5);
  const fallers = [...owned].sort((a, b) => a.trend - b.trend).slice(0, 5);
  const ownerName = (id?: string) => { if (!id) return null; const t = TEAMS.find((x) => x.id === id); return t?.you ? "You" : t?.manager ?? null; };
  const posRank = new Map<string, number>();
  const counts: Record<string, number> = {};
  board.forEach((r) => { counts[r.pos] = (counts[r.pos] ?? 0) + 1; posRank.set(r.id, counts[r.pos]); });

  return (
    <div className="vb">
      <section className="vb-movers">
        {[{ title: "Rising", list: risers, up: true }, { title: "Falling", list: fallers, up: false }].map((col) => (
          <div key={col.title} className="card vb-move">
            <b>{col.title} in your league</b>
            {col.list.map((r) => (
              <div key={r.id} className="vb-move-row">
                <Avatar p={r} size={28} badge={false} />
                <span className="vb-move-name">{r.name}<i>{ownerName(r.ownerId)}</i></span>
                <span className={`vb-trend ${r.trend > 0 ? "up" : r.trend < 0 ? "down" : "flat"}`}>{r.trend === 0 ? "even" : `${r.trend > 0 ? "▲" : "▼"} ${Math.abs(r.trend).toLocaleString()}`}</span>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="card vb-list wv-card" aria-label="Player values">
        <div className="wv-head">
          <div className="wv-head-t"><b>Player values</b><span>Top 150 by trade value</span></div>
          <Select className="wv-sort" size="pill" aria-label="Show" value={own} onChange={setOwn}
            options={[
              { value: "all" as typeof own, label: "Everyone" },
              { value: "mine" as typeof own, label: "My team" },
              { value: "fa" as typeof own, label: "Free agents" },
            ]} />
        </div>
        <div className="wv-pos" role="group" aria-label="Position">
          {POS.map((p) => <button key={p} aria-pressed={pos === p} onClick={() => setPos(p)}>{p === "ALL" ? "All" : p}</button>)}
        </div>
        <div className="vb-head"><span>#</span><span>Player</span><span>Value</span></div>
        {rows.slice(0, 150).map((r, i) => {
          const o = ownerName(r.ownerId);
          return (
            <button key={r.id} className="vb-row" onClick={() => r.ownerId && r.ownerId !== mine && onTarget?.(r.id, r.ownerId)} disabled={!r.ownerId || r.ownerId === mine}>
              <span className="vb-rank">{pos === "ALL" ? i + 1 : posRank.get(r.id)}</span>
              <Avatar p={r} size={40} />
              <span className="vb-who">
                <span className="vb-name">{r.name}{split(r)}</span>
                <span className="lu-meta" data-tier={tier(r.value)}><b className={`lu-pos p-${r.pos}`}>{r.pos}{posRank.get(r.id)}</b><span>{r.nfl}</span>{r.age && <span>Age {r.age}</span>}</span>
                <span className={`vb-owner${o ? (o === "You" ? " you" : "") : " fa"}`}>{o ?? "Free agent"}</span>
              </span>
              <span className="vb-val">
                <b>{r.value.toLocaleString()}</b>
                <Tooltip content={<>Market value <b>{r.value.toLocaleString()}</b>, {tier(r.value)}. The bar is scaled to the top player here.</>}><span className="vb-bar"><span style={{ width: `${(r.value / max) * 100}%` }} /></span></Tooltip>
                {r.trend !== 0 && <i className={r.trend > 0 ? "up" : "down"}>{r.trend > 0 ? "▲" : "▼"}{Math.abs(r.trend).toLocaleString()}</i>}
              </span>
            </button>
          );
        })}
        {!rows.length && <p className="small muted" style={{ padding: "8px 16px 18px" }}>Nobody matches those filters.</p>}
      </section>
      <p className="tiny muted">{LEAGUE.valueSource}. Tap a player on another team to build a trade for him.</p>
    </div>
  );
}
