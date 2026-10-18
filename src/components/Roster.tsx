import { MyTag, TEAMS, YOU, ManagerTag, playerById, Player, onBye, SLOT_HISTORY, UPDATED, DEADLINES, WEEK, sleeperUrl } from "../data";
import { Lineup, Price, DEFAULT_PRICE, Trade, eff, isOut, priceLabel, sleeperDiff, suggestTags, weakSlots, whatItWouldTake, fmt } from "../engine";
import { AiLabel, Delta, Icon, PosBadge, Seg, Stamp, StatusPill } from "./ui";

const TAG_LABEL: Record<MyTag, string> = {
  available: "Available",
  shopping: "Shopping",
  untouchable: "Untouchable",
  amazing: "Untouchable unless amazing",
};
const initials = (name: string) => name.split(" ").filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("");
const ringColor = (p: Player) => (onBye(p.nfl) || p.status === "O" ? "var(--bad)" : p.status === "Q" ? "var(--warn)" : "transparent");

function Token({ p, slot }: { p: Player; slot: string }) {
  return (
    <div className="token">
      <div className="token-badge">
        {initials(p.name)}
        <span className="ring" style={{ borderColor: ringColor(p) }} />
        <span className="token-flag"><span className={`pos pos-${["FLEX", "SF"].includes(slot) ? "FLEX" : p.pos}`} style={{ minWidth: 0, height: 16, fontSize: 9 }}>{slot}</span></span>
      </div>
      <div className="token-name">{p.name}</div>
      <div className="token-proj">{eff(p, true).toFixed(1)}</div>
    </div>
  );
}

/** Your starters lined up in an offensive formation on a football field, broadcast style. */
function Gridiron({ starters }: { starters: { slot: string; player: Player }[] }) {
  // 5-column grid. Row 1 is on the line of scrimmage, row 2 is off the ball, row 3 is the backfield.
  const grid: (({ slot: string; player: Player }) | null)[][] = [[null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null]];
  const extra: { slot: string; player: Player }[] = [];
  const place = (x: { slot: string; player: Player }, spots: [number, number][]) => {
    const spot = spots.find(([r, c]) => !grid[r][c]);
    if (spot) grid[spot[0]][spot[1]] = x; else extra.push(x);
  };
  const of = (slot: string) => starters.filter((x) => x.slot === slot);
  const te = of("TE");
  of("WR").forEach((x) => place(x, [[0, 0], [0, 4], [1, 1], [1, 3], [1, 0]]));
  of("QB").forEach((x) => place(x, [[1, 2], [2, 0]]));
  of("SF").forEach((x) => place(x, [[1, 3], [1, 4], [2, 4]]));
  of("RB").forEach((x) => place(x, [[2, 1], [2, 3], [2, 2]]));
  of("FLEX").forEach((x) => place(x, [[2, 2], [2, 4], [2, 0], [1, 4]]));
  te.slice(1).forEach((x) => place(x, [[1, 3], [1, 4]]));
  const cell = (x: { slot: string; player: Player } | null, i: number) => <div key={i} className="g-cell">{x && <Token p={x.player} slot={x.slot} />}</div>;
  return (
    <section className="gridiron" aria-label="Optimal starting lineup on a football field">
      <span className="hash left" aria-hidden="true" /><span className="hash right" aria-hidden="true" />
      <span className="yard-num l" style={{ top: "6%" }} aria-hidden="true">4 0</span><span className="yard-num r" style={{ top: "6%" }} aria-hidden="true">4 0</span>
      <span className="yard-num l" style={{ top: "54%" }} aria-hidden="true">3 0</span><span className="yard-num r" style={{ top: "54%" }} aria-hidden="true">3 0</span>
      <div className="first-down" aria-hidden="true" />
      <div className="g-row">
        {cell(grid[0][0], 0)}
        <div className="g-cell" />
        <div className="g-cell g-ol"><span className="ol" aria-hidden="true"><i /><i /><i className="c" /><i /><i /></span></div>
        <div className="g-cell">{te[0] && <Token p={te[0].player} slot="TE" />}</div>
        {cell(grid[0][4], 4)}
      </div>
      <div className="los" aria-hidden="true" />
      <div className="g-row g-five">{grid[1].map(cell)}</div>
      <div className="g-row g-five">{grid[2].map(cell)}</div>
      {extra.length > 0 && <div className="g-row g-five">{extra.map((x, i) => cell(x, i))}</div>}
      <span className="g-legend" aria-hidden="true"><span className="lg-los" />Line of scrimmage<span className="lg-fd" />First down</span>
    </section>
  );
}

function SlotReport() {
  const max = Math.max(...SLOT_HISTORY.flatMap((h) => [...h.you, ...h.avg]));
  const weak = weakSlots();
  return (
    <section className="card card-pad slot-report">
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <h2 className="section-title">Slot report</h2>
        <span className="tiny muted">Weeks 1 to 6 · you vs league average</span>
      </div>
      {weak.length > 0 && (
        <p className="small"><Stamp>Per sources</Stamp> Your {weak[0].slot} slot came up short {weak[0].misses} of {weak[0].weeks} weeks ({fmt(weak[0].gap)} a week). It's flagged as a need and the trade finder leans on it.</p>
      )}
      <div className="slot-grid">
        {SLOT_HISTORY.map((h) => {
          const isWeak = weak.some((w) => w.slot === h.slot);
          return (
            <div key={h.slot} className={`slot-col${isWeak ? " weak" : ""}`}>
              <div className="slot-bars" role="img" aria-label={`${h.slot}: ${h.you.filter((v, i) => v >= h.avg[i]).length} of 6 weeks at or above average`}>
                {h.you.map((v, i) => (
                  <span key={i} className="sb">
                    <span className={`sb-you${v < h.avg[i] ? " under" : ""}`} style={{ height: `${(v / max) * 100}%` }} />
                    <span className="sb-avg" style={{ bottom: `${(h.avg[i] / max) * 100}%` }} />
                  </span>
                ))}
              </div>
              <span className="slot-name">{h.slot}</span>
            </div>
          );
        })}
      </div>
      <div className="legend"><span className="row"><span className="lg-sw you" />You</span><span className="row"><span className="lg-sw under" />Below avg</span><span className="row"><span className="lg-line" />League avg</span></div>
    </section>
  );
}

export function Roster({ lineup, myTags, setTag, prices, setPrice, tags, level, onPitch }: {
  lineup: Lineup;
  myTags: Record<string, MyTag>;
  setTag: (id: string, t: MyTag | "") => void;
  prices: Record<string, Price>;
  setPrice: (id: string, p: Price) => void;
  tags: ManagerTag[];
  level: string;
  onPitch: (t: Trade) => void;
}) {
  const s = lineup.slots.filter((x) => x.player) as { slot: string; player: Player }[];
  const by = (slot: string) => s.filter((x) => x.slot === slot);
  const flex = by("FLEX")[0];
  const bestBench = lineup.bench.filter((p) => p.pos !== "QB" && !isOut(p, true))[0];
  const closeCall = flex && bestBench && eff(flex.player, true) - eff(bestBench, true) < 1.5;
  const injured = s.filter((x) => x.player.status);
  const benchOut = lineup.bench.filter((p) => isOut(p, true));
  const locked = YOU.roster.filter((id) => myTags[id] === "amazing");
  const diff = sleeperDiff(lineup);
  const suggestions = level === "light" ? [] : suggestTags(lineup, myTags, tags);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">{YOU.name} · Week {WEEK} · {UPDATED}</div>
          <h1 className="page-title">Your Lineup</h1>
          <p className="page-sub">Your best lineup for this week, based on the latest projections.</p>
        </div>
        <span className="chip chip-good num">{lineup.total.toFixed(1)} projected</span>
      </header>

      {diff.length > 0 && (
        <section className="card nudge nudge-lineup">
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <div className="row wrap"><Stamp>Lineup day</Stamp><span className="deadline"><Icon name="clock" size={12} />{DEADLINES.lock}</span></div>
          </div>
          <h3>Per sources, your Sleeper lineup is leaving <em>{fmt(diff.reduce((a, d) => a + d.gain, 0))} pts</em> on the bench.</h3>
          {diff.map((d) => (
            <div key={d.start.id} className="swap-row">
              <span className="small"><b>{d.slot}:</b> {d.benched.name} {isOut(d.benched, true) ? <StatusPill p={d.benched} /> : null} <span className="muted">→</span> {d.start.name}</span>
              <Delta n={d.gain} />
            </div>
          ))}
          <div className="row wrap">
            <a className="btn btn-primary btn-sm" href={sleeperUrl()} target="_blank" rel="noreferrer"><Icon name="app" size={16} />Open Sleeper</a>
            <span className="tiny muted">Sleeper's API is read-only, so you make the swap there.</span>
          </div>
        </section>
      )}

      <div className="roster-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Gridiron starters={s} />
          {(closeCall || injured.length > 0 || benchOut.length > 0) && (
            <section className="card nudge">
              <Stamp>Per sources</Stamp>
              {closeCall && (
                <p className="small"><b>Close call at FLEX.</b> {flex.player.name} ({eff(flex.player, true).toFixed(1)}) edges {bestBench.name} ({eff(bestBench, true).toFixed(1)}). Check Sunday morning news before lock.</p>
              )}
              {injured.map((x) => <p key={x.player.id} className="small"><b>{x.player.name}</b> is listed {x.player.status === "O" ? "out" : "questionable"}: {x.player.note}.</p>)}
              {benchOut.length > 0 && <p className="small"><b>Byes and injuries on your bench:</b> {benchOut.map((p) => `${p.name} (${onBye(p.nfl) ? "bye" : "out"})`).join(", ")}. Your depth is thin this week if anyone gets hurt.</p>}
              <AiLabel />
            </section>
          )}
        </div>

        <section className="card" style={{ overflow: "hidden" }} aria-label="Your roster and tags">
          <div className="roster-head"><b>Roster tags</b><span className="tiny muted">Private to you</span></div>
          {suggestions.length > 0 && (
            <div className="suggest">
              <div className="row wrap" style={{ justifyContent: "space-between" }}><Stamp>Per sources</Stamp><AiLabel /></div>
              {suggestions.map((sg) => (
                <div key={sg.id} className="suggest-row">
                  <span className="small grow" style={{ minWidth: 0 }}>Mark <b>{playerById(sg.id).name}</b> {TAG_LABEL[sg.tag].toLowerCase()}. <span className="muted">{sg.why}</span></span>
                  <button className="btn btn-xs" onClick={() => setTag(sg.id, sg.tag)}>Apply</button>
                </div>
              ))}
            </div>
          )}
          {YOU.roster.map((id) => {
            const p = playerById(id);
            const starting = s.find((x) => x.player.id === id);
            return (
              <div key={id} className="prow roster-row">
                <PosBadge pos={p.pos} />
                <div style={{ minWidth: 0 }}>
                  <div className="pname">{p.name}</div>
                  <div className="pmeta">{starting ? starting.slot : "Bench"} · {p.nfl} · {eff(p, true).toFixed(1)} pts this week <StatusPill p={p} /></div>
                </div>
                <label htmlFor={`tag-${id}`} className="sr-only">Tag for {p.name}</label>
                <select id={`tag-${id}`} className="tag-select" value={myTags[id] ?? ""} onChange={(e) => setTag(id, e.target.value as MyTag | "")}>
                  <option value="">No tag</option>
                  {(Object.keys(TAG_LABEL) as MyTag[]).map((k) => <option key={k} value={k}>{TAG_LABEL[k]}</option>)}
                </select>
              </div>
            );
          })}
        </section>
      </div>

      <section className="card card-pad wiwt">
        <div>
          <h2 className="section-title">What would it take</h2>
          <p className="small muted" style={{ marginTop: 6 }}>For each player marked "Untouchable unless amazing," set your price. Sources shows the cheapest offer from each team that clears it.</p>
        </div>
        {locked.length === 0 && <p className="small muted">No locked players yet. Mark one "Untouchable unless amazing" above to set a price.</p>}
        {locked.map((pid) => {
          const price = prices[pid] ?? DEFAULT_PRICE;
          const offers = TEAMS.filter((t) => !t.you).map((t) => ({ t, o: whatItWouldTake(YOU, t, pid, tags, price) }));
          const real = offers.filter((x) => x.o).sort((a, b) => a.o!.youDelta - b.o!.youDelta);
          const none = offers.filter((x) => !x.o);
          return (
            <div key={pid} className="wiwt-player">
              <div className="row wrap" style={{ justifyContent: "space-between" }}>
                <div className="row"><PosBadge pos={playerById(pid).pos} /><b>{playerById(pid).name}</b><span className="tiny muted">{real.length} of {TEAMS.length - 1} teams can meet your price</span></div>
                <Seg label="Price type" value={price.mode} onChange={(m) => setPrice(pid, { mode: m, amount: m === "pts" ? 3 : 25 })}
                  options={[{ v: "pts", label: "Pts a week" }, { v: "pct", label: "% over value" }]} />
              </div>
              <div className="bar-input">
                <label htmlFor={`bar-${pid}`} className="small" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Your price</label>
                {price.mode === "pts"
                  ? <input id={`bar-${pid}`} type="range" min={0.5} max={6} step={0.5} value={price.amount} onChange={(e) => setPrice(pid, { mode: "pts", amount: Number(e.target.value) })} />
                  : <input id={`bar-${pid}`} type="range" min={5} max={60} step={5} value={price.amount} onChange={(e) => setPrice(pid, { mode: "pct", amount: Number(e.target.value) })} />}
                <span className="mono small num" style={{ minWidth: 72, textAlign: "right" }}>{price.mode === "pts" ? `${fmt(price.amount)}/wk` : `+${price.amount}%`}</span>
              </div>
              <p className="tiny muted">Only moves if the deal would {priceLabel(price)}{price.mode === "pct" ? " without lowering your starting lineup" : ""}.</p>
              {real.map(({ t, o }, i) => (
                <div key={t.id} className="offer">
                  <div className="row wrap" style={{ justifyContent: "space-between" }}>
                    <b className="small">{i === 0 ? `Per sources, ${t.name} could meet your price. ` : ""}{t.manager} sends {o!.get.map((id) => playerById(id).name).join(" + ")}</b>
                    <button className="btn btn-sm" onClick={() => onPitch(o!)}>Write pitch</button>
                  </div>
                  <div className="idea-nums"><span>You gain <Delta n={o!.youDelta} />/wk</span><span>They gain <Delta n={o!.themDelta} />/wk</span></div>
                </div>
              ))}
              {none.length > 0 && <p className="tiny muted">Can't get there: {none.map((x) => x.t.name).join(", ")}.</p>}
            </div>
          );
        })}
      </section>

      <SlotReport />
    </>
  );
}
