// What an answer is about and its key numbers, on their own so the landing can show them without loading Ask (Ask.tsx).
import { useMemo } from "react";
import { AskShow, Trade, acceptance, fmt } from "../engine";
import { Player, YOU, isSpecialFA, playerById, teamById } from "../data";
import { Icon } from "./ui";
import { SwapRows } from "./SwapRows";

export type OpenPlayer = (p: Player) => void;

/** A player in an answer. Tapping opens the player sheet over Ask. */
function PRow({ p, k, v, tone = "", onOpen, live }: {
  p: { id: string; name: string; pos: string; nfl: string };
  k?: string; v?: string; tone?: string; onOpen?: () => void; live: boolean;
}) {
  const body = (
    <>
      {k && <span className="ask-prow-k">{k}</span>}
      <span className="ask-prow-name">{p.name}</span>
      <span className="ask-prow-meta">{p.pos} · {p.nfl}</span>
      {v && <span className={`ask-prow-v${tone}`}>{v}</span>}
      {onOpen && <Icon name="chev" size={14} />}
    </>
  );
  return (
    <li>
      {onOpen ? <button type="button" className="ask-prow" tabIndex={live ? undefined : -1} onClick={onOpen}
        aria-label={`${p.name}, ${p.pos}, ${p.nfl}${k ? `, ${k}` : ""}. Player details`}>{body}</button>
        : <div className="ask-prow">{body}</div>}
    </li>
  );
}

/** What the answer is about, shown right in the card: the players each way in a deal, the player you asked about, the
 *  lineup swaps, or the waiver add. */
export function AskShowBlock({ show, deal, onPlayer, live }: { show?: AskShow; deal?: Trade; onPlayer: OpenPlayer; live: boolean }) {
  const row = (id: string, k?: string, v?: string, tone?: string) => {
    const p = playerById(id);
    return p ? <PRow key={`${k}-${id}`} p={p} k={k} v={v} tone={tone} live={live} onOpen={() => onPlayer(p)} /> : null;
  };
  if (deal) {
    const them = teamById(deal.partnerId);
    return (
      <div className="ask-show ask-show-deal">
        <div className="ask-show-g"><p className="ask-k">You give</p><ul className="ask-prows">{deal.give.map((id) => row(id))}</ul></div>
        <div className="ask-show-g"><p className="ask-k">You get{them ? ` from ${them.manager}` : ""}</p><ul className="ask-prows">{deal.get.map((id) => row(id))}</ul></div>
      </div>
    );
  }
  if (!show) return null;
  if (show.kind === "player") return <div className="ask-show"><ul className="ask-prows">{row(show.id)}</ul></div>;
  if (show.kind === "players") return <div className="ask-show"><ul className="ask-prows">{show.ids.map((id) => row(id))}</ul></div>;
  // Swaps, with the reason for each when Set optimal lineup's check gave one (the same rows the Lineup tab shows)
  if (show.kind === "swaps") return <SwapRows rows={show.rows} onPlayer={onPlayer} live={live} />;
  const fa = show.fa;
  return (
    <div className="ask-show">
      <ul className="ask-prows">
        <PRow p={fa} k="Add" v={fmt(show.gain)} tone={show.gain > 0 ? " good" : ""} live={live}
          onOpen={isSpecialFA(fa) ? undefined : () => onPlayer(fa as Player)} />
      </ul>
    </div>
  );
}

/** The key numbers for an answer that carries a deal: what each side gains a week and how likely they are to say yes. */
export function DealNumbers({ t }: { t: Trade }) {
  const them = teamById(t.partnerId);
  const acc = useMemo(() => t.accept ?? (them ? acceptance(t, YOU, them) : null), [t, them]);
  const tone = (n: number) => (n > 0 ? " good" : n < 0 ? " bad" : "");
  return (
    <dl className="ask-nums">
      <div><dt>You<span className="ask-wide"> / wk</span></dt><dd className={`ask-num${tone(t.youDelta)}`}>{fmt(t.youDelta)}</dd></div>
      {them && <div><dt><span className="ask-mgr">{them.manager}</span><span className="ask-wide"> / wk</span></dt><dd className={`ask-num${tone(t.themDelta)}`}>{fmt(t.themDelta)}</dd></div>}
      {acc && <div><dt><span className="ask-wide">Will accept</span><span className="ask-narrow">Accept</span></dt><dd className="ask-num">{Math.round(acc.p * 100)}%</dd></div>}
    </dl>
  );
}
