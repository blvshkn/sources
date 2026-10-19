import { ReactNode, useEffect, useRef, useState } from "react";
import { IdeaScan } from "./IdeaScan";
import { LeagueSwitch } from "./LeagueSwitch";
import { PlayerSearch } from "./PlayerSearch";
import { ManagerTag, ManagerTagKind, MyTag, Player, Pos, TEAMS, Team, playerById, YOU, POS_ORDER, gameLine } from "../data";
import { DealLeg, MultiTrade, FAIR_GAP, Lineup, Trade as TradeT, eff, pct, groupPoints, groupsFor, lineupChanges, lineupFor, offerRead, rosterAfter, tendencies, verdict, fmt , acceptance, Acceptance, packageValue } from "../engine";
import { AiLabel, Delta, Icon, Stamp, StatusPill, useSticky, PageTabs } from "./ui";
import { Avatar } from "./Avatar";
import { TradeIdea } from "./Wire";
import { DealSchedule, scheduleLean } from "./Schedule";
import { Fold } from "./Fold";
import { AddTeam, LegState, MultiDeal, MultiRosters } from "./TradeMulti";
import { TagCapture } from "./TagCapture";
import { TeamAvatar, TeamPicker } from "./TeamPicker";
import { PlatformName } from "./PlatformLogo";
import { Select } from "./Select";
import { Tooltip } from "./Tooltip";
import { Trophy } from "./Trophy";

export function RosterPicker({ team, lineup, picked, onToggle, dimIds, lockIds, wantIds, label, tone, noteIds }: {
  team: Team; lineup: Lineup; picked: string[]; onToggle: (id: string) => void;
  dimIds: Record<string, string>; lockIds: Record<string, string>; wantIds: Record<string, string>; label: string; tone: "give" | "get";
  noteIds?: Record<string, string>;
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
    const note = noteIds?.[id];
    return (
      <button key={id + slot} className={`pick tone-${tone}${dim ? " dim" : ""}${want ? " wanted" : ""}`} aria-pressed={on} onClick={() => onToggle(id)}>
        <Avatar p={p} size={34} />
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="pname" style={{ display: "block" }}>{p.name}</span>
          <span className="pmeta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b> {p.nfl}{gameLine(p) ? ` · ${gameLine(p)}` : ""} <StatusPill p={p} />
            {lock && <span className="lock row" style={{ gap: 3 }}><Icon name="lock" size={11} />{lock}</span>}
            {want && <span className="want-tag">{want}</span>}
            {dim && <span className="lock">{dim}</span>}
            {note && <span className="to-tag">{note}</span>}
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
        <div className="rp-id"><TeamAvatar t={team} size={32} /><div className="rp-t"><span>{label}</span><b>{team.name}<Trophy teamId={team.id} /></b></div></div>
        <span className="rp-total"><b>{(current ? current.starters.reduce((n, id) => n + eff(playerById(id)), 0) : lineup.total).toFixed(1)}</b><Tooltip focusable content="Points a week from the starting lineup only. Bench players don't count."><small className="tt-term">starters pts/wk</small></Tooltip></span>
      </div>
      <div className="slot-label">Starters{current ? <small> as set in <PlatformName size={12} /></small> : null}</div>
      {current
        ? current.starters.map((id) => row(id, "ST"))
        : lineup.slots.filter((s) => s.player).map((s) => row(s.player!.id, s.slot))}
      <div className="slot-label">Bench</div>
      {current ? current.bench.map((id) => row(id, "BN")) : lineup.bench.map((p) => row(p.id, "BN"))}
    </section>
  );
}

/** Apple Sports "team stats" layout: big net change per side, then each slot group with a two-color bar. */

/** Each slot group after the deal, you on the left and them on the right, with a two-color bar. */
export function PositionBars({ trade, them }: { trade: TradeT; them: Team }) {
  const youAfter = groupPoints(lineupFor(rosterAfter(YOU, trade, "you")));
  const themAfter = groupPoints(lineupFor(rosterAfter(them, trade, "them")));
  return (
    <div className="tc-rows">
      {groupsFor().map((g) => {
        const a = youAfter[g], b = themAfter[g];
        return (
          <div key={g} className="tc-row">
            <span className="v">{a.toFixed(1)}</span>
            <span className="lbl">{groupName(g)}</span>
            <span className="v r">{b.toFixed(1)}</span>
            <span className="tc-bar" aria-hidden="true"><span style={{ flex: Math.max(a, 0.1) }} /><span style={{ flex: Math.max(b, 0.1) }} /></span>
          </div>
        );
      })}
    </div>
  );
}
const groupName = (g: string) => (g === "SF" ? "Superflex" : g === "FLEX" ? "Flex" : g);

/** One line for a folded position breakdown: where your lineup moves most, up and down. */
export function positionSummary(roster: string[], after: string[]): string {
  const b = groupPoints(lineupFor(roster)), a = groupPoints(lineupFor(after));
  const d = groupsFor().map((g) => ({ g, n: Math.round((a[g] - b[g]) * 10) / 10 })).filter((x) => Math.abs(x.n) >= 0.1);
  if (!d.length) return "Your lineup holds at every spot";
  const up = d.filter((x) => x.n > 0).sort((x, y) => y.n - x.n)[0], down = d.filter((x) => x.n < 0).sort((x, y) => x.n - y.n)[0];
  return ["Your", [up && `${groupName(up.g)} ${fmt(up.n)}`, down && `${groupName(down.g)} ${fmt(down.n)}`].filter(Boolean).join(", ")].join(" ");
}

export function TradeCompare({ trade, them, bars = true }: { trade: TradeT; them: Team; bars?: boolean }) {
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
      {bars && <PositionBars trade={trade} them={them} />}
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
        <span className={`tc-fair ${fair || g > 0 ? "good" : "bad"}`}>{label}</span>
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

/** One side of the deal, editable in place: players as pills with an x, and a matching + Add pill at the end of
 *  the row that drops a searchable list of that roster over the panel below. */
/** Slots a side shows before it needs + Add: empty ones are ghost pills, so real pills land in place and nothing moves. */
const SLOTS = 3;
export function DealSide({ title, team, ids, pool, onToggle, className, flags = {} }: { title: ReactNode; team: string; ids: string[]; pool: string[]; onToggle: (id: string) => void; className?: string;
  /** Players with a problem: a red ring on the pill and the reason in a tooltip. */
  flags?: Record<string, { text: string; icon: "lock" | "alert" }> }) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const term = q.trim().toLowerCase();
  const [sort, setSort] = useState<"value" | "proj">("value");
  const val = (p: Player) => packageValue([p.id]);
  const options = pool.filter((id) => !ids.includes(id)).map(playerById)
    .filter((p) => !term || p.name.toLowerCase().includes(term) || p.pos.toLowerCase() === term || p.nfl.toLowerCase() === term)
    .sort((a, b) => (sort === "value" ? val(b) - val(a) || eff(b, true) - eff(a, true) : eff(b, true) - eff(a, true) || val(b) - val(a)));
  const ghosts = Math.max(0, SLOTS - ids.length);
  // Focus goes back to whatever opens the picker now: the next ghost, or + Add once the slots are full
  const close = (refocus = false) => { setAdding(false); setQ(""); if (refocus) requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>(".qs-ghost, .qs-add")?.focus()); };
  useEffect(() => {
    if (!adding) return;
    // The picker drops over the page; bring all of it on screen (clear of the phone tab bar, lint-overlays.css)
    requestAnimationFrame(() => wrap.current?.querySelector(".qs-pick")?.scrollIntoView({ block: "nearest" }));
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close(); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [adding]);
  return (
    <div className={`qs${className ? ` ${className}` : ""}`}>
      <span className="eyebrow">{title}</span>
      <div className="qs-row" ref={wrap}>
        <ul className="qs-pills" ref={list}>
          {ids.map((id) => { const p = playerById(id); const f = flags[id]; return (
            <li key={id} className={`qs-pill${f ? " flagged" : ""}`}><Avatar p={p} size={22} badge={false} /><Tooltip content={p.name}><span className="qs-n">{p.name.includes(" ") ? <><span className="qs-f">{p.name.slice(0, p.name.indexOf(" ") + 1)}</span>{p.name.slice(p.name.indexOf(" ") + 1)}</> : p.name}</span></Tooltip><b className={`lu-pos p-${p.pos}`}>{p.pos}</b>
              {f && <Tooltip focusable content={f.text}><span className="qs-flag" aria-label={f.text}><Icon name={f.icon} size={12} /></span></Tooltip>}
              <button className="qs-x" onClick={() => onToggle(id)} aria-label={`Remove ${p.name}`}><Icon name="x" size={12} /></button></li>
          ); })}
          {Array.from({ length: ghosts }, (_, i) => (
            <li key={`g${i}`} className="qs-ghostli">
              <button className="qs-ghost" aria-expanded={adding && i === 0} aria-haspopup="listbox" aria-label={`Add a player from ${team}`} onClick={() => (adding ? close() : setAdding(true))}>
                <span className="qs-gav" aria-hidden="true"><Icon name="plus" size={12} /></span><span className="qs-gl">Add player</span>
              </button>
            </li>
          ))}
          {ghosts === 0 && (
            <li className="qs-addli">
              <button className="qs-add" aria-expanded={adding} aria-haspopup="listbox" aria-label={`Add a player from ${team}`} onClick={() => (adding ? close() : setAdding(true))}>
                <Icon name="plus" size={14} />Add
              </button>
            </li>
          )}
        </ul>
        {adding && (
          <div className="qs-pick">
            <label className="qs-search"><Icon name="search" size={16} /><span className="sr-only">Search {team}</span>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${team}…`} autoComplete="off" spellCheck={false}
                onKeyDown={(e) => { if (e.key === "Escape") close(true); if (e.key === "Enter" && options[0]) { onToggle(options[0].id); setQ(""); } }} /></label>
            <button className="qs-done" onClick={() => close(true)}>Done</button>
            <div className="qs-head">
              <span className="qs-sort" role="radiogroup" aria-label="Sort players by">
                {(["value", "proj"] as const).map((k) => (
                  <button key={k} role="radio" aria-checked={sort === k} onClick={() => setSort(k)}>{k === "value" ? "Value" : "Proj"}</button>
                ))}
              </span>
              <Tooltip focusable content="This week's projected points."><span className={`qs-col${sort === "proj" ? " on" : ""}`}>Proj</span></Tooltip>
              <Tooltip focusable content="Market value. The same number the deal's trade value adds up."><span className={`qs-col${sort === "value" ? " on" : ""}`}>Value</span></Tooltip>
              <span aria-hidden="true" />
            </div>
            <ul className="qs-opts qs-scroll">
              {options.map((p) => (
                <li key={p.id}><button onClick={() => { onToggle(p.id); setQ(""); }} aria-label={`Add ${p.name}, ${p.pos}, ${p.nfl}. Projects ${eff(p, true).toFixed(1)}, value ${val(p).toLocaleString()}`}>
                  <Avatar p={p} size={22} badge={false} />
                  <b className={`lu-pos p-${p.pos}`}>{p.pos}</b>
                  <span className="qs-on"><span className="qs-nm">{p.name}</span><span className="qs-tm">{p.nfl}</span><StatusPill p={p} /></span>
                  <span className="qs-num">{eff(p, true).toFixed(1)}</span>
                  <span className="qs-num">{val(p).toLocaleString()}</span>
                  <Icon name="plus" size={14} />
                </button></li>
              ))}
              {options.length === 0 && <li className="qs-none">No one matches. Try a position like WR.</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- The read: one verdict, three rows, then the actions ----------

export type PillFlags = Record<string, { text: string; icon: "lock" | "alert" }>;
/** Red rings for the pills: your untouchables and priced players, and anything the other manager said no to. */
export function pillFlags(them: Team, tags: ManagerTag[], myTags: Record<string, MyTag>, warnings: string[] | null) {
  const { dimThem, dimYou } = tagMaps(them, tags);
  const you: PillFlags = {}, theirs: PillFlags = {};
  Object.entries(myTags).forEach(([id, v]) => {
    if (v === "untouchable") you[id] = { text: "Marked untouchable", icon: "lock" };
    if (v === "amazing") {
      const w = warnings?.find((x) => x.startsWith(playerById(id).name + " only moves"));
      // Once a deal is on the table the price is checked; if it clears, the ring goes away
      if (!warnings || w) you[id] = { text: w ? w.replace(/\.$/, "") : "Only moves if you overpay", icon: "lock" };
    }
  });
  Object.keys(dimYou).forEach((id) => { you[id] ??= { text: `${them.manager} isn't interested in him`, icon: "alert" }; });
  Object.keys(dimThem).forEach((id) => { theirs[id] = { text: `${them.manager} said he won't move him`, icon: "alert" }; });
  return { you, theirs };
}

/** One short line under the pills when more than one player is flagged. */
export function FlagLine({ ids, flags }: { ids: string[]; flags: PillFlags }) {
  const hit = ids.filter((id) => flags[id]);
  if (hit.length < 2) return null;
  return <p className="dv-flags"><Icon name="alert" size={14} /><span>{hit.length} flagged: {hit.map((id) => playerById(id).name).join(", ")}</span></p>;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The why, in one plain sentence: your points, then your value, then what to do. */
function pointsClause(d: number) {
  return d <= -0.05 ? `You lose ${Math.abs(d).toFixed(1)} points a week` : d >= 0.05 ? `You gain ${d.toFixed(1)} points a week` : "Your lineup barely moves";
}
function valueClause(give: number, get: number) {
  const gap = Math.max(give, get) > 0 ? (get - give) / Math.max(give, get) : 0;
  if (Math.abs(gap) <= FAIR_GAP) return "the value is about even";
  const r = Math.max(give, get) / Math.max(1, Math.min(give, get));
  const size = r >= 2.6 ? `about ${Math.round(r)} times the value` : r >= 1.75 ? "about twice the value" : `${pct(gap).slice(1)} more value`;
  return give > get ? `give up ${size}` : `get ${size} back`;
}
const NEXT: Record<string, (them: string) => string> = {
  "Win-win": () => "Both sides have a reason to say yes.",
  "Helps both, tilted your way": (t) => `${t} may want a little more first.`,
  "Helps both, you overpay": () => "Only worth it if you need the fit.",
  "Tough sell": (t) => `${t} gets nothing out of it, so add something.`,
  "You're overpaying": () => "Ask for more or walk.",
  "Lateral": () => "Not worth the hassle.",
  "Take it": () => "Accept it.",
  "Win-now move": () => "Worth it if you're chasing a title this year.",
  "Close": () => "Ask for a small sweetener.",
  "Lowball": () => "Counter or decline.",
};
export function dealWhy(label: string, youDelta: number, give: number, get: number, them: string) {
  return `${pointsClause(youDelta)} and ${valueClause(give, get)}. ${NEXT[label]?.(them) ?? ""}`.trim();
}
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
export function multiWhy(m: MultiTrade, label: string) {
  const holdouts = m.legs.filter((l) => l.accept.label === "Long shot").map((l) => l.team.manager);
  const n = m.legs.length + 1;
  const end = label === "Nobody wins" ? "Start from what each team needs."
    : label === "You're overpaying" ? "Ask for more or walk."
    : label === "Barely moves you" ? `A ${n}-team trade is a lot of work for that.`
    : label.startsWith("All") ? (holdouts.length ? "" : "Everyone gets better, so it has a real shot.") : "";
  const hold = holdouts.length ? `${list(holdouts)} won't say yes as it stands.` : "";
  return [`${pointsClause(m.youDelta)} and ${valueClause(m.marketGive, m.marketGet)}.`, hold, end].filter(Boolean).join(" ");
}

/** Verdict colors only mean good or bad for you. Anything in between reads in plain chalk. */
const vTone = (t: "good" | "warn" | "bad") => (t === "warn" ? "neutral" : t);
export function DealVerdict({ label, tone, line }: { label: string; tone: "good" | "warn" | "bad"; line: string }) {
  return <div className={`dv-verdict ${vTone(tone)}`}><b>{label}</b><p>{line}</p></div>;
}

/** Their odds in neutral ink: it's their call, not good or bad for you. The why sits in a tooltip. */
export function AcceptCell({ a }: { a: Acceptance }) {
  const word = a.label === "Likely yes" ? "Likely" : a.label;
  const why = a.theirBlockers.length ? a.theirBlockers : a.reasons;
  const range = a.label === "Likely yes" ? "Likely is 65% and up" : a.label === "Worth a shot" ? "Worth a shot is 50 to 64%" : "Long shot is under 50%";
  return (
    <span className="dv-v">
      <Tooltip focusable content={<>{why.length ? `${why.map(cap).join(". ")}. ` : ""}{range}, from their needs, notes and trade history.</>}>
        <b className="dv-acc tt-term">{word}, <span className="dv-pct">{Math.round(a.p * 100)}%</span></b>
      </Tooltip>
    </span>
  );
}

export interface DvCol { id: string; head: ReactNode; you?: boolean }
export interface DvRow { label: string; tip?: string; cells: ReactNode[]; extra?: ReactNode }
/** Comparison rows: label on the left, a right-aligned column per team, every row on the same grid. */
export function DealRows({ cols, rows }: { cols: DvCol[]; rows: DvRow[] }) {
  return (
    <div className="dv-rows" style={{ ["--dv-n" as string]: cols.length }} role="table" aria-label="How the deal compares">
      <div className="dv-row dv-headrow" role="row">
        <span className="dv-l" role="columnheader"><span className="sr-only">Measure</span></span>
        {cols.map((c) => <span key={c.id} className={`dv-h${c.you ? " you" : ""}`} role="columnheader">{c.head}</span>)}
      </div>
      {rows.map((r) => (
        <div key={r.label} className="dv-row" role="row">
          <span className="dv-l" role="rowheader">{r.tip ? <Tooltip focusable content={r.tip}><span className="tt-term">{r.label}</span></Tooltip> : r.label}</span>
          {r.cells.map((c, i) => <span key={i} className="dv-c" role="cell">{c}</span>)}
          {r.extra}
        </div>
      ))}
    </div>
  );
}
const tone = (n: number) => (n >= 0.05 ? "up" : n <= -0.05 ? "down" : "flat");
/** A points cell: the change, big, then before → after in small mono. Only your column gets green or red. */
export function PtsCell({ d, before, after, you }: { d: number; before: number; after: number; you?: boolean }) {
  return <span className="dv-v"><b className={`dv-n${you ? ` ${tone(d)}` : ""}`}>{fmt(d)}</b><small className="dv-s">{before.toFixed(1)} → {after.toFixed(1)}</small></span>;
}

/** What your notes on a manager mean for both rosters: their players who won't move, yours they passed on or want. */
export function tagMaps(them: Team, tags: ManagerTag[]) {
  const theirTags = tags.filter((t) => t.teamId === them.id);
  const hit = (t: ManagerTag, id: string) => (t.playerId ? id === t.playerId : playerById(id).pos === t.pos);
  const dimThem: Record<string, string> = {}, dimYou: Record<string, string> = {}, wantYou: Record<string, string> = {};
  theirTags.forEach((t) => { if (t.kind === "refuses") them.roster.forEach((id) => { if (hit(t, id)) dimThem[id] = "Won't move"; }); });
  theirTags.forEach((t) => { if (t.kind === "notInterested") YOU.roster.forEach((id) => { if (hit(t, id)) dimYou[id] = `${them.manager} passed`; }); });
  theirTags.forEach((t) => { if (t.kind === "wants") YOU.roster.forEach((id) => { if (!dimYou[id] && hit(t, id)) wantYou[id] = `${them.manager} wants`; }); });
  return { dimThem, dimYou, wantYou };
}
/** Your untouchables and overpay-only players, marked on your roster. */
export function lockMap(myTags: Record<string, MyTag>) {
  const lockYou: Record<string, string> = {};
  Object.entries(myTags).forEach(([id, v]) => {
    if (v === "untouchable") lockYou[id] = "Untouchable";
    if (v === "amazing") lockYou[id] = "Overpay only";
  });
  return lockYou;
}

export function TradeBuilder({ partnerId, setPartner, give, get, toggle, clear, trade, suggestions, tags, myTags, tip, coach, onPitch, onLoad, onAddTag, onRemoveTag, extra = [], multi = null, addPartner, removePartner, onProfile, profileOpen = false }: {
  partnerId: string; setPartner: (id: string) => void;
  give: string[]; get: string[]; toggle: (side: "give" | "get", id: string, teamId?: string) => void; clear: () => void;
  /** Partners beyond the first in a 3 or 4 team deal, and the read of the whole deal once every team has a player. */
  extra?: DealLeg[]; multi?: MultiTrade | null; addPartner?: (id: string) => void; removePartner?: (id: string) => void;
  /** Opens the side panel on the partner profile: docked from 1600px, a slide-over over the page below that. */
  onProfile?: () => void; profileOpen?: boolean;
  trade: TradeT | null; suggestions: TradeT[]; tags: ManagerTag[]; myTags: Record<string, MyTag>;
  tip: string | null;
  coach: (t: TradeT) => { trade: TradeT; line: string } | null;
  onPitch: (t: TradeT) => void; onLoad: (t: TradeT) => void;
  onAddTag: (t: Omit<ManagerTag, "id">) => void;
  onRemoveTag: (id: string) => void;
}) {
  const them = TEAMS.find((t) => t.id === partnerId)!;
  const isMulti = extra.length > 0;
  const legs: LegState[] = [{ team: them, give, get }, ...extra.map((l) => ({ team: TEAMS.find((t) => t.id === l.teamId)!, give: l.give, get: l.get }))];
  const allGive = legs.flatMap((l) => l.give), allGet = legs.flatMap((l) => l.get);
  const [side, setSide] = useState<"give" | "get">("give");
  const theirTags = tags.filter((t) => t.teamId === them.id);
  const { dimThem, dimYou, wantYou } = tagMaps(them, tags);
  const lockYou = lockMap(myTags);
  const [received, setReceived] = useState(false);
  // An offer comes from one manager: switching partners starts a fresh read, so the header can't name the last one
  useEffect(() => { setReceived(false); }, [partnerId]);
  const flags = pillFlags(them, tags, myTags, trade ? trade.warnings : null);
  const v = trade ? (received ? offerRead(trade) : verdict(trade)) : null;
  const acc = trade && !received ? acceptance(trade, YOU, them) : null;
  const counter = trade && received && trade.youDelta < 0.5 ? coach(trade) : null;
  const td = tendencies(them.id);
  const [why, setWhy] = useState(false);
  const [view, setView] = useSticky<"build" | "ideas" | "notes">("trade.view", "build", ["build", "ideas", "notes"]);
  // Re-run the finder visibly whenever what it reads has changed: a new or removed note, or a new partner
  const sig = `${partnerId}|${theirTags.map((t) => t.id).join(",")}`;
  const seen = useRef<Record<string, { sig: string; keys: string[] }>>({});
  const last = seen.current[partnerId];
  const stale = !last || last.sig !== sig;
  const [scanned, setScanned] = useState<string | null>(null);
  const scanning = view === "ideas" && stale && scanned !== sig;
  const [fresh, setFresh] = useState<string[]>([]);
  const [rescanned, setRescanned] = useState(false);
  const finishScan = () => {
    const before = last?.keys ?? null;
    setFresh(before ? suggestions.map((t) => t.key).filter((k) => !before.includes(k)) : []);
    setRescanned(!!before);
    seen.current[partnerId] = { sig, keys: suggestions.map((t) => t.key) };
    setScanned(sig);
  };
  const scanSteps = [
    theirTags.length ? `Reading ${theirTags.length} note${theirTags.length > 1 ? "s" : ""} on ${them.manager}` : `No notes on ${them.manager} yet, using league needs`,
    "Checking what both lineups need",
    "Testing deals across both rosters",
    "Keeping trades where both sides gain points",
  ];
  const loadIdea = (t: TradeT) => { onLoad(t); setView("build"); };
  const [searching, setSearching] = useState(false);
  // How this manager trades: short facts plus one piece of advice
  const scoutParts = td.summary.split(/(?<=\.)\s+/).map((x) => x.trim().replace(/\.$/, "")).filter(Boolean)
    .map((x) => x.startsWith(them.manager + " ") ? x.slice(them.manager.length + 1) : x)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  const scoutTip = scoutParts.length > 1 ? scoutParts[scoutParts.length - 1] : null;
  const scoutFacts = scoutTip ? scoutParts.slice(0, -1) : scoutParts;

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
  // The deal card's own tools, right-aligned on its first line: search, Add a team, then Clear.
  // Clear stays put and greys out when the deal is empty, so nothing beside it moves when the first player lands.
  const anyPicked = allGive.length > 0 || allGet.length > 0;
  const dealTools = (
    <div className="ttb-row">
      <button type="button" className="btn btn-icon ttb-search" onClick={() => setSearching(true)} aria-label="Search any player in your league"><Icon name="search" size={18} /></button>
      {addPartner && <AddTeam count={legs.length + 1} onAdd={addPartner} teams={TEAMS.filter((t) => !t.you && !legs.some((l) => l.team.id === t.id))} />}
      <button type="button" className="btn btn-ghost ttb-clear" onClick={clear} disabled={!anyPicked}>Clear</button>
    </div>
  );

  return (
    <>
      <header className="page-head">
        <div>
          <LeagueSwitch title="Build a deal" />
        </div>
      </header>

      {searching ? (
        <PlayerSearch picked={[...allGive, ...allGet]} onClose={() => setSearching(false)} onPick={(id, team) => {
          setView("build");
          if (team.you) { toggle("give", id); return; }
          if (extra.some((l) => l.teamId === team.id)) { toggle("get", id, team.id); return; }
          if (team.id !== partnerId) setPartner(team.id);
          toggle("get", id);
        }} />
      ) : (
        <div className="tr-bar">
          <TeamPicker compact teams={TEAMS.filter((t) => !t.you && !extra.some((l) => l.teamId === t.id))} value={partnerId} onChange={setPartner} />
          {onProfile && <button className="btn tr-profile" onClick={onProfile} aria-expanded={profileOpen} aria-controls="inbox" title="Needs, notes and how they trade"><Icon name="group" size={18} /><span>{isMulti ? "Partner profiles" : `${them.manager}'s profile`}</span></button>}
          {/* An offer comes from one manager, so the switch is a two-team thing: the multi-team read never used it */}
          {view === "build" && !isMulti && (
            <Tooltip content={`Turn on when ${them.manager} sent you this deal. The read judges their offer instead of yours.`}>
              <button type="button" role="switch" aria-checked={received} className={`btn ttb-offer${received ? " on" : ""}`} onClick={() => setReceived((x) => !x)} aria-label={`${them.manager} sent me this offer`}>
                <span className="ttb-sw" aria-hidden="true"><span /></span>
                <span className="ttb-long" aria-hidden="true">{them.manager} sent me this offer</span>
                <span className="ttb-short" aria-hidden="true">Their offer</span>
              </button>
            </Tooltip>
          )}
        </div>
      )}

      <PageTabs value={view} onChange={setView} options={[{ v: "build", label: "Build", icon: "trade" }, { v: "ideas", label: suggestions.length ? `Ideas (${suggestions.length})` : "Ideas", icon: "spark" }, { v: "notes", label: theirTags.length ? `Notes (${theirTags.length})` : "Notes", icon: "msg" }]} />

      {view === "ideas" && (
        <div className="tr-scout" aria-label={`How ${them.manager} trades`}>
          <span className="eyebrow">How {them.manager} trades</span>
          <p>{scoutFacts.join(" · ")}</p>
          {scoutTip && <p className="tr-tip"><Icon name="spark" size={14} /><span>{scoutTip}.</span></p>}
        </div>
      )}
      {scanning && <IdeaScan key={sig} steps={scanSteps} onDone={finishScan} />}
      {view === "ideas" && !scanning && suggestions.length === 0 && <p className="empty-deal">No win-win trades with {them.manager} right now. Try another team above, or build one yourself.</p>}
      {view === "ideas" && !scanning && suggestions.length > 0 && (
        <section className="card nudge">
          <div className="row wrap"><span className="stamp">Per sources</span><span className="small muted">Win-win trades built around what {them.manager} wants</span></div>
          {fresh.length > 0
            ? <p className="scan-new"><Icon name="spark" size={14} />{fresh.length} new {fresh.length > 1 ? "ideas" : "idea"} from your notes</p>
            : rescanned && <p className="scan-new muted"><Icon name="check" size={14} />Checked your latest notes. {suggestions.length > 1 ? `These ${suggestions.length} still fit.` : "This one still fits."}</p>}
          {suggestions.map((t) => <div key={t.key} className={fresh.includes(t.key) ? "idea-new" : undefined}><TradeIdea t={t} onOpen={loadIdea} onPitch={onPitch} /></div>)}
        </section>
      )}


      {view === "build" && isMulti && <div className="builder mt-builder">
        <MultiDeal tools={dealTools} legs={legs} m={multi} toggle={toggle} onRemove={(id) => removePartner?.(id)} clear={clear} onPitch={onPitch} tags={tags} myTags={myTags} />
        <MultiRosters key={legs.map((l) => l.team.id).join(",")} legs={legs} toggle={toggle} tags={tags} myTags={myTags} />
      </div>}

      {view === "build" && !isMulti && <div className="builder">
        <section className={`card deal ttb-card${give.length === 0 && get.length === 0 ? " empty" : ""}`} aria-label={received ? `Offer from ${them.manager}` : "The deal"} aria-live="polite">
          {/* The tools share the first grid line with the side labels. With the offer switch on, the same two sides read from the sender's seat */}
          <div className="deal-lists qs-wrap">
            {dealTools}
            <DealSide title={received ? `${them.manager} asks for` : "You send"} team="your roster" ids={give} pool={YOU.roster} onToggle={(id) => toggle("give", id)} flags={flags.you} />
            <DealSide title={received ? `${them.manager} offers` : "You get"} team={`${them.manager}'s roster`} ids={get} pool={them.roster} onToggle={(id) => toggle("get", id)} flags={flags.theirs} />
          </div>
          <FlagLine ids={[...give, ...get]} flags={{ ...flags.you, ...flags.theirs }} />
          {!trade ? (
            <p className="empty-deal">{give.length === 0 && get.length === 0 ? "Add players to both sides, or tap them on the rosters below." : give.length === 0 ? "Now pick who you'd send from your roster." : `Now pick who you'd get from ${them.manager}.`}</p>
          ) : (
            <div className="dv">
              <div className="dv-main">
              {v && <DealVerdict label={v.label} tone={v.tone} line={dealWhy(v.label, trade.youDelta, trade.marketGive, trade.marketGet, them.manager)} />}
              <DealRows
                cols={[{ id: "you", head: "You", you: true }, { id: them.id, head: them.manager }]}
                rows={[
                  { label: "Points per week", tip: "Starting lineups only. Bench players don't count.", cells: [
                    <PtsCell key="y" you d={trade.youDelta} before={trade.youBefore} after={trade.youAfter} />,
                    <PtsCell key="t" d={trade.themDelta} before={trade.themBefore} after={trade.themAfter} />] },
                  { label: "Trade value", tip: "Market value, the plain sum of each player's value, the same way a trade calculator adds it up. The verdict also adjusts for extra pieces, so three bench players can't add up to one star.", cells: [
                    <span key="y" className="dv-v"><b className="dv-n">{trade.marketGive.toLocaleString()}</b><small className="dv-s">you give</small></span>,
                    <span key="t" className="dv-v"><b className="dv-n">{trade.marketGet.toLocaleString()}</b><small className="dv-s">you get</small></span>],
                    extra: <span className="dv-bar" aria-hidden="true"><i style={{ flex: Math.max(1, trade.marketGive) }} /><i style={{ flex: Math.max(1, trade.marketGet) }} /></span> },
                  ...(acc ? [{ label: "Will they accept", cells: [<span key="y" className="dv-v dv-none" />, <AcceptCell key="t" a={acc} />] }] : []),
                ]} />
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
              {/* Warnings about a player live on his pill; anything else still reads here */}
              {trade.warnings.filter((w) => ![...give, ...get].some((id) => w.includes(playerById(id).name))).map((w) => <div key={w} className="warning"><Icon name="alert" size={16} /><span>{w}</span></div>)}
              <div className="dv-actions">
                <button className="btn btn-primary" onClick={() => onPitch(trade)}><Icon name="pen" size={16} />Write pitch</button>
                <button className="linkish small" onClick={() => setWhy((x) => !x)} aria-expanded={why}>{why ? "Hide the math" : "Show the math"}</button>
              </div>
              {why && (
                <div className="why">
                  <div><span className="eyebrow">Your starters</span><Changes team={YOU} trade={trade} side="you" /></div>
                  <div><span className="eyebrow">{them.manager}'s starters</span><Changes team={them} trade={trade} side="them" /></div>
                  <p className="tiny muted">Two lenses. Points per week counts starting lineups only. Trade value is the plain sum of player values: <span className="num">{trade.marketGive.toLocaleString()}</span> you give, <span className="num">{trade.marketGet.toLocaleString()}</span> you get. {give.length !== get.length || give.length > 1 ? <>The verdict counts the best player on each side in full and each extra piece for less (85%, 72%, 61%). Adjusted for {give.length}-for-{get.length}: <span className="num">{trade.adjGive.toLocaleString()}</span> you give, <span className="num">{trade.adjGet.toLocaleString()}</span> you get. </> : null}Net: you {fmt(trade.youDelta)}, {them.manager} {fmt(trade.themDelta)}.</p>
                </div>
              )}
              {tip && (
                <div className="tip">
                  <Stamp>Tip</Stamp>
                  <span className="small">{tip}</span>
                  <AiLabel />
                </div>
              )}
              </div>
              <Fold id="trade.details" title="Details" auto={false} className="fold-details"
                summary="Position breakdown and schedules ahead">
                <div className="dv-details">
                  <Fold id="trade.bars" title="Position breakdown" auto={false} className="fold-bars"
                    summary={positionSummary(YOU.roster, rosterAfter(YOU, trade, "you"))}>
                    <PositionBars trade={trade} them={them} />
                  </Fold>
                  <Fold id="trade.sched" title="Schedules ahead" auto={false} className="fold-sch"
                    summary={`You send ${scheduleLean(give.map(playerById))} · You get ${scheduleLean(get.map(playerById))}`}>
                    <DealSchedule bare give={give.map(playerById)} get={get.map(playerById)} />
                  </Fold>
                </div>
              </Fold>
            </div>
          )}
        </section>

        <div className="rosters" data-side={side}>
          <div className="side-switch" role="tablist" aria-label="Which roster">
            <button role="tab" aria-selected={side === "give"} onClick={() => setSide("give")}><span>Your roster</span><b className="give">{give.length}</b></button>
            <button role="tab" aria-selected={side === "get"} onClick={() => setSide("get")}><span>{them.manager}</span><b className="get">{get.length}</b></button>
          </div>
          <p className="side-hint">{side === "give" ? "Tap your players to send them." : `Tap ${them.manager}'s players to ask for them.`} Tap again to remove.</p>
          <div className="side-pane side-give" role="tabpanel">
            <RosterPicker team={YOU} lineup={lineupFor(YOU.roster)} picked={give} onToggle={(id) => toggle("give", id)} dimIds={dimYou} lockIds={lockYou} wantIds={wantYou} label="Your roster" tone="give" />
          </div>
          <div className="side-pane side-get" role="tabpanel">
            <RosterPicker team={them} lineup={lineupFor(them.roster)} picked={get} onToggle={(id) => toggle("get", id)} dimIds={dimThem} lockIds={{}} wantIds={{}} label={`${them.manager}'s roster`} tone="get" />
          </div>
        </div>
      </div>}

      {view === "build" && (allGive.length > 0 || allGet.length > 0) && (
        <>
        <div className="dt-spacer" aria-hidden="true" />
        <div className="deal-tray" role="region" aria-label="Your deal so far">
          <div className="dt-sides">
            {(["give", "get"] as const).map((k) => {
              const ids = k === "give" ? allGive : allGet;
              return (
                <div key={k} className={`dt-side ${k}`}>
                  <button className="dt-label" onClick={() => setSide(k)}>{k === "give" ? "Send" : "Get"}</button>
                  <div className="dt-chips">
                    {ids.map((id) => { const p = playerById(id); return (
                      <button key={id} className="dt-chip" onClick={() => toggle(k, id)} aria-label={`Remove ${p.name}`}>
                        <Avatar p={p} size={22} badge={false} /><span>{p.name.split(" ").slice(-1)[0]}</span><Icon name="x" size={12} />
                      </button>
                    ); })}
                    {ids.length === 0 && <button className="dt-empty" onClick={() => setSide(k)}>{k === "give" ? "Pick from your roster" : isMulti ? "Pick from their rosters" : `Pick from ${them.manager}`}</button>}
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn btn-primary dt-go" disabled={isMulti ? !multi : !trade} onClick={() => document.querySelector(".builder .deal")?.scrollIntoView({ behavior: "smooth", block: "start" })}>See the read</button>
        </div>
        </>
      )}

      {view === "notes" && <section className="card log-card" aria-label={`What ${them.manager} said`}>
        <div className="log-head">
          <h2 className="section-title">What did {them.manager} say?</h2>
          <p>Private to you. Trade ideas use it.</p>
        </div>
        <TagCapture onSave={onAddTag} placeholder="wants a TE" compact teamId={partnerId} onTeam={setPartner} />
        {last && stale && <button className="scan-cta" onClick={() => setView("ideas")}><Icon name="spark" size={14} /><span>Notes changed. Find new trade ideas with {them.manager}</span><Icon name="chev" size={14} /></button>}
        <div className="tag-builder">
          <span className="tb-or">Or build it</span>
          <div className="tb-sentence">
            <b>{them.manager}</b>
            <Select id="tag-kind" className="tb-sel" aria-label="What kind" value={kind}
              onChange={(k) => { setKind(k); setTarget(k === "wants" ? "pos:RB" : k === "notInterested" ? YOU.roster[0] : them.roster[0]); }}
              options={[
                { value: "wants" as ManagerTagKind, label: "wants" },
                { value: "refuses" as ManagerTagKind, label: "won't move" },
                { value: "notInterested" as ManagerTagKind, label: "isn't interested in" },
              ]} />
            <Select id="tag-target" className="tb-sel" aria-label="Player or position" value={target} onChange={setTarget}
              options={[
                ...POS_ORDER.map((p) => ({ value: `pos:${p}`, label: kind === "wants" ? `${p} help` : kind === "refuses" ? `his ${p}` : `your ${p}`, group: "Position" })),
                ...targetOptions.map((id) => { const pl = playerById(id); return { value: id, label: pl.name, hint: pl.pos, group: kind === "refuses" ? `${them.manager}'s players` : "Your players" }; }),
              ]} />
            <button className="btn btn-sm tb-add" onClick={addTag}>Add</button>
          </div>
        </div>
        {theirTags.length > 0 && (
          <div className="log-saved">
            <span className="tb-or">Saved</span>
            <ul>{theirTags.map((t) => <li key={t.id} className={`saved-tag ${t.kind}`}><i /><span>{t.text}</span><button className="saved-x" onClick={() => onRemoveTag(t.id)} aria-label={`Remove: ${t.text}`}><Icon name="x" size={14} /></button></li>)}</ul>
          </div>
        )}
      </section>}
    </>
  );
}
