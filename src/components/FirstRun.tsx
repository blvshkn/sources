import { useState } from "react";
import { MyTag, TEAMS, YOU, playerById, LEAGUE_NAME } from "../data";
import { Trade, TeamNeeds, fmt, formatLabel, eff, lineupFor } from "../engine";
import { AiLabel, Delta, Icon, PosBadge, Stamp } from "./ui";
import { needCopy } from "./Wire";

const OTHER = [
  { name: "ESPN", when: "v1" }, { name: "Yahoo", when: "v1" }, { name: "MyFantasyLeague", when: "Later" },
];

export function FirstRun({ you, opener, onDone }: {
  you: TeamNeeds;
  opener: Trade | null;
  onDone: (r: { username: string; myTags: Record<string, MyTag> }) => void;
}) {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Record<string, MyTag>>({});
  const starters = lineupFor(YOU.roster).slots.map((s) => s.player).filter(Boolean).sort((a, b) => eff(b!) - eff(a!)).slice(0, 5);
  const steps = ["Connect", "League", "Team", "Intel", "Untouchables"];

  const connect = () => {
    if (!username.trim()) return;
    setLoading(true);
    window.setTimeout(() => { setLoading(false); setStep(1); }, 650);
  };
  const finish = (tags: Record<string, MyTag> = picked) => onDone({ username: username.trim().replace(/^@/, "") || "you", myTags: tags });

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="onboard-card">
        <div className="ob-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
          {steps.map((s, i) => <span key={s} className={i <= step ? "on" : ""} />)}
        </div>

        {step === 0 && (
          <div className="ob-step" key="s0">
            <span className="brand-mark big" aria-hidden="true">“</span>
            <h1 id="ob-title" className="ob-title">Sources</h1>
            <p className="ob-sub">Your fantasy insider. Connect your league and Sources finds the trades both sides will accept.</p>
            <label htmlFor="ob-user" className="small" style={{ fontWeight: 600 }}>Sleeper username</label>
            <form className="ob-input" onSubmit={(e) => { e.preventDefault(); connect(); }}>
              <span className="at">@</span>
              <input id="ob-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="yourname" autoComplete="off" autoCapitalize="none" spellCheck={false} />
              <button className="btn btn-primary" type="submit" disabled={!username.trim() || loading}>{loading ? "Reading…" : "Continue"}</button>
            </form>
            <p className="note-good small"><Icon name="lock" size={16} /><span>Username only. Sources never asks for your password. Sleeper's API is public and read-only.</span></p>
            <div className="ob-others">
              {OTHER.map((o) => <button key={o.name} className="btn btn-sm" disabled title={`Coming in ${o.when}`}>{o.name}<span className="tiny muted">{o.when}</span></button>)}
            </div>
            <p className="tiny muted">Prototype: any username loads the sample league.</p>
          </div>
        )}

        {step === 1 && (
          <div className="ob-step" key="s1">
            <h1 id="ob-title" className="ob-title">Pick your league</h1>
            <p className="ob-sub">Found 1 league for @{username.replace(/^@/, "")}.</p>
            <button className="ob-option selected" onClick={() => setStep(2)}>
              <span className="grow"><b>{LEAGUE_NAME}</b><span className="small muted" style={{ display: "block" }}>10 teams · {formatLabel()} · Redraft · Week 7</span></span>
              <Icon name="chev" />
            </button>
            <button className="ob-option" disabled>
              <span className="grow"><b>Dynasty leagues</b><span className="small muted" style={{ display: "block" }}>Rookie picks and dynasty values arrive in v1</span></span>
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="ob-step" key="s2">
            <h1 id="ob-title" className="ob-title">Which team is yours?</h1>
            <p className="ob-sub">Sources reads every roster, but only you see your tags.</p>
            <div className="ob-teams">
              {TEAMS.map((t) => (
                <button key={t.id} className={`ob-option${t.you ? " selected" : ""}`} disabled={!t.you} onClick={() => setStep(3)}>
                  <span className="grow"><b>{t.name}</b><span className="small muted" style={{ display: "block" }}>{t.you ? "Sample: you" : t.manager} · {t.record}</span></span>
                  {t.you && <Icon name="check" size={16} />}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="ob-step" key="s3">
            <Stamp>Per sources</Stamp>
            <h1 id="ob-title" className="ob-title">Your team needs {needCopy(you.need)}.</h1>
            <p className="ob-sub">Your starters are {fmt(you.groups[you.need].diff)} pts a week vs the league average at {you.need}. You're #{you.rank} of 10 by starting lineup.</p>
            {opener && (
              <div className="ob-trade">
                <span className="eyebrow">One trade worth a look</span>
                <div className="idea-swap"><span>Your {opener.give.map((id) => playerById(id).name).join(" + ")}</span><span className="arrow">for</span><span>{TEAMS.find((t) => t.id === opener.partnerId)!.manager}'s {opener.get.map((id) => playerById(id).name).join(" + ")}</span></div>
                <div className="idea-nums"><span>You gain <Delta n={opener.youDelta} />/wk</span><span>They gain <Delta n={opener.themDelta} />/wk</span></div>
              </div>
            )}
            <AiLabel />
            <button className="btn btn-primary" onClick={() => setStep(4)}>Continue</button>
          </div>
        )}

        {step === 4 && (
          <div className="ob-step" key="s4">
            <h1 id="ob-title" className="ob-title">Anyone off the table?</h1>
            <p className="ob-sub">Optional. Tag your untouchables so trade ideas leave them out. You can set a price for "unless amazing" on your lineup page.</p>
            <div className="ob-teams">
              {starters.map((p) => p && (
                <div key={p.id} className="ob-option static">
                  <PosBadge pos={p.pos} />
                  <span className="grow"><b>{p.name}</b><span className="small muted" style={{ display: "block" }}>{eff(p).toFixed(1)} projected</span></span>
                  <select className="tag-select" aria-label={`Tag for ${p.name}`} value={picked[p.id] ?? ""} onChange={(e) => setPicked((c) => { const n = { ...c }; if (e.target.value) n[p.id] = e.target.value as MyTag; else delete n[p.id]; return n; })}>
                    <option value="">Open to offers</option>
                    <option value="untouchable">Untouchable</option>
                    <option value="amazing">Unless amazing</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="row wrap">
              <button className="btn btn-primary" onClick={() => finish()}>Open The Wire</button>
              <button className="btn btn-ghost" onClick={() => finish({})}>Skip for now</button>
            </div>
          </div>
        )}

        {step > 0 && step < 4 && step !== 3 && <button className="btn btn-ghost btn-sm ob-back" onClick={() => setStep(step - 1)}>Back</button>}
      </div>
    </div>
  );
}
