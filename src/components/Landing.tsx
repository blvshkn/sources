import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Logo } from "./Logo";
import { INITIAL_MANAGER_TAGS, INITIAL_MY_TAGS, TEAMS, YOU, playerById, teamById, type Player } from "../data";
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

  // The cast floating around the hero: the best players in the sample league, real Sleeper headshots
  const cast = useMemo(() => {
    const seen = new Set<string>();
    return TEAMS.flatMap((t) => t.roster).map(playerById).filter((p): p is Player => !!p && !/^[A-Z]{2,3}$/.test(p.id))
      .sort((a, b) => b.proj - a.proj).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, 7);
  }, []);

  // The same trade card and message the app's pitch sheet makes
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!demo.trade) return;
    let url: string | null = null, alive = true;
    drawCard(demo.trade, "216, 242, 74").then((b) => { if (b && alive) { url = URL.createObjectURL(b); setCardUrl(url); } });
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

  // Parallax: one rAF-throttled scroll and pointer read, written as CSS variables on the two layers that use them
  const env = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    let raf = 0, mx = 0, my = 0, tx = 0, ty = 0;
    const tick = () => {
      raf = 0;
      // Ease the pointer toward its target so the layers drift instead of snapping
      tx += (mx - tx) * 0.12; ty += (my - ty) * 0.12;
      const y = Math.min(window.scrollY, 2400);
      for (const el of [env.current, stage.current]) {
        if (!el) continue;
        el.style.setProperty("--sy", String(y));
        el.style.setProperty("--mx", tx.toFixed(3));
        el.style.setProperty("--my", ty.toFixed(3));
      }
      if (Math.abs(mx - tx) > 0.002 || Math.abs(my - ty) > 0.002) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const move = (e: PointerEvent) => { mx = e.clientX / innerWidth * 2 - 1; my = e.clientY / innerHeight * 2 - 1; kick(); };
    addEventListener("scroll", kick, { passive: true });
    if (fine) addEventListener("pointermove", move, { passive: true });
    kick();
    return () => { removeEventListener("scroll", kick); removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
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
      <div className="ld2-env" ref={env} aria-hidden="true">
        <i className="env-glow g1" /><i className="env-glow g2" /><i className="env-glow g3" />
        <div className="env-field"><div className="env-turf" /></div>
        <i className="env-grain" style={{ backgroundImage: GRAIN }} />
      </div>
      <nav className="ld-nav ld2-nav" aria-label="Sources">
        <div className="brand" style={{ padding: 0 }}><Logo height={28} /></div>
        <button className="btn btn-sm btn-ghost" onClick={onDemo}>Try the demo</button>
      </nav>

      <main>
      <header className="ld-hero ld2-hero">
        <div className="ld2-copy">
          <span className="ld2-eyebrow ld2-in"><PlatformLogo size={14} />For Sleeper leagues</span>
          <h1 className="ld2-h1 ld2-typed"><TypedHeadline lines={HEADLINES} /></h1>
          <p className="ld2-sub ld2-in" style={{ ["--i" as string]: 3 }}>Sources reads your Sleeper league, learns what every team needs, and builds deals that help both sides.</p>
          <div className="ld2-in" style={{ ["--i" as string]: 4 }}>{form("ld-user")}</div>
          <button className="ld2-link ld2-in" style={{ ["--i" as string]: 5 }} onClick={onDemo}>Or explore a sample league<Icon name="chev" size={14} /></button>
        </div>

        <div className="ld2-stage" ref={stage}>
        <div className="ld2-heads" aria-hidden="true">
          {cast.map((p, i) => (
            <span key={p.id} className={`ld2-head h${i}`} style={{ ["--i" as string]: i }}>
              <span className="ld2-head-in"><Avatar p={p} size={56} /><b>{p.name.split(" ").slice(-1)[0]}</b></span>
            </span>
          ))}
        </div>
        <div className="ld-preview ld2-preview" aria-hidden="true" {...{ inert: "" }}>
          <div className="ld2-card c1"><Scoreboard you={demo.you} partner={demo.mike.manager} extras={false} /></div>
          {demo.trade && (
            <article className="card nudge ld-preview-2 ld2-idea ld2-card c2">
              <span className="nudge-kind"><Icon name="trade" size={15} />Trade idea</span>
              <h3>{demo.mike.name} needs <em>a TE.</em></h3>
              <TradeIdea t={demo.trade} onOpen={() => onDemo()} onPitch={() => onDemo()} />
            </article>
          )}
        </div>
        </div>
      </header>

      <section className="ld2-tagwrap" aria-label="What Sources does">
        <p className="ld2-tag">{tagline.split(" ").map((w, i) => <span key={i}>{w} </span>)}</p>
      </section>

      <section className="ld-section ld2-steps" aria-labelledby="ld-steps">
        <h2 id="ld-steps" className="ld-h2 ld2-reveal">Up and running in a minute.</h2>
        <ol>
          <li className="ld2-reveal" style={{ ["--i" as string]: 0 }}><b>1</b><h3>Enter your username</h3><p>Your Sleeper username, nothing else. No password, no sign up form.</p></li>
          <li className="ld2-reveal" style={{ ["--i" as string]: 1 }}><b>2</b><h3>Pick your league</h3><p>Sources loads rosters, projections, trades and waivers for the league you choose.</p></li>
          <li className="ld2-reveal" style={{ ["--i" as string]: 2 }}><b>3</b><h3>Get your moves</h3><p>Trade ideas that help both sides, lineup fixes and waiver bids, refreshed through the week.</p></li>
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

// Inline so the stylesheet has no url() and Vite skips its PostCSS pass
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** Everything Sources does, one headline at a time. The first is the promise; the rest rotate in behind it. */
const HEADLINES = [
  "Trades your league\nwill actually accept.",
  "Lineups set\nbefore kickoff.",
  "Waiver bids\nsized to win.",
  "Pitches written\naround their needs.",
  "Win chances that\nmatch Sleeper live.",
];

/**
 * Types the headline out, holds it, backs it out and types the next. Every phrase sits invisibly
 * in the same grid cell so the hero never changes height. Screen readers get the first line as plain text.
 * Pauses when the hero is off screen or the tab is hidden.
 */
function TypedHeadline({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setText(lines[0]); setTyping(false); return; }
    let i = 0, n = 0, dir = 1, timer = 0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !timer) step(); });
    if (ref.current) io.observe(ref.current);
    const step = () => {
      timer = 0;
      if (!visible || document.hidden) return;
      const full = lines[i];
      n += dir;
      setText(full.slice(0, n));
      let wait: number;
      if (dir > 0 && n >= full.length) { dir = -1; setTyping(false); wait = i === 0 ? 4200 : 3000; }
      else if (dir < 0 && n <= 0) { dir = 1; i = (i + 1) % lines.length; setTyping(true); wait = 380; }
      else { setTyping(true); wait = dir > 0 ? (full[n - 1] === "\n" ? 160 : 38 + Math.random() * 46) : 18; }
      timer = window.setTimeout(step, wait);
    };
    const vis = () => { if (!document.hidden && !timer) step(); };
    document.addEventListener("visibilitychange", vis);
    timer = window.setTimeout(step, 420);
    return () => { clearTimeout(timer); io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, [lines]);
  return (
    <>
      <span className="sr-only">{lines[0].replace("\n", " ")}</span>
      <span className="ld2-typed-box" ref={ref} aria-hidden="true">
        {lines.map((l) => <span key={l} className="ld2-typed-size">{l}</span>)}
        <span className="ld2-typed-live"><span className="ld2-typed-text">{text}</span><i className={`ld2-caret${typing ? " on" : ""}`} /></span>
      </span>
    </>
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
