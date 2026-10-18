import { useEffect, useState } from "react";
import { WeekView, loadWeek, lastWeek } from "../weeks";
import { LEAGUE, OPPONENT_ID, SpecialPlayer, gameLine, teamById, MyTag, TEAMS, YOU, ManagerTag, playerById, Player, onBye, SLOT_HISTORY, UPDATED, DEADLINES, WEEK, sleeperUrl } from "../data";
import { irReport, irLabel, lineupFor, specialLineup, specialPts, Lineup, Price, DEFAULT_PRICE, Trade, eff, isOut, sleeperDiff, suggestTags, weakSlots, whatItWouldTake, fmt } from "../engine";
import { AiLabel, Delta, Icon, IconName, Seg, Stamp, StatusPill } from "./ui";
import { Avatar } from "./Avatar";

const TAG_LABEL: Record<MyTag, string> = {
  available: "Available",
  shopping: "Shopping",
  untouchable: "Untouchable",
  amazing: "Unless amazing",
};
// Standard normal CDF, for a win chance from two projections
const phi = (x: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - q : q; };
const ringOf = (p: Player): "bad" | "warn" | undefined => (onBye(p.nfl) || p.status === "O" ? "bad" : p.status === "Q" ? "warn" : undefined);
/** "Questionable, Groin" becomes "Groin". */
export const injuryDetail = (p: Player) => (p.note ?? "").replace(/^(Questionable|Doubtful|Out|IR|PUP|Sus|NA|DNR|COV)\b,?\s*/i, "") || (p.status === "O" ? "Out" : "Game-time decision");
const statusWord = (p: Player) => (onBye(p.nfl) ? "Bye" : p.status === "O" ? "Out" : p.status === "Q" ? "Questionable" : null);

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
            <Avatar p={p} size={36} />
            <span className="lu-who">
              <span className="lu-name">{p.name}</span>
              <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.nfl}</span><b className={`lu-st ${stuck ? "warn" : "bad"}`}>{stuck ? "No longer qualifies" : `${irLabel(p)}${detail && detail !== "Out" ? `, ${detail}` : ""}`}</b></span>
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
            <span className="lu-meta wrap">{ir.moveIn[i] ? `${ir.moveIn[i].name} qualifies. Moving him frees a bench spot.` : "Nobody on your roster qualifies right now."}</span>
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

const SLOT_LABEL: Record<string, string> = { FLEX: "W/R/T", SF: "SFLX", BN: "BN", IR: "IR", TX: "TAXI" };

/** One lineup row, Sleeper style: slot pill, jersey, name, projection. Shows the change to make if Sleeper differs. */
function LineupRow({ p, slot, bench, swap }: { p: Player; slot: string; bench?: boolean; swap?: { from: Player; gain: number } }) {
  const st = statusWord(p);
  return (
    <div className={`lu-row${bench ? " bench" : ""}${swap ? " has-swap" : ""}`}>
      <span className={`lu-slot s-${slot}`}>{SLOT_LABEL[slot] ?? slot}</span>
      <Avatar p={p} size={44} />
      <span className="lu-who">
        <span className="lu-name">{p.name}{st && st !== "Bye" && <b className={`lu-tag ${ringOf(p)}`}>{p.status === "Q" ? "Q" : "OUT"}</b>}</span>
        <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.nfl}</span>{!onBye(p.nfl) && gameLine(p) && <span className="lu-game">{gameLine(p)}</span>}</span>
        {p.status && !onBye(p.nfl) && <span className={`lu-inj ${ringOf(p)}`}>{injuryDetail(p)}</span>}
      </span>
      {onBye(p.nfl) ? <span className="lu-pts bye">BYE</span> : <span className="lu-pts">{eff(p, true).toFixed(1)}</span>}
      {swap && (
        <span className="lu-swap">
          <Icon name="trade" size={14} />
          <span>Sleeper has <b>{swap.from.name}</b>{onBye(swap.from.nfl) ? " (bye)" : isOut(swap.from, true) ? " (out)" : ""} here. Swap for <b className="good">+{swap.gain.toFixed(1)}</b>.</span>
        </span>
      )}
    </div>
  );
}

/** Kicker or defense row. Same layout as a skill player. */
function SpecialRow({ p, slot, bench, swapFrom }: { p: SpecialPlayer; slot: string; bench?: boolean; swapFrom?: SpecialPlayer }) {
  const bye = p.wk === null;
  const out = p.status === "O";
  return (
    <div className={`lu-row${bench ? " bench" : ""}${swapFrom ? " has-swap" : ""}`}>
      <span className={`lu-slot s-${slot}`}>{slot}</span>
      <Avatar p={p} size={44} />
      <span className="lu-who">
        <span className="lu-name">{p.name}{out && <b className="lu-tag bad">OUT</b>}</span>
        <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.nfl}</span>{!bye && gameLine(p) && <span className="lu-game">{gameLine(p)}</span>}</span>
      </span>
      {bye ? <span className="lu-pts bye">BYE</span> : <span className="lu-pts">{specialPts(p).toFixed(1)}</span>}
      {swapFrom && (
        <span className="lu-swap">
          <Icon name="trade" size={14} />
          <span>Sleeper has <b>{swapFrom.name}</b>{swapFrom.wk === null ? " (bye)" : ""} here. Swap for <b className="good">+{(specialPts(p) - specialPts(swapFrom)).toFixed(1)}</b>.</span>
        </span>
      )}
    </div>
  );
}

/** Any other week: past weeks show what you started and the stat lines, future weeks show projections. */
function WeekPanel({ v }: { v: WeekView }) {
  if (v.empty) return <p className="small muted" style={{ padding: "4px 16px 18px" }}>{v.empty}</p>;
  const row = (p: WeekView["bench"][number], slot: string, bench?: boolean) => (
    <div key={`${slot}-${p.id}`} className={`lu-row${bench ? " bench" : ""}`}>
      <span className={`lu-slot s-${slot}`}>{SLOT_LABEL[slot] ?? slot}</span>
      <Avatar p={p} size={40} text={p.pos === "DEF" ? p.nfl : undefined} />
      <span className="lu-who">
        <span className="lu-name">{p.name}</span>
        <span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b>{p.pos === "DEF" ? "Team defense" : p.nfl}</span>
        {p.line && p.pts !== null && <span className="lu-line">{p.line}</span>}
      </span>
      {p.pts === null ? <span className="lu-pts bye">BYE</span> : <span className={`lu-pts${v.kind === "past" ? " actual" : ""}`}>{p.pts.toFixed(1)}</span>}
    </div>
  );
  return (
    <>
      <div className="lu-week-sum">
        <span><i>{v.kind === "past" ? "You scored" : "Best lineup projects"}</i><b>{v.total.toFixed(1)}</b></span>
        {v.oppTotal !== undefined && <span className="r"><i>{v.oppName ?? "Opponent"}</i><b className="dim">{v.oppTotal.toFixed(1)}</b></span>}
        {v.oppTotal !== undefined && <span className={`lu-result ${v.total >= v.oppTotal ? "w" : "l"}`}>{v.total >= v.oppTotal ? "W" : "L"}</span>}
      </div>
      <div className="lu-list-head"><b>{v.kind === "past" ? "Started" : "Starters"}</b><span className="tiny muted">{v.kind === "past" ? "Pts" : "Proj"}</span></div>
      {v.starters.map((x, i) => x.p ? row(x.p, x.slot) : <div key={`e${i}`} className="lu-row"><span className={`lu-slot s-${x.slot}`}>{SLOT_LABEL[x.slot] ?? x.slot}</span><span className="ir-empty" aria-hidden="true" /><span className="lu-who"><span className="lu-name muted">Empty</span></span><span /></div>)}
      <div className="lu-list-head sub"><b>Bench</b><span className="tiny muted">{v.bench.length} players</span></div>
      {v.bench.map((p) => row(p, "BN", true))}
    </>
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
  const kdef = specialLineup(YOU);
  const [week, setWeek] = useState(WEEK);
  const [wv, setWv] = useState<WeekView | null>(null);
  const [wErr, setWErr] = useState<string | null>(null);
  useEffect(() => {
    if (week === WEEK) { setWv(null); return; }
    let live = true;
    setWv(null); setWErr(null);
    loadWeek(week).then((v) => live && setWv(v)).catch(() => live && setWErr("Couldn't load that week from Sleeper. Try again in a minute."));
    return () => { live = false; };
  }, [week]);
  // A K/DEF swap is needed when Sleeper starts someone at that slot who isn't our pick
  const specialSwap = (p: SpecialPlayer) => {
    const setIds = LEAGUE.sleeperSpecial ?? [];
    if (!setIds.length || setIds.includes(p.id)) return undefined;
    const from = setIds.map((id) => LEAGUE.specials?.[id]).find((x) => x && x.pos === p.pos);
    return from && specialPts(p) - specialPts(from) >= 0.5 ? from : undefined;
  };
  const swapFor = (id: string) => { const d = diff.find((x) => x.start.id === id); return d ? { from: d.benched, gain: d.gain } : undefined; };
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  const oppTotal = opp ? lineupFor(opp.roster, true).total + specialLineup(opp).total : null;
  const myTotal = lineup.total + specialLineup(YOU).total;
  const chance = oppTotal !== null ? Math.round(phi((myTotal - oppTotal) / 34) * 100) : 0;
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
          <h1 className="page-title">Lineup</h1>
          <p className="page-meta">Week {WEEK} · {UPDATED}</p>
        </div>
        <div className="lu-score" aria-label={`Your best lineup projects ${myTotal.toFixed(1)} points${opp ? `, ${opp.manager} projects ${oppTotal!.toFixed(1)}` : ""}`}>
          <div className="lu-side"><span className="lu-who-l"><i className="you" />You</span><span className="numeral">{myTotal.toFixed(1)}</span></div>
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
          {(
            <section className="card lu-list" aria-label="Starters and bench">
              <div className="lu-weeknav">
                <button className="btn btn-icon btn-sm" aria-label="Previous week" disabled={week <= 1} onClick={() => setWeek(week - 1)}><Icon name="chev" size={18} /></button>
                <span className="lu-weeknav-lbl"><b>Week {week}</b><span className="tiny muted">{week === WEEK ? "This week" : week < WEEK ? "Final" : "Projected"}</span></span>
                <button className="btn btn-icon btn-sm" aria-label="Next week" disabled={week >= lastWeek()} onClick={() => setWeek(week + 1)}><Icon name="chev" size={18} /></button>
              </div>
              {week !== WEEK ? (wErr ? <p className="small muted" style={{ padding: "4px 16px 18px" }}>{wErr}</p> : wv ? <WeekPanel v={wv} /> : <div className="lu-skel" aria-label={`Loading Week ${week}`}>{Array.from({ length: 6 }).map((_, i) => <span key={i} />)}</div>) : <>
              <div className="lu-list-head"><span><b>Starters</b><span className="tiny muted lu-hint">Your best lineup this week{diff.length ? ". Highlighted rows need a swap in Sleeper." : ". Matches Sleeper."}</span></span><span className="tiny muted">Proj</span></div>
              {s.map((x) => <LineupRow key={x.player.id} p={x.player} slot={x.slot} swap={swapFor(x.player.id)} />)}
              {kdef.slots.map((x, i) => x.player
                ? <SpecialRow key={x.player.id} p={x.player} slot={x.slot} swapFrom={specialSwap(x.player)} />
                : <div key={`empty-${x.slot}-${i}`} className="lu-row"><span className={`lu-slot s-${x.slot}`}>{x.slot}</span><span className="ir-empty" aria-hidden="true" /><span className="lu-who"><span className="lu-name muted">Empty</span><span className="lu-meta">Pick up a {x.slot === "K" ? "kicker" : "defense"} in Sleeper before lock.</span></span><span /></div>)}
              <div className="lu-list-head sub"><b>Bench</b><span className="tiny muted">{lineup.bench.length + kdef.bench.length} players</span></div>
              {lineup.bench.map((p) => <LineupRow key={p.id} p={p} slot="BN" bench />)}
              {kdef.bench.map((p) => <SpecialRow key={p.id} p={p} slot="BN" bench />)}
              <IrBlock />
              </>}
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
                <Avatar p={p} size={36} />
                <div style={{ minWidth: 0 }}>
                  <div className="pname">{p.name}</div>
                  <div className="pmeta">{p.pos} · {p.nfl}{!starting && " · Bench"} <StatusPill p={p} /></div>
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

      <section className="card wt" aria-labelledby="wt-title">
        <header className="wt-head">
          <h2 className="section-title" id="wt-title">What would it take?</h2>
          <p>Name your price for players you'd only move for a lot. Sources finds the cheapest offer from each team that pays it.</p>
        </header>
        {locked.length === 0 && <p className="wt-empty">No players marked "Unless amazing" yet. Tag one in Roster tags above to set a price.</p>}
        {locked.map((pid) => {
          const p = playerById(pid);
          const price = prices[pid] ?? DEFAULT_PRICE;
          const offers = TEAMS.filter((t) => !t.you).map((t) => ({ t, o: whatItWouldTake(YOU, t, pid, tags, price) }));
          const real = offers.filter((x) => x.o).sort((a, b) => a.o!.youDelta - b.o!.youDelta);
          const none = offers.filter((x) => !x.o);
          const pts = price.mode === "pts";
          const [min, max, step] = pts ? [0.5, 6, 0.5] : [5, 60, 5];
          const fill = ((price.amount - min) / (max - min)) * 100;
          return (
            <div key={pid} className="wt-player">
              <div className="wt-who">
                <Avatar p={p} size={40} />
                <span className="wt-name"><b>{p.name}</b><small>{p.pos} · {p.nfl}</small></span>
                <span className={`wt-count${real.length ? " on" : ""}`}><b>{real.length}</b> of {TEAMS.length - 1} teams</span>
              </div>

              <div className="wt-price">
                <div className="wt-price-top">
                  <label htmlFor={`bar-${pid}`}>Your price</label>
                  <Seg label="Price type" value={price.mode} onChange={(m) => setPrice(pid, { mode: m, amount: m === "pts" ? 3 : 25 })}
                    options={[{ v: "pts", label: "Points" }, { v: "pct", label: "% value" }]} />
                </div>
                <output className="wt-readout" htmlFor={`bar-${pid}`}>
                  {pts ? <>+{price.amount.toFixed(1)}<small> pts a week</small></> : <>+{price.amount}%<small> over value</small></>}
                </output>
                <input id={`bar-${pid}`} className="wt-range" type="range" min={min} max={max} step={step} value={price.amount}
                  style={{ background: `linear-gradient(90deg, rgb(var(--tab-rgb)) ${fill}%, var(--surface-3) ${fill}%)` }}
                  onChange={(e) => setPrice(pid, { mode: price.mode, amount: Number(e.target.value) })} />
                <div className="wt-scale" aria-hidden="true"><span>{pts ? "+0.5" : "+5%"}</span><span>{pts ? "+6" : "+60%"}</span></div>
                <p className="wt-note">{pts ? `Only moves if the deal adds at least ${price.amount.toFixed(1)} pts a week to your lineup.` : `Only moves if the return beats his value by ${price.amount}% without lowering your lineup.`}</p>
              </div>

              {real.length > 0 ? (
                <ul className="wt-offers">
                  {real.map(({ t, o }) => (
                    <li key={t.id} className="wt-offer">
                      <span className="wt-from">{t.manager} sends</span>
                      <ul className="wt-gets">
                        {o!.get.map((id) => { const g = playerById(id); return (
                          <li key={id}><Avatar p={g} size={32} /><span><b>{g.name}</b><small>{g.pos} · {g.nfl}</small></span></li>
                        ); })}
                      </ul>
                      <dl className="ti-stats wt-stats">
                        <div className="ti-stat"><dt>You gain</dt><dd><Delta n={o!.youDelta} /><small>/wk</small></dd></div>
                        <div className="ti-stat"><dt>They gain</dt><dd><Delta n={o!.themDelta} /><small>/wk</small></dd></div>
                      </dl>
                      <button className="btn btn-primary btn-sm ti-btn" onClick={() => onPitch(o!)}><Icon name="send" size={15} />Write pitch to {t.manager}</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="wt-empty">No team can pay that yet. Lower your price to see offers.</p>}

              {none.length > 0 && (
                <details className="wt-none">
                  <summary>{none.length} {none.length === 1 ? "team" : "teams"} can't get there<Icon name="chev" size={14} /></summary>
                  <p>{none.map((x) => x.t.name).join(", ")}</p>
                </details>
              )}
            </div>
          );
        })}
      </section>

      <SlotReport />
    </>
  );
}
