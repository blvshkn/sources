/** Waiver results (approved Oct 22, motion-picks.html "Waiver results"): your claims from the latest run, on Waivers.
 *  The first time a result shows this visit it plays once. Won: a 16-bit check stamps in, the bid turns green and
 *  "Claimed for $31. He's yours." morphs in. Outbid: the bid gets a red strike and the line says by how much and who
 *  got him, so you learn something. Seen already this visit, or reduced motion: the result, settled. */
import { useEffect, useState } from "react";
import { DEADLINES, FAAB, LEAGUE, TEAMS, type ClaimResult } from "../data";
import { firstTime } from "../motionOnce";
import { mo } from "../motion";
import { Morph, Px } from "../gameDayMotion";
import { Avatar } from "./Avatar";

const CHECK = ["........g", ".......gg", "......gg.", "g....gg..", "gg..gg...", ".gggg....", "..gg....."];
const CHECK_C = { g: "#7BE08F" };
const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const money = (n: number) => `$${n}`;
/** "Ran Wed" for a live run. The demo's run is a fixed sample, so it just says when claims run. */
const runDay = (at: number) => (LEAGUE.mode === "demo" ? "Ran Wednesday" : `Ran ${new Date(at).toLocaleDateString([], { weekday: "short" })}`);

function line(c: ClaimResult): string {
  const faab = FAAB.enabled;
  if (c.won) return faab ? `Claimed for ${money(c.bid)}. He's yours.` : "Claimed. He's yours.";
  const who = c.winnerId ? TEAMS.find((t) => t.id === c.winnerId)?.manager : undefined;
  if (faab && c.winBid !== undefined && who) return `Outbid by ${money(Math.max(0, c.winBid - c.bid))}. He went to ${who} for ${money(c.winBid)}.`;
  if (who) return `${who} got him first.`;
  return "Someone else got him first.";
}

function Result({ c }: { c: ClaimResult }) {
  // One time: the first time this result shows this visit
  const [play] = useState(() => firstTime(`claim:${c.id}`) && !reduce());
  const [shown, setShown] = useState(!play);
  useEffect(() => {
    if (!play) return;
    // A beat on the run's time first, then the result morphs in
    const t = window.setTimeout(() => setShown(true), mo(171));
    return () => window.clearTimeout(t);
  }, [play]);
  const state = shown ? (c.won ? " is-won" : " is-lost") : "";
  return (
    <li className={`nm-claim${state}${play ? " nm-play" : ""}`}>
      <Avatar p={c.player} size={36} />
      <span className="nm-claim-who">
        <b>{c.player.name}</b>
        <span className="nm-claim-why">
          {c.won && shown && <span className="nm-stamp" aria-hidden="true"><Px rows={CHECK} colors={CHECK_C} /></span>}
          <Morph k={shown ? "result" : "wait"}>{shown ? line(c) : DEADLINES.waivers}</Morph>
        </span>
      </span>
      {FAAB.enabled && <span className="nm-bid"><b className="num">{money(c.bid)}</b><small>your bid</small></span>}
    </li>
  );
}

/** Nothing renders when there are no results from the latest run. */
export function ClaimResults() {
  const list = LEAGUE.claimResults ?? [];
  if (!list.length) return null;
  return (
    <section className="card nm-claims" aria-label="Waiver results">
      <div className="nm-claims-head"><h2 className="section-title">Waiver results</h2><span className="nm-claims-note">{runDay(list[0].at)}</span></div>
      <ul className="nm-claims-list">{list.map((c) => <Result key={c.id} c={c} />)}</ul>
    </section>
  );
}
