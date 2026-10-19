import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Logo } from "./Logo";
import { INITIAL_MANAGER_TAGS, INITIAL_MY_TAGS, TEAMS, YOU, playerById, teamById } from "../data";
import { activeTags, allNeeds, applyFormat, DEFAULT_FORMAT, findTrades, fmt, groupsFor } from "../engine";
import { SLeague, SleeperError, findLeagues, findUser } from "../sleeper";
import { Icon, PosBadge } from "./ui";
import { Scoreboard, TradeIdea } from "./Wire";
import { TradeCompare } from "./Trade";
import { PlatformLogo, PlatformName } from "./PlatformLogo";
import { Avatar } from "./Avatar";
import { drawCard } from "./PitchSheet";
import { IdeaScan } from "./IdeaScan";
import { draftPitch } from "../pitch";
import { PtsCell, gameNow, playCls, PlayCount } from "./Roster";
import { useLive, startersOf, playCount } from "../live";
import { eff } from "../engine";

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
  const [errFor, setErrFor] = useState("ld-user");

  applyFormat(DEFAULT_FORMAT);
  // The landing is for Sleeper leagues, so it wears Sleeper's accent like the app does
  useEffect(() => { document.documentElement.dataset.platform = "sleeper"; }, []);
  useEffect(() => {
    const prev = document.title;
    document.title = "Sources: fantasy football trades for Sleeper leagues";
    return () => { document.title = prev; };
  }, []);
  const live = useLive();
  const starters = startersOf(YOU).map(playerById);
  const order = { in_game: 0, complete: 1, pre_game: 2 } as Record<string, number>;
  const liveRows = [...starters].sort((a, b) => (order[gameNow(live, a.id, a.nfl).state ?? "pre_game"] ?? 3) - (order[gameNow(live, b.id, b.nfl).state ?? "pre_game"] ?? 3)).slice(0, 5);
  const demo = useMemo(() => {
    const tags = activeTags(INITIAL_MANAGER_TAGS, 4);
    const needs = allNeeds();
    const mike = teamById("mike");
    const trade = findTrades(YOU, mike, tags, INITIAL_MY_TAGS, {}, 1)[0];
    const thin = needs.filter((n) => !n.team.you).sort((a, b) => a.groups[a.need].pct - b.groups[b.need].pct).slice(0, 3);
    return { needs, trade, mike, thin, you: needs.find((n) => n.team.you)! };
  }, []);

  // The same trade card and message the app's pitch sheet makes
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!demo.trade) return;
    let url: string | null = null, alive = true;
    drawCard(demo.trade).then((b) => { if (b && alive) { url = URL.createObjectURL(b); setCardUrl(url); } });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [demo.trade]);

  const connect = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const name = username.trim().replace(/^@/, "");
    if (busy) return;
    if (!name) { setError("Enter your Sleeper username to find your leagues."); return; }
    setBusy(true); setError("");
    try {
      const u = await findUser(name);
      if (!u) { setError(`No Sleeper account named @${name}. It's your Sleeper username, not your email.`); setBusy(false); return; }
      const { leagues } = await findLeagues(u.user_id);
      if (!leagues.length) { setError("That account isn't in any NFL leagues on Sleeper yet. Join one on Sleeper, or try the demo."); setBusy(false); return; }
      onLive({ username: name, user: { id: u.user_id, name: u.display_name || name }, leagues });
    } catch (err) {
      setError(err instanceof SleeperError ? err.message : "We couldn't reach Sleeper. Check your connection and try again.");
    }
    setBusy(false);
  };

  // Fade sections up as they enter the viewport, and light the tagline one word at a time
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -12% 0px" });
    el.querySelectorAll(".ld2-reveal").forEach((n) => io.observe(n));
    const words = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("on", e.isIntersecting || e.boundingClientRect.top < 0)), { rootMargin: "0px 0px -45% 0px" });
    el.querySelectorAll(".ld2-tag span").forEach((n) => words.observe(n));
    return () => { io.disconnect(); words.disconnect(); };
  }, []);

  const form = (id: string) => (
    <>
      <label htmlFor={id} className="ld2-label">Your <PlatformName /> username</label>
      <form className="ld2-form" onSubmit={(e) => { setErrFor(id); connect(e); }} noValidate>
        <span className="at" aria-hidden="true">@</span>
        <input id={id} value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }} aria-invalid={!!error && errFor === id} aria-describedby={`${id}-help`} name="username"
          placeholder="yourname…" autoComplete="username" autoCapitalize="none" spellCheck={false} />
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Finding your leagues…" : "Find my leagues"}</button>
      </form>
      <p id={`${id}-help`} className={error && errFor === id ? "ld2-error" : "ld2-help"} role={error && errFor === id ? "alert" : undefined}>{(errFor === id && error) || "Free. No password. Read only, so Sources can't change anything in Sleeper."}</p>
    </>
  );
  const tagline = "Every offer judged by both starting lineups, then pitched around what the other manager needs.";
  // Each answer stands on its own, so search and AI answers can quote it without the question
  const faqs: [string, string][] = [
    ["What is Sources?", "Sources is a free trade tool for Sleeper fantasy football leagues. It reads your league, measures what every team needs at each starting slot, and builds trades that raise both teams' starting points. It also drafts the pitch, lineup fixes and waiver bids."],
    ["Is Sources free?", "Yes. Sources is free. Connect your Sleeper league with your username and use every screen, from trade ideas to waiver bids, at no cost."],
    ["Do you need my Sleeper password?", "No. Sources only needs your Sleeper username. League data comes from Sleeper's public API, so there's no password and nothing to sign into."],
    ["Can Sources make moves in my league?", "No. Sources is read only, so it can't change anything in your Sleeper league. It drafts offers, lineup changes and waiver bids. You make every move in Sleeper yourself."],
    ["Where do trade values come from?", "Sources blends public market values for your league's scoring format with a projection model for the rest of the season and each team's actual starting needs. Every offer is then judged by what it does to both starting lineups."],
    ["Will other managers see my notes?", "No. Tags and notes you log about league mates stay on your device. Sources never shows them to other managers."],
    ["Does the win chance match Sleeper?", "Yes. Sources uses the lineup you set in Sleeper and the same method Sleeper does, refreshed every 15 seconds while games are on."],
    ["Which platforms work?", "Sources works with Sleeper today. Yahoo and ESPN are next, then MyFantasyLeague and CBS."],
  ];
  const faqLd = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

  return (
    <div className="landing ld2" ref={root}>
      <nav className="ld-nav" aria-label="Sources">
        <div className="brand" style={{ padding: 0 }}><Logo height={28} /></div>
        <button className="btn btn-sm btn-ghost" onClick={onDemo}>Try the demo</button>
      </nav>

      <main>
      <header className="ld-hero ld2-hero">
        <div className="ld2-copy">
          <span className="ld2-eyebrow ld-rise"><PlatformLogo size={14} />For Sleeper leagues</span>
          <h1 className="ld2-h1 ld-rise">Trades your league<br />will actually accept.</h1>
          <p className="ld2-sub ld-rise d1">Sources reads your Sleeper league, learns what every team needs, and builds deals that help both sides.</p>
          <div className="ld-rise d2">{form("ld-user")}</div>
          <button className="ld2-link ld-rise d3" onClick={onDemo}>Or explore a sample league<Icon name="chev" size={14} /></button>
        </div>

        <div className="ld-preview ld2-preview" aria-hidden="true" {...{ inert: "" }}>
          <div className="ld-rise d1"><Scoreboard you={demo.you} partner={demo.mike.manager} extras={false} /></div>
          {demo.trade && (
            <article className="card nudge ld-preview-2 ld2-idea ld-rise d2">
              <span className="nudge-kind"><Icon name="trade" size={15} />Trade idea</span>
              <h3>{demo.mike.name} needs <em>a TE.</em></h3>
              <TradeIdea t={demo.trade} onOpen={() => onDemo()} onPitch={() => onDemo()} />
            </article>
          )}
        </div>
      </header>

      <section className="ld2-tagwrap" aria-label="What Sources does">
        <p className="ld2-tag">{tagline.split(" ").map((w, i) => <span key={i}>{w} </span>)}</p>
      </section>

      <section className="ld-section ld2-steps" aria-labelledby="ld-steps">
        <h2 id="ld-steps" className="ld-h2 ld2-reveal">Up and running in a minute.</h2>
        <ol>
          <li className="ld2-reveal"><b>1</b><h3>Enter your username</h3><p>Your Sleeper username, nothing else. No password, no sign up form.</p></li>
          <li className="ld2-reveal"><b>2</b><h3>Pick your league</h3><p>Sources loads rosters, projections, trades and waivers for the league you choose.</p></li>
          <li className="ld2-reveal"><b>3</b><h3>Get your moves</h3><p>Trade ideas that help both sides, lineup fixes and waiver bids, refreshed through the week.</p></li>
        </ol>
      </section>

      <section className="ld-section" aria-labelledby="ld-how">
        <h2 id="ld-how" className="ld-h2 ld2-reveal">Built on your league, not a value chart.</h2>
        <div className="ld-bento">
          <article className="card ld-cell ld2-reveal tall">
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
            <article className="card ld-cell ld2-reveal">
              <h3>Verdicts in starting points</h3>
              <p>Every deal is judged by what it does to both starting lineups, so three bench players can't fake a star.</p>
              <TradeCompare trade={demo.trade} them={demo.mike} />
            </article>
          )}
          {demo.trade && (
            <article className="card ld-cell ld2-reveal">
              <h3>Pitch it where you talk</h3>
              <p>A message written around their need, ready for text, the group chat or Sleeper. You hit send.</p>
              <div className="ld2-pitch">
                <p className="ld2-bubble">{draftPitch(demo.trade, "friendly")}</p>
                <figure className="tcard">{cardUrl ? <img src={cardUrl} alt={`Trade offer card for ${demo.mike.manager}`} /> : <div className="tcard-skel" />}</figure>
              </div>
            </article>
          )}
          {demo.trade && (
            <article className="card ld-cell ld2-reveal wide">
              <h3>Ideas both sides say yes to</h3>
              <p>Tell Sources what a league mate said. It reads your notes, checks both lineups, tests the deals and keeps only the ones where both teams gain points.</p>
              <FinderDemo steps={[`Reading 2 notes on ${demo.mike.manager}`, "Checking what both lineups need", "Testing deals across both rosters", "Keeping trades where both sides gain points"]}>
                <TradeIdea t={demo.trade} onOpen={() => onDemo()} onPitch={() => onDemo()} />
              </FinderDemo>
            </article>
          )}
          <article className="card ld-cell ld2-reveal wide ld2-live">
            <div className="ld2-live-head">
              <div><h3>Sunday, live</h3><p>Points so far, where each player is on pace to finish, and a win chance that tracks Sleeper's. Players heat up when they're beating their projection, cool off when they're not, and finals are set in stone.</p></div>
              <PlayCount c={playCount(live, starters.map((p) => p.nfl))} />
            </div>
            <div className="lu-list ld2-live-rows">
              {liveRows.map((p) => {
                const g = gameNow(live, p.id, p.nfl);
                return (
                  <div key={p.id} className={`lu-row${playCls(g)}`}>
                    <span className={`lu-slot s-${p.pos}`}>{p.pos}</span>
                    <Avatar p={p} size={40} />
                    <span className="lu-who"><span className="lu-name">{p.name}</span><span className="lu-meta"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span>{p.nfl}</span>{g.state === "in_game" ? <span className="lu-live"><i aria-hidden="true" />Live</span> : g.state === "complete" ? <span className="lu-final">Final</span> : null}</span></span>
                    <PtsCell id={p.id} g={g} proj={eff(p, true)} />
                  </div>
                );
              })}
            </div>
          </article>
        </div>
      </section>

      <section className="ld-trust ld2-trust" aria-labelledby="ld-private">
        <h2 id="ld-private" className="ld-h2 ld2-reveal">Private by default.</h2>
        <ul className="ld-trust-list">
          <li className="ld2-reveal"><Icon name="lock" size={22} /><div><b>No passwords</b><p>Connect with your Sleeper username. Your league is read straight from Sleeper's public API.</p></div></li>
          <li className="ld2-reveal"><Icon name="eye" size={22} /><div><b>Your notes stay yours</b><p>What you log about league mates is private and never shown to them.</p></div></li>
          <li className="ld2-reveal"><Icon name="send" size={22} /><div><b>Nothing sends on its own</b><p>Sources drafts the offer. You decide if and where it goes.</p></div></li>
        </ul>
      </section>

      <section className="ld-section ld2-faq" aria-labelledby="ld-faq">
        <h2 id="ld-faq" className="ld-h2 ld2-reveal">Questions, answered.</h2>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd }} />
        <div className="ld2-faq-list ld2-reveal">
          {faqs.map(([q, a]) => (
            <details key={q}><summary>{q}<Icon name="chev" size={16} /></summary><p>{a}</p></details>
          ))}
        </div>
      </section>

      <section className="ld2-final ld2-reveal" aria-labelledby="ld-final">
        <div className="ld2-final-panel">
          <h2 id="ld-final" className="ld2-h1 ld2-final-h">See your first trade<br />in under a minute.</h2>
          <div className="ld2-final-form">{form("ld-user-2")}</div>
          <button className="ld2-link" onClick={onDemo}>Or explore a sample league<Icon name="chev" size={14} /></button>
        </div>
      </section>
      </main>

      <footer className="ld-foot">
        <span>Sources. Your fantasy insider.</span>
        <span>Not affiliated with Sleeper. The {TEAMS.length} team sample league uses made up data.</span>
      </footer>
    </div>
  );
}

/** The trade finder doing its thing: it runs through its steps when scrolled into view, then shows what it found. */
function FinderDemo({ steps, children }: { steps: string[]; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"wait" | "scan" | "done">("wait");
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setPhase((p) => (p === "wait" ? "scan" : p)); io.disconnect(); } }, { rootMargin: "0px 0px -20% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="ld2-finder">
      {phase !== "done" ? <IdeaScan steps={steps} onDone={() => setPhase("done")} key={phase} paused={phase === "wait"} /> : <div className="ld2-found">{children}</div>}
      {phase === "done" && <button className="ld2-again" onClick={() => setPhase("scan")}><Icon name="spark" size={14} />Run it again</button>}
    </div>
  );
}
