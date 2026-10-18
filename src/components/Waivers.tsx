import { useMemo, useRef, useState } from "react";
import { LeagueSwitch } from "./LeagueSwitch";
import { DEADLINES, FAAB, YOU, sleeperUrl , PLAYERS, gameLine, FREE_AGENTS, FreeAgent, gameState, lockedThisWeek } from "../data";
import { WaiverRec, bidDollars, bidsFor, eff, fmt, irReport } from "../engine";
import { AiLabel, Icon, useSticky } from "./ui";
import { Avatar } from "./Avatar";

/** Why a free agent can't help this week, or null when he can. */
type Avail = null | "played" | "bye" | "out" | "ir";
const AVAIL_LABEL: Record<Exclude<Avail, null>, string> = { played: "Played", bye: "Bye", out: "Out", ir: "IR" };
const availOf = (fa: FreeAgent): Avail => {
  const s = gameState(fa.nfl);
  if (s === "bye") return "bye";
  if (s === "in_game" || s === "complete") return "played";
  const p = PLAYERS[fa.id];
  if (p?.injury === "IR") return "ir";
  if (p?.status === "O") return "out";
  return null;
};
type Entry = { fa: FreeAgent; value: number; avail: Avail; rec?: WaiverRec };

/** Highlights the typed part of a name in type-ahead results. */
function Hit({ name, term }: { name: string; term: string }) {
  const low = name.toLowerCase();
  const w = low.split("").findIndex((_, k) => (k === 0 || low[k - 1] === " ") && low.startsWith(term, k));
  const i = w >= 0 ? w : low.indexOf(term);
  if (!term || i < 0) return <>{name}</>;
  return <>{name.slice(0, i)}<mark>{name.slice(i, i + term.length)}</mark>{name.slice(i + term.length)}</>;
}

/** "$40-$90", or "Up to $150" when the low end is zero. */
const bidText = (b: [number, number] | number[]) => { const lo = bidDollars(b[0]), hi = bidDollars(b[1]); return lo <= 0 ? `Up to $${hi}` : `$${lo}-$${hi}`; };

export function Waivers({ recs, onToast }: { recs: WaiverRec[]; onToast: (m: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pos, setPos] = useSticky<"ALL" | "QB" | "RB" | "WR" | "TE">("waivers.pos", "ALL");
  const [sort, setSort] = useSticky<"fit" | "trend" | "proj">("waivers.sort", "fit");
  const [q, setQ] = useState("");
  const [suggest, setSuggest] = useState(false);
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const top = recs[0];
  const ir = irReport(YOU);
  const irMove = ir.open > 0 ? ir.moveIn[0] : undefined;
  // Every free agent: the ones who can help this week first, then anyone who already played, is on bye, Out or on IR
  const all = useMemo<Entry[]>(() => {
    const ok: Entry[] = recs.map((r) => ({ fa: r.fa, value: r.value, avail: availOf(r.fa), rec: r }));
    const locked: Entry[] = FREE_AGENTS.filter((fa) => lockedThisWeek(fa.nfl)).map((fa) => ({ fa, value: PLAYERS[fa.id] ? eff(PLAYERS[fa.id]) : fa.proj, avail: availOf(fa) }));
    return [...ok, ...locked];
  }, [recs]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = all.filter((e) => (pos === "ALL" || e.fa.pos === pos) && (!term || e.fa.name.toLowerCase().includes(term) || e.fa.nfl.toLowerCase() === term));
    const sorted = sort === "trend" ? [...list].sort((a, b) => (b.fa.trend === "up" ? 1 : 0) - (a.fa.trend === "up" ? 1 : 0) || (b.fa.rostered ?? 0) - (a.fa.rostered ?? 0))
      : sort === "proj" ? [...list].sort((a, b) => b.value - a.value) : list;
    return [...sorted.filter((e) => !e.avail), ...sorted.filter((e) => e.avail)];
  }, [all, pos, sort, q]);
  // Type-ahead: names that start with what you typed rank above names that merely contain it
  const term = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!term) return [];
    const starts = (n: string) => n.toLowerCase().split(/\s+/).some((w) => w.startsWith(term));
    return all.filter((e) => e.fa.name.toLowerCase().includes(term)).sort((a, b) => Number(starts(b.fa.name)) - Number(starts(a.fa.name)) || Number(!!a.avail) - Number(!!b.avail) || b.value - a.value).slice(0, 6);
  }, [all, term]);
  const pick = (e: Entry) => {
    setQ(e.fa.name); setSuggest(false); setPos("ALL"); setOpen(e.rec ? e.fa.id : null);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-id="${CSS.escape(e.fa.id)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };
  const onKey = (ev: { key: string; preventDefault: () => void }) => {
    if (!suggest || !hits.length) return;
    if (ev.key === "ArrowDown") { ev.preventDefault(); setHi((h) => (h + 1) % hits.length); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setHi((h) => (h - 1 + hits.length) % hits.length); }
    else if (ev.key === "Enter") { ev.preventDefault(); pick(hits[hi]); }
    else if (ev.key === "Escape") setSuggest(false);
  };
  const ready = shown.filter((e) => !e.avail).length;
  return (
    <>
      <header className="page-head">
        <div>
          <LeagueSwitch title="Waivers" meta={<>{DEADLINES.waivers}</>} />
        </div>
      </header>

      {FAAB.enabled && <div className="faab faab-row" aria-label={`FAAB remaining ${FAAB.remaining} of ${FAAB.budget}`}>
        <span className="faab-row-top"><b className="num">${FAAB.remaining}<span className="muted">/{FAAB.budget}</span></b><span className="muted">FAAB left</span></span>
        <span className="faab-track"><span style={{ width: `${(FAAB.remaining / FAAB.budget) * 100}%` }} /></span>
      </div>}

      {top && (() => {
        const hi = bidDollars(top.bid[1]);
        const starts = top.gain > 0.05;
        const game = gameLine(PLAYERS[top.fa.id] ?? {});
        return (
          <section className={`card topk${starts ? " gain" : ""}`} aria-label="Top pickup">
            <div className="topk-head"><span className="topk-label">Top pickup</span><AiLabel /></div>
            <div className="topk-who">
              <Avatar p={top.fa} size={52} />
              <div className="topk-id">
                <h3 className="topk-name">{top.fa.name}</h3>
                <span className="wv-meta"><b className={`lu-pos p-${top.fa.pos}`}>{top.fa.pos}</b>{top.fa.nfl}{game && <span className="lu-game">· {game}</span>}</span>
              </div>
            </div>
            <dl className="topk-stats">
              <div><dt>This week</dt><dd>{top.fa.proj.toFixed(1)}</dd></div>
              <div><dt>ROS per week</dt><dd>{top.value.toFixed(1)}</dd></div>
              <div><dt>{FAAB.enabled ? "Bid" : "Claim"}</dt><dd>{FAAB.enabled ? bidText(top.bid) : "Priority"}</dd></div>
            </dl>
            {!/^Projects /.test(top.fa.why) && <p className="topk-why">{top.fa.why}</p>}
            <ul className="topk-plan">
              <li className={starts ? "good" : ""}><Icon name={starts ? "check" : "eye"} size={16} />
                {starts ? <span>Starts for you. <b>{fmt(top.gain)} pts</b> this week.</span> : <span>Bench stash for now. Doesn't crack your lineup this week.</span>}
              </li>
              <li><Icon name="trade" size={16} />
                {irMove ? <span>Move <b>{irMove.name}</b> to IR first. No drop needed.</span>
                  : top.drop ? <span>Drop <b>{top.drop.name}</b> ({eff(top.drop).toFixed(1)} projected).</span>
                  : <span>You have an open roster spot.</span>}
              </li>
            </ul>
            <a className="btn btn-primary topk-cta" href={sleeperUrl()} target="_blank" rel="noreferrer"
              onClick={() => onToast(`Opening Sleeper. ${FAAB.enabled ? `Bid up to $${hi} on` : "Claim"} ${top.fa.name}${top.drop && !irMove ? `, drop ${top.drop.name}` : ""}.`)}>
              Claim in Sleeper
            </a>
          </section>
        );
      })()}

      <section className="card wv-card" aria-label="Waiver targets">
        <div className="wv-head">
          <div className="wv-head-t">
            <b>Available</b>
            <span>{ready} can help this week{shown.length > ready ? ` · ${shown.length - ready} can't` : ""}</span>
          </div>
          <label className="wv-sort">
            <span className="sr-only">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="fit">Best fit</option>
              <option value="trend">Trending</option>
              <option value="proj">Projected</option>
            </select>
            <Icon name="chev" size={14} />
          </label>
        </div>
        <div className="wv-ta">
          <label className="psr-field wv-search">
            <Icon name="search" size={18} />
            <span className="sr-only">Search free agents</span>
            <input value={q} onChange={(e) => { setQ(e.target.value); setSuggest(true); setHi(0); }} onFocus={() => setSuggest(true)} onBlur={() => window.setTimeout(() => setSuggest(false), 120)} onKeyDown={onKey}
              placeholder="Search every free agent" autoComplete="off" spellCheck={false} role="combobox" aria-expanded={suggest && hits.length > 0} aria-controls="wv-ta-list" aria-autocomplete="list" />
            {q && <button className="psr-clear" onClick={() => { setQ(""); setSuggest(false); }} aria-label="Clear search"><Icon name="x" size={16} /></button>}
          </label>
          {suggest && hits.length > 0 && (
            <ul className="wv-ta-list" id="wv-ta-list" role="listbox">
              {hits.map((e, i) => (
                <li key={e.fa.id} role="option" aria-selected={i === hi}>
                  <button onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(e)} onMouseEnter={() => setHi(i)} className={`${i === hi ? "on" : ""}${e.avail ? " off" : ""}`}>
                    <b className={`lu-pos p-${e.fa.pos}`}>{e.fa.pos}</b>
                    <span className="wv-ta-n"><span><Hit name={e.fa.name} term={term} /></span><small>{e.fa.nfl}</small></span>
                    {e.avail ? <span className={`wv-tag t-${e.avail}`}>{AVAIL_LABEL[e.avail]}</span> : <span className="wv-ta-p">{e.value.toFixed(1)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="wv-pos" role="group" aria-label="Position">
          {(["ALL", "QB", "RB", "WR", "TE"] as const).map((p) => (
            <button key={p} aria-pressed={pos === p} onClick={() => setPos(p)}>{p === "ALL" ? "All" : p}</button>
          ))}
        </div>
        <div ref={listRef}>
        {shown.length === 0 && <p className="small muted" style={{ padding: "8px 16px 18px" }}>{q.trim() ? `No free agent matches "${q.trim()}". Rostered players are in Build a deal search.` : `No ${pos === "ALL" ? "players" : pos} available right now. Check back after waivers run.`}</p>}
        {shown.map((e, i) => {
          if (!e.rec) return (
            <div key={e.fa.id} data-id={e.fa.id} className="wv wv-off">
              <div className="wv-row">
                <span className="wv-rank"><Icon name="lock" size={14} /></span>
                <Avatar p={e.fa} size={40} />
                <span className="wv-who">
                  <span className="wv-name">{e.fa.name}<span className={`wv-tag t-${e.avail}`}>{AVAIL_LABEL[e.avail!]}</span></span>
                  <span className="wv-meta"><b className={`lu-pos p-${e.fa.pos}`}>{e.fa.pos}</b>{e.fa.nfl}{e.fa.rookie && <span className="wv-flag">Rookie</span>}</span>
                </span>
                <span className="wv-proj"><span>Proj</span><b>{e.value.toFixed(1)}</b></span>
                <span className="wv-stats"><span><i>This week</i><b>{e.avail === "bye" ? "On bye, can't score" : "Game started, can't score"}</b></span>{e.fa.rostered !== undefined && <span><i>Rostered</i><b>{e.fa.rostered}%</b></span>}</span>
              </div>
            </div>
          );
          const r = e.rec;
          const isOpen = open === r.fa.id;
          return (
            <div key={r.fa.id} data-id={r.fa.id} className={`wv${isOpen ? " open" : ""}${e.avail ? " wv-dim" : ""}`}>
              <button className="wv-row" onClick={() => setOpen(isOpen ? null : r.fa.id)} aria-expanded={isOpen}>
                <span className="wv-rank">{e.avail ? <Icon name="lock" size={14} /> : i + 1}</span>
                <Avatar p={r.fa} size={40} />
                <span className="wv-who">
                  <span className="wv-name">{r.fa.name}{r.fa.trend === "up" && <Icon name="spark" size={14} />}{e.avail && <span className={`wv-tag t-${e.avail}`}>{AVAIL_LABEL[e.avail]}</span>}</span>
                  <span className="wv-meta"><b className={`lu-pos p-${r.fa.pos}`}>{r.fa.pos}</b>{r.fa.nfl}{gameLine(PLAYERS[r.fa.id] ?? {}) && <span className="lu-game">· {gameLine(PLAYERS[r.fa.id] ?? {})}</span>}{r.fa.rookie && <span className="wv-flag">Rookie</span>}</span>
                </span>
                <span className="wv-proj"><span>Proj</span><b>{r.value.toFixed(1)}</b></span>
                <span className="wv-stats">
                  <span><i>Your lineup</i><b className={r.gain > 0.05 ? "good" : ""}>{r.gain > 0.05 ? fmt(r.gain) : "No change"}</b></span>
                  <span><i>{FAAB.enabled ? "Bid" : "Tier"}</i><b>{FAAB.enabled ? bidText(r.bid) : r.tier}</b></span>
                  {r.fa.rostered !== undefined && <span><i>Rostered</i><b>{r.fa.rostered}%</b></span>}
                  {r.fa.adds !== undefined && <span><i>Adds 24h</i><b>{r.fa.adds >= 1000 ? `${(r.fa.adds / 1000).toFixed(1)}K` : r.fa.adds}</b></span>}
                </span>
              </button>
              {isOpen && (
                <div className="wv-detail">
                  <p className="small">{r.fa.why}</p>
                  <div className="wv-grid">
                    <div><span className="eyebrow">Add</span><p className="small"><b>{r.fa.name}</b>, {r.tier.toLowerCase()} tier</p></div>
                    <div><span className="eyebrow">Drop</span><p className="small">{r.drop ? <><b>{r.drop.name}</b> ({eff(r.drop).toFixed(1)} proj, your lowest bench player)</> : "Open roster spot"}</p></div>
                    <div><span className="eyebrow">{FAAB.enabled ? "Bid range" : "Claim"}</span><p className="small">{FAAB.enabled ? <><b>{bidText(r.bid)}</b> ({r.bid[0]} to {r.bid[1]} percent of budget)</> : <>Rolling waiver priority in your league</>}</p></div>
                  </div>
                  {FAAB.enabled && <BidHistory tier={r.tier} range={r.bid} />}
                  <div className="row wrap">
                    <a className="btn btn-primary btn-sm" href={sleeperUrl()} target="_blank" rel="noreferrer" onClick={() => onToast(`Opening Sleeper. Bid ${r.bid[1]}% on ${r.fa.name}, drop ${r.drop?.name ?? "nobody"}.`)}>
                      <Icon name="app" size={16} />Open Sleeper
                    </a>
                    <span className="tiny muted">Claims are placed in your league app. Sources never bids for you.</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
      </section>
    </>
  );
}

function BidHistory({ tier, range }: { tier: string; range: [number, number] }) {
  const { bids, estimated } = bidsFor(tier as "Starter" | "Flex" | "Depth" | "Stash");
  const max = Math.max(30, ...bids);
  return (
    <div className="bid-hist">
      <span className="tiny muted">{estimated ? `Not enough winning ${tier.toLowerCase()} bids in your league yet, so this shows a typical range` : `Winning ${tier.toLowerCase()} bids in your league this season (${bids.length})`}</span>
      <div className="bid-track" role="img" aria-label={`Winning bids: ${bids.join(", ")} percent`}>
        <span className="bid-range" style={{ left: `${(range[0] / max) * 100}%`, width: `${Math.max(2, ((range[1] - range[0]) / max) * 100)}%` }} />
        {bids.map((b, i) => <span key={i} className="bid-dot" style={{ left: `${(b / max) * 100}%` }} title={`${b}%`} />)}
      </div>
      <div className="bid-scale"><span>0%</span><span>{Math.round(max / 2)}%</span><span>{max}%</span></div>
    </div>
  );
}
