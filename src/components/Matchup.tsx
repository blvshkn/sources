import { useMemo, useState } from "react";
import { OPPONENT_ID, Player, SLEEPER_SET, Team, WEEK, YOU, gameLine, onBye, playerById, sleeperUrl, teamById } from "../data";
import { eff, fits, fmt, lineupFor, round1, SlotName } from "../engine";
import { Avatar } from "./Avatar";
import { Icon, StatusPill } from "./ui";

const phi = (x: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
const pts = (id: string | null) => (id ? eff(playerById(id), true) : 0);

/** Fill the league's slots in order from a list of starters, so both lineups line up slot for slot. */
function slotted(team: Team, starters: string[] | undefined): { slot: SlotName; id: string | null }[] {
  const base = lineupFor(team.roster, true);
  if (!starters?.length) return base.slots.map((s) => ({ slot: s.slot, id: s.player?.id ?? null }));
  const pool = starters.filter((id) => team.roster.includes(id));
  const used = new Set<string>();
  return base.slots.map((s) => {
    const id = pool.find((x) => !used.has(x) && fits(s.slot, playerById(x).pos)) ?? null;
    if (id) used.add(id);
    return { slot: s.slot, id };
  });
}

export function Matchup({ onBack }: { onBack: () => void }) {
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  const sleeperMine = useMemo(() => {
    const set = Object.values(SLEEPER_SET).flat();
    return slotted(YOU, YOU.starters?.length ? YOU.starters : set.length ? set : undefined);
  }, []);
  const theirs = useMemo(() => (opp ? slotted(opp, opp.starters) : []), [opp]);
  const [mine, setMine] = useState(sleeperMine);
  const [open, setOpen] = useState<number | null>(null);

  if (!opp) return (
    <section className="card card-pad"><button className="st-back" onClick={onBack}><Icon name="chev" size={16} />Wire</button><p className="small muted">No matchup this week.</p></section>
  );

  const myTotal = round1(mine.reduce((a, s) => a + pts(s.id), 0));
  const oppTotal = round1(theirs.reduce((a, s) => a + pts(s.id), 0));
  const baseTotal = round1(sleeperMine.reduce((a, s) => a + pts(s.id), 0));
  const chance = Math.round(phi((myTotal - oppTotal) / 34) * 100);
  const changed = mine.some((s, i) => s.id !== sleeperMine[i].id);
  const bench = YOU.roster.filter((id) => !mine.some((s) => s.id === id)).map(playerById);
  const best = lineupFor(YOU.roster, true);
  const edges = mine.map((s, i) => round1(pts(s.id) - pts(theirs[i]?.id ?? null)));
  const winning = edges.filter((e) => e > 0).length;
  const bigWin = edges.reduce((bi, e, i) => (e > edges[bi] ? i : bi), 0);
  const bigLoss = edges.reduce((bi, e, i) => (e < edges[bi] ? i : bi), 0);

  const swap = (slotIdx: number, id: string) => {
    setMine((cur) => {
      const next = cur.map((s) => ({ ...s }));
      const other = next.findIndex((s) => s.id === id);
      const prev = next[slotIdx].id;
      next[slotIdx].id = id;
      if (other >= 0) next[other].id = prev && fits(next[other].slot, playerById(prev).pos) ? prev : null;
      return next;
    });
    setOpen(null);
  };
  const useBest = () => { setMine(best.slots.map((s) => ({ slot: s.slot, id: s.player?.id ?? null }))); setOpen(null); };

  const Who = ({ p, side }: { p: Player | null; side: "you" | "them" }) => p ? (
    <span className={`mu-p ${side}`}>
      <Avatar p={p} size={32} />
      <span className="mu-n"><b>{p.name}</b><small>{p.pos} · {p.nfl}{!onBye(p.nfl) && gameLine(p) ? ` · ${gameLine(p)}` : ""} <StatusPill p={p} /></small></span>
    </span>
  ) : <span className={`mu-p ${side} empty`}><span className="mu-n"><b>Empty</b></span></span>;

  return (
    <>
      <button className="st-back mu-back" onClick={onBack}><Icon name="chev" size={16} />Wire</button>
      <section className="card mu" aria-label={`Week ${WEEK} matchup`}>
        <header className="mu-score">
          <div className="mu-side you"><span>You · {changed ? "what-if" : "as set in Sleeper"}</span><b>{myTotal.toFixed(1)}</b></div>
          <div className="mu-mid"><b>{chance}%</b><small>to win</small></div>
          <div className="mu-side them"><span>{opp.manager}</span><b>{oppTotal.toFixed(1)}</b></div>
        </header>
        <div className="mu-bar" aria-hidden="true"><span style={{ width: `${chance}%` }} /></div>
        <p className="mu-sum">
          You win <b>{winning} of {mine.length}</b> spots.
          {edges[bigWin] > 0 && <> Biggest edge: <b>{mine[bigWin].slot} {fmt(edges[bigWin])}</b>.</>}
          {edges[bigLoss] < 0 && <> Biggest hole: <b>{mine[bigLoss].slot} {fmt(edges[bigLoss])}</b>.</>}
        </p>

        {changed && (
          <div className="mu-whatif">
            <span><b>What-if lineup</b>{fmt(round1(myTotal - baseTotal))} pts vs your Sleeper lineup. Make the swap in Sleeper to lock it in.</span>
            <div className="mu-wbtn">
              <button className="btn btn-sm" onClick={() => { setMine(sleeperMine); setOpen(null); }}>Reset</button>
              <a className="btn btn-sm btn-primary" href={sleeperUrl()} target="_blank" rel="noreferrer">Open Sleeper</a>
            </div>
          </div>
        )}

        <div className="mu-th"><span>Slot</span><span>You, then {opp.manager}</span></div>
        {mine.map((s, i) => {
          const me = s.id ? playerById(s.id) : null;
          const them = theirs[i]?.id ? playerById(theirs[i].id!) : null;
          const e = edges[i];
          const options = bench.filter((p) => fits(s.slot, p.pos)).sort((a, b) => eff(b, true) - eff(a, true));
          return (
            <div key={i} className={`mu-row${open === i ? " open" : ""}`}>
              <span className="mu-slot">{s.slot}</span>
              <button className="mu-mine" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} aria-label={`Swap ${me?.name ?? "empty"} at ${s.slot}`}>
                <Who p={me} side="you" />
                <span className="mu-pts">{pts(s.id).toFixed(1)}</span>
              </button>
              <span className={`mu-edge ${e > 0 ? "up" : e < 0 ? "down" : ""}`}>{e === 0 ? "even" : fmt(e)}</span>
              <span className="mu-theirs"><Who p={them} side="them" /><span className="mu-pts">{pts(them?.id ?? null).toFixed(1)}</span></span>
              {open === i && (
                <div className="mu-swap">
                  <small>Swap in at {s.slot}</small>
                  {options.length ? options.map((p) => (
                    <button key={p.id} className="mu-opt" onClick={() => swap(i, p.id)}>
                      <Who p={p} side="you" />
                      <span className="mu-pts">{eff(p, true).toFixed(1)}</span>
                      <span className={`mu-delta ${eff(p, true) - pts(s.id) >= 0 ? "up" : "down"}`}>{fmt(round1(eff(p, true) - pts(s.id)))}</span>
                    </button>
                  )) : <p className="small muted">No bench player can play {s.slot}.</p>}
                </div>
              )}
            </div>
          );
        })}
        <div className="mu-foot">
          <span>Tap any of your players to try a swap.</span>
          {round1(best.total - myTotal) > 0 && <button className="btn btn-sm" onClick={useBest}>Use best lineup {fmt(round1(best.total - myTotal))}</button>}
        </div>
      </section>
    </>
  );
}
