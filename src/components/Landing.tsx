import { useMemo, useState } from "react";
import { INITIAL_MANAGER_TAGS, INITIAL_MY_TAGS, TEAMS, YOU, playerById, teamById } from "../data";
import { activeTags, allNeeds, applyFormat, DEFAULT_FORMAT, findTrades, fmt, groupsFor } from "../engine";
import { SLeague, SleeperError, findLeagues, findUser } from "../sleeper";
import { Delta, Icon, PosBadge } from "./ui";
import { Scoreboard, TradeIdea } from "./Wire";
import { TradeCompare } from "./Trade";

/**
 * Public landing. Everything on the right side and in the feature grid is a real
 * component running on the demo league, not a mock screenshot.
 */
export function Landing({ onLive, onDemo }: {
  onLive: (s: { username: string; user: { id: string; name: string }; leagues: SLeague[] }) => void;
  onDemo: () => void;
}) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  applyFormat(DEFAULT_FORMAT);
  const demo = useMemo(() => {
    const tags = activeTags(INITIAL_MANAGER_TAGS, 4);
    const needs = allNeeds();
    const mike = teamById("mike");
    const trade = findTrades(YOU, mike, tags, INITIAL_MY_TAGS, {}, 1)[0];
    const thin = needs.filter((n) => !n.team.you).sort((a, b) => a.groups[a.need].pct - b.groups[b.need].pct).slice(0, 3);
    return { needs, trade, mike, thin, you: needs.find((n) => n.team.you)! };
  }, []);

  const connect = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const name = username.trim().replace(/^@/, "");
    if (!name || busy) return;
    setBusy(true); setError("");
    try {
      const u = await findUser(name);
      if (!u) { setError(`No Sleeper account named @${name}. It's your Sleeper username, not your email.`); setBusy(false); return; }
      const { leagues } = await findLeagues(u.user_id);
      if (!leagues.length) { setError("That account isn't in any NFL leagues on Sleeper yet."); setBusy(false); return; }
      onLive({ username: name, user: { id: u.user_id, name: u.display_name || name }, leagues });
    } catch (err) {
      setError(err instanceof SleeperError ? err.message : "Couldn't reach Sleeper. Try again in a moment.");
    }
    setBusy(false);
  };

  return (
    <div className="landing">
      <nav className="ld-nav" aria-label="Sources">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark" aria-hidden="true">“</span>
          <span className="brand-name">Sources</span>
        </div>
        <button className="btn btn-sm" onClick={onDemo}>Try the demo</button>
      </nav>

      <header className="ld-hero">
        <div>
          <h1 className="ld-h1 ld-rise">Trades your league will actually accept.</h1>
          <p className="ld-sub ld-rise d1">Sources reads your Sleeper league, learns what every team needs, and builds deals that help both sides.</p>
          <label htmlFor="ld-user" className="ld-label ld-rise d2">Your Sleeper username</label>
          <form className="ld-form ld-rise d2" onSubmit={connect}>
            <span className="at" aria-hidden="true">@</span>
            <input id="ld-user" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }}
              placeholder="yourname" autoComplete="username" autoCapitalize="none" spellCheck={false} />
            <button className="btn btn-primary" type="submit" disabled={!username.trim() || busy}>{busy ? "Finding you…" : "Connect Sleeper"}</button>
          </form>
          {error ? <p className="small ob-error ld-error" role="alert">{error}</p> : <p className="ld-help">No password needed.</p>}
          <button className="btn ld-rise d3" style={{ marginTop: 18 }} onClick={onDemo}>Try the demo</button>
        </div>

        <div className="ld-preview" aria-hidden="true">
          <div className="ld-rise d1"><Scoreboard you={demo.you} partner={demo.mike.manager} /></div>
          {demo.trade && (
            <article className="card nudge ld-preview-2 ld-rise d2">
              <span className="nudge-kind"><Icon name="trade" size={15} />Trade idea</span>
              <h3><span className="ps">Per sources, </span>{demo.mike.name} needs <em>a TE.</em></h3>
              <TradeIdea t={demo.trade} onOpen={() => onDemo()} onPitch={() => onDemo()} />
            </article>
          )}
        </div>
      </header>

      <section className="ld-section" aria-labelledby="ld-how">
        <h2 id="ld-how" className="ld-h2">Built on your league, not a value chart.</h2>
        <div className="ld-bento">
          <article className="card ld-cell reveal tall gradient">
            <h3>Know who needs what</h3>
            <p>Every starting slot measured against your league's average, so you know exactly where an offer lands.</p>
            <div className="bars">
              {demo.thin.map((n) => (
                <div key={n.team.id} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}><b className="small">{n.team.name}</b><span className="row small muted">Needs <PosBadge pos={n.need} /></span></div>
                  {groupsFor().slice(0, 4).map((g) => {
                    const d = n.groups[g];
                    const w = Math.min(Math.abs(d.pct) * 140, 50);
                    return (
                      <div key={g} className="bar-row">
                        <span className="bar-label">{g}</span>
                        <span className="bar-track"><span className="bar-mid" /><span className={`bar-fill ${d.diff >= 0 ? "up" : "down"}`} style={{ width: `${w}%` }} /></span>
                        <span className="bar-val" style={{ color: d.diff >= 0 ? "var(--good)" : "var(--bad)" }}>{fmt(d.diff)}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </article>
          {demo.trade && (
            <article className="card ld-cell reveal">
              <h3>Verdicts in starting points</h3>
              <p>Every deal is judged by what it does to both starting lineups, so three bench players can't fake a star.</p>
              <TradeCompare trade={demo.trade} them={demo.mike} />
            </article>
          )}
          {demo.trade && (
            <article className="card ld-cell reveal">
              <h3>Pitch it where you talk</h3>
              <p>A message written around their need, ready for text, the group chat or Sleeper. You hit send.</p>
              <figure className="pitch-card" style={{ margin: 0 }}>
                <div className="pc-title">A trade that works for {demo.mike.manager}</div>
                <div className="pc-cols">
                  <div><span className="pc-k">{demo.mike.manager} gets</span>{demo.trade.give.map((id) => <div key={id} className="pc-p"><PosBadge pos={playerById(id).pos} />{playerById(id).name}</div>)}</div>
                  <div><span className="pc-k">I get</span>{demo.trade.get.map((id) => <div key={id} className="pc-p"><PosBadge pos={playerById(id).pos} />{playerById(id).name}</div>)}</div>
                </div>
                <div className="pc-nums"><span>{demo.mike.manager} <Delta n={demo.trade.themDelta} />/wk</span><span>Me <Delta n={demo.trade.youDelta} />/wk</span></div>
              </figure>
            </article>
          )}
        </div>
      </section>

      <section className="ld-trust" aria-labelledby="ld-private">
        <h2 id="ld-private" className="ld-h2">Private by default.</h2>
        <ul className="ld-trust-list">
          <li><Icon name="lock" size={22} /><div><b>No passwords</b><p>Connect with your Sleeper username. Your league is read straight from Sleeper's public API.</p></div></li>
          <li><Icon name="eye" size={22} /><div><b>Your notes stay yours</b><p>What you log about league mates is private and never shown to them.</p></div></li>
          <li><Icon name="send" size={22} /><div><b>Nothing sends on its own</b><p>Sources drafts the offer. You decide if and where it goes.</p></div></li>
        </ul>
      </section>

      <footer className="ld-foot">
        <span>Sources. Your fantasy insider.</span>
        <span>Not affiliated with Sleeper. {TEAMS.length}-team demo league uses sample data.</span>
      </footer>
    </div>
  );
}
