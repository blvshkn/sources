import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DetailSheet } from "./DetailSheet";
import { useDismiss } from "./useDismiss";
import { denyOn } from "../deny";
import { LeagueSwitch } from "./LeagueSwitch";
import { kickLine, kickWhen, kickWhenIn, oppAt, oppText, useKickoffs } from "../kickoff";
import { DEADLINES, FAAB, YOU, LEAGUE, WEEK, sleeperUrl , PLAYERS, FREE_AGENTS, SPECIAL_FREE_AGENTS, WaiverFA, WaiverPos, BidTier, isSpecialFA, gameNow, lockedThisWeek } from "../data";
import { WaiverRec, bidDollars, bidRange, bidSourceNote, bidsFor, eff, fitScore, fmt, irReport, lockedRecs, recDrop, round1, slotGaps, specialBidRange, weakSet } from "../engine";
import { WeekView, loadWeek, peekWeek } from "../weeks";
import { FaLite, WkCell, lastThreeWeeks, setWeekPick, useWeekCells } from "../waiverWeeks";
import { useLive } from "../live";
import { AiLabel, Icon, StatusPill, useSticky, type IconName } from "./ui";
import { Avatar } from "./Avatar";
import { Tooltip } from "./Tooltip";
import { PlatformLogo } from "./PlatformLogo";
import { Select } from "./Select";
import { WeekStepper } from "./WeekStepper";
import { useKeyboardInset } from "./useKeyboardInset";
import { matchPlayer, pieces, rankPlayers } from "../search";
import { DepthTab, GameLogTab, SheetTabs, useSheetTab, type SheetTab } from "./PlayerTabs";
import { PlayerSheet } from "./lazy";
import { waiverWeek } from "./watchCtx";
import { PlayerBar, PlayerHero, WatchButton, keepTabs } from "./PlayerHero";
import type { Player } from "../data";

/** Why a free agent can't help this week, or null when he can. */
export type Avail = null | "played" | "bye" | "out" | "ir";
const AVAIL_LABEL: Record<Exclude<Avail, null>, string> = { played: "Played", bye: "Bye", out: "Out", ir: "IR" };
// Game states are the live ones (data.gameNow), the same states the Lineup rows and lineup advice use
export const availOf = (fa: WaiverFA): Avail => {
  const s = gameNow(fa.nfl);
  if (s === "bye") return "bye";
  if (s === "in_game" || s === "complete") return "played";
  if (isSpecialFA(fa)) return fa.status === "O" ? "out" : null;
  const p = PLAYERS[fa.id];
  if (p?.injury === "IR") return "ir";
  if (p?.status === "O") return "out";
  return null;
};
/** This week's row label for a free agent who can't be claimed for it: "Playing", "Played", "Bye", "Out" or "IR". */
export const cantLabel = (fa: WaiverFA, avail: Avail) => (avail === "bye" ? "Bye" : avail === "out" ? "Out" : avail === "ir" ? "IR" : gameNow(fa.nfl) === "in_game" ? "Playing" : "Played");
/** Why a locked row can't be claimed this week, said when it's tapped. Null when he can be. */
export const lockWhyText = (fa: WaiverFA, avail: Avail): string | null => !avail ? null
  : avail === "played" ? (gameNow(fa.nfl) === "in_game" ? `${fa.name} is playing now, so Sleeper locks him until waivers run.` : `${fa.name} already played this week, so Sleeper locks him until waivers run.`)
  : avail === "bye" ? `${fa.name} is on bye this week. Step to Week ${WEEK + 1} to plan a claim.`
  : `${fa.name} is ${avail === "ir" ? "on IR" : "out"} this week, so Sources isn't suggesting a claim.`;
/** `later`: claim details for a player whose game already started, used once you look past this week. */
type Entry = { fa: WaiverFA; value: number; avail: Avail; rec?: WaiverRec; later?: WaiverRec };
type Tab = "ALL" | WaiverPos;
const TABS: readonly Tab[] = ["ALL", "QB", "RB", "WR", "TE", "K", "DEF"];
/** The game line for any free agent: skill players carry it in PLAYERS, kickers and defenses on the entry itself. */
const gameOf = (fa: WaiverFA) => kickLine(isSpecialFA(fa) ? fa : PLAYERS[fa.id] ?? {});
/** A list row's game: the opponent, then "· Sun 1:00 PM" (or the day) as a separate piece that never splits. */
const GameBits = ({ opp, when }: { opp: string; when: string }) => <><span className="lu-game">{opp}</span>{when && <span className="lu-game wv-when"><i>· </i>{when}</span>}</>;
/** "vs LAR" for a defense's matchup row. The row adds the kickoff after it when known. */
const oppShort = (fa: WaiverFA) => (isSpecialFA(fa) && fa.opp ? (/^(vs|@)\s/.test(fa.opp) ? fa.opp : `vs ${fa.opp}`) : "");

/** Current injury designation as a row tag, for weeks still to come. Weekly designations only describe this week. */
function injuryTag(fa: WaiverFA): { cls: string; label: string; tip: string } | null {
  if (isSpecialFA(fa)) return fa.status === "O" ? { cls: "t-out", label: "Out", tip: "Ruled out this week." } : null;
  const p = PLAYERS[fa.id];
  if (!p?.status && !p?.injury) return null;
  const inj = p.injury ?? "";
  if (p.longTerm || inj === "IR" || inj === "PUP" || inj === "Sus") return { cls: "t-ir", label: inj === "Sus" ? "SUS" : inj || "IR", tip: [inj === "Sus" ? "Suspended" : inj === "PUP" ? "On the PUP list" : "On injured reserve", p.note].filter(Boolean).join(". ") };
  if (p.status === "O") return { cls: "t-out", label: "Out", tip: [`Ruled out for week ${WEEK}`, p.note].filter(Boolean).join(". ") };
  if (p.status === "Q") return { cls: "t-q", label: inj === "Doubtful" ? "D" : "Q", tip: [`${inj === "Doubtful" ? "Doubtful" : "Questionable"} for week ${WEEK}`, p.note].filter(Boolean).join(". ") };
  return null;
}
const longOut = (fa: WaiverFA) => !isSpecialFA(fa) && !!PLAYERS[fa.id]?.longTerm && PLAYERS[fa.id]?.status === "O";

/** Which of your starting slots a position can fill, by the slot names a WeekView uses. */
const FITS: Record<string, string[]> = { FLEX: ["RB", "WR", "TE"], SF: ["QB", "RB", "WR", "TE"] };
/** What a free agent scoring `pts` would add to your lineup that week (beat the weakest starter he could replace),
 *  and which of your slots he'd take. */
function slotGainIn(v: WeekView, pos: string, pts: number): { gain: number; slot: string | null } {
  const slots = v.starters.filter((s) => (FITS[s.slot] ?? [s.slot]).includes(pos));
  if (!slots.length) return { gain: 0, slot: null };
  const low = slots.slice().sort((a, b) => (a.p?.pts ?? 0) - (b.p?.pts ?? 0))[0];
  const gain = round1(Math.max(0, pts - (low.p?.pts ?? 0)));
  return { gain, slot: gain > 0.05 ? low.slot : null };
}
/** Your players at a position who are all off that week (bye, out, nothing projected), so the slot sits empty. */
function holeIn(v: WeekView, pos: string): string[] {
  const mine = [...v.starters.map((s) => s.p), ...v.bench].filter((p): p is NonNullable<typeof p> => !!p && p.pos === pos);
  if (!mine.length || mine.some((p) => (p.pts ?? 0) > 0)) return [];
  return mine.map((p) => p.name.split(" ").slice(-1)[0]);
}

const defaultWeek = waiverWeek;

/** Highlights the matched letters of a name in type-ahead results (search.ts: initials, word starts, substrings). */
function Hit({ name, term }: { name: string; term: string }) {
  const m = term ? matchPlayer(term, name) : null;
  if (!m?.marks.length) return <>{name}</>;
  return <>{pieces(name, m.marks).map((x, i) => (x.on ? <mark key={i}>{x.text}</mark> : x.text))}</>;
}

/** "$40-$90", or "Up to $150" when the low end is zero. Kickers and defenses go for any amount, so they never get a range. */
/** The Sugg. bid as Sleeper shows it, "$100-$200". K/DEF use the league's K/DEF range, never "Any amount". */
export const bidText = (b: [number, number] | number[], fa?: WaiverFA) => bidRange(fa && isSpecialFA(fa) ? specialBidRange().bid : b);
/** The Sugg. bid cell for any row, with or without claim details. */
const bidCell = (fa: WaiverFA, r?: WaiverRec) => FAAB.enabled ? (isSpecialFA(fa) ? bidText([0, 0], fa) : r ? bidText(r.bid) : "–") : (isSpecialFA(fa) ? "Low priority" : r ? r.tier : "–");
/** The label over every suggested amount. */
export const SUGG_BID = "Sugg. bid";

/** Actual scores over the last three completed weeks, oldest first, best one brightest. A dash is a bye, a dot is still loading. */
function LastThree({ v, weeks }: { v: (number | null | undefined)[]; weeks: number[] }) {
  if (!weeks.length) return <span className="wv-l3"><i>Last 3</i><b>–</b></span>;
  const max = Math.max(1, ...v.map((x) => x ?? 0));
  return (
    <span className="wv-l3"><i>Last {weeks.length}</i>
      <Tooltip content={<>Actual points, weeks <span className="num">{weeks.join(", ")}</span>: <span className="num">{v.map((x) => (typeof x === "number" ? x.toFixed(2) : "–")).join(", ")}</span></>}>
        <b className="wv-l3-row" aria-label={`Last ${weeks.length} weeks: ${v.map((x, k) => `week ${weeks[k]} ${x === null ? "bye" : x === undefined ? "loading" : x.toFixed(1)}`).join(", ")}`}>
          {v.map((x, k) => <em key={k} className={x === null || x === undefined ? "nil" : x === max ? "hi" : ""}>{x === null ? "–" : x === undefined ? "·" : x.toFixed(1)}</em>)}
        </b>
      </Tooltip>
    </span>
  );
}

type Kind = "past" | "current" | "future";
interface Row extends Entry {
  /** Claim details usable in the selected week. */
  r?: WaiverRec;
  c?: WkCell;
  /** The number in the right-hand box: projection or points scored. undefined = loading, null = bye. */
  pts: number | null | undefined;
  gain: number;
  help: boolean;
  /** You said you're not interested: he stays findable, but out of "can help" and every pick. */
  no: boolean;
  /** Weakness-first rank and the line that says why (see fitScore). */
  score: number;
  fit: string | null;
  pick: boolean;
  tag: { cls: string; label: string; tip?: string } | null;
  l3: (number | null | undefined)[];
}

export function Waivers({ recs, onToast, watch, onWatch, passed, onUnpass, snoozed = [], onSnooze, onUnsnooze }: {
  recs: WaiverRec[]; onToast: (m: string) => void; watch: Record<string, number>; onWatch: (next: (w: Record<string, number>) => Record<string, number>) => void;
  /** Players you said you're not interested in, shared with every other suggestion. Nothing here adds to it anymore;
   *  players already on it stay dimmed with a way back. */
  passed: string[]; onUnpass: (p: { id: string; name: string }) => void;
  /** "Not right now": skipped this week. Still listed, out of the top pickup, back next week. */
  snoozed?: string[]; onSnooze: (p: { id: string; name: string }) => void; onUnsnooze: (p: { id: string; name: string }) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  // The claim sheet's tabs (Claim, Game log, Depth chart), remembered for the session; a depth chart name opens his sheet
  const [sheetTab, setSheetTab] = useSheetTab("waiver", ["main", "log", "depth"]);
  const [other, setOther] = useState<Player | null>(null);
  // K and DEF tabs only when the league starts them
  const tabs = TABS.filter((t) => (t !== "K" && t !== "DEF") || (LEAGUE.specialSlots ?? []).includes(t));
  const [pos, setPos] = useSticky<Tab>("waivers.pos", "ALL", tabs);
  const [sort, setSort] = useSticky<"fit" | "trend" | "proj">("waivers.sort", "fit", ["fit", "trend", "proj"]);
  const [q, setQ] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [hi, setHi] = useState(0);
  const [onlyWatch, setOnlyWatch] = useState(false);
  const defWeek = useMemo(defaultWeek, []);
  const [week, setWeek] = useState(defWeek);
  const kind: Kind = week < WEEK ? "past" : week > WEEK ? "future" : "current";
  const listRef = useRef<HTMLDivElement>(null);
  // Position tabs scroll sideways on phones: keep the selected one in view
  const posRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = posRef.current, on = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !on || row.scrollWidth <= row.clientWidth) return;
    const l = on.offsetLeft - 16, r = on.offsetLeft + on.offsetWidth + 16 - row.clientWidth;
    if (row.scrollLeft > l) row.scrollLeft = l; else if (row.scrollLeft < r) row.scrollLeft = r;
  }, [pos]);
  const ir = irReport(YOU);
  const irMove = ir.open > 0 ? ir.moveIn[0] : undefined;
  const live = useLive();
  useKickoffs(week);
  // Every free agent: the ones who can help this week first, then anyone who already played, is on bye, Out or on IR
  const all = useMemo<Entry[]>(() => {
    const ok: Entry[] = recs.map((r) => ({ fa: r.fa, value: r.value, avail: availOf(r.fa), rec: r }));
    const later = new Map(lockedRecs(YOU).map((r) => [r.fa.id, r]));
    const locked: Entry[] = FREE_AGENTS.filter((fa) => lockedThisWeek(fa.nfl)).map((fa) => ({ fa, value: PLAYERS[fa.id] ? eff(PLAYERS[fa.id]) : fa.proj, avail: availOf(fa), later: later.get(fa.id) }));
    const slots = LEAGUE.specialSlots ?? [];
    const lockedSpecial: Entry[] = SPECIAL_FREE_AGENTS.filter((fa) => slots.includes(fa.pos) && !ok.some((e) => e.fa.id === fa.id)).map((fa) => ({ fa, value: fa.proj, avail: availOf(fa) }));
    return [...ok, ...locked, ...lockedSpecial];
  }, [recs]);

  // Week numbers for every free agent: the selected week, plus the current week's points for anyone who already played
  const lite = useMemo<FaLite[]>(() => all.map((e) => ({ id: e.fa.id, name: e.fa.name, pos: e.fa.pos, nfl: e.fa.nfl, proj: e.fa.proj })), [all]);
  const anyPlayed = all.some((e) => e.avail === "played");
  const sel = useWeekCells(kind === "current" ? (anyPlayed ? [WEEK] : []) : [week], lite, kind === "current" ? live.at : 0);
  const l3Weeks = lastThreeWeeks();
  const l3 = useWeekCells(l3Weeks, lite);
  // Your own lineup that week, so "can help" means the same thing in every week: he'd beat one of your starters
  const [mine, setMine] = useState<WeekView | null>(null);
  useEffect(() => {
    if (week === WEEK || peekWeek(week)) return;
    let on = true;
    loadWeek(week).then((v) => on && setMine(v)).catch(() => {});
    return () => { on = false; };
  }, [week]);
  const myView = week === WEEK ? null : (mine?.week === week ? mine : peekWeek(week) ?? null);
  const fitCtx = useMemo(() => { const gaps = slotGaps(); return { gaps, weak: weakSet(gaps) }; }, [recs]);
  const no = (id: string) => passed.includes(id);

  const rows = useMemo<Row[]>(() => all.map((e) => {
    const c = sel.cells[week]?.[e.fa.id];
    const lt = l3Weeks.map((w) => { const x = l3.cells[w]?.[e.fa.id]; return x ? x.pts : undefined; });
    // Rows that can't be claimed this week say why in their stats (bye, out, or the score so far), so they skip the tag
    const n = no(e.fa.id);
    if (kind === "current") return { ...e, r: e.rec, c, pts: e.value, gain: e.rec?.gain ?? 0, help: !e.avail && !n, no: n, score: e.rec?.score ?? 0, fit: e.rec ? (e.rec.kdef ? e.rec.kdef.line : e.rec.fit ?? null) : null, pick: !!e.rec?.pick && !e.avail && !n, tag: e.avail && e.rec ? { cls: `t-${e.avail}`, label: AVAIL_LABEL[e.avail] } : null, l3: lt };
    const bye = c?.pts === null;
    const out = kind === "future" && longOut(e.fa);
    const pts = c ? c.pts : undefined;
    const sg = !myView || myView.empty || bye || out || pts == null ? { gain: 0, slot: null } : slotGainIn(myView, e.fa.pos, pts);
    const gain = sg.gain;
    const tag = bye ? { cls: "t-bye", label: "Bye", tip: `On bye in week ${week}` } : kind === "future" ? injuryTag(e.fa) : null;
    const r = e.rec ?? e.later;
    // Weeks ahead rank the same way as this week: rest-of-season help at a weak slot first, a one-week fill at a
    // slot that's already fine last, a real hole (everyone you have there is off) in between, by its size
    const kd = !!r?.kdef;
    const f = kind === "past" || !r || kd ? null
      : fitScore({ name: e.fa.name, pos: e.fa.pos, week, weekGain: gain, ros: r.ros ?? 0, rosSlot: r.rosSlot ?? null, weekSlot: sg.slot, holeNames: myView && gain > 0.05 ? holeIn(myView, e.fa.pos) : [] }, fitCtx.gaps, fitCtx.weak);
    const score = f ? (r?.noDrop ? round1(f.score * 0.25) : f.score) : kd ? (gain > 0.05 ? gain * 0.5 : 0) : gain;
    const pick = kind === "past" ? gain > 0.05 : !!r && !n && (f ? f.pick && !r.noDrop : gain > 0.05);
    return { ...e, r, c, pts, gain, help: gain > 0.05 && !n, no: n, score, fit: f?.line ?? null, pick, tag, l3: lt };
  }), [all, sel.cells, l3.cells, kind, week, myView, passed, fitCtx]); // eslint-disable-line react-hooks/exhaustive-deps
  const watched = (id: string) => watch[id] !== undefined;

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((e) => (pos === "ALL" || e.fa.pos === pos) && (!onlyWatch || watched(e.fa.id)) && (!term || !!matchPlayer(term, e.fa.name, { pos: e.fa.pos, team: e.fa.nfl })));
    const num = (e: Row) => (typeof e.pts === "number" ? e.pts : -1);
    const sorted = sort === "trend" ? [...list].sort((a, b) => (b.fa.trend === "up" ? 1 : 0) - (a.fa.trend === "up" ? 1 : 0) || (b.fa.rostered ?? 0) - (a.fa.rostered ?? 0))
      : sort === "proj" ? [...list].sort((a, b) => num(b) - num(a))
      : kind === "current" ? list : [...list].sort((a, b) => Number(b.help) - Number(a.help) || Number(b.pick) - Number(a.pick) || b.score - a.score || b.gain - a.gain || num(b) - num(a));
    // This week, anyone who can't play sinks; other weeks, byes sink. Players you're watching float to the top.
    // Players you passed on go to the very end, still there to find. Skipped this week stays in place.
    const gone = (e: Row) => e.no;
    const sink = (e: Row) => (kind === "current" ? !!e.avail : e.pts === null);
    const live = sorted.filter((e) => !gone(e));
    const ordered = [...live.filter((e) => !sink(e)), ...live.filter(sink)];
    return [...ordered.filter((e) => watched(e.fa.id)), ...ordered.filter((e) => !watched(e.fa.id)), ...sorted.filter(gone)];
  }, [rows, pos, sort, q, onlyWatch, watch, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  // Type-ahead: names that start with what you typed rank above names that merely contain it
  const term = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!term) return [];
    const sorted = [...all].sort((a, b) => Number(!!a.avail) - Number(!!b.avail) || b.value - a.value);
    return rankPlayers(term, sorted, (e) => ({ name: e.fa.name })).map((r) => r.item).slice(0, 6);
  }, [all, term]);
  // Phones: the type-ahead fits above the keyboard (useKeyboardInset.ts)
  const taField = useRef<HTMLLabelElement>(null);
  const taList = useRef<HTMLUListElement>(null);
  const taMax = useKeyboardInset(taField, taList);
  // The suggestions close on a tap outside the field and the list, and on Escape. Focus stays in the field.
  useDismiss(taList, () => setSuggest(false), { open: suggest && hits.length > 0, keep: (t) => !!taField.current?.contains(t), restoreFocus: false });
  const pick = (e: Entry) => {
    setQ(e.fa.name); setSuggest(false); setPos("ALL"); setOnlyWatch(false); setOpen(e.rec || (week !== WEEK && e.later) ? e.fa.id : null);
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-id="${CSS.escape(e.fa.id)}"]`)?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  const onKey = (ev: { key: string; preventDefault: () => void }) => {
    if (!suggest || !hits.length) return;
    if (ev.key === "ArrowDown") { ev.preventDefault(); setHi((h) => (h + 1) % hits.length); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setHi((h) => (h - 1 + hits.length) % hits.length); }
    else if (ev.key === "Enter") { ev.preventDefault(); pick(hits[hi]); }
  };
  const loading = kind !== "current" && (sel.loading || !myView);
  const ready = shown.filter((e) => e.help).length;
  const passedHere = shown.filter((e) => e.no).length;
  const skipped = (id: string) => snoozed.includes(id);
  const snooze = (e: { fa: WaiverFA }) => onSnooze({ id: e.fa.id, name: e.fa.name });
  const unsnooze = (e: { fa: WaiverFA }) => onUnsnooze({ id: e.fa.id, name: e.fa.name });
  const unpass = (e: { fa: WaiverFA }) => onUnpass({ id: e.fa.id, name: e.fa.name });
  const byes = shown.filter((e) => e.pts === null).length;
  // Marking a player: for the week you're looking at when it's ahead, otherwise the week waivers are working on
  const target = kind === "future" ? week : defWeek;
  const toggleWatch = (e: Row) => {
    if (watched(e.fa.id)) { onWatch((w) => { const n = { ...w }; delete n[e.fa.id]; return n; }); onToast(`Stopped watching ${e.fa.name}.`); }
    else { onWatch((w) => ({ ...w, [e.fa.id]: target })); onToast(`Watching ${e.fa.name} for week ${target}.`); }
  };
  const watchCount = all.filter((e) => watched(e.fa.id)).length;

  // This week's top pickup: the engine's best pick you haven't passed on
  const nowTop = recs.find((r) => r.pick && !no(r.fa.id) && !skipped(r.fa.id));
  // Top pickup follows the week: this week it's the engine's pick; other weeks, the best claim by what he adds that week
  // Weeks ahead pick by weakness first (score); a past week's "top scorer" is simply who would have added the most.
  const freshTop = kind === "current" || loading ? undefined : rows.filter((x) => x.r && typeof x.pts === "number" && !x.no && !skipped(x.fa.id) && (kind === "past" || x.pick)).sort((a, b) => b.score - a.score || b.gain - a.gain || (b.pts as number) - (a.pts as number))[0];
  // While a week loads, keep the last card up so nothing below it moves
  const lastTop = useRef<{ row: Row; week: number; kind: Kind } | null>(null);
  if (freshTop) lastTop.current = { row: freshTop, week, kind };
  const held = kind !== "current" && loading && lastTop.current && !no(lastTop.current.row.fa.id) && !skipped(lastTop.current.row.fa.id) ? lastTop.current : null;
  const topRow = freshTop ?? held?.row;
  const topWeek = freshTop ? week : held?.week ?? week, topKind = freshTop ? kind : held?.kind ?? kind;
  // The docked panel shows the same pick
  const pickKey = topRow && topKind !== "current" ? `${topWeek}|${topRow.fa.id}|${topRow.pts}|${topRow.gain}` : "";
  useEffect(() => {
    setWeekPick(topRow && topKind !== "current" && topRow.r ? { week: topWeek, kind: topKind, rec: topRow.r, pts: topRow.pts as number, gain: topRow.gain, fit: topRow.fit } : null);
  }, [pickKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setWeekPick(null), []);

  return (
    <>
      <header className="page-head">
        <div>
          <LeagueSwitch title="Waivers" meta={<>{DEADLINES.waivers}</>} />
        </div>
      </header>

      <div className="wv-layout">
      <aside className="wv-aside" aria-label="Your budget and top pickup">
      {FAAB.enabled && <div className="faab faab-row" aria-label={`FAAB remaining ${FAAB.remaining} of ${FAAB.budget}`}>
        <span className="faab-row-top"><b className="num">${FAAB.remaining}<span className="muted">/{FAAB.budget}</span></b><span className="muted">FAAB left</span></span>
        <span className="faab-track"><span style={{ width: `${(FAAB.remaining / FAAB.budget) * 100}%` }} /></span>
      </div>}

      {kind === "current" && (nowTop ? (() => {
        const top = nowTop;
        const starts = top.gain > 0.05;
        const kd = top.kdef;
        return <TopCard rec={top} irMove={irMove?.name} onToast={onToast} starts={starts} eyebrow="Top pickup" onSnooze={() => snooze(top)}
          stat={{ dt: "This week", dd: (isSpecialFA(top.fa) ? top.fa.wk ?? 0 : top.fa.proj).toFixed(1) }}
          why={kd ? kd.line : top.fit ?? (!/^Projects /.test(top.fa.why) ? top.fa.why : null)}
          plan={kd?.fix ? <span>Fills your {kd.fix === "empty" ? "empty" : kd.fix === "bye" ? "bye-week" : "injured"} {top.fa.pos} slot. <b>{fmt(top.gain)} pts</b> this week.</span>
            : starts ? <span>Starts for you. <b>{fmt(top.gain)} pts</b> this week.</span> : <span>Bench stash for now. Doesn't crack your lineup this week.</span>} />;
      })() : null /* Nothing worth claiming: no card at all (Zach) */)}
      {kind !== "current" && (topRow ? (() => {
        const x = topRow, r = x.r!, starts = x.gain > 0.05, past = topKind === "past", week = topWeek;
        return <TopCard rec={r} irMove={irMove?.name} onToast={onToast} starts={starts} game={x.c?.opp ? (past ? x.c.opp : oppAt(r.fa.nfl, x.c.opp, week)) : ""} eyebrow={past ? `Top scorer, week ${week}` : `Top pickup, week ${week}`} onSnooze={() => snooze(x)}
          stat={{ dt: past ? `Scored wk ${week}` : `Week ${week}`, dd: (x.pts as number).toFixed(past ? 2 : 1) }}
          why={past ? (x.c?.line ?? null) : x.fit ?? `${x.fa.name} projects ${(x.pts as number).toFixed(1)}${x.c?.opp ? ` ${x.c.opp}` : ""} in week ${week}.`}
          plan={past ? (starts ? <span>Would have added <b>{fmt(x.gain)} pts</b> to your week {week} lineup.</span> : <span>Wouldn't have cracked your week {week} lineup.</span>)
            : starts ? <span>Starts for you in week {week}. <b>{fmt(x.gain)} pts</b>.</span> : <span>Bench depth in week {week}. Doesn't crack your lineup.</span>} />;
      })() : loading && nowTop ? (
        // First load of another week: the top pickup card's own frame as a skeleton, so the list below doesn't jump
        <TopCard skel rec={nowTop} irMove={irMove?.name} onToast={onToast} starts={false} onSnooze={() => {}}
          eyebrow={kind === "past" ? `Top scorer, week ${week}` : `Top pickup, week ${week}`} stat={{ dt: `Week ${week}`, dd: "0.0" }}
          why={nowTop.fit ?? nowTop.fa.why} plan={<span>Starts for you in week {week}. <b>+0.0 pts</b>.</span>} />
      ) : !loading && sel.err ? <EmptyTop label={kind === "past" ? `Top scorer, week ${week}` : `Top pickup, week ${week}`} text={sel.err} /> : null)}
      </aside>

      <section className="card wv-card" aria-label="Waiver targets">
        <div className="wv-head wv2-head wv3-head">
          <span className="wv3-head-t">
            <b>Available</b>
            <span aria-live="polite">{kind === "current"
              ? <><em>{ready}</em> can help this week{shown.length - passedHere > ready ? <> · <em>{shown.length - passedHere - ready}</em> can't</> : null}{passedHere ? <> · <em>{passedHere}</em> passed</> : null}</>
              : loading ? <><em>–</em> {kind === "past" ? <>would have helped<span className="wv3-wk"> in week {week}</span></> : <>can help in week {week}</>}</>
              : kind === "past" ? <><em>{ready}</em> would have helped<span className="wv3-wk"> in week {week}</span></>
              : <><em>{ready}</em> can help in week {week}{byes ? <> · <em>{byes}</em> on bye</> : null}{passedHere ? <> · <em>{passedHere}</em> passed</> : null}</>}</span>
          </span>
          <WeekStepper week={week} onChange={(w) => { setWeek(w); setOpen(null); }} className="wv3-weeknav" />
        </div>
        {sel.err && kind !== "current" && <p className="small muted wv3-err">{sel.err}</p>}
        <div className={`wv-ta wv2-bar${findOpen || q ? " is-finding" : ""}`}>
          {/* Phones: search lives behind an icon button beside Watching and Sort, and opens over that row */}
          <button className="wv3-find" aria-label="Search players" aria-expanded={findOpen || !!q} onClick={() => { taField.current?.querySelector("input")?.focus(); setFindOpen(true); }}><Icon name="search" size={18} /></button>
          <label className="psr-field wv-search" ref={taField}>
            <Icon name="search" size={18} />
            <span className="sr-only">Search free agents</span>
            <input value={q} onChange={(e) => { setQ(e.target.value); setSuggest(true); setHi(0); }} onFocus={() => setSuggest(true)} onBlur={(e) => { const empty = !e.currentTarget.value; window.setTimeout(() => { setSuggest(false); if (empty) setFindOpen(false); }, 120); }} onKeyDown={onKey}
              placeholder="Search players…" autoComplete="off" spellCheck={false} role="combobox" aria-expanded={suggest && hits.length > 0} aria-controls="wv-ta-list" aria-autocomplete="list" aria-activedescendant={suggest && hits[hi] ? `wv-ta-${hits[hi].fa.id}` : undefined} />
            {(q || findOpen) && <button className="psr-clear" onClick={() => { setQ(""); setSuggest(false); setFindOpen(false); }} aria-label={q ? "Clear search" : "Close search"}><Icon name="x" size={16} /></button>}
          </label>
          <button className="wv3-watching" aria-pressed={onlyWatch} aria-label={`Show only players you're watching (${watchCount})`} onClick={() => setOnlyWatch(!onlyWatch)}>
            <Icon name="star" size={16} /><span className="wv3-watching-l">Watching</span><small>{watchCount}</small>
          </button>
          <Select className="wv2-sort" size="pill" chevron="switch" aria-label="Sort" header="Sort by" value={sort} onChange={setSort}
            options={[
              { value: "fit" as typeof sort, label: "Best fit" },
              { value: "trend" as typeof sort, label: "Trending" },
              { value: "proj" as typeof sort, label: kind === "past" ? "Scored" : "Projected" },
            ]} />
          {suggest && hits.length > 0 && (
            <ul className="wv-ta-list" id="wv-ta-list" role="listbox" ref={taList} style={taMax ? { maxHeight: taMax, overflowY: "auto" } : undefined}>
              {hits.map((e, i) => (
                <li key={e.fa.id} id={`wv-ta-${e.fa.id}`} role="option" aria-selected={i === hi}>
                  <button tabIndex={-1} onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(e)} onMouseEnter={() => setHi(i)} className={`${i === hi ? "on" : ""}${e.avail ? " off" : ""}`}>
                    <b className={`lu-pos p-${e.fa.pos}`}>{e.fa.pos}</b>
                    <span className="wv-ta-n"><span><Hit name={e.fa.name} term={term} /></span><small>{e.fa.nfl}</small></span>
                    {e.avail ? <span className={`wv-tag t-${e.avail}`}>{AVAIL_LABEL[e.avail]}</span> : <span className="wv-ta-p">{e.value.toFixed(1)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div ref={posRef} className={`wv2-pos wv2-pos-${tabs.length}`} role="group" aria-label="Position">
          {tabs.map((p) => {
            const n = all.filter((e) => p === "ALL" || e.fa.pos === p).length;
            return <button key={p} aria-pressed={pos === p} onClick={() => setPos(p)}><span>{p === "ALL" ? "All" : p}</span><small>{n}</small></button>;
          })}
        </div>
        <div ref={listRef} className={`wv3-list k-${kind}`} aria-busy={loading}>
        {shown.length === 0 && <p className="small muted" style={{ padding: "8px 16px 18px" }}>{onlyWatch ? `You're not watching anyone${pos === "ALL" ? "" : ` at ${pos}`} yet. Tap the star on a player to watch him for week ${target}.` : q.trim() ? `No free agent matches "${q.trim()}". Rostered players are in Build a deal search.` : `No ${pos === "ALL" ? "players" : pos} available right now. Check back after waivers run.`}</p>}
        {shown.map((e) => {
          const r = e.r;
          const isOpen = !!r && open === e.fa.id;
          const kd = kind === "current" ? r?.kdef : undefined;
          const drop = r ? recDrop(r) : null;
          const game = gameOf(e.fa);
          const off = kind === "current" ? !r : e.pts === null;
          // Passed on for good, or skipped this week ("Not right now"): dimmed, with a way back instead of the stats
          const skip = !e.no && skipped(e.fa.id);
          const shelved = e.no || skip;
          const dim = (kind === "current" && !!r && !!e.avail) || shelved;
          const st = gameNow(e.fa.nfl);
          const isWatched = watched(e.fa.id);
          const num = (n: number | null | undefined) => (n === null ? "Bye" : n === undefined ? "–" : n.toFixed(1));
          // Actual points keep Sleeper's two decimals, so they match the Sleeper app exactly
          const act = (n: number | null | undefined) => (n === null ? "Bye" : n === undefined ? "–" : n.toFixed(2));
          const played = kind === "current" && e.avail === "played";
          // The box on the right: this week's projection, points so far for anyone who already played, or the selected week's number
          const box = kind === "past" ? { k: "Scored", v: act(e.pts) }
            : kind === "future" ? { k: "Proj", v: num(e.pts) }
            : played ? { k: st === "in_game" ? "So far" : "Scored", v: e.c ? act(e.c.pts) : sel.loading ? "–" : "0.00" }
            : { k: "Proj", v: e.value.toFixed(1) };
          // Opponent right after the team, then when it kicks off as its own piece, so a narrow row drops the time
          // to the next line whole instead of cutting it off
          const src = isSpecialFA(e.fa) ? e.fa : PLAYERS[e.fa.id];
          const meta = kind === "current"
            ? (e.fa.pos === "DEF" ? oppShort(e.fa) && <GameBits opp={oppShort(e.fa)} when={kickWhenIn(e.fa.nfl, oppShort(e.fa), WEEK)} />
              : game && r && <GameBits opp={oppText(src?.opp)} when={kickWhen(src ?? {})} />)
            : e.c?.opp ? <GameBits opp={e.c.opp} when={kind === "future" ? kickWhenIn(e.fa.nfl, e.c.opp, week) : ""} /> : null;
          // What he did that week, or so far this week: one line under the name, cut short rather than wrapping
          const line = kind === "past" ? (e.pts === null ? null : !e.c ? null : e.c.line ?? "Didn't play") : kind === "current" && !r && e.c?.played ? e.c.line : null;
          // Every row carries the same cells in the same order, so the columns never shift between rows, tabs or weeks
          const cant = kind === "current" && !r ? cantLabel(e.fa, e.avail) : null;
          const stats: ReactNode = e.no ? <span className="ps-again-line"><span>Sources won't suggest him.</span><button className="linkish ps-again" onClick={() => unpass(e)}>Interested again</button></span>
            : skip ? <span className="ps-again-line"><span>Skipped this week.</span><button className="linkish ps-again" onClick={() => unsnooze(e)}>Suggest again</button></span> : <>
            <span className="wv-c-lu"><i>Your lineup</i><b className={!cant && e.gain > 0.05 ? "good" : "flat"}>{cant ?? (loading ? "–" : e.pts === null ? "Bye" : e.gain > 0.05 ? fmt(e.gain) : "No change")}</b></span>
            <span className="wv-c-bid"><i>{FAAB.enabled ? SUGG_BID : "Tier"}</i><b>{bidCell(e.fa, r)}</b></span>
            <LastThree v={e.l3} weeks={l3Weeks} />
          </>;
          const inner = <>
            <span className="wv-rank" aria-hidden="true" />
            <Avatar p={e.fa} size={40} />
            <span className="wv-who">
              <span className="wv-name"><span className="wv-nm">{e.fa.name}</span>{e.fa.trend === "up" && kind === "current" && r && <Tooltip content="Trending up: adds are rising across Sleeper"><span className="wv-trend up" aria-label="Trending up">▲</span></Tooltip>}
                {e.no ? <span className="wv-tag ps-tag">Not interested</span> : skip ? <span className="wv-tag ps-tag">Skipped this week</span> : e.tag && (e.tag.tip ? <Tooltip content={e.tag.tip}><span className={`wv-tag ${e.tag.cls}`}>{e.tag.label}</span></Tooltip> : <span className={`wv-tag ${e.tag.cls}`}>{e.tag.label}</span>)}
                {kd?.fix && kd.lead && <span className="wv-tag t-fix">{kd.fix === "empty" ? "Fills slot" : "Must fix"}</span>}</span>
              <span className="wv-meta"><b className={`lu-pos p-${e.fa.pos}`}>{e.fa.pos}</b>{e.fa.nfl}{meta}{e.fa.rookie && <span className="wv-flag">Rookie</span>}{line && <Tooltip content={line}><span className="wv-line">· {line}</span></Tooltip>}</span>
            </span>
            <span className={`wv-proj${box.k !== "Proj" ? " wv3-scored" : ""}`}><span>{box.k}</span><b>{box.v}</b></span>
            <span className="wv-stats">{stats}</span>
            {/* Reserved end column, kept the same width on every row */}
            <span className="wv-end" aria-hidden="true" />
          </>;
          // This week, a player Sleeper has locked (his game started, or his team is off) or who can't help still takes
          // the tap: it shakes and says why instead of doing nothing (deny.ts)
          const lockWhy = kind === "current" && !r && !shelved ? lockWhyText(e.fa, e.avail) : null;
          const watchLabel = isWatched ? `Watching for week ${watch[e.fa.id]}. Tap to stop` : `Watch for week ${target}`;
          // The claim sheet's actions: in the hero from 768px, docked to the sheet's bottom edge on phones
          const claimActs = isOpen && r && !shelved ? <>
            <a className="btn btn-primary btn-sm ph-cta" href={sleeperUrl("players")} target="_blank" rel="noreferrer" onClick={() => onToast(`Opening Sleeper. ${FAAB.enabled ? `Sugg. bid ${bidText(r.bid, r.fa)} for` : "Claim"} ${r.fa.name}, drop ${drop?.name ?? "nobody"}.`)}>
              <PlatformLogo size={16} />Claim
            </a>
            <WatchButton on={isWatched} name={e.fa.name} week={isWatched ? watch[e.fa.id] : target} onToggle={() => toggleWatch(e)} />
            <button className="snooze-btn ph-snooze" onClick={() => { snooze(e); setOpen(null); }} aria-label={`Not right now: skip ${e.fa.name} this week`}>Not now</button>
          </> : null;
          return (
            <div key={e.fa.id} data-id={e.fa.id} className={`wv ps-wv${dim ? " wv-dim" : ""}${off ? " wv-off" : ""}${isWatched ? " wv3-on" : ""}${shelved ? " ps-no" : ""}`}>
              {r && !shelved ? <button className="wv-row" onClick={() => setOpen(e.fa.id)} aria-haspopup="dialog">{inner}</button>
                : lockWhy ? <button className="wv-row wv-locked" aria-disabled="true" onClick={denyOn(lockWhy)}>{inner}</button>
                : <div className="wv-row">{inner}</div>}
              <Tooltip content={watchLabel}>
                <button className="wv3-watch" aria-pressed={isWatched} aria-label={`${watchLabel}: ${e.fa.name}`} onClick={() => toggleWatch(e)}><Icon name="star" size={16} /><span className="wv-act-t" aria-hidden="true">{isWatched ? "Watching" : "Watch"}</span></button>
              </Tooltip>
              {!shelved && <span className="ps-end">
                <Tooltip content="Not right now. Skips him this week">
                  <button className="ps-x" aria-label={`Not right now: skip ${e.fa.name} this week`} onClick={() => snooze(e)}><Icon name="x" size={16} /><span className="wv-act-t" aria-hidden="true">Not now</span></button>
                </Tooltip>
              </span>}
              {isOpen && r && !shelved && (
                <DetailSheet className="wv-sheet pt-sheet ph-sheet" label={`${r.fa.name}, claim details`} onClose={() => setOpen(null)}
                  title={<PlayerBar s={e.fa} />} foot={<div className="ph-dock">{claimActs}</div>}>
                {(closeSheet) => {
                const subj = { id: e.fa.id, name: e.fa.name, pos: e.fa.pos, nfl: e.fa.nfl, proj: e.fa.proj, rookie: "rookie" in e.fa ? e.fa.rookie : undefined };
                const tabOpts: { v: SheetTab; label: string; icon: IconName }[] = [{ v: "main", label: "Claim", icon: "userPlus" }, { v: "log", label: "Game log", icon: "table" }, ...(e.fa.pos === "DEF" ? [] : [{ v: "depth" as SheetTab, label: "Depth chart", icon: "listOrdered" as IconName }])];
                // The hero and the tabs scroll with the body; the tabs stick under the sheet's top and hold their place on a switch
                const lead = <>
                  <PlayerHero s={e.fa}
                    meta={kind === "current" ? (gameOf(e.fa) || undefined) : undefined}
                    status={<StatusPill p={PLAYERS[e.fa.id] ?? { id: e.fa.id, name: e.fa.name, pos: "WR", nfl: e.fa.nfl, proj: e.fa.proj, status: isSpecialFA(e.fa) ? e.fa.status : undefined }} />}
                    actions={claimActs} />
                  <div className="ph-stick">
                    <SheetTabs value={e.fa.pos === "DEF" && sheetTab === "depth" ? "main" : sheetTab} options={tabOpts} onChange={(t) => { keepTabs(document.querySelector<HTMLElement>(".pt-sheet .ds-body")); setSheetTab(t); }} />
                  </div>
                </>;
                const t = e.fa.pos === "DEF" && sheetTab === "depth" ? "main" : sheetTab;
                if (t === "log") return <>{lead}<GameLogTab key={e.fa.id} s={subj} /></>;
                if (t === "depth") return <>{lead}<DepthTab key={e.fa.id} s={subj} onOpen={(id) => { const n = PLAYERS[id]; if (n) closeSheet(() => setOther(n)); }} /></>;
                return (<>{lead}
                <div className="wv-detail">
                  {e.fit && !kd && <p className="small ps-fit">{e.fit}</p>}
                  <p className="small">{kind === "current" ? (kd ? kd.line : r.fa.why)
                    : kind === "future" ? (e.pts === null ? `${e.fa.name} is on bye in week ${week}. Projects ${(r.kdef ? r.fa.proj : r.value).toFixed(1)} a week the rest of the way.` : `${e.fa.name} projects ${num(e.pts)}${e.c?.opp ? ` ${e.c.opp}` : ""} in week ${week}, and ${(r.kdef ? r.fa.proj : r.value).toFixed(1)} a week the rest of the way.`)
                    : `${e.fa.name} scored ${act(e.pts)} in week ${week}${e.c?.line ? ` (${e.c.line})` : ""}. Projects ${(r.kdef ? r.fa.proj : r.value).toFixed(1)} a week the rest of the way.`}</p>
                  <div className="wv-grid">
                    <div><span className="eyebrow">Add</span><p className="small"><b>{r.fa.name}</b>, {kd ? `${r.fa.pos} stream for this week` : `${r.tier.toLowerCase()} tier`}</p></div>
                    <div><span className="eyebrow">Drop</span><p className="small">{kd?.drop ? <><b>{kd.drop.name}</b> ({drop!.note}). Swap {r.fa.pos} for {r.fa.pos}, your bench stays put</>
                      : drop ? <><b>{drop.name}</b> ({drop.note}, the least you'd lose)</> : r.noDrop ? "Nobody on your bench is worth cutting for him" : "Open roster spot"}</p></div>
                    <div><span className="eyebrow">{FAAB.enabled ? SUGG_BID : "Claim"}</span><p className="small">{FAAB.enabled ? (r.kdef || isSpecialFA(r.fa) ? <><b className="sugg-bid-amt">{bidText(r.bid, r.fa)}</b>. Kickers and defenses rarely draw real bids.</> : <><b className="sugg-bid-amt">{bidText(r.bid)}</b>. {bidSourceNote()}</>) : r.kdef ? <>Low priority claim. Don't spend a high waiver spot on a {r.fa.pos === "K" ? "kicker" : "defense"}</> : <>Rolling waiver priority in your league</>}</p></div>
                  </div>
                  {FAAB.enabled && (r.kdef ? <SpecialBidNote /> : <BidHistory tier={r.tier as BidTier["tier"]} range={r.bid} />)}
                  <p className="tiny muted wv-claim-note">Claim opens Sleeper's Players tab. Claims are placed in your league app. Sources never bids for you.</p>
                </div>
                </>);
                }}
                </DetailSheet>
              )}
            </div>
          );
        })}
        </div>
      </section>
      </div>
      {other && <PlayerSheet p={other} onClose={() => setOther(null)} />}
    </>
  );
}

/** The Top pickup card. This week it's the engine's pick; other weeks the caller passes that week's numbers. */
function TopCard({ rec: top, eyebrow, stat, why, plan, starts, irMove, onToast, game: weekGame, onSnooze, skel = false }: {
  rec: WaiverRec;
  /** Drawn as a loading skeleton: the same frame, text behind soft bars, nothing to tap */
  skel?: boolean; eyebrow: string; stat: { dt: string; dd: string }; why: string | null; plan: ReactNode; starts: boolean; irMove?: string; onToast: (m: string) => void;
  /** "Not right now": skips him this week and the next best fills in. He can come back next week. */
  onSnooze: () => void;
  /** That week's opponent, for a week other than this one. */
  game?: string;
}) {
  const game = weekGame ?? gameOf(top.fa);
  const kd = top.kdef;
  const drop = recDrop(top);
  const hold = useHoldHeight<HTMLElement>(top.fa.id);
  return (
    <section ref={hold} className={`card topk${starts ? " gain" : ""}${skel ? " is-skel" : ""}`} aria-label={skel ? undefined : "Top pickup"}
      {...(skel ? { "aria-hidden": true, inert: "" } : {})}>
      <div className="topk-head"><span className="topk-label">{eyebrow}</span><AiLabel /></div>
      <div className="topk-who">
        <Avatar p={top.fa} size={52} />
        <div className="topk-id">
          <h3 className="topk-name">{top.fa.name}</h3>
          <span className="wv-meta"><b className={`lu-pos p-${top.fa.pos}`}>{top.fa.pos}</b>{top.fa.nfl}{game && <span className="lu-game">{game}</span>}</span>
        </div>
      </div>
      <dl className="topk-stats">
        <div><dt>{stat.dt}</dt><dd>{stat.dd}</dd></div>
        <div><dt>{kd ? "Season per week" : "ROS per week"}</dt><dd>{(kd ? top.fa.proj : top.value).toFixed(1)}</dd></div>
        <div className="topk-bid"><dt>{FAAB.enabled ? <Tooltip content={bidSourceNote()} focusable><span className="sugg-bid-lbl">{SUGG_BID}</span></Tooltip> : "Claim"}</dt><dd>{FAAB.enabled ? bidText(top.bid, top.fa) : "Priority"}</dd></div>
      </dl>
      <p className="topk-why">{why}</p>
      <ul className="topk-plan">
        <li className={starts ? "good" : ""}><Icon name={starts ? "check" : "eye"} size={16} />{plan}</li>
        <li><Icon name="trade" size={16} />
          {kd?.drop ? <span>Drop <b>{kd.drop.name}</b> ({drop!.note}). A straight {top.fa.pos} swap.</span>
            : irMove ? <span>Move <b>{irMove}</b> to IR first. No drop needed.</span>
            : drop ? <span>Drop <b>{drop.name}</b> ({drop.note}).</span>
            : top.noDrop ? <span>Nobody on your bench is worth cutting for him.</span>
            : <span>You have an open roster spot.</span>}
        </li>
      </ul>
      <div className="ps-actions">
        <a className="btn btn-primary topk-cta" href={sleeperUrl("players")} target="_blank" rel="noreferrer"
          onClick={() => onToast(`Opening Sleeper. ${FAAB.enabled ? `Sugg. bid ${bidText(top.bid, top.fa)} for` : "Claim"} ${top.fa.name}${drop && (kd?.drop || !irMove) ? `, drop ${drop.name}` : ""}.`)}>
          <PlatformLogo size={18} />Claim in Sleeper
        </a>
        <button className="snooze-btn" onClick={onSnooze} aria-label={`Not right now: skip ${top.fa.name} this week`}>Not right now</button>
      </div>
    </section>
  );
}

/** Top pickup with nobody to pick, same frame so the column doesn't jump. */
function EmptyTop({ label, text }: { label: string; text: string }) {
  return <section className="card topk wv3-topk-empty" aria-label="Top pickup"><div className="topk-head"><span className="topk-label">{label}</span></div><p className="small muted">{text}</p></section>;
}

/** Keeps a card at the tallest it's been for the same slot, so swapping in the next pick never pulls the page up. */
export function useHoldHeight<T extends HTMLElement>(key: string) {
  const el = useRef<T | null>(null);
  const max = useRef(0);
  useLayoutEffect(() => {
    const n = el.current;
    if (!n) return;
    n.style.minHeight = max.current ? `${max.current}px` : "";
    max.current = Math.max(max.current, n.offsetHeight);
  }, [key]);
  return el;
}

/** K/DEF bids: the league's own winning K/DEF claims when there are a few, else the usual $0-$1. */
function SpecialBidNote() {
  const { bids, estimated } = specialBidRange();
  return <p className="tiny muted wv-kdef-bid">{estimated
    ? `Your league doesn't have enough K/DEF claims yet. Kickers and defenses usually go for ${bidRange(specialBidRange().bid)}, so bid low.`
    : `Winning K/DEF bids in your league this season: ${bids.slice().sort((a, b) => a - b).map((b) => `$${bidDollars(b, true)}`).join(", ")}.`}</p>;
}

function BidHistory({ tier, range }: { tier: string; range: [number, number] }) {
  const { bids, estimated } = bidsFor(tier as "Starter" | "Flex" | "Depth" | "Stash");
  const max = Math.max(30, ...bids, range[1]);
  return (
    <div className="bid-hist">
      <span className="tiny muted">{estimated ? `Not enough winning ${tier.toLowerCase()} bids in your league yet, so this shows a typical range` : `Winning ${tier.toLowerCase()} bids in your league this season (${bids.length})`}</span>
      <div className="bid-track" role="img" aria-label={`Winning bids: ${bids.join(", ")} percent`}>
        <span className="bid-range" style={{ left: `${(range[0] / max) * 100}%`, width: `${Math.max(2, ((range[1] - range[0]) / max) * 100)}%` }} />
        {bids.map((b, i) => <Tooltip key={i} content={<>A winning bid of <b>{b}%</b> of budget</>}><span className="bid-dot" style={{ left: `${(b / max) * 100}%` }} /></Tooltip>)}
      </div>
      <div className="bid-scale"><span>0%</span><span>{Math.round(max / 2)}%</span><span>{max}%</span></div>
    </div>
  );
}
