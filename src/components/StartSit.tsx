import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useErrorHaptic } from "../haptics";
import { Decrypt } from "./Decrypt";
import { LEAGUE, Player, WEEK, YOU, onBye, playerById } from "../data";
import { kickLine, oppAt, useKickoffs } from "../kickoff";
import { eff, round1, scored } from "../engine";
import { seasonFor } from "../schedule";
import { WeekView, loadWeek, peekWeek } from "../weeks";
import { Avatar } from "./Avatar";
import { Icon } from "./ui";
import { Marked } from "./Marked";
import { useDismiss } from "./useDismiss";
import { useKeyboardInset } from "./useKeyboardInset";
import { rankPlayers } from "../search";
import { deny } from "../deny";
import { WeekStepper } from "./WeekStepper";
import { Tooltip } from "./Tooltip";

type Metric = { label: string; get: (p: Player) => number | null; fmt?: (n: number) => string };

const recent = (p: Player) => {
  const pts = Object.keys(LEAGUE.history ?? {}).map(Number).filter((w) => w < WEEK).sort((a, b) => b - a)
    .map((w) => LEAGUE.history![w].points[p.id]).filter((v): v is number => typeof v === "number").slice(0, 3);
  return pts.length ? round1(pts.reduce((a, b) => a + b, 0) / pts.length) : null;
};

/** The rows that don't change with the week. */
const METRICS: Metric[] = [
  { label: "Rest of season, per week", get: (p) => eff(p) },
  { label: "Playoff weeks, per week", get: (p) => (p.playoff ? round1(scored({ ...p, pts: p.playoff, wk: undefined })) : null) },
  { label: "Last 3 games, average", get: recent },
  { label: "Trade value", get: (p) => p.value ?? null, fmt: (n) => Math.round(n).toLocaleString() },
];

/** Why a player can't play (or might not) in a given week. Injury designations only exist for the current week. */
interface Avail { kind: "bye" | "ir" | "out" | "q"; pill: string; say: string; out: boolean }
function availability(p: Player, w: number, bye: boolean): Avail | null {
  if (bye) return { kind: "bye", pill: "Bye", say: "on bye", out: true };
  if (w < WEEK) return null;
  if (p.status === "O" && p.longTerm) {
    const [pill, say] = p.injury === "IR" ? ["IR", "on IR"] : p.injury === "PUP" ? ["PUP", "on the PUP list"] : p.injury === "Sus" ? ["Suspended", "suspended"] : ["Out", "out long term"];
    return { kind: "ir", pill, say, out: true };
  }
  if (w !== WEEK) return null;
  if (p.status === "O") return { kind: "out", pill: "Out", say: "out", out: true };
  if (p.status === "Q") { const d = p.injury === "Doubtful"; return { kind: "q", pill: d ? "Doubtful" : "Questionable", say: d ? "doubtful" : "questionable", out: false }; }
  return null;
}

/** "@KC" / "vKC" from the season grid, as "@ KC" / "v KC". */
const oppText = (o: string) => o.replace(/^(@|v)\s*/, "$1 ");

interface Side { p: Player; pts: number | null; bye: boolean; game: string; avail: Avail | null }

/** One player in one week: points (scored or projected), bye, opponent and availability. `pts` null = unknown. */
function sideFor(p: Player, w: number, view: WeekView | null): Side {
  if (w === WEEK) {
    const bye = onBye(p.nfl);
    const avail = availability(p, w, bye);
    return { p, bye, avail, pts: bye ? 0 : eff(p, true), game: bye ? "" : kickLine(p) };
  }
  const cell = seasonFor(p).find((c) => c.week === w);
  const hasSchedule = LEAGUE.slate ? Object.keys(LEAGUE.slate.opp).length > 0 : true;
  const row = view ? [...view.starters.map((s) => s.p), ...view.bench].find((x) => x?.id === p.id) : undefined;
  const bye = row?.pts === null || (hasSchedule && !!cell && cell.opp === null);
  const avail = availability(p, w, bye);
  let pts: number | null = null;
  if (bye || avail?.out) pts = 0;
  else if (row && row.pts !== null) pts = row.pts;
  else if (w < WEEK) pts = cell?.pts ?? null;
  else pts = cell?.proj ?? (view?.kind === "future" ? 0 : null);
  return { p, bye, avail, pts, game: !bye && cell?.opp ? oppAt(p.nfl, oppText(cell.opp), w) : "" };
}

/** The verdict for a week, saying plainly when someone can't play. */
function verdictFor(A: Side, B: Side, w: number): { text: string; flip: boolean; lead?: string } {
  const past = w < WEEK;
  const wk = `week ${w}`;
  const aOut = !!A.avail?.out, bOut = !!B.avail?.out;
  if (aOut && bOut) {
    const same = A.avail!.say === B.avail!.say;
    return { flip: true, text: same
      ? `${A.p.name} and ${B.p.name} are both ${A.avail!.say} in ${wk}. Neither can help you.`
      : `Neither can play in ${wk}. ${A.p.name} is ${A.avail!.say} and ${B.p.name} is ${B.avail!.say}.` };
  }
  if (aOut || bOut) {
    const [out, ok] = aOut ? [A, B] : [B, A];
    if (past) return { flip: false, lead: ok.p.id, text: `${out.p.name} was ${out.avail!.say} in ${wk}. ${ok.p.name} scored ${(ok.pts ?? 0).toFixed(1)}.` };
    const note = ok.avail?.kind === "q" ? `, though he's ${ok.avail.say}` : "";
    return { flip: false, lead: ok.p.id, text: `${out.p.name} is ${out.avail!.say} for ${wk}. Start ${ok.p.name}${note}.` };
  }
  if (A.pts === null || B.pts === null) return { flip: true, text: `No ${past ? "score" : "projection"} for ${(A.pts === null ? A : B).p.name} in ${wk}.` };
  const gap = round1(Math.abs(A.pts - B.pts));
  const lead = A.pts >= B.pts ? A : B, other = lead === A ? B : A;
  if (past) {
    if (A.pts === 0 && B.pts === 0) return { flip: true, text: `Neither scored in ${wk}.` };
    return gap < 0.1 ? { flip: true, text: `Dead even in ${wk}. Both scored ${A.pts.toFixed(1)}.` }
      : { flip: false, lead: lead.p.id, text: `${lead.p.name} outscored ${other.p.name} by ${gap.toFixed(1)} pts in ${wk}.` };
  }
  if (A.pts === 0 && B.pts === 0) return { flip: true, text: `Neither is projected to play in ${wk}.` };
  // Under a point apart, the projection can't decide it; availability can. The healthy player is the safer start.
  // Rest-of-season value says nothing about this week, so it never breaks the tie.
  if (gap < 1) {
    const aQ = A.avail?.kind === "q", bQ = B.avail?.kind === "q";
    if (aQ !== bQ) {
      const [q, safe] = aQ ? [A, B] : [B, A];
      return { flip: false, lead: safe.p.id, text: `Too close to call on projections. Start ${safe.p.name}, since ${q.p.name} is ${q.avail!.say}.` };
    }
    if (aQ && bQ) return { flip: true, text: `Too close to call, and both are questionable. Check who's active before kickoff.` };
    return { flip: true, text: gap < 0.1 ? `Dead even for ${wk}. Either is a fine start.` : `Too close to call for ${wk}. Either is a fine start.` };
  }
  const but = lead.avail?.kind === "q" ? `, but he's ${lead.avail.say}` : "";
  return { flip: false, lead: lead.p.id, text: `Start ${lead.p.name}. He projects ${gap.toFixed(1)} more points than ${other.p.name} for ${wk}${but}.` };
}

/** One compare row: label on top, two thin bars growing out from the middle, values at the outer ends. The bigger
 *  side is lit green and its value is set bolder. */
function Bars({ label, a, b, at, bt, wk, dim }: { label: string; a: number; b: number; at: string; bt: string; wk?: boolean; dim?: boolean }) {
  const max = Math.max(a, b, 0.0001);
  const aw = a > b ? " win" : "", bw = b > a ? " win" : "";
  return (
    <div className={`sx-row${wk ? " sx-wk" : ""}${dim ? " sx-loading" : ""}`}>
      <span className="sx-label">{label}</span>
      <div className="sx-bars">
        <b className={`sx-val a${aw}`}>{at}</b>
        <span className={`sx-bar a${aw}`}><i style={{ "--v": a / max } as CSSProperties} /></span>
        <span className={`sx-bar b${bw}`}><i style={{ "--v": b / max } as CSSProperties} /></span>
        <b className={`sx-val b${bw}`}>{bt}</b>
      </div>
    </div>
  );
}

/** The search field on each pick: focus it and the roster drops down, type to narrow it, pick in one step.
 *  Same matcher as every other player search (search.ts). Arrows move, Enter picks, Escape or a tap outside closes. */
function PlayerFind({ pool, value, other, irIds, onPick, label }: { pool: Player[]; value: string; other: string; irIds: Set<string>; onPick: (id: string) => void; label: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const field = useRef<HTMLLabelElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const uid = useId().replace(/:/g, "");
  const hits = rankPlayers(q, pool, (p) => ({ name: p.name, pos: p.pos, team: p.nfl }));
  const ok = (i: number) => i >= 0 && i < hits.length && hits[i].item.id !== other;
  const firstOk = () => { for (let i = 0; i < hits.length; i++) if (ok(i) && hits[i].item.id !== value) return i; return hits.findIndex((_, i) => ok(i)); };
  const close = () => { setOpen(false); setQ(""); setHi(-1); };
  const listMax = useKeyboardInset(field, list, open);
  // A tap outside the field and the list closes it, and so does Escape. Focus stays in the field.
  useDismiss(list, close, { open, keep: (t) => !!field.current?.contains(t), restoreFocus: false });
  // A new query puts the best match up top and active
  useEffect(() => { if (open) { setHi(firstOk()); if (list.current) list.current.scrollTop = 0; } }, [q, open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = hi >= 0 ? document.getElementById(`sx-${uid}-${hi}`) : null;
    el?.scrollIntoView({ block: "nearest" });
  }, [hi, uid]);
  const pick = (i: number) => {
    const p = hits[i]?.item;
    if (!p) return;
    if (p.id === other) { deny(document.getElementById(`sx-${uid}-${i}`), `${p.name} is already on the other side. Pick someone else to compare.`); return; }
    if (p.id !== value) onPick(p.id);
    close();
    input.current?.blur();
  };
  const step = (dir: 1 | -1) => setHi((h) => { for (let i = h + dir; i >= 0 && i < hits.length; i += dir) if (ok(i)) return i; return h; });
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else step(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (open) step(-1); }
    else if (e.key === "Enter") { e.preventDefault(); if (!open) setOpen(true); else pick(hi); }
    else if (e.key === "Tab") close();
  };
  const listId = `sx-${uid}-list`;
  return (
    <div className="sx-find">
      <label className="sx-find-field" ref={field}>
        <Icon name="search" size={16} />
        <span className="sr-only">{label}</span>
        <input ref={input} value={q} placeholder="Search your roster" autoComplete="off" spellCheck={false} enterKeyHint="go"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={onKey}
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && hi >= 0 ? `sx-${uid}-${hi}` : undefined} />
        {q && <button type="button" className="sx-find-x" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(""); input.current?.focus(); }}><Icon name="x" size={14} /></button>}
      </label>
      {open && (
        <ul className="sx-ta-list" id={listId} role="listbox" ref={list} aria-label={label} style={listMax ? { maxHeight: listMax } : undefined}>
          {hits.map(({ item: o, match }, i) => {
            const taken = o.id === other, on = o.id === value;
            return (
              <li key={o.id} id={`sx-${uid}-${i}`} role="option" aria-selected={on} aria-disabled={taken || undefined}>
                <button type="button" tabIndex={-1} className={`${i === hi ? "on" : ""}${taken ? " off" : ""}`}
                  onMouseDown={(e) => e.preventDefault()} onPointerMove={() => { if (!taken && hi !== i) setHi(i); }} onClick={() => pick(i)}>
                  <b className={`lu-pos p-${o.pos}`}>{o.pos}</b>
                  <span className="sx-ta-n"><span><Marked name={o.name} marks={match.marks} /></span><small>{o.nfl}{irIds.has(o.id) ? ", IR slot" : ""}{taken ? ", other side" : ""}</small></span>
                  {on ? <Icon name="check" size={16} /> : <span className="sx-ta-p">{eff(o, true).toFixed(1)}</span>}
                </button>
              </li>
            );
          })}
          {!hits.length && <li className="sx-ta-none" role="presentation">{`Nothing on your roster matches "${q.trim()}"`}</li>}
        </ul>
      )}
    </div>
  );
}

/** Head-to-head start/sit: pick two of your players and compare them stat by stat, week by week. */
export function StartSit({ a: a0, b: b0 }: { a?: string; b?: string }) {
  // Active roster by this week's projection, then anyone in an IR slot
  const onIr = new Set(YOU.ir ?? []);
  const pool = [...YOU.roster.map(playerById).sort((x, y) => eff(y, true) - eff(x, true)), ...[...onIr].map(playerById).filter(Boolean)];
  const [aId, setA] = useState(a0 ?? pool[0]?.id);
  const [bId, setB] = useState(b0 ?? pool[1]?.id);
  const [week, setWeek] = useState(WEEK);
  useKickoffs(week);
  const [wv, setWv] = useState<WeekView | null>(null);
  const [err, setErr] = useState<{ week: number; msg: string } | null>(null);
  useErrorHaptic(err);
  useEffect(() => {
    if (week === WEEK || peekWeek(week)) return;
    let live = true;
    setErr(null);
    loadWeek(week).then((v) => live && setWv(v)).catch(() => live && setErr({ week, msg: `Couldn't load week ${week} from Sleeper. Try again in a minute.` }));
    return () => { live = false; };
  }, [week]);
  if (!aId || !bId) return null;
  const A0 = playerById(aId), B0 = playerById(bId);
  const wErr = err?.week === week ? err.msg : null;
  const view = week === WEEK ? null : (wv?.week === week ? wv : peekWeek(week) ?? null);
  const loading = week !== WEEK && !wErr && !view;
  const A = sideFor(A0, week, view), B = sideFor(B0, week, view);
  const v: { text: string; flip: boolean; lead?: string } = wErr ? { text: wErr, flip: true } : loading ? { text: `Loading week ${week}`, flip: false } : verdictFor(A, B, week);
  const leadId = v.lead;

  const Pick = ({ s, set, side }: { s: Side; set: (v: string) => void; side: "a" | "b" }) => {
    const p = s.p;
    const lead = p.id === leadId;
    return (
      <div className={`sx-pick ${side}${lead ? " lead" : ""}`}>
        <Avatar p={p} size={56} cut />
        <div className="sx-who">
          <b className="sx-name">{p.name}</b>
          <small className="sx-game">{p.pos} · {p.nfl}{s.game ? ` ${s.game}` : ""}</small>
          <span className="sx-status">{lead && <span className="sx-lead"><Icon name="check" size={12} />{week < WEEK ? "Scored more" : "Start"}</span>}{loading ? null : s.avail ? <Tooltip content={s.avail.kind === "bye" ? <>On bye in week <span className="num">{week}</span></> : p.note || (s.avail.kind === "ir" ? "On injured reserve" : s.avail.pill)}><span className={`status status-${s.avail.kind === "bye" ? "BYE" : s.avail.kind === "q" ? "Q" : "O"}`}>{s.avail.pill}</span></Tooltip> : null}</span>
        </div>
        <PlayerFind pool={pool} value={p.id} other={side === "a" ? bId : aId} irIds={onIr} onPick={set}
          label={`${side === "a" ? "First player" : "Second player"}, now ${p.name}. Search your roster to change`} />
      </div>
    );
  };

  const cell = (s: Side) => (s.bye ? "Bye" : s.avail?.out ? s.avail.pill : s.pts === null ? "n/a" : s.pts.toFixed(1));
  const rows = METRICS.map((m) => ({ m, a: m.get(A0), b: m.get(B0) })).filter((r) => r.a !== null || r.b !== null);

  return (
    <section className="card sx" aria-labelledby="sx-title" aria-busy={loading}>
      <header className="sx-head">
        <div className="sx-head-text">
          <h2 className="section-title" id="sx-title">Start / Sit compare</h2>
          <p>Pick any two players on your roster.</p>
        </div>
        <WeekStepper week={week} onChange={setWeek} className="sx-weeknav" />
      </header>
      <div className="sx-picks">
        {Pick({ s: A, set: setA, side: "a" })}
        <span className="sx-vs" aria-hidden="true">vs</span>
        {Pick({ s: B, set: setB, side: "b" })}
      </div>
      <p className={`sx-verdict${v.flip ? " flip" : ""}${loading ? " sx-loading" : ""}`}><Decrypt text={v.text} hold={loading} /></p>
      <div className="sx-rows">
        {loading
          ? <Bars label={`Week ${week}`} a={0} b={0} at="" bt="" wk dim />
          : <Bars label={week < WEEK ? `Week ${week}, final` : `Week ${week}`} a={A.pts ?? 0} b={B.pts ?? 0} at={cell(A)} bt={cell(B)} wk />}
        {rows.map(({ m, a, b }) => {
          const f = m.fmt ?? ((n: number) => n.toFixed(1));
          return <Bars key={m.label} label={m.label} a={a ?? 0} b={b ?? 0} at={a === null ? "n/a" : f(a)} bt={b === null ? "n/a" : f(b)} />;
        })}
      </div>
    </section>
  );
}
