import { useState } from "react";
import { ManagerTag, ManagerTagKind, MyTag, Pos, TEAMS, Team, playerById, YOU, POS_ORDER, UPDATED , gameLine } from "../data";
import { FAIR_GAP, Lineup, Trade as TradeT, eff, pct, groupPoints, groupsFor, lineupChanges, lineupFor, offerRead, rosterAfter, tendencies, verdict, fmt , acceptance, Acceptance } from "../engine";
import { AiLabel, Delta, Icon, Stamp, StatusPill } from "./ui";
import { Avatar } from "./Avatar";
import { TradeIdea } from "./Wire";
import { TagCapture } from "./TagCapture";
import { TeamPicker } from "./TeamPicker";

function RosterPicker({ team, lineup, picked, onToggle, dimIds, lockIds, wantIds, label }: {
  team: Team; lineup: Lineup; picked: string[]; onToggle: (id: string) => void;
  dimIds: Record<string, string>; lockIds: Record<string, string>; wantIds: Record<string, string>; label: string;
}) {
  const row = (id: string, slot: string) => {
    const p = playerById(id);
    const on = picked.includes(id);
    const dim = dimIds[id];
    const lock = lockIds[id];
    const want = wantIds[id];
    return (
      <button key={id + slot} className={`pick${dim ? " dim" : ""}${want ? " wanted" : ""}`} aria-pressed={on} onClick={() => onToggle(id)}
        title={dim || lock || want || undefined}>
        <Avatar p={p} size={34} />
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="pname" style={{ display: "block" }}>{p.name}</span>
          <span className="pmeta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b> {p.nfl}{gameLine(p) ? ` · ${gameLine(p)}` : ""} · <span className="slot-tag">{slot}</span> <StatusPill p={p} />
            {lock && <span className="lock row" style={{ gap: 3 }}><Icon name="lock" size={11} />{lock}</span>}
            {want && <span className="want-tag">{want}</span>}
            {dim && <span className="lock">{dim}</span>}
          </span>
        </span>
        <span className="pproj">{eff(p).toFixed(1)}</span>
        <span className="check">{on && <Icon name="check" size={13} />}</span>
      </button>
    );
  };
  return (
    <section className="card" aria-label={label} style={{ overflow: "hidden" }}>
      <div className="roster-head">
        <div style={{ minWidth: 0 }}><div className="eyebrow">{label}</div><b>{team.name}</b></div>
        <span className="mono small num">{lineup.total.toFixed(1)}</span>
      </div>
      <div className="slot-label">Starters</div>
      {lineup.slots.filter((s) => s.player).map((s) => row(s.player!.id, s.slot))}
      <div className="slot-label">Bench</div>
      {lineup.bench.map((p) => row(p.id, "BN"))}
    </section>
  );
}

/** Apple Sports "team stats" layout: big net change per side, then each slot group with a two-color bar. */
/** Would they say yes? A plain read with the reasons, or what's standing in the way. */
export function AcceptRead({ a, who }: { a: Acceptance; who: string }) {
  const tone = a.label === "Likely yes" ? "good" : a.label === "Worth a shot" ? "warn" : "bad";
  return (
    <div className={`accept ${tone}`}>
      <div className="accept-top"><b>{a.label}</b><span className="tiny muted">{Math.round(a.p * 100)}% chance {who} accepts</span></div>
      {a.theirBlockers.length ? <ul>{a.theirBlockers.map((b) => <li key={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</li>)}</ul>
        : a.reasons.length ? <p className="tiny muted">{a.reasons.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(" · ")}</p> : null}
    </div>
  );
}

export function TradeCompare({ trade, them }: { trade: TradeT; them: Team }) {
  const youAfter = groupPoints(lineupFor(rosterAfter(YOU, trade, "you")));
  const themAfter = groupPoints(lineupFor(rosterAfter(them, trade, "them")));
  const cls = (n: number) => (n >= 0.05 ? "up" : n <= -0.05 ? "down" : "flat");
  return (
    <div className="tc" aria-label={`You ${fmt(trade.youDelta)} a week, ${them.manager} ${fmt(trade.themDelta)} a week`}>
      <div className="tc-head">
        <div className="tc-side">
          <span className="who"><i />You</span>
          <span className={`numeral ${cls(trade.youDelta)}`}>{fmt(trade.youDelta)}</span>
          <span className="sub">{trade.youBefore.toFixed(1)} to {trade.youAfter.toFixed(1)}</span>
        </div>
        <span className="tc-mid">pts / wk</span>
        <div className="tc-side right">
          <span className="who">{them.manager}<i /></span>
          <span className={`numeral ${cls(trade.themDelta)}`}>{fmt(trade.themDelta)}</span>
          <span className="sub">{trade.themBefore.toFixed(1)} to {trade.themAfter.toFixed(1)}</span>
        </div>
      </div>
      <MarketRow trade={trade} them={them} />
      <div className="tc-rows">
        {groupsFor().map((g) => {
          const a = youAfter[g], b = themAfter[g];
          return (
            <div key={g} className="tc-row">
              <span className="v">{a.toFixed(1)}</span>
              <span className="lbl">{g === "SF" ? "Superflex" : g === "FLEX" ? "Flex" : g}</span>
              <span className="v r">{b.toFixed(1)}</span>
              <span className="tc-bar" aria-hidden="true"><span style={{ flex: Math.max(a, 0.1) }} /><span style={{ flex: Math.max(b, 0.1) }} /></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Market value of both packages, the fairness lens a trade calculator uses. */
function MarketRow({ trade, them }: { trade: TradeT; them: Team }) {
  const g = trade.marketGap;
  const fair = Math.abs(g) <= FAIR_GAP;
  const total = Math.max(1, trade.marketGive + trade.marketGet);
  const label = fair ? "Fair" : g > 0 ? `You win by ${pct(g).slice(1)}` : `${them.manager} wins by ${pct(g).slice(1)}`;
  return (
    <div className="tc-market" aria-label={`Market value. You give ${trade.marketGive}, you get ${trade.marketGet}. ${label}.`}>
      <div className="tc-market-top">
        <span className="tiny muted">Market value</span>
        <span className={`tc-fair ${fair ? "good" : "warn"}`}>{label}</span>
      </div>
      <div className="tc-market-bar" aria-hidden="true">
        <span className="give" style={{ flex: trade.marketGive / total }} />
        <span className="get" style={{ flex: trade.marketGet / total }} />
      </div>
      <div className="tc-market-top">
        <span className="small"><b className="num">{trade.marketGive.toLocaleString()}</b> <span className="muted">you give</span></span>
        <span className="small"><span className="muted">you get</span> <b className="num">{trade.marketGet.toLocaleString()}</b></span>
      </div>
    </div>
  );
}

function Changes({ team, trade, side }: { team: Team; trade: TradeT; side: "you" | "them" }) {
  const ch = lineupChanges(lineupFor(team.roster), lineupFor(rosterAfter(team, trade, side)));
  if (!ch.length) return <p className="tiny muted">Starting lineup doesn't change.</p>;
  return (
    <ul className="changes">
      {ch.map((c, i) => (
        <li key={i}>
          <span className="slot-tag">{c.slot}</span>
          <span className="grow">{c.out ? c.out.name : "Empty"} <span className="muted">→</span> {c.in ? c.in.name : "Empty"}</span>
          <Delta n={c.delta} />
        </li>
      ))}
    </ul>
  );
}

export function TradeBuilder({ partnerId, setPartner, give, get, toggle, clear, trade, suggestions, tags, myTags, tip, coach, onPitch, onLoad, onAddTag }: {
  partnerId: string; setPartner: (id: string) => void;
  give: string[]; get: string[]; toggle: (side: "give" | "get", id: string) => void; clear: () => void;
  trade: TradeT | null; suggestions: TradeT[]; tags: ManagerTag[]; myTags: Record<string, MyTag>;
  tip: string | null;
  coach: (t: TradeT) => { trade: TradeT; line: string } | null;
  onPitch: (t: TradeT) => void; onLoad: (t: TradeT) => void;
  onAddTag: (t: Omit<ManagerTag, "id">) => void;
}) {
  const them = TEAMS.find((t) => t.id === partnerId)!;
  const theirTags = tags.filter((t) => t.teamId === them.id);
  const dimThem: Record<string, string> = {};
  theirTags.forEach((t) => {
    if (t.kind !== "refuses") return;
    them.roster.forEach((id) => { if (t.playerId ? id === t.playerId : playerById(id).pos === t.pos) dimThem[id] = "Won't move"; });
  });
  const dimYou: Record<string, string> = {};
  theirTags.forEach((t) => {
    if (t.kind !== "notInterested") return;
    YOU.roster.forEach((id) => { if (t.playerId ? id === t.playerId : playerById(id).pos === t.pos) dimYou[id] = `${them.manager} passed`; });
  });
  const wantYou: Record<string, string> = {};
  theirTags.forEach((t) => {
    if (t.kind !== "wants") return;
    YOU.roster.forEach((id) => { if (!dimYou[id] && (t.playerId ? id === t.playerId : playerById(id).pos === t.pos)) wantYou[id] = `${them.manager} wants`; });
  });
  const lockYou: Record<string, string> = {};
  Object.entries(myTags).forEach(([id, v]) => {
    if (v === "untouchable") lockYou[id] = "Untouchable";
    if (v === "amazing") lockYou[id] = "Unless amazing";
  });
  const [received, setReceived] = useState(false);
  const v = trade ? (received ? offerRead(trade) : verdict(trade)) : null;
  const acc = trade && !received ? acceptance(trade, YOU, them) : null;
  const counter = trade && received && trade.youDelta < 0.5 ? coach(trade) : null;
  const td = tendencies(them.id);
  const [why, setWhy] = useState(false);

  const [kind, setKind] = useState<ManagerTagKind>("wants");
  const [target, setTarget] = useState<string>("pos:RB");
  const addTag = () => {
    const isPos = target.startsWith("pos:");
    const val = target.slice(4);
    const name = isPos ? val : playerById(target).name;
    const text = kind === "wants" ? (isPos ? `Looking for ${name} help` : `Wants ${name}`) : kind === "refuses" ? `Won't move ${isPos ? `his ${name}` : name}` : `Not interested in ${isPos ? `your ${name}` : name}`;
    onAddTag({ teamId: them.id, kind, pos: isPos ? (val as Pos) : undefined, playerId: isPos ? undefined : target, text, weeksOld: 0 });
  };
  const targetOptions = kind === "notInterested" ? YOU.roster : kind === "refuses" ? them.roster : YOU.roster;

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Build a deal</h1>
          <p className="page-meta">{UPDATED}</p>
        </div>
      </header>

      <TeamPicker teams={TEAMS.filter((t) => !t.you)} value={partnerId} onChange={setPartner} />

      <p className="tp-note">{td.summary}</p>

      {suggestions.length > 0 && (
        <section className="card nudge">
          <div className="row wrap"><span className="stamp">Per sources</span><span className="small muted">Deals that help both teams, built around what {them.manager} wants</span></div>
          {suggestions.map((t) => <TradeIdea key={t.key} t={t} onOpen={onLoad} onPitch={onPitch} />)}
        </section>
      )}

      {give.length === 0 && get.length === 0 && <p className="deal-hint">Tap players on either roster below to start a deal. The read on it shows up here.</p>}

      <div className="builder">
        <section className={`card deal${give.length === 0 && get.length === 0 ? " empty" : ""}`} aria-live="polite">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="section-title">{received ? `Offer from ${them.manager}` : "The deal"}</h2>
            {(give.length > 0 || get.length > 0) && <button className="btn btn-sm btn-ghost" onClick={clear}>Clear</button>}
          </div>
          {(give.length > 0 || get.length > 0) && (
            <label className="offer-toggle">
              <button role="switch" aria-checked={received} className={`switch${received ? " on" : ""}`} onClick={() => setReceived((x) => !x)} aria-label={`${them.manager} sent me this offer`}><span /></button>
              {them.manager} sent me this offer
            </label>
          )}
          {!trade ? (
            <p className="empty-deal">{give.length === 0 && get.length === 0 ? "Tap players on either roster to start a deal." : give.length === 0 ? "Now pick who you'd send from your roster." : `Now pick who you'd get from ${them.manager}.`}</p>
          ) : (
            <>
              <div className="deal-lists">
                <div><span className="eyebrow">You send</span><ul>{give.map((id) => <li key={id}><Avatar p={playerById(id)} size={26} /><span>{playerById(id).name}</span></li>)}</ul></div>
                <div><span className="eyebrow">You get</span><ul>{get.map((id) => <li key={id}><Avatar p={playerById(id)} size={26} /><span>{playerById(id).name}</span></li>)}</ul></div>
              </div>
              <TradeCompare trade={trade} them={them} />
              {v && <div className={`verdict ${v.tone}`}><b>{v.label}</b><span className="small">{v.line}{received ? ` ${them.manager} gains ${fmt(trade.themDelta)}.` : ""}</span></div>}
              {acc && <AcceptRead a={acc} who={them.manager} />}
              {received && counter && (
                <div className="coach">
                  <p className="small"><b>Ready counter:</b> {counter.line}. You {fmt(counter.trade.youDelta)}, {them.manager} {fmt(counter.trade.themDelta)} a week.</p>
                  <div className="row wrap">
                    <button className="btn btn-sm" onClick={() => onLoad(counter.trade)}>Open in builder</button>
                    <button className="btn btn-sm btn-primary" onClick={() => onPitch(counter.trade)}>Send counter</button>
                  </div>
                </div>
              )}
              {(trade.youDrop.length > 0 || trade.themDrop.length > 0) && (
                <p className="small drop-note">
                  {trade.youDrop.length > 0 && <>You'd drop {trade.youDrop.map((id) => playerById(id).name).join(", ")} to make room. </>}
                  {trade.themDrop.length > 0 && <>{them.manager} would drop {trade.themDrop.map((id) => playerById(id).name).join(", ")}. </>}
                  Counted in the numbers above.
                </p>
              )}
              {trade.warnings.map((w) => <div key={w} className="warning"><Icon name="alert" size={16} /><span>{w}</span></div>)}
              {tip && (
                <div className="tip">
                  <Stamp>Tip</Stamp>
                  <span className="small">{tip}</span>
                </div>
              )}
              <button className="linkish small" onClick={() => setWhy((x) => !x)} aria-expanded={why}>{why ? "Hide the math" : "Show the math"}</button>
              {why && (
                <div className="why">
                  <div><span className="eyebrow">Your starters</span><Changes team={YOU} trade={trade} side="you" /></div>
                  <div><span className="eyebrow">{them.manager}'s starters</span><Changes team={them} trade={trade} side="them" /></div>
                  <p className="tiny muted">Two lenses. Points per week counts starting lineups only. Market value weighs the best player in full and each extra piece for less, so three bench players can't add up to one star. Net: you {fmt(trade.youDelta)}, {them.manager} {fmt(trade.themDelta)}.</p>
                </div>
              )}
              <div className="row wrap">
                <button className="btn btn-primary" onClick={() => onPitch(trade)}><Icon name="send" size={16} />Write pitch</button>
                {tip && <AiLabel />}
              </div>
            </>
          )}
        </section>

        <div className="rosters">
          <RosterPicker team={YOU} lineup={lineupFor(YOU.roster)} picked={give} onToggle={(id) => toggle("give", id)} dimIds={dimYou} lockIds={lockYou} wantIds={wantYou} label="You send" />
          <RosterPicker team={them} lineup={lineupFor(them.roster)} picked={get} onToggle={(id) => toggle("get", id)} dimIds={dimThem} lockIds={{}} wantIds={{}} label="You get" />
        </div>
      </div>

      <section className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h2 className="section-title">Log what {them.manager} said</h2>
          <p className="small muted" style={{ marginTop: 6 }}>Private to you. Type it the way they said it, or pick from the lists. Trade ideas follow it.</p>
        </div>
        <TagCapture onSave={onAddTag} placeholder={`${them.manager} said he's looking for a TE`} compact />
        <div className="row wrap">
          <label htmlFor="tag-kind" className="sr-only">Tag type</label>
          <select id="tag-kind" className="tag-select" value={kind} onChange={(e) => { const k = e.target.value as ManagerTagKind; setKind(k); setTarget(k === "wants" ? "pos:RB" : k === "notInterested" ? YOU.roster[0] : them.roster[0]); }}>
            <option value="wants">Wants</option>
            <option value="refuses">Won't move</option>
            <option value="notInterested">Not interested in</option>
          </select>
          <label htmlFor="tag-target" className="sr-only">Player or position</label>
          <select id="tag-target" className="tag-select" style={{ maxWidth: 220 }} value={target} onChange={(e) => setTarget(e.target.value)}>
            {POS_ORDER.map((p) => <option key={p} value={`pos:${p}`}>{kind === "wants" ? `${p} help` : kind === "refuses" ? `His ${p}` : `Your ${p}`}</option>)}
            {targetOptions.map((id) => <option key={id} value={id}>{playerById(id).name}</option>)}
          </select>
          <button className="btn btn-sm" onClick={addTag}>Save tag</button>
        </div>
        {theirTags.length > 0 && (
          <div className="row wrap">
            {theirTags.map((t) => <span key={t.id} className={`chip ${t.kind === "wants" ? "chip-good" : t.kind === "refuses" ? "chip-bad" : "chip-warn"}`}>{t.text}</span>)}
          </div>
        )}
      </section>
    </>
  );
}
