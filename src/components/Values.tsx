import { useMemo, useState } from "react";
import { BoardRow, LEAGUE, PLAYERS, TEAMS, FREE_AGENTS } from "../data";
import { marketValue } from "../engine";
import { Avatar } from "./Avatar";

// Demo leagues have no market feed, so build the board from projection-based values.
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
function demoBoard(): BoardRow[] {
  const owner = new Map<string, string>();
  TEAMS.forEach((t) => [...t.roster, ...(t.ir ?? [])].forEach((id) => owner.set(id, t.id)));
  const ids = new Set([...Object.keys(PLAYERS), ...FREE_AGENTS.map((f) => f.id)]);
  return [...ids].map((id) => PLAYERS[id] ?? FREE_AGENTS.find((f) => f.id === id)!).filter(Boolean).map((p) => {
    const value = marketValue({ ...p, value: undefined } as never);
    return { id: p.id, name: p.name, pos: p.pos, nfl: p.nfl, value, trend: Math.round((hash(p.id) - 0.45) * value * 0.35), ownerId: owner.get(p.id) };
  }).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
}

const POS = ["ALL", "QB", "RB", "WR", "TE"] as const;

/** League-aware market board: every player's trade value, who owns him in your league, and who's moving. */
export function Values({ onTarget }: { onTarget?: (playerId: string, ownerId: string) => void }) {
  const [pos, setPos] = useState<(typeof POS)[number]>("ALL");
  const [own, setOwn] = useState<"all" | "fa" | "mine">("all");
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
                <span className={`vb-trend ${r.trend >= 0 ? "up" : "down"}`}>{r.trend >= 0 ? "▲" : "▼"} {Math.abs(r.trend).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ))}
      </section>

      <div className="wv-filters">
        <div className="chips" role="group" aria-label="Position">
          {POS.map((p) => <button key={p} className={`chip-btn${pos === p ? " on" : ""}`} aria-pressed={pos === p} onClick={() => setPos(p)}>{p === "ALL" ? "All" : p}</button>)}
        </div>
        <div className="chips" role="group" aria-label="Owner">
          {([["all", "Everyone"], ["mine", "My team"], ["fa", "Free agents"]] as const).map(([k, l]) => <button key={k} className={`chip-btn${own === k ? " on" : ""}`} aria-pressed={own === k} onClick={() => setOwn(k)}>{l}</button>)}
        </div>
      </div>

      <section className="card vb-list" aria-label="Player values">
        <div className="vb-head"><span>#</span><span>Player</span><span>Value</span></div>
        {rows.slice(0, 150).map((r, i) => {
          const o = ownerName(r.ownerId);
          return (
            <button key={r.id} className="vb-row" onClick={() => r.ownerId && r.ownerId !== mine && onTarget?.(r.id, r.ownerId)} disabled={!r.ownerId || r.ownerId === mine}>
              <span className="vb-rank">{pos === "ALL" ? i + 1 : posRank.get(r.id)}</span>
              <Avatar p={r} size={40} />
              <span className="vb-who">
                <span className="vb-name">{r.name}</span>
                <span className="lu-meta"><b className={`lu-pos p-${r.pos}`}>{r.pos}{posRank.get(r.id)}</b><span>{r.nfl}</span>{r.age && <span>Age {r.age}</span>}<span className={o ? (o === "You" ? "vb-own you" : "vb-own") : "vb-own fa"}>{o ?? "Free agent"}</span></span>
              </span>
              <span className="vb-val">
                <b>{r.value.toLocaleString()}</b>
                <span className="vb-bar"><span style={{ width: `${(r.value / max) * 100}%` }} /></span>
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
