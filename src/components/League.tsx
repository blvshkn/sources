import { useState } from "react";
import { ManagerTag, playerById, Pos, POS_ORDER, YOU } from "../data";
import { FadeWeeks, Group, TeamNeeds, Trade, fmt, groupsFor, isFaded, tagStrength, tendencies } from "../engine";
import { AiLabel, Delta, Phase, PosBadge, Seg, Stamp } from "./ui";
import { TagCapture } from "./TagCapture";

function Bar({ label, diff, pct }: { label: string; diff: number; pct: number }) {
  const w = Math.min(Math.abs(pct) * 100 * 1.4, 50); // half track = 36% off league avg
  const dir = diff >= 0 ? "up" : "down";
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track" role="img" aria-label={`${label} ${fmt(diff)} points vs league average`}>
        <span className="bar-mid" />
        <span className={`bar-fill ${dir}`} style={{ width: `${w}%` }} />
      </span>
      <span className="bar-val" style={{ color: diff >= 0 ? "var(--good)" : "var(--bad)" }}>{fmt(diff)}</span>
    </div>
  );
}

export function League({ needs, tags, fade, focusId, partners, onTrade, onOpen, onRemoveTag, onKeepTag, onAddTag }: {
  needs: TeamNeeds[];
  tags: ManagerTag[];
  fade: FadeWeeks;
  focusId?: string;
  partners: { n: TeamNeeds; t: Trade; why: string }[];
  onTrade: (teamId: string) => void;
  onOpen: (t: Trade) => void;
  onRemoveTag: (id: string) => void;
  onKeepTag: (id: string) => void;
  onAddTag: (t: Omit<ManagerTag, "id">) => void;
}) {
  const [view, setView] = useState<"needs" | "tendencies">("needs");
  const sorted = [...needs].sort((a, b) => a.rank - b.rank);
  const you = needs.find((n) => n.team.you)!;
  // Starter copy: "Per sources, three teams are thin at RB. You have two to spare."
  const headline = (() => {
    const spare = POS_ORDER.map((pos) => ({ pos, n: you.lineup.bench.filter((p) => p.pos === pos).length }))
      .filter((x) => x.n > 0 && x.pos !== "QB")
      .map((x) => ({ ...x, thin: needs.filter((n) => !n.team.you && n.groups[x.pos as Group].diff < -1.5).length }))
      .sort((a, b) => b.thin - a.thin)[0];
    if (!spare || !spare.thin) return null;
    const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    return `${words[spare.thin][0].toUpperCase() + words[spare.thin].slice(1)} ${spare.thin === 1 ? "team is" : "teams are"} thin at ${spare.pos}. You have ${words[spare.n]} to spare.`;
  })();

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Sample League · 10 teams</div>
          <h1 className="page-title">League Needs</h1>
          <p className="page-sub">Every starting slot measured against the league average. Red is where a team is hurting, which is where your offer lands.</p>
        </div>
        <Seg label="View" value={view} onChange={setView} options={[{ v: "needs", label: "Needs" }, { v: "tendencies", label: "Tendencies" }]} />
      </header>

      {partners.length > 0 && (
        <section className="card nudge" aria-label="Best trade partners">
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <Stamp>Per sources</Stamp>
            <AiLabel />
          </div>
          {headline && <h3>Per sources, {headline.charAt(0).toLowerCase() + headline.slice(1)}</h3>}
          <div className="partners">
            {partners.map(({ n, t, why }, i) => (
              <button key={n.team.id} className="partner-card" onClick={() => onOpen(t)}>
                <span className="partner-rank">{i + 1}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <b>{n.team.name}</b>
                  <span className="small muted" style={{ display: "block" }}>{why}</span>
                </span>
                <span className="idea-nums" style={{ flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <span>You <Delta n={t.youDelta} /></span><span>Them <Delta n={t.themDelta} /></span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card card-pad capture-card">
        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <h2 className="section-title">Heard something in league chat?</h2>
          <span className="tiny muted">Type or dictate. Tags stay private.</span>
        </div>
        <TagCapture onSave={onAddTag} />
      </section>

      {view === "needs" && (
        <div className="legend">
          <span className="row"><span className="tag-dot tag-wants" /> Wants</span>
          <span className="row"><span className="tag-dot tag-refuses" /> Won't move</span>
          <span className="row"><span className="tag-dot tag-notInterested" /> Not interested</span>
          <span className="row muted">Tags fade after {fade} weeks</span>
        </div>
      )}
      {view === "tendencies" && <p className="small muted">Built from completed trades and offers in this league over the last year. <Phase v="v1" /></p>}

      <div className="needs-grid">
        {sorted.map((n) => {
          const t = n.team;
          const teamTags = tags.filter((x) => x.teamId === t.id);
          const td = tendencies(t.id);
          return (
            <article key={t.id} id={`team-${t.id}`} className={`card team-card${t.you ? " is-you" : ""}${focusId === t.id ? " is-focus" : ""}`}>
              <div className="row" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="team-name">{t.name}</div>
                  <div className="team-sub">{t.manager} · {t.record} · {t.pf.toFixed(0)} PF · #{n.rank} power</div>
                </div>
                <span className={`chip ${n.mode === "Contender" ? "chip-good" : n.mode === "Seller" ? "chip-bad" : ""}`}>{n.mode}</span>
              </div>

              {view === "needs" ? (
                <>
                  <div className="bars">
                    {groupsFor().map((g) => <Bar key={g} label={g} diff={n.groups[g].diff} pct={n.groups[g].pct} />)}
                  </div>
                  <div className="row wrap tiny muted">
                    <span className="row">Needs <PosBadge pos={n.need} /></span>
                    {n.surplus && <span className="row">Spare <PosBadge pos={n.surplus as Pos} /></span>}
                    <span className="num">{n.lineup.total.toFixed(1)} pts/wk</span>
                  </div>
                  {teamTags.length > 0 && (
                    <div className="tag-list">
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
                </>
              ) : (
                <div className="tend">
                  <div className="tend-stats">
                    <div><b className="num">{td.trades}</b><span>trades</span></div>
                    <div><b className="num">{td.offers ? Math.round(td.closeRate * 100) : 0}%</b><span>close rate</span></div>
                    <div><b className="row" style={{ gap: 4 }}>{td.buys.length ? td.buys.map((p) => <PosBadge key={p} pos={p} />) : "None"}</b><span>buys</span></div>
                    <div><b className="num">{Math.round(td.rookieShare * 100)}%</b><span>rookies</span></div>
                  </div>
                  <p className="small">{t.you ? "Your own trade history. League mates can't see this." : td.summary}</p>
                  {!t.you && <AiLabel />}
                </div>
              )}
              {!t.you && <button className="btn btn-sm" onClick={() => onTrade(t.id)}>Build a trade with {t.manager}</button>}
              {t.you && <span className="tiny muted">This is you. {YOU.roster.length} rostered players.</span>}
            </article>
          );
        })}
      </div>
    </>
  );
}
