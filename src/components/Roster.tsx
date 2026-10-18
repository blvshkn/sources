import { useState } from "react";
import { LEAGUE, OPPONENT_ID, teamById, MyTag, TEAMS, YOU, ManagerTag, playerById, Player, onBye, SLOT_HISTORY, UPDATED, DEADLINES, WEEK, sleeperUrl } from "../data";
import { irReport, irLabel, lineupFor, Lineup, Price, DEFAULT_PRICE, Trade, eff, isOut, priceLabel, sleeperDiff, suggestTags, weakSlots, whatItWouldTake, fmt } from "../engine";
import { AiLabel, Delta, Icon, IconName, PosBadge, Seg, Stamp, StatusPill } from "./ui";
import { Jersey } from "./Jersey";

const TAG_LABEL: Record<MyTag, string> = {
  available: "Available",
  shopping: "Shopping",
  untouchable: "Untouchable",
  amazing: "Untouchable unless amazing",
};
const lastName = (name: string) => { const w = name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/, "").split(" "); return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(" ")}` : name; };
// Standard normal CDF, for a win chance from two projections
const phi = (x: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - q : q; };
const ringOf = (p: Player): "bad" | "warn" | undefined => (onBye(p.nfl) || p.status === "O" ? "bad" : p.status === "Q" ? "warn" : undefined);
/** "Questionable, Groin" becomes "Groin". */
export const injuryDetail = (p: Player) => (p.note ?? "").replace(/^(Questionable|Doubtful|Out|IR|PUP|Sus|NA|DNR|COV)\b,?\s*/i, "") || (p.status === "O" ? "Out" : "Game-time decision");
const statusWord = (p: Player) => (onBye(p.nfl) ? "Bye" : p.status === "O" ? "Out" : p.status === "Q" ? "Questionable" : null);

function Token({ p, slot }: { p: Player; slot: string }) {
  const ring = ringOf(p);
  return (
    <div className="ftok">
      <span className="ftok-shirt">
        <Jersey p={p} size={50} ring={ring} />
        {ring && <span className={`ftok-flag ${ring}`}>{onBye(p.nfl) ? "BYE" : p.status}</span>}
      </span>
      <span className="ftok-name">{lastName(p.name)}</span>
      <span className="ftok-meta"><b>{eff(p, true).toFixed(1)}</b><i>{slot}</i></span>
    </div>
  );
}

/** IR and taxi: players who don't count against your roster limit, plus anything that needs a move. */
function IrBlock() {
  const ir = irReport(YOU);
  const taxi = (YOU.taxi ?? []).map(playerById);
  if (!ir.slots && !ir.used.length && !taxi.length) return null;
  return (
    <>
      <div className="lu-list-head sub"><b>Injured reserve</b><span className="tiny muted">{ir.used.length} of {ir.slots} · off your {LEAGUE.rosterMax}-man limit</span></div>
      {ir.used.map((p) => {
        const stuck = !p.irEligible;
        const detail = injuryDetail(p);
        return (
          <div key={p.id} className={`lu-row ir-row${stuck ? " ir-stuck" : ""}`}>
            <span className="lu-slot">IR</span>
            <Jersey p={p} size={36} />
            <span className="lu-who">
              <span className="lu-name">{p.name}</span>
              <span className="lu-meta">{p.pos} · {p.nfl}<b className={`lu-st ${stuck ? "warn" : "bad"}`}>{stuck ? "No longer qualifies" : `${irLabel(p)}${detail && detail !== "Out" ? `, ${detail}` : ""}`}</b></span>
            </span>
            {stuck ? <a className="btn btn-xs" href={sleeperUrl()} target="_blank" rel="noreferrer">Activate</a> : <span className="lu-pts dim">{(p.proj || 0).toFixed(1)}</span>}
          </div>
        );
      })}
      {Array.from({ length: ir.open }).map((_, i) => (
        <div key={`open-${i}`} className="lu-row ir-row ir-open">
          <span className="lu-slot">IR</span>
          <span className="ir-empty" aria-hidden="true" />
          <span className="lu-who">
            <span className="lu-name muted">Open spot</span>
            <span className="lu-meta">{ir.moveIn[i] ? `${ir.moveIn[i].name} qualifies. Moving him frees a bench spot.` : "Nobody on your roster qualifies right now."}</span>
          </span>
          {ir.moveIn[i] ? <a className="btn btn-xs" href={sleeperUrl()} target="_blank" rel="noreferrer">Move</a> : <span />}
        </div>
      ))}
      {taxi.length > 0 && (
        <>
          <div className="lu-list-head sub"><b>Taxi squad</b><span className="tiny muted">{taxi.length} of {LEAGUE.taxiSlots}</span></div>
          {taxi.map((p) => <LineupRow key={p.id} p={p} slot="TX" bench />)}
        </>
      )}
    </>
  );
}

/** Your starters in an offensive formation, shot from above like a broadcast all-22 view. */
function Field({ starters }: { starters: { slot: string; player: Player }[] }) {
  // Three rows: on the line, off the ball, backfield. Five columns each.
  const grid: ({ slot: string; player: Player } | null)[][] = [[null, null, null, null, null], [null, null, null, null, null], [null, null, null, null, null]];
  const extra: { slot: string; player: Player }[] = [];
  const place = (x: { slot: string; player: Player }, spots: [number, number][]) => {
    const spot = spots.find(([r, c]) => !grid[r][c]);
    if (spot) grid[spot[0]][spot[1]] = x; else extra.push(x);
  };
  const of = (slot: string) => starters.filter((x) => x.slot === slot);
  of("WR").forEach((x) => place(x, [[0, 0], [0, 4], [1, 1], [1, 3], [1, 0]]));
  of("TE").forEach((x) => place(x, [[0, 3], [1, 3], [1, 4]]));
  of("QB").forEach((x) => place(x, [[1, 2], [2, 0]]));
  of("SF").forEach((x) => place(x, [[1, 4], [1, 0], [2, 4]]));
  of("RB").forEach((x) => place(x, [[2, 2], [2, 1], [2, 3]]));
  of("FLEX").forEach((x) => place(x, [[2, 3], [2, 1], [1, 4], [1, 0], [2, 4], [2, 0]]));
  const row = (cells: ({ slot: string; player: Player } | null)[], key: string) => (
    <div key={key} className="f-row">{cells.map((x, i) => <div key={i} className="f-cell">{x && <Token p={x.player} slot={x.slot} />}</div>)}</div>
  );
  return (
    <div className="field-shell">
      <section className="field" aria-label="Your best lineup on a football field">
        <div className="f-turf" aria-hidden="true" />
        {row(grid[0], "line")}
        <div className="f-los" aria-hidden="true"><span>Line of scrimmage</span></div>
        {row(grid[1], "off")}
        {row(grid[2], "back")}
        {extra.length > 0 && row([...extra, null, null, null, null, null].slice(0, 5), "extra")}
      </section>
    </div>
  );
}

const SLOT_LABEL: Record<string, string> = { FLEX: "W/R/T", SF: "SFLX", BN: "BN", IR: "IR", TX: "TAXI" };

/** One lineup row, Sleeper style: slot pill, jersey, name, projection. Shows the change to make if Sleeper differs. */
function LineupRow({ p, slot, bench, swap }: { p: Player; slot: string; bench?: boolean; swap?: { from: Player; gain: number } }) {
  const st = statusWord(p);
  return (
    <div className={`lu-row${bench ? " bench" : ""}${swap ? " has-swap" : ""}`}>
      <span className={`lu-slot s-${slot}`}>{SLOT_LABEL[slot] ?? slot}</span>
      <Jersey p={p} size={40} ring={ringOf(p)} />
      <span className="lu-who">
        <span className="lu-name">{p.name}</span>
        <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b>{p.nfl}{st && <b className={`lu-st ${ringOf(p)}`}>{st === "Questionable" ? "Q" : st}{p.status && !onBye(p.nfl) ? ` · ${injuryDetail(p)}` : ""}</b>}</span>
      </span>
      <span className="lu-pts">{eff(p, true).toFixed(1)}</span>
      {swap && (
        <span className="lu-swap">
          <Icon name="trade" size={14} />
          <span>Sleeper has <b>{swap.from.name}</b>{onBye(swap.from.nfl) ? " (bye)" : isOut(swap.from, true) ? " (out)" : ""} here. Swap for <b className="good">+{swap.gain.toFixed(1)}</b>.</span>
        </span>
      )}
    </div>
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
  const [view, setView] = useState<"list" | "field">("list");
  const swapFor = (id: string) => { const d = diff.find((x) => x.start.id === id); return d ? { from: d.benched, gain: d.gain } : undefined; };
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  const oppTotal = opp ? lineupFor(opp.roster, true).total : null;
  const chance = oppTotal !== null ? Math.round(phi((lineup.total - oppTotal) / 34) * 100) : 0;
  const ir = irReport(YOU);
  const checks: { key: string; tone: "warn" | "bad" | "info"; icon: IconName; title: string; text: string }[] = [
    ...ir.mustActivate.map((p) => ({ key: `ira-${p.id}`, tone: "bad" as const, icon: "alert" as IconName, title: `Activate ${p.name} from IR`, text: "He no longer qualifies. Sleeper blocks adds and trades until he's moved." })),
    ...(ir.open > 0 && ir.moveIn[0] ? [{ key: "irm", tone: "info" as const, icon: "plug" as IconName, title: `Move ${ir.moveIn[0].name} to IR`, text: `Open IR spot. Frees a bench spot without a drop.` }] : []),
    ...injured.map((x) => ({ key: `inj-${x.player.id}`, tone: (x.player.status === "O" ? "bad" : "warn") as "bad" | "warn", icon: "alert" as IconName, title: `${x.player.name} is ${x.player.status === "O" ? "out" : "questionable"}`, text: `${injuryDetail(x.player)}. ${x.player.status === "O" ? "Swap him before lock." : "Check the inactives 90 minutes before kickoff."}` })),
    ...(closeCall ? [{ key: "flex", tone: "info" as const, icon: "trade" as IconName, title: "Close call at flex", text: `${flex.player.name} ${eff(flex.player, true).toFixed(1)} vs ${bestBench.name} ${eff(bestBench, true).toFixed(1)}. Less than a point and a half apart.` }] : []),
    ...(benchOut.length ? [{ key: "bench", tone: "info" as const, icon: "roster" as IconName, title: "Thin bench this week", text: benchOut.map((p) => `${p.name} (${onBye(p.nfl) ? "bye" : "out"})`).join(", ") + "." }] : []),
  ];

  return (
    <>
      <header className="lu-hero">
        <div className="lu-hero-l">
          <span className="lu-kicker">Week {WEEK} · {UPDATED}</span>
          <h1 className="page-title">Lineup</h1>
        </div>
        <div className="lu-score" aria-label={`Your best lineup projects ${lineup.total.toFixed(1)} points${opp ? `, ${opp.manager} projects ${oppTotal!.toFixed(1)}` : ""}`}>
          <div className="lu-side"><span className="lu-who-l"><i className="you" />You</span><span className="numeral">{lineup.total.toFixed(1)}</span></div>
          {opp && <>
            <span className="lu-vs">{chance}%<small>win</small></span>
            <div className="lu-side r"><span className="lu-who-l">{opp.manager}<i className="them" /></span><span className="numeral dim">{oppTotal!.toFixed(1)}</span></div>
          </>}
        </div>
      </header>

      {diff.length > 0 && (
        <div className="lu-banner" role="status">
          <span className="lu-banner-ic"><Icon name="alert" size={18} /></span>
          <span className="lu-banner-txt"><b>{diff.length} {diff.length > 1 ? "changes" : "change"} to make in Sleeper</b><span>Worth {fmt(diff.reduce((a, d) => a + d.gain, 0))} pts. {DEADLINES.lock}.</span></span>
          <a className="btn btn-primary btn-sm" href={sleeperUrl()} target="_blank" rel="noreferrer">Open Sleeper</a>
        </div>
      )}

      <div className="lu-grid">
        <div className="lu-col">
          <div className="lu-tabs">
            <Seg label="Lineup view" value={view} onChange={setView} options={[{ v: "list", label: "List" }, { v: "field", label: "Field" }]} />
          </div>
          {view === "field" ? <Field starters={s} /> : (
            <section className="card lu-list" aria-label="Starters and bench">
              <div className="lu-list-head"><span><b>Starters</b><span className="tiny muted lu-hint">Your best lineup this week{diff.length ? ". Highlighted rows need a swap in Sleeper." : ". Matches Sleeper."}</span></span><span className="tiny muted">Proj</span></div>
              {s.map((x) => <LineupRow key={x.player.id} p={x.player} slot={x.slot} swap={swapFor(x.player.id)} />)}
              <div className="lu-list-head sub"><b>Bench</b><span className="tiny muted">{lineup.bench.length} of {LEAGUE.rosterMax - s.length}</span></div>
              {lineup.bench.map((p) => <LineupRow key={p.id} p={p} slot="BN" bench />)}
              <IrBlock />
            </section>
          )}
        </div>
        {checks.length > 0 && (
          <div className="lu-col">
            <section className="card lu-checks" aria-label="Before kickoff">
              <div className="lu-checks-head"><b>Before kickoff</b><span className="tiny muted">{DEADLINES.lock}</span></div>
              {checks.map((c) => (
                <div key={c.key} className="lu-check">
                  <span className={`lu-check-ic ${c.tone}`}><Icon name={c.icon} size={16} /></span>
                  <span className="lu-check-txt"><b>{c.title}</b><span>{c.text}</span></span>
                </div>
              ))}
              <div className="lu-checks-foot"><AiLabel /></div>
            </section>
          </div>
        )}
      </div>

      <div className="roster-grid">
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
                <Jersey p={p} size={36} />
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
