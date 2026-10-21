import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "./focusTrap";
import { MyTag, TEAMS, YOU, playerById, LEAGUE_NAME, setLeague, teamById } from "../data";
import { Trade, TeamNeeds, allNeeds, applyFormat, eff, findTrades, fmt, formatLabel, lineupFor } from "../engine";
import { SLeague, SleeperError, leagueType, loadLeague } from "../sleeper";
import { AiLabel, Delta, Icon, PosBadge, Stamp } from "./ui";
import { needCopy } from "./Wire";
import { Select } from "./Select";

type Live = { username: string; userId: string; leagueId: string };
type Step = "connect" | "league" | "team" | "intel" | "untouchables";
const STEPS: Step[] = ["connect", "league", "team", "intel", "untouchables"];
// "connect" happens on the landing page; the dialog starts at league (live) or team (demo).

export type FirstRunStart = { kind: "live"; username: string; user: { id: string; name: string }; leagues: SLeague[] } | { kind: "demo" };

export function FirstRun({ start, onLive, onDemo, onClose }: { start: FirstRunStart; onLive: (s: Live, myTags: Record<string, MyTag>) => void; onDemo: (myTags: Record<string, MyTag>) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>(start.kind === "live" ? "league" : "team");
  const dialog = useRef<HTMLDivElement>(null);
  useFocusTrap(dialog);
  const username = start.kind === "live" ? start.username : "";
  const user = start.kind === "live" ? start.user : null;
  const leagues: SLeague[] = start.kind === "live" ? start.leagues : [];
  const [leagueId, setLeagueId] = useState<string | null>(start.kind === "demo" ? "demo" : null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Record<string, MyTag>>({});
  const [intel, setIntel] = useState<{ you: TeamNeeds; opener: Trade | null } | null>(null);
  const isDemoRun = leagueId === "demo";

  const fail = (e: unknown) => { setBusy(""); setError(e instanceof SleeperError ? e.message : "We couldn't load that league from Sleeper. Try again in a minute."); };

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


  const finish = (tags: Record<string, MyTag> = picked) => {
    if (isDemoRun) onDemo(tags);
    else if (user && leagueId) onLive({ username: username.trim().replace(/^@/, ""), userId: user.id, leagueId }, tags);
  };

  const starters = step === "untouchables" ? lineupFor(YOU.roster).slots.map((s) => s.player).filter(Boolean).sort((a, b) => eff(b!) - eff(a!)).slice(0, 5) : [];
  const idx = STEPS.indexOf(step);
  // Focus moves into the dialog when it opens; Escape backs out to the landing, as the Back button does
  useEffect(() => { dialog.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy && !e.defaultPrevented) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div ref={dialog} tabIndex={-1} className="onboard" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="onboard-card">
        <div className="ob-progress" aria-label={`Step ${idx + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => <span key={s} className={i <= idx ? "on" : ""} />)}
        </div>

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
            <button className="btn btn-ghost btn-sm ob-back" onClick={onClose} disabled={!!busy}>Back</button>
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
              <button className="btn btn-ghost" onClick={() => (isDemoRun ? onClose() : setStep("league"))}>Back</button>
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
            ) : <p className="small muted">No trade helps both sides right now. Sources will tell you when one opens up.</p>}
            <AiLabel />
            <button className="btn btn-primary" onClick={() => setStep("untouchables")}>Continue</button>
          </div>
        )}

        {step === "untouchables" && (
          <div className="ob-step" key="s4">
            <h1 id="ob-title" className="ob-title">Anyone off the table?</h1>
            <p className="ob-sub">Optional. Tag your untouchables so trade ideas leave them out. Set an asking price for "overpay only" guys on your Lineup page.</p>
            <div className="ob-teams">
              {starters.map((p) => p && (
                <div key={p.id} className="ob-option static">
                  <PosBadge pos={p.pos} />
                  <span className="grow" style={{ minWidth: 0 }}><b>{p.name}</b><span className="small muted" style={{ display: "block" }}>{eff(p).toFixed(1)} a week</span></span>
                  <Select className="tag-select" aria-label={`Tag for ${p.name}`} value={picked[p.id] ?? ""}
                    onChange={(v) => setPicked((c) => { const n = { ...c }; if (v) n[p.id] = v as MyTag; else delete n[p.id]; return n; })}
                    options={[
                      { value: "", label: "Open to offers" },
                      { value: "untouchable", label: "Untouchable" },
                      { value: "amazing", label: "Overpay only" },
                    ]} />
                </div>
              ))}
            </div>
            <div className="row wrap">
              <button className="btn btn-primary" onClick={() => finish()}>Open Overview</button>
              <button className="btn btn-ghost" onClick={() => finish({})}>Skip for now</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
