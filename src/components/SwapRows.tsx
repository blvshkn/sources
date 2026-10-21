// Lineup swaps as Ask shows them: a slot label, the player to start with what he adds, the player to bench, and the
// reason when there is one. Shared by Ask's start/sit answer and Set optimal lineup on the Lineup tab, so both read
// the same. Styles come from ask.css (.ask-show, .ask-prow); the reason line is in optimal-lineup.css.
import { fmt } from "../engine";
import { Player, playerById } from "../data";
import { Icon } from "./ui";

export interface SwapRow { start: string; bench: string; slot: string; gain: number; why?: string }

function Row({ id, k, v, tone = "", onOpen, live }: { id: string; k: string; v?: string; tone?: string; onOpen?: (p: Player) => void; live: boolean }) {
  const p = playerById(id);
  if (!p) return null;
  const body = (
    <>
      <span className="ask-prow-k">{k}</span>
      <span className="ask-prow-name">{p.name}</span>
      <span className="ask-prow-meta">{p.pos} · {p.nfl}</span>
      {v && <span className={`ask-prow-v${tone}`}>{v}</span>}
      {onOpen && <Icon name="chev" size={14} />}
    </>
  );
  return (
    <li>
      {onOpen ? <button type="button" className="ask-prow" tabIndex={live ? undefined : -1} onClick={() => onOpen(p)}
        aria-label={`${p.name}, ${p.pos}, ${p.nfl}, ${k}${v ? ` ${v}` : ""}. Player details`}>{body}</button>
        : <div className="ask-prow">{body}</div>}
    </li>
  );
}

export function SwapRows({ rows, onPlayer, live = true, className = "" }: { rows: SwapRow[]; onPlayer?: (p: Player) => void; live?: boolean; className?: string }) {
  return (
    <div className={`ask-show ${className}`.trim()}>
      {rows.map((r) => (
        <div key={r.start} className="ask-show-g">
          <p className="ask-k">{r.slot} swap</p>
          <ul className="ask-prows">
            <Row id={r.start} k="Start" v={fmt(r.gain)} tone={r.gain > 0 ? " good" : r.gain < 0 ? " bad" : ""} onOpen={onPlayer} live={live} />
            <Row id={r.bench} k="Bench" onOpen={onPlayer} live={live} />
          </ul>
          {r.why && <p className="ask-why">{r.why}</p>}
        </div>
      ))}
    </div>
  );
}
