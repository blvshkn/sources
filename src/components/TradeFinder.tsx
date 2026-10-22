// The trade finder (tradeFinder.ts) on Trade, Ideas, All teams: three tiers instead of an empty state, each idea
// with your points gain over the season, regular season or playoffs, both teams' playoff odds before and after, and
// near copies folded under "Show N similar". Filters: Fair offers only, Buy player, Sell player, Improve position.
import { useEffect, useMemo, useState } from "react";
import { POS_ORDER, Pos, TEAMS, YOU, isDemo, playerById, teamById } from "../data";
import type { Trade } from "../engine";
import {
  FinderFilter, FinderIdea, FinderResult, Horizon, NO_FILTER, TIER_ORDER, Tier, TradeOdds, hasOdds, ODDS_DROP, tiersOf, tradeOdds,
} from "../tradeFinder";
import { runIdle } from "../idleSteps";
import type { Steps } from "../steps";
import { Delta, Icon, Seg, useSticky } from "./ui";
import { IdeaSide } from "./Wire";
import { TeamAvatar } from "./TeamPicker";
import { Select } from "./Select";
import { Tooltip } from "./Tooltip";

const TIER_COPY: Record<Tier, { title: string; sub: string }> = {
  both: { title: "Both sides win", sub: "Both starting lineups get better." },
  fair: { title: "Fair, they're about even", sub: "Even on value. Their lineup and playoff odds hold." },
  long: { title: "Long shots", sub: "Big for you, a loss for them. Expect a no." },
};
const HORIZON_LABEL: Record<Horizon, string> = { whole: "rest of season", reg: "regular season", po: "playoffs" };

/** Odds for the trades on screen. Cached ones show at once; the rest run in idle time, a few per slice. */
function useOdds(trades: Trade[]): Record<string, TradeOdds> {
  const [got, setGot] = useState<Record<string, TradeOdds>>({});
  const keys = trades.map((t) => t.key).join("|");
  useEffect(() => {
    const missing = trades.filter((t) => !got[t.key]);
    if (!missing.length) return;
    const ready: Record<string, TradeOdds> = {};
    missing.filter((t) => hasOdds(t.key)).forEach((t) => (ready[t.key] = tradeOdds(t, YOU)));
    if (Object.keys(ready).length) setGot((g) => ({ ...g, ...ready }));
    const rest = missing.filter((t) => !ready[t.key]);
    if (!rest.length) return;
    function* steps(): Steps<Record<string, TradeOdds>> {
      const out: Record<string, TradeOdds> = {};
      for (const t of rest) { out[t.key] = tradeOdds(t, YOU); yield { t: "n", n: Object.keys(out).length }; }
      return out;
    }
    return runIdle(steps, (r) => setGot((g) => ({ ...g, ...r })));
  }, [keys]); // eslint-disable-line react-hooks/exhaustive-deps
  return got;
}

const pctOf = (p: number) => (p >= 0.995 ? ">99%" : p > 0 && p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
/** One odds cell: before, after, and the change in points. Up is green, down red, under half a point flat. */
function OddsCell({ before, after }: { before: number; after: number }) {
  const d = Math.round((after - before) * 100);
  const tone = d > 0 ? "up" : d < 0 ? "down" : "flat";
  return (
    <span className="tf-oc">
      <span className="tf-oc-v"><span className="tf-oc-b">{pctOf(before)}</span><Icon name="chev" size={10} /><b>{pctOf(after)}</b></span>
      <span className={`tf-oc-d ${tone}`}>{d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "±0"}</span>
    </span>
  );
}

function OddsTable({ t, o }: { t: Trade; o: TradeOdds | undefined }) {
  const them = teamById(t.partnerId);
  const rows: { who: string; k: "you" | "them" }[] = [{ who: "You", k: "you" }, { who: them.manager, k: "them" }];
  return (
    <div className={`tf-odds${o ? "" : " is-wait"}`} role="table" aria-label="Playoff odds before and after" aria-busy={!o}>
      <div role="row" className="tf-or tf-oh">
        <span role="columnheader"><Tooltip focusable content={`From 1,000 sims of the rest of the season with each lineup's projected points, before and after the trade. The change is in points.`}><span className="tt-term">Playoff odds</span></Tooltip></span>
        <span role="columnheader">Make playoffs</span>
        <span role="columnheader">Win it all</span>
      </div>
      {rows.map((r) => (
        <div role="row" className="tf-or" key={r.k}>
          <span role="rowheader" className="tf-who">{r.who}</span>
          {o ? <>
            <span role="cell"><OddsCell before={o[r.k].before.playoff} after={o[r.k].after.playoff} /></span>
            <span role="cell"><OddsCell before={o[r.k].before.champ} after={o[r.k].after.champ} /></span>
          </> : <>
            <span role="cell"><span className="tf-oc tf-ghost" aria-label="Working" /></span>
            <span role="cell"><span className="tf-oc tf-ghost" aria-label="Working" /></span>
          </>}
        </div>
      ))}
    </div>
  );
}

const names = (ids: string[]) => ids.map((id) => playerById(id).name).join(" + ");

function IdeaCard({ x, h, similar, odds, onOpen, onPitch }: { x: FinderIdea; h: Horizon; similar: FinderIdea[]; odds: Record<string, TradeOdds>;
  onOpen: (t: Trade) => void; onPitch: (t: Trade) => void }) {
  const [more, setMore] = useState(false);
  const them = teamById(x.t.partnerId);
  const g = x.gain;
  return (
    <article className={`tf-card tier-${x.tier}`}>
      <header className="tf-ch">
        <span className="tf-team"><TeamAvatar t={them} size={28} /><span><b>{them.manager}</b><small>{them.name}</small></span></span>
        <span className="tf-gain">
          <Tooltip focusable content={`Your starting lineup's projected points over the ${HORIZON_LABEL[h]}${h === "whole" ? `: ${g.regWeeks} regular season ${g.regWeeks === 1 ? "week" : "weeks"} and ${g.poWeeks} playoff ${g.poWeeks === 1 ? "week" : "weeks"}` : h === "reg" ? `, ${g.regWeeks} ${g.regWeeks === 1 ? "week" : "weeks"}` : `, ${g.poWeeks} ${g.poWeeks === 1 ? "week" : "weeks"}, from playoff-week projections`}.`}>
            <span className="tf-gain-n"><Delta n={g[h]} /><small>pts</small></span>
          </Tooltip>
          <small className="tf-gain-k">{h === "whole" ? <>Reg <Delta n={g.reg} /> · Playoffs <Delta n={g.po} /></> : HORIZON_LABEL[h]}</small>
        </span>
      </header>
      {(x.fair || x.tier === "long") && <div className="tf-tags">
        {x.fair && <Tooltip content="Within 10% on trade value, after extra pieces count for less. Value only: it doesn't say they'd take it."><span className="tf-badge fair">Fair offer</span></Tooltip>}
        {x.tier === "long" && x.balk && <span className="tf-balk"><Icon name="alert" size={14} />{x.balk}</span>}
      </div>}
      <div className="tx">
        <IdeaSide label="You send" ids={x.t.give} tone="send" />
        <span className="tx-swap" aria-hidden="true"><Icon name="trade" size={16} /></span>
        <IdeaSide label="You get" ids={x.t.get} tone="get" />
      </div>
      <dl className="tf-pts">
        <div><dt>Your lineup</dt><dd><Delta n={x.t.youDelta} /><small>/wk</small></dd></div>
        <div><dt>{them.manager}'s lineup</dt><dd><Delta n={x.t.themDelta} /><small>/wk</small></dd></div>
      </dl>
      <OddsTable t={x.t} o={odds[x.t.key]} />
      <div className="ti-actions tf-actions">
        <button className="btn btn-sm ti-btn" onClick={() => onOpen(x.t)}>Open in builder</button>
        <button className="btn btn-primary btn-sm ti-btn" onClick={() => onPitch(x.t)}><Icon name="pen" size={15} />Write pitch</button>
      </div>
      {similar.length > 0 && <>
        {/* dismiss-exempt: inline show-more list, not an overlay */}
        <button className="tf-more" aria-expanded={more} onClick={() => setMore((v) => !v)}>
          <span>{more ? "Hide similar" : `Show ${similar.length} similar`}</span><Icon name="chev" size={14} />
        </button>
        {more && <ul className="tf-sim">
          {similar.map((s) => (
            <li key={s.t.key}>
              <button className="tf-sim-row" onClick={() => onOpen(s.t)} aria-label={`Open in builder: your ${names(s.t.give)} for ${names(s.t.get)}`}>
                <span className="tf-sim-txt"><span>{names(s.t.give)}</span><small>for {names(s.t.get)}</small></span>
                <span className="tf-sim-n"><Delta n={s.gain[h]} /><small>pts</small></span>
                <Icon name="chev" size={14} />
              </button>
            </li>
          ))}
        </ul>}
      </>}
    </article>
  );
}

/** A filter chip that opens the app's picker. Picking "Any" clears it. */
function PickChip<T extends string>({ label, value, valueLabel, options, header, onChange }: { label: string; value: T | ""; valueLabel?: string; header: string;
  options: { value: T | ""; label: string; hint?: string; group?: string; match?: { pos?: string; team?: string } }[]; onChange: (v: T | "") => void }) {
  return (
    <Select<T | ""> size="chip" className={`tf-chip chip-btn${value ? " on" : ""}`} header={header} aria-label={value ? `${label}: ${valueLabel}` : label}
      value={value} onChange={onChange} options={options} searchPlaceholder="Player, position or team">
      <span className="tf-chip-l">{value ? <><span className="tf-chip-k">{label}</span>{valueLabel}</> : label}</span><Icon name="chev" size={12} />
    </Select>
  );
}

export function TradeFinder({ ideas, stats, onOpen, onPitch }: { ideas: FinderIdea[] | null; stats: FinderResult | null; onOpen: (t: Trade) => void; onPitch: (t: Trade) => void }) {
  const [h, setH] = useSticky<Horizon>("trade.finder.h", "whole", ["whole", "reg", "po"]);
  const [f, setF] = useState<FinderFilter>(NO_FILTER);
  const tiers = useMemo(() => (ideas ? tiersOf(ideas, f, h) : null), [ideas, f, h]);
  const shown = useMemo(() => (tiers ? TIER_ORDER.flatMap((k) => tiers[k].map((g) => g.lead.t)) : []), [tiers]);
  const odds = useOdds(shown);
  const others = TEAMS.filter((t) => !t.you);
  const buyOpts = useMemo(() => [{ value: "" as string, label: "Any player" }, ...others.flatMap((t) => t.roster.map((id) => {
    const p = playerById(id);
    return { value: id, label: p.name, hint: `${p.pos} · ${t.manager}`, group: t.manager, match: { pos: p.pos, team: p.nfl } };
  }))], [others.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const sellOpts = useMemo(() => [{ value: "" as string, label: "Any player" }, ...YOU.roster.map((id) => {
    const p = playerById(id);
    return { value: id, label: p.name, hint: p.pos, match: { pos: p.pos, team: p.nfl } };
  })], []);
  const posOpts: { value: Pos | ""; label: string }[] = [{ value: "", label: "Any position" }, ...POS_ORDER.map((p) => ({ value: p, label: p }))];
  const any = f.fairOnly || !!f.buy || !!f.sell || !!f.pos;
  const count = tiers ? TIER_ORDER.reduce((a, k) => a + tiers[k].length, 0) : 0;
  return (
    <section className="tf" aria-label="Trade finder">
      <div className="tf-ctl">
        <Seg<Horizon> label="Points gain over" value={h} onChange={setH} options={[{ v: "whole", label: "Whole season" }, { v: "reg", label: "Regular season" }, { v: "po", label: "Playoffs" }]} />
        <div className="tf-chips" role="group" aria-label="Filters">
          <button className={`chip-btn tf-chip${f.fairOnly ? " on" : ""}`} aria-pressed={f.fairOnly} onClick={() => setF((x) => ({ ...x, fairOnly: !x.fairOnly }))}>
            {f.fairOnly && <Icon name="check" size={12} />}Fair offers only
          </button>
          <PickChip label="Buy" header="Buy a player" value={f.buy} valueLabel={f.buy ? playerById(f.buy).name : undefined} options={buyOpts} onChange={(v) => setF((x) => ({ ...x, buy: v }))} />
          <PickChip label="Sell" header="Sell one of yours" value={f.sell} valueLabel={f.sell ? playerById(f.sell).name : undefined} options={sellOpts} onChange={(v) => setF((x) => ({ ...x, sell: v }))} />
          <PickChip<Pos> label="Improve" header="Improve a position" value={f.pos} valueLabel={f.pos || undefined} options={posOpts} onChange={(v) => setF((x) => ({ ...x, pos: v }))} />
          {any && <button className="chip-btn ghost tf-clear" onClick={() => setF(NO_FILTER)}>Clear</button>}
        </div>
        <p className="tf-meta" role="status" data-search-ms={stats ? Math.round(stats.searchMs) : undefined} data-odds-ms={stats ? Math.round(stats.oddsMs) : undefined}>
          {!stats ? "Checking swaps with every team..." : <>Checked {stats.tried.toLocaleString()} swaps with {stats.teams} teams{isDemo() ? " in the demo league" : ""}.{any && count === 0 ? " Nothing matches these filters." : ""}</>}
        </p>
      </div>
      {!tiers ? (
        <div className="tf-wait" aria-hidden="true"><span className="tf-card tf-ghost-card" /><span className="tf-card tf-ghost-card" /></div>
      ) : TIER_ORDER.map((k) => (
        <section key={k} className={`tf-tier tier-${k}`} aria-labelledby={`tf-h-${k}`}>
          <div className="tf-th">
            <h3 id={`tf-h-${k}`}>{TIER_COPY[k].title}<span className="tf-n">{tiers[k].length}</span></h3>
            <p>{TIER_COPY[k].sub}</p>
          </div>
          {tiers[k].length === 0
            ? <p className="tf-none">{any ? "None with these filters." : k === "both" ? "Nothing helps both lineups yet. The fair ones below come closest." : "None right now."}</p>
            : tiers[k].map((g) => <IdeaCard key={g.lead.t.key} x={g.lead} similar={g.similar} h={h} odds={odds} onOpen={onOpen} onPitch={onPitch} />)}
        </section>
      ))}
      <p className="tf-foot small muted">Fair means within 10% on value with their lineup within a point a week and their playoff odds down no more than {Math.round(ODDS_DROP * 100)} points.</p>
    </section>
  );
}
