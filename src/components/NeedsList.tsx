import { useEffect, useState } from "react";
import { LEAGUE, ManagerTag, Pos, playerById, YOU } from "../data";
import { FadeWeeks, TeamNeeds, fmt, groupsFor, isFaded, tagStrength } from "../engine";
import { Icon, PosBadge } from "./ui";
import { TeamAvatar } from "./TeamPicker";
import { Trophy, championLabel } from "./Trophy";
import { Tooltip } from "./Tooltip";
import { byStandings } from "./Standings";

/** One position vs the league average: fill grows from the middle line, green when stronger, red when weaker. */
function Bar({ label, diff, pct }: { label: string; diff: number; pct: number }) {
  const w = Math.min(Math.abs(pct) * 100 * 1.4, 50); // half track = 36% off league avg
  const dir = diff >= 0.05 ? "up" : diff <= -0.05 ? "down" : "flat";
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track" role="img" aria-label={`${label} ${fmt(diff)} points vs league average`}>
        <span className="bar-mid" />
        <span className={`bar-fill ${dir}`} style={{ width: `${w}%` }} />
      </span>
      <span className="bar-val" style={{ color: dir === "up" ? "var(--good)" : dir === "down" ? "var(--bad)" : "var(--muted)" }}>{fmt(diff)}</span>
    </div>
  );
}

const storeKey = () => `sources.needs.open.${LEAGUE?.mode ?? "demo"}:${LEAGUE?.id ?? "demo"}`;
function readOpen(fallback: string[]): string[] {
  try {
    const s = sessionStorage.getItem(storeKey());
    if (s) { const v = JSON.parse(s); if (Array.isArray(v)) return v.filter((x) => typeof x === "string"); }
  } catch { /* ignore */ }
  return fallback;
}

/**
 * League Needs as an accordion in standings order. Each row is one button that opens the team's
 * power, points, position bars, needs and the trade action inline. Several rows can be open at once;
 * which ones are open is kept per league for the session. The top trade partner starts open.
 */
export function NeedsList({ needs, tags, fade, focusId, topPartnerId, onFocused, onTrade, onRemoveTag, onKeepTag }: {
  needs: TeamNeeds[];
  tags: ManagerTag[];
  fade: FadeWeeks;
  focusId?: string;
  topPartnerId?: string;
  onFocused?: () => void;
  onTrade: (teamId: string) => void;
  onRemoveTag: (id: string) => void;
  onKeepTag: (id: string) => void;
}) {
  const rows = [...needs].sort((a, b) => byStandings(a.team, b.team));
  const [open, setOpenRaw] = useState<string[]>(() => readOpen(topPartnerId ? [topPartnerId] : []));
  const setOpen = (next: string[]) => { setOpenRaw(next); try { sessionStorage.setItem(storeKey(), JSON.stringify(next)); } catch { /* ignore */ } };
  const toggle = (id: string) => setOpen(open.includes(id) ? open.filter((x) => x !== id) : [...open, id]);

  // Deep links (a Wire nudge, a partner link): open that team's row and bring it into view
  useEffect(() => {
    if (!focusId) return;
    const wasOpen = open.includes(focusId);
    if (!wasOpen) setOpen([...open, focusId]);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Scroll once the row has finished opening, so the page is its full height and the row can reach the top
    const id = window.setTimeout(() => {
      document.getElementById(`team-${focusId}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      onFocused?.();
    }, wasOpen || reduce ? 40 : 260);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  return (
    <section className="card nl" aria-label="Team needs, in standings order">
      {rows.map((n, i) => {
        const t = n.team;
        const isOpen = open.includes(t.id);
        const teamTags = tags.filter((x) => x.teamId === t.id);
        const extra = n.surplus && n.surplus !== n.need ? (n.surplus as Pos) : null;
        const tone = n.mode === "Contender" ? "good" : ""; // Seller is a trade opportunity, not bad for you: muted like Bubble
        const champ = championLabel(t.id);
        return (
          <div key={t.id} id={`team-${t.id}`} className={`nl-item${t.you ? " you" : ""}${isOpen ? " open" : ""}`}>
            <button
              type="button"
              className="nl-row"
              id={`nl-row-${t.id}`}
              aria-expanded={isOpen}
              aria-controls={`nl-panel-${t.id}`}
              aria-label={`${i + 1}. ${t.name}${champ ? `, ${champ}` : ""}, ${t.you ? "you" : t.manager}, ${t.record}, ${n.mode}, needs ${n.need}${extra ? `, has extra ${extra}` : ""}, projected ${n.lineup.total.toFixed(1)} a week`}
              onClick={() => toggle(t.id)}
            >
              <span className="nl-rk">{i + 1}</span>
              <TeamAvatar t={t} size={32} />
              <b className="nl-name">{t.name}<Trophy teamId={t.id} size={13} /></b>
              <small className="nl-sub">{t.you ? "You" : t.manager} · {t.record}</small>
              <span className={`nl-mode tc-mode ${tone}`}>{n.mode}</span>
              <span className="nl-fit">
                <span className="nl-chip"><small>Needs</small><PosBadge pos={n.need} /></span>
                {extra && <span className="nl-chip nl-extra"><small>Has extra</small><PosBadge pos={extra} /></span>}
              </span>
              <span className="nl-proj">{n.lineup.total.toFixed(1)}<small>/wk</small></span>
              <Icon name="chev" size={16} />
            </button>
            <div className="nl-panel" id={`nl-panel-${t.id}`} role="region" aria-labelledby={`nl-row-${t.id}`} ref={(el) => el?.toggleAttribute("inert", !isOpen)}>
              <div className="nl-clip">
                <div className="nl-body">
                  <div className="nl-side">
                    <dl className="ti-stats tc-stats">
                      <div className="ti-stat"><dt><Tooltip focusable content="Power rank: starting lineup strength against the other teams. 1 is strongest."><span className="tt-term">Power</span></Tooltip></dt><dd>#{n.rank}</dd></div>
                      <div className="ti-stat"><dt>Points for</dt><dd>{t.pf.toFixed(0)}</dd></div>
                      <div className="ti-stat"><dt>Projected</dt><dd>{n.lineup.total.toFixed(1)}<small>/wk</small></dd></div>
                    </dl>
                    <div className="tc-fit">
                      <span><small>Needs</small><PosBadge pos={n.need} /></span>
                      {extra && <span><small>Has extra</small><PosBadge pos={extra} /></span>}
                    </div>
                  </div>
                  <div className="bars nl-bars">
                    <div className="bar-row tc-scale" aria-hidden="true"><span /><span className="tc-scale-lbl"><span>Weaker</span><span>League avg</span><span>Stronger</span></span><span /></div>
                    {groupsFor().map((g) => <Bar key={g} label={g} diff={n.groups[g].diff} pct={n.groups[g].pct} />)}
                  </div>
                  {teamTags.length > 0 && (
                    <div className="tag-list nl-tags">
                      {teamTags.map((tag) => {
                        const faded = isFaded(tag, fade);
                        return (
                          <div key={tag.id} className="tag-line" style={{ opacity: tagStrength(tag, fade) }}>
                            <span className={`tag-dot tag-${tag.kind}`} />
                            <span className="grow" style={{ minWidth: 0 }}><b>{tag.text}</b>{tag.playerId && !tag.text.includes(playerById(tag.playerId).name) ? ` (${playerById(tag.playerId).name})` : ""} · {tag.weeksOld === 0 ? "this week" : `${tag.weeksOld} wk ago`}{faded ? " · faded" : ""}</span>
                            {tag.weeksOld >= 2 && <button className="btn btn-ghost btn-xs" onClick={() => onKeepTag(tag.id)} aria-label={`Still true: ${tag.text}`}>Still true</button>}
                            <button className="btn btn-ghost btn-xs" onClick={() => onRemoveTag(tag.id)} aria-label={`Remove tag: ${tag.text}`}>Clear</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="nl-act">
                    {!t.you && <button className="btn btn-sm tc-trade" onClick={() => onTrade(t.id)}>Build a trade with {t.manager}<Icon name="chev" size={16} /></button>}
                    {t.you && <span className="tiny muted">This is you. {YOU.roster.length} rostered players.</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
