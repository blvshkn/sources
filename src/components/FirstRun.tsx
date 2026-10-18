import { useState } from "react";
import { MyTag, TEAMS, YOU, playerById, LEAGUE_NAME, setLeague, demoLeague, teamById } from "../data";
import { Trade, TeamNeeds, allNeeds, applyFormat, eff, findTrades, fmt, formatLabel, lineupFor } from "../engine";
import { SLeague, SleeperError, findLeagues, findUser, leagueType, loadLeague } from "../sleeper";
import { AiLabel, Delta, Icon, PosBadge, Stamp } from "./ui";
import { needCopy } from "./Wire";

type Live = { username: string; userId: string; leagueId: string };
type Step = "connect" | "league" | "team" | "intel" | "untouchables";
const STEPS: Step[] = ["connect", "league", "team", "intel", "untouchables"];

const OTHER = [{ name: "ESPN", when: "v1" }, { name: "Yahoo", when: "v1" }, { name: "MyFantasyLeague", when: "Later" }];

export function FirstRun({ onLive, onDemo }: { onLive: (s: Live, myTags: Record<string, MyTag>) => void; onDemo: (myTags: Record<string, MyTag>) => void }) {
  const [step, setStep] = useState<Step>("connect");
  const [username, setUsername] = useState("");
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [leagues, setLeagues] = useState<SLeague[]>([]);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Record<string, MyTag>>({});
  const [intel, setIntel] = useState<{ you: TeamNeeds; opener: Trade | null } | null>(null);
  const isDemoRun = leagueId === "demo";

  const fail = (e: unknown) => { setBusy(""); setError(e instanceof SleeperError ? e.message : "Something went wrong talking to Sleeper. Try again in a moment."); };

  const connect = async () => {
    const name = username.trim().replace(/^@/, "");
    if (!name) return;
    setError(""); setBusy("Finding your account");
    try {
      const u = await findUser(name);
      if (!u) { setBusy(""); setError(`No Sleeper account named @${name}. Check the spelling. It's your username, not your email.`); return; }
      setUser({ id: u.user_id, name: u.display_name || name });
      setBusy("Finding your leagues");
      const { leagues } = await findLeagues(u.user_id);
      setBusy("");
      if (!leagues.length) { setError("That account isn't in any NFL leagues on Sleeper yet."); return; }
      setLeagues(leagues);
      setStep("league");
    } catch (e) { fail(e); }
  };

  const computeIntel = () => {
    applyFormat({ scoring: "ppr", superflex: false, tePremium: false });
    const needs = allNeeds();
    const you = needs.find((n) => n.team.you)!;
    const opener = TEAMS.filter((t) => !t.you).map((t) => findTrades(YOU, t, [], {}, {}, 1)[0]).filter(Boolean)
      .sort((a, b) => Math.min(b.youDelta, b.themDelta) - Math.min(a.youDelta, a.themDelta))[0] ?? null;
    setIntel({ you, opener });
  };

  const chooseLeague = async (id: string) => {
    if (!user) return;
    setError(""); setLeagueId(id);
    try {
      const d = await loadLeague(id, user.id, username.trim().replace(/^@/, ""), setBusy);
      setLeague(d);
      applyFormat(d.format);
      setBusy("");
      setStep("team");
    } catch (e) { fail(e); }
  };

  const tryDemo = () => { setLeague(demoLeague()); setLeagueId("demo"); setError(""); setStep("team"); };

  const finish = (tags: Record<string, MyTag> = picked) => {
    if (isDemoRun) onDemo(tags);
    else if (user && leagueId) onLive({ username: username.trim().replace(/^@/, ""), userId: user.id, leagueId }, tags);
  };

  const starters = step === "untouchables" ? lineupFor(YOU.roster).slots.map((s) => s.player).filter(Boolean).sort((a, b) => eff(b!) - eff(a!)).slice(0, 5) : [];
  const idx = STEPS.indexOf(step);

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="onboard-card">
        <div className="ob-progress" aria-label={`Step ${idx + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => <span key={s} className={i <= idx ? "on" : ""} />)}
        </div>

        {step === "connect" && (
          <div className="ob-step" key="s0">
            <span className="brand-mark big" aria-hidden="true">“</span>
            <h1 id="ob-title" className="ob-title">Sources</h1>
            <p className="ob-sub">Your fantasy insider. Connect your league and Sources finds the trades both sides will accept.</p>
            <label htmlFor="ob-user" className="small" style={{ fontWeight: 600 }}>Sleeper username</label>
            <form className="ob-input" onSubmit={(e) => { e.preventDefault(); connect(); }}>
              <span className="at">@</span>
              <input id="ob-user" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }} placeholder="yourname" autoComplete="username" autoCapitalize="none" spellCheck={false} />
              <button className="btn btn-primary" type="submit" disabled={!username.trim() || !!busy}>{busy ? "Looking…" : "Continue"}</button>
            </form>
            {busy && <p className="small muted" role="status">{busy}…</p>}
            {error && <p className="small ob-error" role="alert">{error}</p>}
            <p className="note-good small"><Icon name="lock" size={16} /><span>Username only. Sources never asks for your password. Sleeper's API is public and read-only, and your league is read straight from Sleeper in your browser.</span></p>
            <div className="ob-others">
              {OTHER.map((o) => <button key={o.name} className="btn btn-sm" disabled title={`Coming in ${o.when}`}>{o.name}<span className="tiny muted">{o.when}</span></button>)}
            </div>
            <button className="linkish small" onClick={tryDemo}>No Sleeper league? Try the demo league</button>
          </div>
        )}

        {step === "league" && (
          <div className="ob-step" key="s1">
            <h1 id="ob-title" className="ob-title">Pick your league</h1>
            <p className="ob-sub">Found {leagues.length} league{leagues.length === 1 ? "" : "s"} for @{username.replace(/^@/, "")}.</p>
            <div className="ob-teams">
              {leagues.map((l) => {
                const type = leagueType(l);
                const loading = leagueId === l.league_id && !!busy;
                return (
                  <button key={l.league_id} className={`ob-option${leagueId === l.league_id ? " selected" : ""}`} onClick={() => chooseLeague(l.league_id)} disabled={!!busy}>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <b>{l.name}</b>
                      <span className="small muted" style={{ display: "block" }}>
                        {l.total_rosters} teams · {(l.scoring_settings.rec ?? 0) >= 1 ? "PPR" : (l.scoring_settings.rec ?? 0) >= 0.5 ? "Half PPR" : "Standard"} · {type[0].toUpperCase() + type.slice(1)}{type === "dynasty" ? " (dynasty values arrive in v1)" : ""}
                      </span>
                      {loading && <span className="small" style={{ display: "block", marginTop: 4 }}>{busy}…</span>}
                    </span>
                    {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="chev" />}
                  </button>
                );
              })}
            </div>
            {error && <p className="small ob-error" role="alert">{error}</p>}
            <button className="btn btn-ghost btn-sm ob-back" onClick={() => { setStep("connect"); setLeagueId(null); }} disabled={!!busy}>Back</button>
          </div>
        )}

        {step === "team" && (
          <div className="ob-step" key="s2">
            <h1 id="ob-title" className="ob-title">Is this your team?</h1>
            <p className="ob-sub">{LEAGUE_NAME} · {TEAMS.length} teams. Sources reads every roster, but only you see your tags.</p>
            <div className="ob-teams">
              {[...TEAMS].sort((a, b) => Number(!!b.you) - Number(!!a.you)).map((t) => (
                <div key={t.id} className={`ob-option static${t.you ? " selected" : ""}`} style={t.you ? undefined : { opacity: 0.55 }}>
                  <span className="grow" style={{ minWidth: 0 }}><b>{t.name}</b><span className="small muted" style={{ display: "block" }}>{t.you ? (isDemoRun ? "Demo: you" : "You") : t.manager} · {t.record}</span></span>
                  {t.you && <Icon name="check" size={16} />}
                </div>
              ))}
            </div>
            <div className="row wrap">
              <button className="btn btn-primary" onClick={() => { computeIntel(); setStep("intel"); }}>Yes, that's me</button>
              <button className="btn btn-ghost" onClick={() => setStep(isDemoRun ? "connect" : "league")}>Back</button>
            </div>
          </div>
        )}

        {step === "intel" && intel && (
          <div className="ob-step" key="s3">
            <Stamp>Per sources</Stamp>
            <h1 id="ob-title" className="ob-title">Your team needs {needCopy(intel.you.need)}.</h1>
            <p className="ob-sub">Your starters are {fmt(intel.you.groups[intel.you.need].diff)} pts a week vs the league average at {intel.you.need}. You're #{intel.you.rank} of {TEAMS.length} by starting lineup ({formatLabel()}).</p>
            {intel.opener ? (
              <div className="ob-trade">
                <span className="eyebrow">One trade worth a look</span>
                <div className="idea-swap"><span>Your {intel.opener.give.map((id) => playerById(id).name).join(" + ")}</span><span className="arrow">for</span><span>{teamById(intel.opener.partnerId).manager}'s {intel.opener.get.map((id) => playerById(id).name).join(" + ")}</span></div>
                <div className="idea-nums"><span>You gain <Delta n={intel.opener.youDelta} />/wk</span><span>They gain <Delta n={intel.opener.themDelta} />/wk</span></div>
              </div>
            ) : <p className="small muted">No clean win-win trade right now. Sources will nudge you when one opens up.</p>}
            <AiLabel />
            <button className="btn btn-primary" onClick={() => setStep("untouchables")}>Continue</button>
          </div>
        )}

        {step === "untouchables" && (
          <div className="ob-step" key="s4">
            <h1 id="ob-title" className="ob-title">Anyone off the table?</h1>
            <p className="ob-sub">Optional. Tag your untouchables so trade ideas leave them out. You can set a price for "unless amazing" on your Lineup page.</p>
            <div className="ob-teams">
              {starters.map((p) => p && (
                <div key={p.id} className="ob-option static">
                  <PosBadge pos={p.pos} />
                  <span className="grow" style={{ minWidth: 0 }}><b>{p.name}</b><span className="small muted" style={{ display: "block" }}>{eff(p).toFixed(1)} a week</span></span>
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
      </div>
    </div>
  );
}
