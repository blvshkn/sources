import { useState } from "react";
import { Format, FadeWeeks, Scoring, formatLabel } from "../engine";
import { LEAGUE, LEAGUE_NAME, LeagueFormat } from "../data";
import { Icon, Seg } from "./ui";

export type Level = "light" | "standard" | "hands";
export const PUSH_CAP: Record<Level, number> = { light: 2, standard: 5, hands: 10 };

const PLATFORMS: { name: string; how: string; when: "MVP" | "v1" | "Later" | "n/a" }[] = [
  { name: "Sleeper", how: "Username only (public, read-only API)", when: "MVP" },
  { name: "Yahoo", how: "Official sign-in on Yahoo's page (OAuth)", when: "v1" },
  { name: "ESPN", how: "League ID for public leagues; private leagues read on your device, never stored on our servers", when: "v1" },
  { name: "MyFantasyLeague", how: "Official API with access you grant", when: "Later" },
  { name: "CBS", how: "Needs a technical check", when: "Later" },
  { name: "NFL.com", how: "Not needed; leagues moved to ESPN", when: "n/a" },
];
const FORMATS: { name: string; when: string }[] = [
  { name: "Redraft (PPR, Half, Standard)", when: "MVP" },
  { name: "Superflex and TE Premium", when: "MVP" },
  { name: "Dynasty, with rookie picks", when: "v1 (offseason build)" },
  { name: "Keeper, with keeper cost in value", when: "v1" },
  { name: "Guillotine, with FAAB pacing", when: "Later" },
  { name: "IDP", when: "Later" },
  { name: "Best ball", when: "Not planned (few trades)" },
];
const PHASES = [
  { phase: "MVP (private beta)", when: "Rest of 2026 season", what: "Sleeper redraft: needs map, intent tags, trade finder, what would it take, trade builder, verdicts, optimal lineup, Per Sources nudges, pitch and send" },
  { phase: "v1 (public launch)", when: "Aug 2027", what: "iOS, Android, web; ESPN and Yahoo; dynasty and keeper; waivers and FAAB; manager tendencies; full AI nudges; Pro tier" },
  { phase: "Later", when: "2028", what: "MFL, CBS, IDP, guillotine, commissioner tools, trade report cards" },
];

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} className={`switch${on ? " on" : ""}`} onClick={() => onChange(!on)} aria-label={label}>
      <span />
    </button>
  );
}

export function Settings({ username, demo, leagueFormat, onRefresh, format, setFormat, level, setLevel, fade, setFade, dismissed, resetDismissed, onDisconnect, onDelete, onReplay }: {
  username: string;
  demo: boolean;
  leagueFormat: LeagueFormat;
  onRefresh: () => void;
  format: Format; setFormat: (f: Format) => void;
  level: Level; setLevel: (l: Level) => void;
  fade: FadeWeeks; setFade: (f: FadeWeeks) => void;
  dismissed: Record<string, number>; resetDismissed: () => void;
  onDisconnect: () => void; onDelete: () => void; onReplay: () => void;
}) {
  const [confirm, setConfirm] = useState<"none" | "disconnect" | "delete">("none");
  const muted = Object.entries(dismissed).filter(([, n]) => n >= 2).map(([k]) => k);
  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Account</div>
          <h1 className="page-title">Settings</h1>
        </div>
      </header>

      <section className="card settings-group">
        <h2 className="section-title">League connection</h2>
        <div className="set-row">
          <span className="set-ic"><Icon name="plug" size={18} /></span>
          <span className="grow" style={{ minWidth: 0 }}><b>Sleeper</b><span className="small muted" style={{ display: "block" }}>{demo ? "Not connected. You're exploring the demo league." : `Connected as @${username} · ${LEAGUE_NAME} · read-only`}</span></span>
          {demo ? <button className="btn btn-sm btn-primary" onClick={onDisconnect}>Connect Sleeper</button> : (
            <span className="row wrap">
              <button className="btn btn-sm" onClick={onRefresh}>Refresh</button>
              {confirm === "disconnect" ? (
                <><button className="btn btn-sm btn-danger" onClick={onDisconnect}>Disconnect Sleeper</button><button className="btn btn-sm btn-ghost" onClick={() => setConfirm("none")}>Cancel</button></>
              ) : <button className="btn btn-sm" onClick={() => setConfirm("disconnect")}>Disconnect</button>}
            </span>
          )}
        </div>
        <div className="note-good"><Icon name="lock" size={16} /><span><b>No passwords, ever.</b> Sources connects with your username or the platform's official sign-in. We never ask for or store a fantasy app password.</span></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Platform</th><th>How you connect</th><th>When</th></tr></thead>
            <tbody>{PLATFORMS.map((p) => <tr key={p.name}><td><b>{p.name}</b></td><td>{p.how}</td><td>{p.when === "n/a" ? <span className="muted">n/a</span> : <span className={`when when-${p.when}`}>{p.when === "MVP" ? "Available" : p.when === "v1" ? "Next" : "Later"}</span>}</td></tr>)}</tbody>
          </table>
        </div>
        <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={onReplay}>{demo ? "Run setup again" : "Switch league or account"}</button>
      </section>

      <section className="card settings-group">
        <h2 className="section-title">League format</h2>
        <div className="set-row">
          <span className="grow"><b>Scoring</b><span className="small muted" style={{ display: "block" }}>{demo ? "Changes every projection, need and trade." : `Your league is set to ${formatLabel(leagueFormat)}. Changing it here only changes how Sources scores.`}</span></span>
          <Seg<Scoring> label="Scoring" value={format.scoring} onChange={(v) => setFormat({ ...format, scoring: v })}
            options={[{ v: "ppr", label: "PPR" }, { v: "half", label: "Half" }, { v: "std", label: "Standard" }]} />
        </div>
        <div className="set-row">
          <span className="grow"><b>Superflex</b><span className="small muted" style={{ display: "block" }}>Adds a slot any QB, RB, WR or TE can fill.</span></span>
          <Toggle label="Superflex" on={format.superflex} onChange={(v) => setFormat({ ...format, superflex: v })} />
        </div>
        <div className="set-row">
          <span className="grow"><b>TE Premium</b><span className="small muted" style={{ display: "block" }}>+0.5 per TE reception.</span></span>
          <Toggle label="TE Premium" on={format.tePremium} onChange={(v) => setFormat({ ...format, tePremium: v })} />
        </div>
        <p className="tiny muted">{demo ? "Demo projections are PPR. Half, Standard and TE Premium are derived using estimated receptions by position." : "Projections come from Sleeper for every scoring type. TE Premium adds half a point per projected TE reception."} Trade values: {LEAGUE.valueSource}.</p>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Format</th><th>When</th></tr></thead>
            <tbody>{FORMATS.map((f) => <tr key={f.name}><td>{f.name}</td><td>{f.when}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="card settings-group">
        <h2 className="section-title">Nudges</h2>
        <div className="set-row">
          <span className="grow"><b>Nudge level</b><span className="small muted" style={{ display: "block" }}>Up to {PUSH_CAP[level]} push notifications a week. In-app nudges stay inline and never block a screen.</span></span>
          <Seg<Level> label="Nudge level" value={level} onChange={setLevel}
            options={[{ v: "light", label: "Light" }, { v: "standard", label: "Standard" }, { v: "hands", label: "Hands-on" }]} />
        </div>
        <ul className="small level-list">
          <li><b>Light:</b> the two most important nudges, lineup and offer alerts. No tips.</li>
          <li><b>Standard:</b> top nudges, roster tag suggestions, and live builder tips.</li>
          <li><b>Hands-on:</b> everything, including patterns and stale-tag checks.</li>
        </ul>
        <div className="set-row">
          <span className="grow"><b>What Sources learned</b><span className="small muted" style={{ display: "block" }}>{muted.length ? `Showing fewer: ${muted.join(", ")} nudges.` : "Tap \"Not useful\" on a nudge and Sources shows fewer like it."}</span></span>
          {muted.length > 0 && <button className="btn btn-sm" onClick={resetDismissed}>Reset</button>}
        </div>
        <p className="tiny muted">Nudges line up with real deadlines: waivers, lineup lock, and the trade deadline.</p>
      </section>

      <section className="card settings-group">
        <h2 className="section-title">Intent tags</h2>
        <div className="set-row">
          <span className="grow"><b>Tags fade after</b><span className="small muted" style={{ display: "block" }}>Interest changes week to week. Faded tags stop filtering suggestions until you confirm them.</span></span>
          <Seg label="Tag fade" value={String(fade) as "2" | "4" | "6"} onChange={(v) => setFade(Number(v) as FadeWeeks)}
            options={[{ v: "2", label: "2 wks" }, { v: "4", label: "4 wks" }, { v: "6", label: "6 wks" }]} />
        </div>
      </section>

      <section className="card settings-group">
        <h2 className="section-title">Privacy and trust</h2>
        <ul className="trust">
          <li><b>No passwords, ever.</b> Official sign-in or username only.</li>
          <li><b>Tags are private.</b> What you note about a league mate is never shown to them.</li>
          <li><b>Collect the minimum.</b> Rosters are mostly public already; tokens and emails get real protection.</li>
          <li><b>One tap to leave.</b> Disconnect any platform or delete your account and data instantly.</li>
          <li><b>No selling data.</b> Said plainly in the privacy policy.</li>
          <li><b>Show our work.</b> Every verdict explains why, and every value shows when it last changed.</li>
          <li><b>Nothing sends on its own.</b> Sources preps the message. You tap send.</li>
        </ul>
        <div className="set-row danger-row">
          <span className="grow"><b>Delete account and data</b><span className="small muted" style={{ display: "block" }}>Removes your connection, tags, prices and history from this device. This can't be undone.</span></span>
          {confirm === "delete" ? (
            <span className="row"><button className="btn btn-sm btn-danger" onClick={onDelete}><Icon name="trash" size={14} />Delete my data</button><button className="btn btn-sm btn-ghost" onClick={() => setConfirm("none")}>Cancel</button></span>
          ) : <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirm("delete")}>Delete my data</button>}
        </div>
      </section>

      <section className="card settings-group">
        <h2 className="section-title">Release phases</h2>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Phase</th><th>Timing</th><th>What ships</th></tr></thead>
            <tbody>{PHASES.map((p) => <tr key={p.phase}><td><b>{p.phase}</b></td><td>{p.when}</td><td>{p.what}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
