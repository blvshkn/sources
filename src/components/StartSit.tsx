import { useEffect, useState, type CSSProperties } from "react";
import { LEAGUE, Player, WEEK, YOU, onBye, playerById } from "../data";
import { kickLine, oppAt, useKickoffs } from "../kickoff";
import { eff, round1, scored } from "../engine";
import { seasonFor } from "../schedule";
import { WeekView, loadWeek, peekWeek } from "../weeks";
import { Avatar } from "./Avatar";
import { Icon } from "./ui";
import { Select } from "./Select";
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

/** One compare row: two bars growing out from the middle, the bigger one lit. */
function Bars({ label, a, b, at, bt, wk, dim }: { label: string; a: number; b: number; at: string; bt: string; wk?: boolean; dim?: boolean }) {
  const max = Math.max(a, b, 0.0001);
  return (
    <div className={`sx-row${wk ? " sx-wk" : ""}${dim ? " sx-loading" : ""}`}>
      <span className="sx-label">{label}</span>
      <div className="sx-bars">
        <span className={`sx-bar a${a > b ? " win" : ""}`}><i style={{ "--v": a / max } as CSSProperties} /><b>{at}</b></span>
        <span className={`sx-bar b${b > a ? " win" : ""}`}><i style={{ "--v": b / max } as CSSProperties} /><b>{bt}</b></span>
      </div>
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
    return (
      <Select className={`sx-pick ${side}${p.id === leadId ? " lead" : ""}`} value={p.id} onChange={set} aria-label={`${side === "a" ? "First player" : "Second player"}: ${p.name}`}
        searchPlaceholder="Search your players"
        options={pool.map((o) => ({ value: o.id, label: o.name, hint: `${o.pos}${onIr.has(o.id) ? ", IR slot" : ""}`, match: { pos: o.pos, team: o.nfl }, disabled: o.id === (side === "a" ? bId : aId), why: `${o.name} is already in the other spot. Pick someone else to compare.` }))}>
        <Avatar p={p} size={44} cut />
        <b className="sx-name">{p.name}</b>
        <small className="sx-game">{p.pos} · {p.nfl}{s.game ? ` ${s.game}` : ""}</small>
        <span className="sx-status">{loading ? null : s.avail ? <Tooltip content={s.avail.kind === "bye" ? <>On bye in week <span className="num">{week}</span></> : p.note || (s.avail.kind === "ir" ? "On injured reserve" : s.avail.pill)}><span className={`status status-${s.avail.kind === "bye" ? "BYE" : s.avail.kind === "q" ? "Q" : "O"}`}>{s.avail.pill}</span></Tooltip> : null}</span>
        <span className="sx-change">Change<Icon name="chev" size={12} /></span>
      </Select>
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
      <p className={`sx-verdict${v.flip ? " flip" : ""}${loading ? " sx-loading" : ""}`} aria-live="polite">{v.text}</p>
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
