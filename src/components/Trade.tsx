import { useState } from "react";
import { ManagerTag, ManagerTagKind, MyTag, Pos, TEAMS, Team, playerById, YOU, POS_ORDER, UPDATED , gameLine } from "../data";
import { FAIR_GAP, Lineup, Trade as TradeT, eff, pct, groupPoints, groupsFor, lineupChanges, lineupFor, offerRead, rosterAfter, tendencies, verdict, fmt , acceptance, Acceptance } from "../engine";
import { AiLabel, Delta, Icon, Stamp, StatusPill } from "./ui";
import { Avatar } from "./Avatar";
import { TradeIdea } from "./Wire";
import { TagCapture } from "./TagCapture";
import { TeamPicker } from "./TeamPicker";

function RosterPicker({ team, lineup, picked, onToggle, dimIds, lockIds, wantIds, label, tone }: {
  team: Team; lineup: Lineup; picked: string[]; onToggle: (id: string) => void;
  dimIds: Record<string, string>; lockIds: Record<string, string>; wantIds: Record<string, string>; label: string; tone: "give" | "get";
}) {
  // Live leagues: show the lineup exactly as it's set in Sleeper right now. Demo falls back to the best lineup.
  const current = team.starters?.length ? (() => {
    const starters = team.starters!.filter((id) => team.roster.includes(id));
    return { starters, bench: team.roster.filter((id) => !starters.includes(id)) };
  })() : null;
  const row = (id: string, slot: string) => {
    const p = playerById(id);
    const on = picked.includes(id);
    const dim = dimIds[id];
    const lock = lockIds[id];
    const want = wantIds[id];
    return (
      <button key={id + slot} className={`pick tone-${tone}${dim ? " dim" : ""}${want ? " wanted" : ""}`} aria-pressed={on} onClick={() => onToggle(id)}
        title={dim || lock || want || undefined}>
        <Avatar p={p} size={34} />
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="pname" style={{ display: "block" }}>{p.name}</span>
          <span className="pmeta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b> {p.nfl}{gameLine(p) ? ` · ${gameLine(p)}` : ""} <StatusPill p={p} />
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
        <div className="rp-t"><span>{label}</span><b>{team.name}</b></div>
        <span className="rp-total"><b>{(current ? current.starters.reduce((n, id) => n + eff(playerById(id)), 0) : lineup.total).toFixed(1)}</b><small>starters pts/wk</small></span>
      </div>
      <div className="slot-label">Starters{current ? <small> as set in Sleeper</small> : null}</div>
      {current
        ? current.starters.map((id) => row(id, "ST"))
        : lineup.slots.filter((s) => s.player).map((s) => row(s.player!.id, s.slot))}
      <div className="slot-label">Bench</div>
      {current ? current.bench.map((id) => row(id, "BN")) : lineup.bench.map((p) => row(p.id, "BN"))}
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

export function TradeBuilder({ partnerId, setPartner, give, get, toggle, clear, trade, suggestions, tags, myTags, tip, coach, onPitch, onLoad, onAddTag, onRemoveTag }: {
  partnerId: string; setPartner: (id: string) => void;
  give: string[]; get: string[]; toggle: (side: "give" | "get", id: string) => void; clear: () => void;
  trade: TradeT | null; suggestions: TradeT[]; tags: ManagerTag[]; myTags: Record<string, MyTag>;
  tip: string | null;
  coach: (t: TradeT) => { trade: TradeT; line: string } | null;
  onPitch: (t: TradeT) => void; onLoad: (t: TradeT) => void;
  onAddTag: (t: Omit<ManagerTag, "id">) => void;
  onRemoveTag: (id: string) => void;
}) {
  const them = TEAMS.find((t) => t.id === partnerId)!;
  const [side, setSide] = useState<"give" | "get">("give");
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
    if (v === "amazing") lockYou[id] = "Overpay only";
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

      <div className="tp-card">
        <TeamPicker teams={TEAMS.filter((t) => !t.you)} value={partnerId} onChange={setPartner} />
        {(() => {
          // Facts become tags; the closing advice gets its own line
          const parts = td.summary.split(/(?<=\.)\s+/).map((x) => x.trim().replace(/\.$/, "")).filter(Boolean)
            .map((x) => x.startsWith(them.manager + " ") ? x.slice(them.manager.length + 1) : x)
            .map((x) => x.charAt(0).toUpperCase() + x.slice(1));
          const tip = parts.length > 1 ? parts[parts.length - 1] : null;
          const facts = tip ? parts.slice(0, -1) : parts;
          return (
            <div className="tp-scout" aria-label={`How ${them.manager} trades`}>
              <ul className="tp-facts">{facts.map((f) => <li key={f}>{f}</li>)}</ul>
              {tip && <p className="tp-tip"><Icon name="spark" size={14} /><span>{tip}.</span></p>}
            </div>
          );
        })()}
      </div>

      {suggestions.length > 0 && (
        <section className="card nudge">
          <div className="row wrap"><span className="stamp">Per sources</span><span className="small muted">Win-win trades built around what {them.manager} wants</span></div>
          {suggestions.map((t) => <TradeIdea key={t.key} t={t} onOpen={onLoad} onPitch={onPitch} />)}
        </section>
      )}


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
                <button className="btn btn-primary" onClick={() => onPitch(trade)}><Icon name="pen" size={16} />Write pitch</button>
                {tip && <AiLabel />}
              </div>
            </>
          )}
        </section>

        <div className="rosters" data-side={side}>
          <div className="side-switch" role="tablist" aria-label="Which roster">
            <button role="tab" aria-selected={side === "give"} onClick={() => setSide("give")}><span>You send</span><b className="give">{give.length}</b></button>
            <button role="tab" aria-selected={side === "get"} onClick={() => setSide("get")}><span>You get</span><b className="get">{get.length}</b></button>
          </div>
          {give.length === 0 && get.length === 0 && <p className="side-hint">Tap players on either side to build the deal.</p>}
          <div className="side-pane side-give" role="tabpanel">
            <RosterPicker team={YOU} lineup={lineupFor(YOU.roster)} picked={give} onToggle={(id) => toggle("give", id)} dimIds={dimYou} lockIds={lockYou} wantIds={wantYou} label="You send" tone="give" />
          </div>
          <div className="side-pane side-get" role="tabpanel">
            <RosterPicker team={them} lineup={lineupFor(them.roster)} picked={get} onToggle={(id) => toggle("get", id)} dimIds={dimThem} lockIds={{}} wantIds={{}} label="You get" tone="get" />
          </div>
        </div>
      </div>

      {(give.length > 0 || get.length > 0) && (
        <div className="deal-tray" role="region" aria-label="Your deal so far">
          <div className="dt-sides">
            {(["give", "get"] as const).map((k) => {
              const ids = k === "give" ? give : get;
              return (
                <div key={k} className={`dt-side ${k}`}>
                  <button className="dt-label" onClick={() => setSide(k)}>{k === "give" ? "Send" : "Get"}</button>
                  <div className="dt-chips">
                    {ids.map((id) => { const p = playerById(id); return (
                      <button key={id} className="dt-chip" onClick={() => toggle(k, id)} aria-label={`Remove ${p.name}`}>
                        <Avatar p={p} size={22} badge={false} /><span>{p.name.split(" ").slice(-1)[0]}</span><Icon name="x" size={12} />
                      </button>
                    ); })}
                    {ids.length === 0 && <button className="dt-empty" onClick={() => setSide(k)}>{k === "give" ? "Pick from your roster" : `Pick from ${them.manager}`}</button>}
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn btn-primary dt-go" disabled={!trade} onClick={() => document.querySelector(".builder .deal")?.scrollIntoView({ behavior: "smooth", block: "start" })}>See the read</button>
        </div>
      )}

      <section className="card log-card" aria-label={`What ${them.manager} said`}>
        <div className="log-head">
          <h2 className="section-title">What did {them.manager} say?</h2>
          <p>Private to you. Trade ideas use it.</p>
        </div>
        <TagCapture onSave={onAddTag} placeholder={`${them.manager} said he wants a TE`} compact />
        <div className="tag-builder">
          <span className="tb-or">Or build it</span>
          <div className="tb-sentence">
            <b>{them.manager}</b>
            <label className="wv-sort tb-pick">
              <span className="sr-only">What kind</span>
              <select id="tag-kind" value={kind} onChange={(e) => { const k = e.target.value as ManagerTagKind; setKind(k); setTarget(k === "wants" ? "pos:RB" : k === "notInterested" ? YOU.roster[0] : them.roster[0]); }}>
                <option value="wants">wants</option>
                <option value="refuses">won't move</option>
                <option value="notInterested">isn't interested in</option>
              </select>
              <Icon name="chev" size={14} />
            </label>
            <label className="wv-sort tb-pick">
              <span className="sr-only">Player or position</span>
              <select id="tag-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                {POS_ORDER.map((p) => <option key={p} value={`pos:${p}`}>{kind === "wants" ? `${p} help` : kind === "refuses" ? `his ${p}` : `your ${p}`}</option>)}
                {targetOptions.map((id) => <option key={id} value={id}>{playerById(id).name}</option>)}
              </select>
              <Icon name="chev" size={14} />
            </label>
            <button className="btn btn-sm tb-add" onClick={addTag}>Add</button>
          </div>
        </div>
        {theirTags.length > 0 && (
          <div className="log-saved">
            <span className="tb-or">Saved</span>
            <ul>{theirTags.map((t) => <li key={t.id} className={`saved-tag ${t.kind}`}><i /><span>{t.text}</span><button className="saved-x" onClick={() => onRemoveTag(t.id)} aria-label={`Remove: ${t.text}`}><Icon name="x" size={14} /></button></li>)}</ul>
          </div>
        )}
      </section>
    </>
  );
}
