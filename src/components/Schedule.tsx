import { Player } from "../data";
import { seasonFor, scheduleRead } from "../schedule";
import { PosBadge } from "./ui";

/** A player's season as a row of weeks: points behind, opponents and matchup tone ahead, playoffs marked. */
export function ScheduleStrip({ p, compact = false }: { p: Player; compact?: boolean }) {
  const cells = seasonFor(p);
  const shown = compact ? cells.filter((c) => !c.past) : cells;
  const read = scheduleRead(cells);
  return (
    <div className={`sch${compact ? " compact" : ""}`}>
      <div className="sch-row" role="list" aria-label={`${p.name} schedule`}>
        {shown.map((c) => (
          <span key={c.week} role="listitem" className={`sch-c${c.past ? " past" : ""}${c.tone ? ` t-${c.tone}` : ""}${!c.opp ? " bye" : ""}${c.playoff ? " po" : ""}`}
            aria-label={`Week ${c.week}: ${!c.opp ? "bye" : c.opp.replace(/^v/, "vs ").replace(/^@/, "at ")}${c.past ? (c.pts !== undefined ? `, scored ${c.pts}` : "") : c.proj !== undefined ? `, projects ${c.proj}${c.tone ? `, ${c.tone} matchup` : ""}` : ""}`}>
            <i>W{c.week}</i>
            <b>{!c.opp ? "Bye" : c.opp.replace(/^v/, "")}</b>
            <small>{c.past ? (c.pts !== undefined ? c.pts.toFixed(1) : "–") : c.proj !== undefined ? c.proj.toFixed(1) : ""}</small>
          </span>
        ))}
      </div>
      <p className="sch-read"><span>Next 4: <b>{read.next}</b></span><span>Playoffs: <b>{read.playoffs}</b></span></p>
    </div>
  );
}

/** Every player in a deal, each with their remaining schedule, so you can see who has the easier road. */
export function DealSchedule({ give, get, bare = false, sendLabel = "You send", getLabel = "You get" }: { give: Player[]; get: Player[]; bare?: boolean; sendLabel?: string; getLabel?: string }) {
  if (!give.length && !get.length) return null;
  const block = (title: string, ps: Player[]) => ps.length > 0 && (
    <div className="dsch-side">
      <span className="eyebrow">{title}</span>
      {ps.map((p) => (
        <div key={p.id} className="dsch-p">
          <span className="dsch-who"><PosBadge pos={p.pos} /><b>{p.name}</b><small>{p.nfl}</small></span>
          <ScheduleStrip p={p} compact />
        </div>
      ))}
    </div>
  );
  return (
    <section className="dsch" aria-label="Schedules ahead">
      <div className="dsch-head">{!bare && <b>Schedules ahead</b>}<span className="sch-key"><i className="t-good" />Good<i className="t-ok" />Even<i className="t-tough" />Tough<i className="po" />Playoffs</span></div>
      {block(sendLabel, give)}
      {block(getLabel, get)}
    </section>
  );
}

/** One player's next four weeks in a word: good if good matchups outnumber tough ones, tough if the reverse. */
function lean(p: Player): "good" | "tough" | "even" {
  const next = seasonFor(p).filter((c) => !c.past).slice(0, 4);
  const g = next.filter((c) => c.tone === "good").length, t = next.filter((c) => c.tone === "tough").length;
  return g > t ? "good" : t > g ? "tough" : "even";
}
/** "2 good, 3 tough" for a group of players, counting each player once by how his next four weeks lean. */
export function scheduleLean(ps: Player[]): string {
  const l = ps.map(lean);
  const g = l.filter((x) => x === "good").length, t = l.filter((x) => x === "tough").length;
  return [g && `${g} good`, t && `${t} tough`].filter(Boolean).join(", ") || "all even";
}
