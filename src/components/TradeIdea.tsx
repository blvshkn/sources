// A trade idea card, on its own so the landing can show it without loading the rest of Overview (Wire.tsx).
import { useContext } from "react";
import { IdeaFeedbackCtx } from "./IdeaFeedback";
import { playerById } from "../data";
import { Trade } from "../engine";
import { Delta, Icon } from "./ui";
import { Avatar } from "./Avatar";
import { Tooltip } from "./Tooltip";

function IdeaSide({ label, ids, tone }: { label: string; ids: string[]; tone: "send" | "get" }) {
  return (
    <section className={`tx-side ${tone}`} aria-label={label}>
      <header><span>{label}</span><small>{ids.length} {ids.length === 1 ? "player" : "players"}</small></header>
      <ul>
        {ids.map((id) => {
          const p = playerById(id);
          return (
            <li key={id}>
              <Avatar p={p} size={40} />
              <span className="tx-pl"><b>{p.name}</b><small>{p.pos} · {p.nfl}</small></span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function TradeIdea({ t, onOpen, onPitch }: { t: Trade; onOpen: (t: Trade) => void; onPitch: (t: Trade) => void }) {
  // "Their lineup +x/wk" repeats the number shown above, so it's left out
  const reasons = (t.accept?.reasons ?? []).filter((r) => !/lineup/i.test(r)).map((r) => r.charAt(0).toUpperCase() + r.slice(1));
  // Their odds are their call, not good or bad for you, so they read in neutral ink
  const tone = "neutral";
  const feedback = useContext(IdeaFeedbackCtx);
  return (
    <article className="ti">
      <div className="tx">
        <IdeaSide label="You send" ids={t.give} tone="send" />
        <span className="tx-swap" aria-hidden="true"><Icon name="trade" size={16} /></span>
        <IdeaSide label="You get" ids={t.get} tone="get" />
      </div>
      <dl className="ti-stats">
        {t.accept && (
          <div className={`ti-stat odds ${tone}`}>
            <dt><Tooltip focusable content={<>Chance they accept, from their needs, notes and trade history. {t.accept.label === "Likely yes" ? "Likely yes is 65% and up." : t.accept.label === "Worth a shot" ? "Worth a shot is 50 to 64%." : "Long shot is under 50%."}</>}><span className="tt-term">{t.accept.label}</span></Tooltip></dt>
            <dd>{Math.round(t.accept.p * 100)}<small>%</small></dd>
            <span className="ti-meter" aria-hidden="true"><i style={{ width: `${Math.round(t.accept.p * 100)}%` }} /></span>
          </div>
        )}
        <div className="ti-stat"><dt>You gain</dt><dd><Delta n={t.youDelta} /><small>/wk</small></dd></div>
        <div className="ti-stat"><dt>They gain</dt><dd><Delta n={t.themDelta} /><small>/wk</small></dd></div>
      </dl>
      {reasons.length > 0 && <p className="ti-why">{reasons.join(". ")}.</p>}
      <div className="ti-actions">
        <button className="btn btn-sm ti-btn" onClick={() => onOpen(t)}>Open in builder</button>
        <button className="btn btn-primary btn-sm ti-btn" onClick={() => onPitch(t)}><Icon name="pen" size={15} />Write pitch</button>
      </div>
      {feedback && <button className="ti-nope" onClick={() => feedback(t)}>Won't work? Tell Sources why</button>}
    </article>
  );
}
