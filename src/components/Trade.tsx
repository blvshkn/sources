import { ReactNode, useEffect, useRef, useState } from "react";
import { deny, denyOn } from "../deny";
import { IdeaScan } from "./IdeaScan";
import { WhyNone } from "./WhyNone";
import { LeagueSwitch } from "./LeagueSwitch";
import { PlayerSearch } from "./PlayerSearch";
import { ManagerTag, ManagerTagKind, MyTag, Player, Pos, TEAMS, Team, playerById, YOU, POS_ORDER } from "../data";
import { kickLine } from "../kickoff";
import { DealLeg, MultiTrade, FAIR_GAP, Lineup, Trade as TradeT, eff, pct, groupPoints, groupsFor, lineupChanges, lineupFor, offerRead, rosterAfter, tendencies, verdict, fmt , acceptance, Acceptance, packageValue, valueEdge, valueRatio } from "../engine";
import { AiLabel, Delta, Icon, Stamp, StatusPill, useSticky, PageTabs } from "./ui";
import { Avatar } from "./Avatar";
import { TradeIdea } from "./Wire";
import { SentOffers } from "./SentOffers";
import type { SentOffer } from "../sentOffers";
import { DealSchedule, scheduleLean } from "./Schedule";
import { DealDetails } from "./DealDetails";
import { DetailSheet } from "./DetailSheet";
import { AddTeam, LegState, MultiDeal, MultiRosters } from "./TradeMulti";
import { TagCapture } from "./TagCapture";
import { PartnerProfile } from "./PartnerProfile";
import { TeamAvatar, TeamPicker } from "./TeamPicker";
import { PlatformName } from "./PlatformLogo";
import { Select } from "./Select";
import { NumTip, Tooltip } from "./Tooltip";
import { Trophy } from "./Trophy";
import { useHFade } from "./hFade";
import { Marked } from "./Marked";
import { useKeyboardInset } from "./useKeyboardInset";
import { rankPlayers } from "../search";
import type { Price, ScanDiag } from "../engine";
import { useTrace } from "../think";
import { ideaSteps, readSteps, type Read } from "../reads";
import { Stream, ThinkingTrace } from "./ThinkingTrace";
import { AiMark } from "./WorkingLoader";

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
          <span className="pmeta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b> {p.nfl}{kickLine(p) ? ` ${kickLine(p)}` : ""} <StatusPill p={p} />
            {lock && <span className="lock row" style={{ gap: 3 }}><Icon name="lock" size={11} />{lock}</span>}
            {want && <span className="want-tag">{want}</span>}
            {dim && <span className="lock">{dim}</span>}
            {note && <span className="to-tag">{note}</span>}
          </span>
        </span>
        <NumTip label="Projected points a week" note="Rest of season"><span className="pproj">{eff(p).toFixed(1)}</span></NumTip>
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

/** One side of the deal, editable in place: players as rows with an x, and a + Add player row at the end.
 *  Tapped, that row turns into the search field in place, and the results drop under it over the panel below. */
export function DealSide({ title, team, ids, pool, onToggle, className, flags = {} }: { title: ReactNode; team: string; ids: string[]; pool: string[]; onToggle: (id: string) => void; className?: string;
  /** Players with a problem: a lock or alert badge on the avatar and the reason in a tooltip. */
  flags?: Record<string, { text: string; icon: "lock" | "alert" }> }) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [sort, setSort] = useState<"value" | "proj">("value");
  const val = (p: Player) => packageValue([p.id]);
  // Sorted by Value or Proj, then search.ts ranks the matches (initials, word starts, last name) above that order
  const ranked = rankPlayers(q, pool.filter((id) => !ids.includes(id)).map(playerById)
    .sort((a, b) => (sort === "value" ? val(b) - val(a) || eff(b, true) - eff(a, true) : eff(b, true) - eff(a, true) || val(b) - val(a))), (p) => ({ name: p.name, pos: p.pos, team: p.nfl }));
  const options = ranked.map((r) => r.item);
  // Phones: the list fits above the keyboard and the tray steps aside (useKeyboardInset.ts)
  const field = useRef<HTMLLabelElement>(null);
  const opts = useRef<HTMLUListElement>(null);
  const kbMax = useKeyboardInset(field, opts, adding);
  // Focus goes back to + Add player, the one thing that opens the picker
  const close = (refocus = false) => { setAdding(false); setQ(""); if (refocus) requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>(".qs-add")?.focus()); };
  useEffect(() => {
    if (!adding) return;
    // The + Add player row is now the search field, with the results panel under it. Phones: the field goes just
    // under the top bar, so the list gets everything down to the keyboard (useKeyboardInset sizes it). Desktop: the
    // panel comes fully on screen, but never by pushing the field itself out of view.
    requestAnimationFrame(() => {
      const box = field.current, pick = wrap.current?.querySelector(".qs-pick");
      if (!box || !pick) return;
      const bar = document.querySelector(".topbar");
      const top = (bar && /sticky|fixed/.test(getComputedStyle(bar).position) ? Math.max(0, bar.getBoundingClientRect().bottom) : 0) + 8;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const a = box.getBoundingClientRect(), k = pick.getBoundingClientRect();
      const phone = window.matchMedia("(hover: none), (pointer: coarse)").matches;
      const below = k.bottom + (parseFloat(getComputedStyle(pick).scrollMarginBottom) || 16) - vh;
      const dy = phone || a.top < top ? a.top - top : below > 0 ? Math.min(below, a.top - top) : 0;
      if (Math.abs(dy) > 1) window.scrollBy({ top: dy, behavior: "instant" as ScrollBehavior });
    });
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close(); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [adding]);
  // The tenth player fills the side, so the list closes
  useEffect(() => { if (adding && ids.length >= 10) close(); }, [ids.length]);
  return (
    <div className={`qs${className ? ` ${className}` : ""}`}>
      <span className="eyebrow">{title}</span>
      <div className="qs-row" ref={wrap}>
        <ul className="qs-list" ref={list}>
          {ids.map((id) => { const p = playerById(id); const f = flags[id]; return (
            <li key={id} className={`qs-item${f ? " flagged" : ""}`}>
              <span className="qs-av"><Avatar p={p} size={34} />
                {f && <Tooltip focusable content={f.text}><span className={`qs-flag qs-flag-${f.icon}`} aria-label={f.text}><Icon name={f.icon} size={10} /></span></Tooltip>}</span>
              <span className="qs-who"><span className="qs-pn">{p.name}</span><span className="qs-pm"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span aria-hidden="true">·</span>{p.nfl}<StatusPill p={p} /></span></span>
              <Tooltip content="This week's projected points."><span className="qs-pts">{eff(p, true).toFixed(1)}</span></Tooltip>
              <button className="qs-x" onClick={() => onToggle(id)} aria-label={`Remove ${p.name}`}><Icon name="x" size={16} /></button>
            </li>
          ); })}
          {/* Tapped, the row itself becomes the search field: same box, + turns into the search icon, Done on the right */}
          <li className={`qs-addli${adding ? " open" : ""}`}>
            {/* 10 a side is the cap (App.tsx), so the row says so instead of opening a list that can't add. It still
                takes the tap: aria-disabled, a shake and a toast saying why (deny.ts) */}
            <button className="qs-add" aria-disabled={ids.length >= 10 || undefined} tabIndex={adding ? -1 : undefined} aria-hidden={adding || undefined} aria-expanded={adding} aria-haspopup="listbox" aria-label={ids.length >= 10 ? "10 players a side is the most" : `Add a player from ${team}`}
              onClick={(e) => (ids.length >= 10 ? deny(e.currentTarget, "10 players a side is the most. Remove one to add another.") : setAdding(true))}>
              <span className="qs-plus" aria-hidden="true"><Icon name="plus" size={16} /></span><span>{ids.length >= 10 ? "10 players max" : "Add player"}</span>
            </button>
            {adding && (
              <div className="qs-field">
                <label className="qs-search" ref={field}><span className="qs-plus" aria-hidden="true"><Icon name="search" size={16} /></span><span className="sr-only">Search {team}</span>
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${team}…`} autoComplete="off" spellCheck={false}
                    onKeyDown={(e) => { if (e.key === "Escape") close(true); if (e.key === "Enter" && options[0]) { onToggle(options[0].id); setQ(""); } }} /></label>
                <button className="qs-done" onClick={() => close(true)}>Done</button>
              </div>
            )}
          </li>
        </ul>
        {adding && (
          <div className="qs-pick">
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
            <ul className="qs-opts qs-scroll" ref={opts} style={kbMax ? { maxHeight: kbMax } : undefined}>
              {ranked.map(({ item: p, match }) => (
                <li key={p.id}><button onClick={() => { onToggle(p.id); setQ(""); }} aria-label={`Add ${p.name}, ${p.pos}, ${p.nfl}. Projects ${eff(p, true).toFixed(1)}, value ${val(p).toLocaleString()}`}>
                  <Avatar p={p} size={22} badge={false} />
                  <b className={`lu-pos p-${p.pos}`}>{p.pos}</b>
                  <span className="qs-on"><span className="qs-nm"><Marked name={p.name} marks={match.marks} /></span><span className="qs-tm">{p.nfl}</span><StatusPill p={p} /></span>
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
/** Badges for the deal rows: your untouchables and priced players, and anything the other manager said no to. */
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

/** One short line under the deal rows when more than one player is flagged. */
export function FlagLine({ ids, flags }: { ids: string[]; flags: PillFlags }) {
  const hit = ids.filter((id) => flags[id]);
  if (hit.length < 2) return null;
  return <p className="dv-flags"><Icon name="alert" size={14} /><span>{hit.length} flagged: {hit.map((id) => playerById(id).name).join(", ")}</span></p>;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Bring the read's headline into view just under the sticky top bar. Waits a frame so a read that is still rendering has a box to scroll to. */
function seeRead() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(".builder .dv-verdict") ?? document.querySelector<HTMLElement>(".builder .deal");
    if (!el) return;
    const bar = document.querySelector<HTMLElement>(".topbar");
    const pinned = bar && /sticky|fixed/.test(getComputedStyle(bar).position) ? bar.getBoundingClientRect().height : 0;
    el.style.scrollMarginTop = `${Math.round(pinned) + 16}px`;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  }));
}
/** The why, in one plain sentence: your points, then your value, then what to do. */
function pointsClause(d: number) {
  return d <= -0.05 ? `You lose ${Math.abs(d).toFixed(1)} points a week` : d >= 0.05 ? `You gain ${d.toFixed(1)} points a week` : "Your lineup barely moves";
}
function valueClause(give: number, get: number) {
  const gap = Math.max(give, get) > 0 ? (get - give) / Math.max(give, get) : 0;
  if (Math.abs(gap) <= FAIR_GAP) return "the value is about even";
  return valueEdge(give > get ? "give" : "get", valueRatio(give, get));
}
/** "Your lineup barely moves" has its own subject, so the value half needs "you". */
function pointsAndValue(d: number, give: number, get: number) {
  const p = pointsClause(d), v = valueClause(give, get);
  return `${p} and ${p.startsWith("Your") && !v.startsWith("the ") ? "you " : ""}${v}.`;
}
const NEXT: Record<string, (them: string) => string> = {
  "Win-win": () => "Both sides have a reason to say yes.",
  "Helps both, tilted your way": (t) => `${t} may want a little more first.`,
  "Helps both, you overpay": () => "Only worth it if you need the fit.",
  "Tough sell": (t) => `${t} gets nothing out of it, so add something.`,
  "You're overpaying": () => "Ask for a little more before you send it.",
  "Hurts your lineup": () => "Start from a position you need instead.",
  "Value over points": () => "Only worth it if you can spare the points now.",
  "Value play": () => "Worth sending as it stands.",
  "Lateral": () => "Not worth sending as it stands.",
  "Take it": () => "Accept it.",
  "Win-now move": () => "Worth it if you're chasing a title this year.",
  "Close": () => "Ask for a small sweetener.",
  "Lowball": () => "Counter or decline.",
};
export function dealWhy(label: string, youDelta: number, give: number, get: number, them: string) {
  return `${pointsAndValue(youDelta, give, get)} ${NEXT[label]?.(them) ?? ""}`.trim();
}
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
export function multiWhy(m: MultiTrade, label: string) {
  const holdouts = m.legs.filter((l) => l.accept.label === "Long shot").map((l) => l.team.manager);
  const n = m.legs.length + 1;
  const end = label === "Nobody wins" ? "Start from what each team needs."
    : label === "You're overpaying" ? "Ask for a little more before you send it."
    : label === "Barely moves you" ? `A ${n}-team trade is a lot of work for that.`
    : label.startsWith("All") ? (holdouts.length ? "" : "Everyone gets better, so it has a real shot.") : "";
  const hold = holdouts.length ? `${list(holdouts)} won't say yes as it stands.` : "";
  return [pointsAndValue(m.youDelta, m.adjGive, m.adjGet), hold, end].filter(Boolean).join(" ");
}

/** Verdict colors only mean good or bad for you. Anything in between reads in plain chalk. */
const vTone = (t: "good" | "warn" | "bad") => (t === "warn" ? "neutral" : t);
export function DealVerdict({ label, tone, line }: { label: string; tone: "good" | "warn" | "bad"; line: string }) {
  return <div className={`dv-verdict ${vTone(tone)}`}><b>{label}</b><p><Stream text={line} /></p></div>;
}

/** The read on a two-team deal, worked out as real steps (reads.ts) every time the deal changes. The trace keeps
 *  to one line so the rows under it never move, and the last verdict stays until the new one is ready. */
function TradeRead({ them, give, get, tags, myTags, prices, received }: {
  them: Team; give: string[]; get: string[]; tags: ManagerTag[]; myTags: Record<string, MyTag>; prices: Record<string, Price>; received: boolean;
}) {
  const { trace, result, start } = useTrace<Read>();
  const key = `${them.id}|${give.join(",")}>${get.join(",")}|${received}|${tags.map((t) => t.id).join(",")}|${JSON.stringify(myTags)}|${JSON.stringify(prices)}`;
  useEffect(() => { start(() => readSteps(them, give, get, tags, myTags, prices, received)); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [shown, setShown] = useState<Read | null>(null);
  useEffect(() => { if (result) setShown(result); }, [result]);
  const r = result ?? shown;
  return (
    <div className="dv-read">
      <ThinkingTrace trace={trace} compact verb={{ doing: "Reading the deal", done: "Read the deal in" }} />
      {r ? <div className={trace.status === "done" ? undefined : "dv-stale"}><DealVerdict label={r.v.label} tone={r.v.tone} line={dealWhy(r.v.label, r.trade.youDelta, r.trade.adjGive, r.trade.adjGet, them.manager)} /></div>
        : <div className="dv-verdict dv-pending" aria-hidden="true"><b>&nbsp;</b><p>&nbsp;<br />&nbsp;</p></div>}
    </div>
  );
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

const NO_IDEAS: Record<string, TradeT[]> = {};
export function TradeBuilder({ partnerId, setPartner, give, get, toggle, clear, trade, suggestions, ideasByTeam = NO_IDEAS, tags, myTags, prices = {}, tip, coach, onPitch, onLoad, onAddTag, onRemoveTag, extra = [], multi = null, addPartner, removePartner, onProfile, sent = [], sentSynced = false, syncUser = "", onReopenSent, onDeclineSent, onClearSent }: {
  partnerId: string; setPartner: (id: string) => void;
  give: string[]; get: string[]; toggle: (side: "give" | "get", id: string, teamId?: string) => void; clear: () => void;
  /** Partners beyond the first in a 3 or 4 team deal, and the read of the whole deal once every team has a player. */
  extra?: DealLeg[]; multi?: MultiTrade | null; addPartner?: (id: string) => void; removePartner?: (id: string) => void;
  /** Turns on the partner profile button. The profile opens in its own sheet (phones) or modal (768px up); the side
   *  panel keeps its partner card as is. profileOpen is no longer read. */
  onProfile?: () => void; profileOpen?: boolean;
  trade: TradeT | null; suggestions: TradeT[];
  /** Every team's ideas from the league scan, so an empty result can point at teams where deals work. */
  ideasByTeam?: Record<string, TradeT[]>;
  tags: ManagerTag[]; myTags: Record<string, MyTag>;
  /** Your asking prices, so the read and the idea finder score deals the same way the rest of the app does. */
  prices?: Record<string, Price>;
  tip: string | null;
  coach: (t: TradeT) => { trade: TradeT; line: string } | null;
  onPitch: (t: TradeT) => void; onLoad: (t: TradeT) => void;
  onAddTag: (t: Omit<ManagerTag, "id">) => void;
  onRemoveTag: (id: string) => void;
  /** Offers you sent, for the Sent tab. Tapping one puts it back in the builder. */
  sent?: SentOffer[]; sentSynced?: boolean; syncUser?: string; onReopenSent?: (o: SentOffer) => void; onDeclineSent?: (o: SentOffer) => void; onClearSent?: (o: SentOffer) => void;
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
  const [view, setView] = useSticky<"build" | "ideas" | "notes" | "sent">("trade.view", "build", ["build", "ideas", "notes", "sent"]);
  const sentCount = new Set(sent.map((o) => o.deal)).size;
  // Re-run the finder visibly whenever what it reads has changed: a new or removed note, or a new partner
  const sig = `${partnerId}|${theirTags.map((t) => t.id).join(",")}`;
  const seen = useRef<Record<string, { sig: string; keys: string[] }>>({});
  const last = seen.current[partnerId];
  const stale = !last || last.sig !== sig;
  const [scanned, setScanned] = useState<string | null>(null);
  const scanning = view === "ideas" && stale && scanned !== sig;
  const [fresh, setFresh] = useState<string[]>([]);
  const [rescanned, setRescanned] = useState(false);
  // Each finished scan's own record of what it turned down, for the "why no trades" read
  const diags = useRef<Record<string, ScanDiag>>({});
  const finishScan = (_found: TradeT[], d: ScanDiag) => {
    diags.current[sig] = d;
    const before = last?.keys ?? null;
    setFresh(before ? suggestions.map((t) => t.key).filter((k) => !before.includes(k)) : []);
    setRescanned(!!before);
    seen.current[partnerId] = { sig, keys: suggestions.map((t) => t.key) };
    setScanned(sig);
    setShownScan(sig);
  };
  // The finished scan stays on the Ideas tab, folded, until you leave it
  const [shownScan, setShownScan] = useState<string | null>(null);
  useEffect(() => { if (view !== "ideas") setShownScan(null); }, [view]);
  const loadIdea = (t: TradeT) => { onLoad(t); setView("build"); };
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState(false);
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
  // Picking from the search: your player goes on the side you send, anyone else on the side you get, with that team
  const searchPick = (id: string, team: { id: string; you?: boolean }) => {
    setView("build");
    if (team.you) { toggle("give", id); return; }
    if (extra.some((l) => l.teamId === team.id)) { toggle("get", id, team.id); return; }
    if (team.id !== partnerId) setPartner(team.id);
    toggle("get", id);
  };
  const dealTools = (
    <div className="ttb-row">
      {/* Tablet and desktop: the search is always there, filling the line, so there's nothing to open first */}
      <div className="ttb-find"><PlayerSearch picked={[...allGive, ...allGet]} onPick={searchPick} /></div>
      <button type="button" className="btn btn-icon ttb-search" onClick={() => setSearching(true)} aria-label="Search any player in your league"><Icon name="search" size={18} /></button>
      {addPartner && <AddTeam count={legs.length + 1} onAdd={addPartner} teams={TEAMS.filter((t) => !t.you && !legs.some((l) => l.team.id === t.id))} />}
      <button type="button" className="btn btn-ghost ttb-clear" aria-disabled={!anyPicked || undefined} onClick={anyPicked ? clear : denyOn("Nothing to clear yet. Add a player to start a deal.")}>Clear</button>
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
        <PlayerSearch picked={[...allGive, ...allGet]} onClose={() => setSearching(false)} onPick={searchPick} />
      ) : (
        <div className="tr-bar">
          <TeamPicker compact teams={TEAMS.filter((t) => !t.you && !extra.some((l) => l.teamId === t.id))} value={partnerId} onChange={setPartner} />
          {onProfile && <button type="button" className="btn tr-profile" onClick={() => setProfile(true)} aria-haspopup="dialog" aria-expanded={profile} title="Needs, notes and how they trade"><Icon name="group" size={18} /><span>{isMulti ? "Partner profiles" : `${them.manager}'s profile`}</span></button>}
          {profile && <PartnerProfile teamIds={legs.map((l) => l.team.id)} initial={partnerId} tags={tags} onClose={() => setProfile(false)}
            onNotes={(id) => { if (id !== partnerId) setPartner(id); setView("notes"); }} />}
          {/* An offer comes from one manager, so the switch is a two-team thing: the multi-team read never used it */}
          {view === "build" && !isMulti && (
            <Tooltip content={`Turn on when ${them.manager} sent you this deal. The read judges their offer instead of yours.`}>
              <button type="button" role="switch" aria-checked={received} className={`btn ttb-offer${received ? " on" : ""}`} onClick={() => setReceived((x) => !x)} aria-label={`Received this offer from ${them.manager}`}>
                <span className="ttb-sw" aria-hidden="true"><span /></span>
                <span className="ttb-long" aria-hidden="true">Received this offer</span>
                <span className="ttb-short" aria-hidden="true">Their offer</span>
              </button>
            </Tooltip>
          )}
        </div>
      )}

      <PageTabs value={view} onChange={setView} options={[{ v: "build", label: "Build", icon: "trade" }, { v: "ideas", label: suggestions.length ? `Ideas (${suggestions.length})` : "Ideas", icon: "spark" }, { v: "notes", label: theirTags.length ? `Notes (${theirTags.length})` : "Notes", icon: "msg" }, { v: "sent", label: sentCount ? `Sent (${sentCount})` : "Sent", icon: "send" }]} />

      {view === "sent" && (
        <SentOffers offers={sent} synced={sentSynced} syncUser={syncUser} onReopen={(o) => { setView("build"); onReopenSent?.(o); }}
          onDecline={(o) => onDeclineSent?.(o)} onClear={(o) => onClearSent?.(o)} />
      )}

      {view === "ideas" && (
        <div className="tr-scout" aria-label={`How ${them.manager} trades`}>
          <span className="eyebrow">How {them.manager} trades</span>
          <p>{scoutFacts.join(" · ")}</p>
          {scoutTip && <p className="tr-tip"><AiMark size={14} /><span>{scoutTip}.</span></p>}
        </div>
      )}
      {view === "ideas" && (scanning || shownScan === sig) && <IdeaScan key={sig} run={(d) => ideaSteps(them, tags, myTags, prices, 3, d)} onDone={finishScan} />}
      {view === "ideas" && !scanning && suggestions.length === 0 && (
        <WhyNone them={them} diag={diags.current[sig]} tags={tags} myTags={myTags} prices={prices} ideasByTeam={ideasByTeam} onOpen={loadIdea} onTeam={setPartner} />
      )}
      {view === "ideas" && !scanning && suggestions.length > 0 && (
        <section className="card nudge">
          <div className="row wrap"><span className="stamp">Per sources</span><span className="small muted">Win-win trades built around what {them.manager} wants</span></div>
          {fresh.length > 0
            ? <p className="scan-new"><AiMark size={14} />{fresh.length} new {fresh.length > 1 ? "ideas" : "idea"} from your notes</p>
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
              {v && <TradeRead them={them} give={give} get={get} tags={tags} myTags={myTags} prices={prices} received={received} />}
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
                <button className="linkish small" onClick={() => setWhy(true)} aria-haspopup="dialog">Show the math</button>
                <button className="btn btn-primary" onClick={() => onPitch(trade)}><Icon name="pen" size={16} />Write pitch</button>
              </div>
              {why && (
                <DetailSheet className="dm-sheet" onClose={() => setWhy(false)} title={<h2 className="ds-h">The math</h2>}>
                <div className="why">
                  <section className="dm-sec"><h3 className="dm-h">Your starters</h3><Changes team={YOU} trade={trade} side="you" /></section>
                  <section className="dm-sec"><h3 className="dm-h">{them.manager}'s starters</h3><Changes team={them} trade={trade} side="them" /></section>
                  <p className="small muted">Two lenses. Points per week counts starting lineups only. Trade value is the plain sum of player values: <span className="num">{trade.marketGive.toLocaleString()}</span> you give, <span className="num">{trade.marketGet.toLocaleString()}</span> you get. {give.length !== get.length || give.length > 1 ? <>The verdict counts the best player on each side in full and each extra piece for less (85%, 72%, 61%). Adjusted for {give.length}-for-{get.length}: <span className="num">{trade.adjGive.toLocaleString()}</span> you give, <span className="num">{trade.adjGet.toLocaleString()}</span> you get. </> : null}Net: you {fmt(trade.youDelta)}, {them.manager} {fmt(trade.themDelta)}.</p>
                </div>
                </DetailSheet>
              )}
              {tip && (
                <div className="tip">
                  <Stamp>Tip</Stamp>
                  <span className="small"><Stream text={tip} /></span>
                  <AiLabel />
                </div>
              )}
              </div>
              <DealDetails
                bars={<PositionBars trade={trade} them={them} />} barsSummary={positionSummary(YOU.roster, rosterAfter(YOU, trade, "you"))}
                schedule={<DealSchedule bare give={give.map(playerById)} get={get.map(playerById)} />}
                scheduleSummary={`You send ${scheduleLean(give.map(playerById))} · You get ${scheduleLean(get.map(playerById))}`} />
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
                  <DtChips count={ids.length}>
                    {ids.map((id) => { const p = playerById(id); return (
                      <button key={id} className="dt-chip" onClick={() => toggle(k, id)} aria-label={`Remove ${p.name}`}>
                        <Avatar p={p} size={22} badge={false} /><span>{p.name.split(" ").slice(-1)[0]}</span><Icon name="x" size={12} />
                      </button>
                    ); })}
                    {ids.length === 0 && <button className="dt-empty" onClick={() => setSide(k)}>{k === "give" ? "Pick from your roster" : isMulti ? "Pick from their rosters" : `Pick from ${them.manager}`}</button>}
                  </DtChips>
                </div>
              );
            })}
          </div>
          <button className="btn btn-primary dt-go" aria-disabled={(isMulti ? !multi : !trade) || undefined}
            onClick={(e) => (isMulti ? multi : trade) ? seeRead()
              : deny(e.currentTarget, isMulti ? "Add a player for every team in the deal to see the read." : !allGive.length && !allGet.length ? "Add a player to each side to see the read." : !allGive.length ? "Add a player you send to see the read." : "Add a player you get to see the read.")}>See the read</button>
        </div>
        </>
      )}

      {view === "notes" && <section className="card log-card" aria-label={`What ${them.manager} said`}>
        <div className="log-head">
          <h2 className="section-title">What did {them.manager} say?</h2>
          <p>Private to you. Trade ideas use it.</p>
        </div>
        <TagCapture onSave={onAddTag} placeholder="wants a TE" compact teamId={partnerId} onTeam={setPartner} />
        {last && stale && <button className="scan-cta" onClick={() => setView("ideas")}><AiMark size={14} /><span>Notes changed. Find new trade ideas with {them.manager}</span><Icon name="chev" size={14} /></button>}
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
            <Select id="tag-target" className="tb-sel" aria-label="Player or position" value={target} onChange={setTarget} searchPlaceholder="Player, position or team"
              options={[
                ...POS_ORDER.map((p) => ({ value: `pos:${p}`, label: kind === "wants" ? `${p} help` : kind === "refuses" ? `his ${p}` : `your ${p}`, group: "Position" })),
                ...targetOptions.map((id) => { const pl = playerById(id); return { value: id, label: pl.name, hint: pl.pos, match: { pos: pl.pos, team: pl.nfl }, group: kind === "refuses" ? `${them.manager}'s players` : "Your players" }; }),
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

/** One side of the deal tray: its pills scroll sideways, fade at the edge with more, and the newest scrolls into view. */
function DtChips({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useHFade(ref, count);
  return <div ref={ref} className="dt-chips">{children}</div>;
}
