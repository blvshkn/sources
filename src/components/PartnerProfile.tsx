import { useEffect, useMemo, useRef, useState } from "react";
import { useBackClose } from "../backClose";
import { createPortal } from "react-dom";
import { COMPLETED_TRADES, ManagerTag, PastTrade, TEAMS, teamById } from "../data";
import { allNeeds, fmt, groupsFor, tendencies } from "../engine";
import { TeamAvatar } from "./TeamPicker";
import { Icon } from "./ui";
import { usePullToDismiss } from "./sheetDrag";
import { useFocusTrap } from "./focusTrap";
import { ScrollArea } from "./ScrollArea";
import { AiMark } from "./WorkingLoader";

/** Below this the profile is a bottom sheet; from here up (tablet and desktop) a centered modal. Matches partner.css. */
const MODAL_FROM = 768;
const isSheet = () => typeof window !== "undefined" && window.innerWidth < MODAL_FROM;

/** "2026 Wk 5" sorts after "2025 Wk 11" */
const tradeOrder = (t: PastTrade) => {
  const m = /(\d{4})\D+(\d+)/.exec(t.week);
  return m ? Number(m[1]) * 100 + Number(m[2]) : 0;
};
const names = (xs: PastTrade["aGot"]) => xs.map((x) => x.name).join(" and ");

/**
 * A trade partner's profile, opened from Trade's "<Manager>'s profile" button: what they need, where their
 * starters are strong, how they trade, their recent trades and your notes on them. Same facts as the side
 * panel's partner card. A bottom sheet below 768px, a centered modal from 768px up. With more than one
 * partner in the deal, pills at the top switch between them.
 */
export function PartnerProfile({ teamIds, initial, tags, onNotes, onClose }: {
  teamIds: string[]; initial?: string; tags: ManagerTag[];
  /** Opens Trade's Notes tab for this team */
  onNotes: (teamId: string) => void;
  onClose: () => void;
}) {
  const [id, setId] = useState(initial && teamIds.includes(initial) ? initial : teamIds[0]);
  const [shown, setShown] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closing = useRef(false);
  useFocusTrap(sheet);

  const close = (after?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    const el = sheet.current;
    if (el) { el.style.transition = ""; el.style.transform = ""; }
    if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; }
    setShown(false);
    window.setTimeout(() => { onClose(); after?.(); }, 220);
  };

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => setShown(true));
    closeBtn.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", key);
    // The root keeps a stable scrollbar gutter (frame.css), so locking the page moves nothing behind
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
      const back = opener.current;
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull down to dismiss, on the phone sheet only; the modal stays put
  useBackClose(() => close());
  usePullToDismiss(sheet, { scrim, enabled: isSheet, onDismiss: () => close() });

  const needs = useMemo(() => allNeeds(), []);
  const n = needs.find((x) => x.team.id === id);
  const t = n?.team ?? teamById(id);
  const theirs = tags.filter((x) => x.teamId === id);
  const td = tendencies(id);
  const recent = COMPLETED_TRADES.filter((x) => x.a === id || x.b === id).sort((a, b) => tradeOrder(b) - tradeOrder(a)).slice(0, 4);
  const groups = groupsFor();
  const strong = n ? groups.filter((g) => n.groups[g].diff >= 0.5).sort((a, b) => n.groups[b].diff - n.groups[a].diff) : [];
  // The summary's last sentence is advice; the ones before it are facts already shown as numbers
  const parts = td.summary.split(/(?<=\.)\s+/).filter(Boolean);
  const tip = parts.length > 1 ? parts[parts.length - 1] : td.trades ? null : parts[0];

  const pick = (next: string) => { setId(next); body.current?.scrollTo({ top: 0 }); };

  return createPortal(
    <div className={`ps-wrap pp-wrap${shown ? " in" : ""}`}>
      <div ref={scrim} className="ps-scrim" onClick={() => close()} aria-hidden="true" />
      <section ref={sheet} className="ps ps-partner" role="dialog" aria-modal="true" aria-labelledby="pp-name">
        <div className="pp-top">
          <span className="ps-handle" aria-hidden="true" />
          {teamIds.length > 1 && (
            <div className="seg pp-switch" role="group" aria-label="Partner">
              {teamIds.map((tid) => (
                <button key={tid} type="button" aria-pressed={tid === id} onClick={() => pick(tid)}>{teamById(tid).manager}</button>
              ))}
            </div>
          )}
          <header className="pp-head">
            <TeamAvatar t={t} size={48} />
            <span className="pp-who">
              <b id="pp-name">{t.name}</b>
              <small>{t.manager} · <span className="pp-num">{t.record}</span>{n ? <> · <span className="pp-num">#{n.rank}</span> power</> : null}</small>
            </span>
            {n && <span className="pp-mode">{n.mode}</span>}
          </header>
          <button ref={closeBtn} className="ps-x" onClick={() => close()} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>

        {/* Only this scrolls; the header above stays put */}
        <ScrollArea ref={body} className="pp-body" data-sheet-scroll>
          {n && (
            <section className="pp-sec" aria-labelledby="pp-needs">
              <h3 id="pp-needs" className="pp-h">Needs and strengths</h3>
              <p className="pp-line">
                Needs <b>{n.need}</b>.
                {strong.length ? <> Strong at <b>{strong.join(", ")}</b>.</> : " No group above league average."}
                {n.surplusPlayer && n.surplus !== n.need ? <> Spare {n.surplus}: <b>{n.surplusPlayer.name}</b>.</> : null}
              </p>
              <div className="pp-vs" aria-label="Starting lineup points per week against league average">
                {groups.map((g) => {
                  const d = n.groups[g].diff;
                  return (
                    <span key={g} className={`${g === n.need ? "need" : ""}${d >= 0.5 ? " up" : ""}`}>
                      <small>{g}</small><b className="pp-num">{fmt(d)}</b>
                    </span>
                  );
                })}
              </div>
              <p className="pp-key">Starters vs league average, points per week</p>
            </section>
          )}

          <section className="pp-sec" aria-labelledby="pp-how">
            <h3 id="pp-how" className="pp-h">How they trade</h3>
            <dl className="pp-stats">
              <div><dt>Trades</dt><dd className="pp-num">{td.trades}</dd></div>
              <div><dt>Closed</dt><dd>{td.offers ? <><span className="pp-num">{td.trades}</span> of <span className="pp-num">{td.offers}</span></> : <span className="pp-dash">n/a</span>}</dd></div>
              <div><dt>Usually buys</dt><dd>{td.buys.length ? td.buys.join(", ") : <span className="pp-dash">n/a</span>}</dd></div>
            </dl>
            {tip && <p className="pp-tip"><AiMark size={14} /><span>{tip.replace(/-/g, "‑")}</span></p>}
          </section>

          <section className="pp-sec" aria-labelledby="pp-recent">
            <h3 id="pp-recent" className="pp-h">Recent trades</h3>
            {recent.length ? (
              <ul className="pp-trades">
                {recent.map((x, i) => {
                  const mine = x.a === id;
                  const other = TEAMS.find((tm) => tm.id === (mine ? x.b : x.a));
                  return (
                    <li key={`${x.week}-${i}`}>
                      <span className="pp-wk pp-num">{x.week}</span>
                      <span>Got <b>{names(mine ? x.aGot : x.bGot)}</b> for {names(mine ? x.bGot : x.aGot)}{other ? <span className="pp-with"> with {other.you ? "you" : other.manager}</span> : null}</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="pp-none">No completed trades on record.</p>}
          </section>

          <section className="pp-sec" aria-labelledby="pp-notes">
            <div className="pp-h-row">
              <h3 id="pp-notes" className="pp-h">Your notes</h3>
              <button type="button" className="linkish" onClick={() => close(() => onNotes(id))}>{theirs.length ? "Open notes" : "Add a note"}</button>
            </div>
            {theirs.length ? (
              <ul className="pp-tags">{theirs.map((x) => <li key={x.id}>{x.text}{x.from === "declined" && <small className="tag-from">From a declined offer</small>}</li>)}</ul>
            ) : <p className="pp-none">Nothing noted on {t.manager} yet. Notes steer the trade ideas.</p>}
          </section>
        </ScrollArea>
      </section>
    </div>,
    document.body,
  );
}
