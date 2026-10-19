import { useEffect, useRef, useState } from "react";
import { ManagerTag, MyTag, Team, YOU, playerById } from "../data";
import { FAIR_GAP, MultiTrade, Trade as TradeT, fmt, groupPoints, groupsFor, lineupFor, pct, verdictMulti } from "../engine";
import { Icon } from "./ui";
import { TeamAvatar } from "./TeamPicker";
import { PlatformName } from "./PlatformLogo";
import { DealSchedule, scheduleLean } from "./Schedule";
import { Fold } from "./Fold";
import { DealSide, RosterPicker, lockMap, positionSummary, tagMaps } from "./Trade";

export const MAX_PARTNERS = 3;
export interface LegState { team: Team; give: string[]; get: string[] }
type Toggle = (side: "give" | "get", id: string, teamId?: string) => void;
const cls = (n: number) => (n >= 0.05 ? "up" : n <= -0.05 ? "down" : "flat");

/** + Add a team: a menu of the teams not in the deal yet. It opens over the page and pushes nothing. */
export function AddTeam({ teams, onAdd, count }: { teams: Team[]; onAdd: (id: string) => void; count: number }) {
  const full = count >= MAX_PARTNERS + 1;
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!open) return;
    setHi(0);
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    requestAnimationFrame(() => list.current?.focus());
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const pick = (t: Team) => { onAdd(t.id); setOpen(false); };
  const onKey = (e: { key: string; preventDefault(): void }) => {
    if (e.key === "Escape") setOpen(false);
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(teams.length - 1, h + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    if ((e.key === "Enter" || e.key === " ") && teams[hi]) { e.preventDefault(); pick(teams[hi]); }
  };
  return (
    <div className="mt-addteam" ref={wrap}>
      <button className="btn mt-add" aria-haspopup="listbox" aria-expanded={open} disabled={full}
        title={full ? "Sleeper trades top out at 4 teams" : undefined} onClick={() => setOpen((o) => !o)}>
        <Icon name="plus" size={16} /><span>Add a team</span>
      </button>
      {open && (
        <div className="mt-menu">
          <p className="mt-menu-note">Make it a {count + 1}-team trade. <PlatformName size={12} /> takes up to {MAX_PARTNERS + 1} teams in one proposal.</p>
          <ul className="tp-list mt-list" role="listbox" ref={list} tabIndex={-1} aria-label="Add a team to this trade" onKeyDown={onKey}>
            {teams.map((t, i) => (
              <li key={t.id} role="option" aria-selected={false} className={`tp-opt${i === hi ? " hi" : ""}`} onPointerEnter={() => setHi(i)} onClick={() => pick(t)}>
                <TeamAvatar t={t} size={32} />
                <span className="tp-who"><b>{t.name}</b><small>{t.manager} · {t.record}</small></span>
                <Icon name="plus" size={16} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Market value, read from one team's seat: what it gives up against what it gets. */
function valueLine(sends: number, gets: number) {
  const gap = Math.max(sends, gets) > 0 ? (gets - sends) / Math.max(sends, gets) : 0;
  return { gap, text: Math.abs(gap) <= FAIR_GAP ? "Fair on value" : gap > 0 ? `Wins on value by ${pct(gap).slice(1)}` : `Loses on value by ${pct(gap).slice(1)}` };
}

/** The deal panel for 3 and 4 team trades: one column per partner, then a row per team with its lineup change and odds. */
export function MultiDeal({ legs, m, toggle, onRemove, clear, onPitch }: {
  legs: LegState[]; m: MultiTrade | null; toggle: Toggle; onRemove: (id: string) => void; clear: () => void; onPitch: (t: TradeT) => void;
}) {
  const n = legs.length + 1;
  const any = legs.some((l) => l.give.length || l.get.length);
  const allGive = legs.flatMap((l) => l.give), allGet = legs.flatMap((l) => l.get);
  const big = legs.some((l) => l.give.length > 2 || l.get.length > 2) || allGive.length > 3 || allGet.length > 3;
  const empty = legs.find((l) => !l.give.length && !l.get.length);
  const v = m ? verdictMulti(m) : null;
  const youAfterRoster = m ? YOU.roster.filter((id) => !m.give.includes(id)).concat(m.get).filter((id) => !m.youDrop.includes(id)) : YOU.roster;
  const you = m ? valueLine(m.marketGive, m.marketGet) : null;
  return (
    <section className={`card deal mt-deal${any ? "" : " empty"}`} aria-live="polite">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 className="section-title">The deal <small className="mt-count">{n} teams</small></h2>
        {any && <button className="btn btn-sm btn-ghost" onClick={clear}>Clear</button>}
      </div>
      <p className="mt-note"><Icon name="trade" size={14} /><span>Proposed in <PlatformName size={12} /> as one {n}-team trade. All {n} managers have to accept.</span></p>
      <div className="mt-cols" data-cols={legs.length}>
        {legs.map((l) => {
          const others = legs.filter((o) => o.team.id !== l.team.id).flatMap((o) => o.give);
          return (
            <div key={l.team.id} className="mt-col">
              <div className="mt-colhead">
                <TeamAvatar t={l.team} size={28} />
                <span className="mt-who"><b>{l.team.name}</b><small>{l.team.manager}</small></span>
                <button className="mt-x" onClick={() => onRemove(l.team.id)} aria-label={`Take ${l.team.manager} out of the trade`}><Icon name="x" size={14} /></button>
              </div>
              <DealSide title={`You send ${l.team.manager}`} team="your roster" ids={l.give} pool={YOU.roster.filter((id) => !others.includes(id))} onToggle={(id) => toggle("give", id, l.team.id)} className="qs-give" />
              <DealSide title={`${l.team.manager} sends you`} team={`${l.team.manager}'s roster`} ids={l.get} pool={l.team.roster} onToggle={(id) => toggle("get", id, l.team.id)} className="qs-get" />
            </div>
          );
        })}
      </div>
      {!m || !v ? (
        <p className="empty-deal">{!any ? "Add players to each team's column, or tap them on the rosters below." : empty ? `Add a player to or from ${empty.team.manager}, or take them out of the trade.` : !allGive.length ? "Now pick who you'd send." : "Now pick who you'd get back."}</p>
      ) : (
        <div className="mt-read">
          <div className="mt-main">
          <ul className="mt-teams" aria-label="How each team does">
            <li className="mt-team you">
              <span className="mt-av you-dot" aria-hidden="true">You</span>
              <span className="mt-tw"><b>You</b><small>{m.youBefore.toFixed(1)} to {m.youAfter.toFixed(1)} pts/wk</small></span>
              <span className={`mt-d numeral ${cls(m.youDelta)}`}>{fmt(m.youDelta)}</span>
              <span className="mt-side">
                <b className={`tc-fair ${you!.gap >= -FAIR_GAP ? "good" : "bad"}`}>{you!.text.replace("Wins", "You win").replace("Loses", "You lose").replace("Fair on value", "Fair")}</b>
                <small>{m.marketGive.toLocaleString()} out, {m.marketGet.toLocaleString()} in</small>
              </span>
            </li>
            {m.legs.map((r) => {
              const val = valueLine(r.trade.marketGet, r.trade.marketGive);
              const tone = r.accept.label === "Likely yes" ? "good" : r.accept.label === "Worth a shot" ? "warn" : "bad";
              return (
                <li key={r.team.id} className="mt-team">
                  <TeamAvatar t={r.team} size={32} />
                  <span className="mt-tw"><b>{r.team.manager}</b><small>{r.trade.themBefore.toFixed(1)} to {r.trade.themAfter.toFixed(1)} pts/wk{r.accept.theirBlockers.length ? "" : ` · ${val.text.toLowerCase()}`}</small></span>
                  <span className={`mt-d numeral ${cls(r.trade.themDelta)}`}>{fmt(r.trade.themDelta)}</span>
                  <span className="mt-side">
                    <b className={`mt-acc ${tone}`}>{r.accept.label}</b>
                    <small>{Math.round(r.accept.p * 100)}% accepts</small>
                  </span>
                  {r.accept.theirBlockers.length > 0 && <span className="mt-why">{r.accept.theirBlockers.map((b) => b.charAt(0).toUpperCase() + b.slice(1)).join(" · ")}</span>}
                </li>
              );
            })}
          </ul>
          </div>
          <div className="mt-aside">
          <div className={`verdict ${v.tone}`}><b>{v.label}</b><span className="small">{v.line}</span></div>
          {(m.youDrop.length > 0 || m.legs.some((r) => r.trade.themDrop.length)) && (
            <p className="small drop-note">
              {m.youDrop.length > 0 && <>You'd drop {m.youDrop.map((id) => playerById(id).name).join(", ")} to make room. </>}
              {m.legs.filter((r) => r.trade.themDrop.length).map((r) => <span key={r.team.id}>{r.team.manager} would drop {r.trade.themDrop.map((id) => playerById(id).name).join(", ")}. </span>)}
              Counted in the numbers above.
            </p>
          )}
          {m.warnings.map((w) => <div key={w} className="warning"><Icon name="alert" size={16} /><span>{w}</span></div>)}
          <div className="mt-pitch">
            <p className="tiny muted">Propose the whole trade in <PlatformName size={12} />, then send each manager a pitch about their part of it.</p>
            <div className="mt-pitch-btns">
              {m.legs.map((r, i) => (
                <button key={r.team.id} className={`btn${i === 0 ? " btn-primary" : ""}`} onClick={() => onPitch(r.trade)}><Icon name="pen" size={16} />Pitch {r.team.manager}</button>
              ))}
            </div>
          </div>
          </div>
          <Fold id="trade.bars" title="Position breakdown" auto={!big} className="fold-bars" summary={positionSummary(YOU.roster, youAfterRoster)}>
            <PositionDeltas m={m} youAfter={youAfterRoster} />
          </Fold>
          <Fold id="trade.sched" title="Schedules ahead" auto={!big} className="fold-sch"
            summary={`You send ${scheduleLean(m.give.map(playerById))} · You get ${scheduleLean(m.get.map(playerById))}`}>
            <DealSchedule bare give={m.give.map(playerById)} get={m.get.map(playerById)} />
          </Fold>
        </div>
      )}
    </section>
  );
}

/** Each slot group's change for every team in the deal, you first. */
function PositionDeltas({ m, youAfter }: { m: MultiTrade; youAfter: string[] }) {
  const cols = [
    { id: "you", name: "You", before: groupPoints(lineupFor(YOU.roster)), after: groupPoints(lineupFor(youAfter)) },
    ...m.legs.map((r) => {
      const after = r.team.roster.filter((id) => !r.get.includes(id)).concat(r.give).filter((id) => !r.trade.themDrop.includes(id));
      return { id: r.team.id, name: r.team.manager, before: groupPoints(lineupFor(r.team.roster)), after: groupPoints(lineupFor(after)) };
    }),
  ];
  return (
    <table className="mt-pos">
      <thead><tr><th scope="col"><span className="sr-only">Position</span></th>{cols.map((c) => <th key={c.id} scope="col">{c.name}</th>)}</tr></thead>
      <tbody>
        {groupsFor().map((g) => (
          <tr key={g}>
            <th scope="row">{g === "SF" ? "Superflex" : g === "FLEX" ? "Flex" : g}</th>
            {cols.map((c) => { const d = Math.round((c.after[g] - c.before[g]) * 10) / 10; return (
              <td key={c.id}><b className={`num ${cls(d)}`}>{Math.abs(d) < 0.05 ? "±0.0" : fmt(d)}</b><small>{c.after[g].toFixed(1)}</small></td>
            ); })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Rosters for a multi-team deal: yours with a Send to choice, and each partner's behind a tab. */
export function MultiRosters({ legs, toggle, tags, myTags }: { legs: LegState[]; toggle: Toggle; tags: ManagerTag[]; myTags: Record<string, MyTag> }) {
  const [pane, setPane] = useState<string>("you");
  const [dest, setDest] = useState<string>(legs[0].team.id);
  const partner = legs.find((l) => l.team.id === (pane === "you" ? dest : pane)) ?? legs[0];
  const to = legs.find((l) => l.team.id === dest) ?? legs[0];
  const allGive = legs.flatMap((l) => l.give);
  const noteYou: Record<string, string> = {};
  legs.forEach((l) => l.give.forEach((id) => { noteYou[id] = `To ${l.team.manager}`; }));
  const mapsTo = tagMaps(to.team, tags), mapsP = tagMaps(partner.team, tags);
  const openPartner = (id: string) => { setPane(id); setDest(id); };
  return (
    <div className="rosters mt-rosters" data-side={pane === "you" ? "give" : "get"}>
      <div className="side-switch" role="tablist" aria-label="Which roster" style={{ gridTemplateColumns: `repeat(${legs.length + 1}, minmax(0, 1fr))` }}>
        <button role="tab" aria-selected={pane === "you"} onClick={() => setPane("you")}><span>You</span><b className="give">{allGive.length}</b></button>
        {legs.map((l) => (
          <button key={l.team.id} role="tab" aria-selected={pane === l.team.id} onClick={() => openPartner(l.team.id)}><span>{l.team.manager}</span><b className="get">{l.get.length}</b></button>
        ))}
      </div>
      <p className="side-hint">{pane === "you" ? `Tap your players to send them to ${to.team.manager}.` : `Tap ${partner.team.manager}'s players to ask for them.`} Tap again to remove.</p>
      <div className="side-pane side-give" role="tabpanel">
        <div className="mt-to" role="radiogroup" aria-label="Send to">
          <span>Send to</span>
          {legs.map((l) => (
            <button key={l.team.id} role="radio" aria-checked={dest === l.team.id} onClick={() => setDest(l.team.id)}>
              <TeamAvatar t={l.team} size={20} />{l.team.manager}
            </button>
          ))}
        </div>
        <RosterPicker team={YOU} lineup={lineupFor(YOU.roster)} picked={allGive} onToggle={(id) => toggle("give", id, dest)}
          dimIds={mapsTo.dimYou} lockIds={lockMap(myTags)} wantIds={mapsTo.wantYou} noteIds={noteYou} label="You send" tone="give" />
      </div>
      <div className="side-pane side-get" role="tabpanel">
        <div className="mt-ptabs" role="tablist" aria-label="Partner roster">
          {legs.map((l) => (
            <button key={l.team.id} role="tab" aria-selected={partner.team.id === l.team.id} onClick={() => openPartner(l.team.id)}>
              <TeamAvatar t={l.team} size={20} />{l.team.manager}{l.get.length > 0 && <b>{l.get.length}</b>}
            </button>
          ))}
        </div>
        <RosterPicker team={partner.team} lineup={lineupFor(partner.team.roster)} picked={partner.get} onToggle={(id) => toggle("get", id, partner.team.id)}
          dimIds={mapsP.dimThem} lockIds={{}} wantIds={{}} label={`${partner.team.manager} sends you`} tone="get" />
      </div>
    </div>
  );
}

