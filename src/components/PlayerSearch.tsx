import { useMemo, useRef, useState } from "react";
import { TEAMS, Team, playerById } from "../data";
import { eff } from "../engine";
import { Avatar } from "./Avatar";
import { Icon } from "./ui";

/** Find any rostered player in the league and see whose fantasy team he's on. */
export function PlayerSearch({ onPick, picked }: { onPick: (id: string, team: Team) => void; picked: string[] }) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => TEAMS.flatMap((t) => t.roster.map((id) => ({ p: playerById(id), team: t }))), []);
  const term = q.trim().toLowerCase();
  const hits = term.length < 2 ? [] : all
    .filter(({ p }) => p.name.toLowerCase().includes(term) || p.nfl.toLowerCase() === term)
    .sort((a, b) => Number(b.p.name.toLowerCase().startsWith(term)) - Number(a.p.name.toLowerCase().startsWith(term)) || eff(b.p) - eff(a.p))
    .slice(0, 8);

  return (
    <div className="psr">
      <label className="psr-field">
        <Icon name="search" size={18} />
        <span className="sr-only">Search players in your league</span>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any player in your league" autoComplete="off" spellCheck={false} />
        {q && <button className="psr-clear" onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Clear search"><Icon name="x" size={16} /></button>}
      </label>
      {term.length >= 2 && (
        <ul className="psr-list" aria-label="Search results">
          {hits.length ? hits.map(({ p, team }) => {
            const on = picked.includes(p.id);
            return (
              <li key={p.id}>
                <button className={`psr-row${on ? " on" : ""}`} onClick={() => { onPick(p.id, team); setQ(""); }}>
                  <Avatar p={p} size={36} />
                  <span className="psr-n"><b>{p.name}</b><small>{p.pos} · {p.nfl}</small></span>
                  <span className={`psr-team${team.you ? " you" : ""}`}>{team.you ? "Your team" : team.name}</span>
                  <span className="psr-act">{on ? <Icon name="check" size={16} /> : <Icon name="plus" size={16} />}</span>
                </button>
              </li>
            );
          }) : <li className="psr-none">No rostered player matches "{q.trim()}". Free agents are on Waivers.</li>}
        </ul>
      )}
    </div>
  );
}
