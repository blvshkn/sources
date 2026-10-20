import { useEffect, useState } from "react";
import { ManagerTag, Pos, playerById, YOU } from "../data";
import { FadeWeeks, TeamNeeds, Trade, fmt, groupsFor, isFaded, tagStrength } from "../engine";
import { Icon, PosBadge } from "./ui";
import { TeamAvatar } from "./TeamPicker";
import { Trophy, championLabel } from "./Trophy";
import { Tooltip } from "./Tooltip";
import { DetailSheet } from "./DetailSheet";

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
      <span className={`bar-val ${dir}`}>{fmt(diff)}</span>
    </div>
  );
}

const extraOf = (n: TeamNeeds) => (n.surplus && n.surplus !== n.need ? (n.surplus as Pos) : null);

/** Why a team sits near the top: the position of yours they need or asked for. Null when there's nothing short to say. */
function fitNote(n: TeamNeeds, t: Trade): { verb: string; pos: string } | null {
  const give = t.give.map((id) => playerById(id).pos as string);
  if (give.includes(n.need)) return { verb: "needs", pos: n.need };
  if (t.fillsWant && give[0]) return { verb: "wants", pos: give[0] };
  return null;
}

/**
 * League Needs as cards: one per team, best trade chance with you first (the same ranking as "best trade
 * partners"), then teams with no trade idea, then you. Ties and the no-idea group go alphabetically. A card
 * shows who the team is, what they need and have extra, and their projection; tapping it opens the full
 * detail (power, points, position bars, your tags, the trade action) in a sheet on phones or a modal from 768px.
 */
export function NeedsList({ needs, tags, fade, focusId, fits, onFocused, onTrade, onRemoveTag, onKeepTag }: {
  needs: TeamNeeds[];
  tags: ManagerTag[];
  fade: FadeWeeks;
  focusId?: string;
  fits: { n: TeamNeeds; t: Trade }[];
  onFocused?: () => void;
  onTrade: (teamId: string) => void;
  onRemoveTag: (id: string) => void;
  onKeepTag: (id: string) => void;
}) {
  const byName = (a: TeamNeeds, b: TeamNeeds) => a.team.name.localeCompare(b.team.name);
  const rank = new Map(fits.map((f, i) => [f.n.team.id, i]));
  const score = (x: { t: Trade }) => Math.min(x.t.youDelta, x.t.themDelta) + (x.t.fillsWant ? 1 : 0);
  const fitOf = new Map(fits.map((f) => [f.n.team.id, f]));
  const cards = [...needs].sort((a, b) => {
    if (a.team.you !== b.team.you) return a.team.you ? 1 : -1;
    const ra = rank.get(a.team.id), rb = rank.get(b.team.id);
    if (ra !== undefined && rb !== undefined) return score(fitOf.get(b.team.id)!) - score(fitOf.get(a.team.id)!) || byName(a, b);
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return byName(a, b);
  });
  const [open, setOpen] = useState<string | null>(null);

  // Deep links (a Wire nudge, a partner link): bring that team's card into view and open its detail
  useEffect(() => {
    if (!focusId) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const card = document.getElementById(`team-${focusId}`);
    card?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    card?.focus({ preventScroll: true });
    setOpen(focusId);
    onFocused?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const sel = open ? needs.find((x) => x.team.id === open) : null;

  return (
    <>
      <section className="nc-grid" aria-label="Team needs, best trade chance with you first">
        {cards.map((n, i) => {
          const t = n.team;
          const extra = extraOf(n);
          const champ = championLabel(t.id);
          const f = fitOf.get(t.id);
          const note = f && i < 3 ? fitNote(n, f.t) : null;
          return (
            <button
              key={t.id}
              type="button"
              id={`team-${t.id}`}
              className={`card nc-card${t.you ? " you" : ""}`}
              aria-haspopup="dialog"
              aria-label={`${t.name}${champ ? `, ${champ}` : ""}, ${t.you ? "you" : t.manager}, ${t.record}, needs ${n.need}${extra ? `, has extra ${extra}` : ""}, projected ${n.lineup.total.toFixed(1)} a week${note ? `. Good fit: ${note.verb} your ${note.pos}` : ""}. Details`}
              onClick={() => setOpen(t.id)}
            >
              <TeamAvatar t={t} size={36} />
              <b className="nc-name">{t.name}<Trophy teamId={t.id} size={13} /></b>
              <small className="nc-sub">{t.you ? "You" : t.manager} · {t.record}</small>
              <span className="nc-proj">{n.lineup.total.toFixed(1)}<small>/wk</small></span>
              <span className="nc-fit">
                <span className="nc-chip"><small>Needs</small><PosBadge pos={n.need} /></span>
                {extra && <span className="nc-chip"><small>Has extra</small><PosBadge pos={extra} /></span>}
              </span>
              {note && <span className="nc-note">Good fit: {note.verb} your <span className={`nc-pos p-${note.pos}`}>{note.pos}</span></span>}
            </button>
          );
        })}
      </section>
      {sel && (
        <DetailSheet className="nd-sheet" label={`${sel.team.name} details`} onClose={() => setOpen(null)} title={
          <span className="nd-head">
            <TeamAvatar t={sel.team} size={40} />
            <span className="nd-who"><b>{sel.team.name}<Trophy teamId={sel.team.id} focusable /></b><small>{sel.team.you ? "You" : sel.team.manager} · {sel.team.record}</small></span>
          </span>
        }>
          {(close) => <NeedsDetail n={sel} tags={tags.filter((x) => x.teamId === sel.team.id)} fade={fade}
            onTrade={() => close(() => onTrade(sel.team.id))} onRemoveTag={onRemoveTag} onKeepTag={onKeepTag} />}
        </DetailSheet>
      )}
    </>
  );
}

/** Everything about one team that used to sit in the accordion: power, points, outlook, the position chart, your tags, the trade action. */
function NeedsDetail({ n, tags, fade, onTrade, onRemoveTag, onKeepTag }: {
  n: TeamNeeds; tags: ManagerTag[]; fade: FadeWeeks;
  onTrade: () => void; onRemoveTag: (id: string) => void; onKeepTag: (id: string) => void;
}) {
  const t = n.team;
  const extra = extraOf(n);
  return (
    <div className="nd-body">
      <dl className="ti-stats tc-stats">
        <div className="ti-stat"><dt><Tooltip focusable content="Power rank: starting lineup strength against the other teams. 1 is strongest."><span className="tt-term">Power</span></Tooltip></dt><dd>#{n.rank}</dd></div>
        <div className="ti-stat"><dt>Points for</dt><dd>{t.pf.toFixed(0)}</dd></div>
        <div className="ti-stat"><dt>Projected</dt><dd>{n.lineup.total.toFixed(1)}<small>/wk</small></dd></div>
      </dl>
      <div className="tc-fit">
        <span><small>Outlook</small><b className="nd-outlook">{n.mode}</b></span>
        <span><small>Needs</small><PosBadge pos={n.need} /></span>
        {extra && <span><small>Has extra</small><PosBadge pos={extra} /></span>}
      </div>
      <section className="nd-sec" aria-label="Starters by position against the league average">
        <h3 className="nd-h">Starters vs league average</h3>
        <div className="bars nd-bars">
          <div className="bar-row tc-scale" aria-hidden="true"><span /><span className="tc-scale-lbl"><span>Weaker</span><span>League avg</span><span>Stronger</span></span><span /></div>
          {groupsFor().map((g) => <Bar key={g} label={g} diff={n.groups[g].diff} pct={n.groups[g].pct} />)}
        </div>
      </section>
      {tags.length > 0 && (
        <section className="nd-sec" aria-label="Your tags">
          <h3 className="nd-h">Your tags</h3>
          <div className="tag-list nd-tags">
            {tags.map((tag) => {
              const faded = isFaded(tag, fade);
              return (
                <div key={tag.id} className="tag-line" style={{ ["--tag-o" as string]: tagStrength(tag, fade) }}>
                  <span className={`tag-dot tag-${tag.kind}`} />
                  <span className="grow" style={{ minWidth: 0 }}><b>{tag.text}</b>{tag.playerId && !tag.text.includes(playerById(tag.playerId).name) ? ` (${playerById(tag.playerId).name})` : ""} · {tag.weeksOld === 0 ? "this week" : `${tag.weeksOld} wk ago`}{faded ? " · faded" : ""}</span>
                  {tag.weeksOld >= 2 && <button className="btn btn-ghost btn-xs" onClick={() => onKeepTag(tag.id)} aria-label={`Still true: ${tag.text}`}>Still true</button>}
                  <button className="btn btn-ghost btn-xs" onClick={() => onRemoveTag(tag.id)} aria-label={`Remove tag: ${tag.text}`}>Clear</button>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <div className="nd-act">
        {!t.you && <button className="btn btn-sm tc-trade" onClick={onTrade}>Build a trade with {t.manager}<Icon name="chev" size={16} /></button>}
        {t.you && <span className="tiny muted">This is you. {YOU.roster.length} rostered players.</span>}
      </div>
    </div>
  );
}
