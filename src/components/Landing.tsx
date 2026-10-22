import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setInert } from "../inert";
import { BrandLogo } from "./BrandLogo";
import { INITIAL_MANAGER_TAGS, INITIAL_MY_TAGS, TEAMS, YOU, playerById, teamById, type Player } from "../data";
import { activeTags, allNeeds, applyFormat, ask, DEFAULT_FORMAT, findTrades, fmt, groupsFor, waiverRecs } from "../engine";
import { SLeague, SleeperError, findLeagues, findUser } from "../sleeper";
import { Icon, PosBadge } from "./ui";
import { Scoreboard } from "./Scoreboard";
import { TradeIdea } from "./TradeIdea";
import { TradeCompare } from "./TradeCompare";
import { PlatformLogo, PlatformName } from "./PlatformLogo";
import { Avatar, AvatarPhotos, ManagerAvatar } from "./Avatar";
import { drawCard } from "./lazy";
import { loadJerseyNumbers } from "../jersey";
import { IdeaScan } from "./IdeaScan";
import { ideaSteps } from "../reads";
import type { Answer, Trade } from "../engine";
import type { Steps } from "../steps";
import { cardHeight, draftPitch } from "../pitch";
import { useLoadedIn } from "../loadedIn";
import { PtsCell, gameNow, playCls, PlayCount } from "./LivePts";
import { useLive, startersOf, playCount, type Live } from "../live";
import { eff } from "../engine";
import { AiMark, AiMarkPlay } from "./WorkingLoader";
import { LandingAsk } from "./LandingAsk";
import { AskShowBlock, DealNumbers } from "./AskShow";
import { SwapRows } from "./SwapRows";
import { lockedIn, resultFor } from "../optimalLineup";
import { bestUnderLocks, sleeperNow } from "../lineupWhatIf";
import { DetailSheet } from "./DetailSheet";
import { HowItWorksDoc, LegalDoc } from "./About";
import { useIconStroke } from "./iconStroke";
import { FinalCtaPanel } from "./FinalCta";
import { LandingSteps } from "./LandingSteps";
import { heroDepth } from "../heroDepth";
import { clearHandoff, setHandoff } from "../demoHandoff";
import { sampleWeek, matchNow } from "../live";
import { LEAGUE, OPPONENT_ID } from "../data";
import { Seg } from "./ui";
import { Trophy, WinCup } from "./Trophy";
import { whenNear } from "../idle";
import type { TeamNeeds } from "../engine";

/** What follows YOUR in the banner under the hero */
const YOURS = ["Fantasy Source", "trades", "lineup", "waivers", "league"];

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
  // Headshots for the sample league are matched by name, so the landing needs the player id table too
  useEffect(() => { loadJerseyNumbers(); }, []);
  useEffect(() => {
    const prev = document.title;
    document.title = "Source: fantasy football trades for Sleeper leagues";
    return () => { document.title = prev; };
  }, []);
  const live = useLive();
  const starters = startersOf(YOU).map(playerById);
  const order = { in_game: 0, complete: 1, pre_game: 2 } as Record<string, number>;
  const liveRows = [...starters].sort((a, b) => (order[gameNow(live, a.id, a.nfl).state ?? "pre_game"] ?? 3) - (order[gameNow(live, b.id, b.nfl).state ?? "pre_game"] ?? 3)).slice(0, 5);
  // Sunday, live plays its game-day moments once when it scrolls into view (Zach, Oct 22): the first live player heats
  // up (the smoke), then catches fire, and the second goes cold. The sample's points and clock are scripted through four
  // beats so the real PtsCell turns hot and cold on its own. Reduced motion lands on the last beat with nothing playing.
  const liveCard = useRef<HTMLElement>(null);
  const [heatBeat, setHeatBeat] = useState(0);
  useEffect(() => {
    const el = liveCard.current;
    if (!el || typeof IntersectionObserver === "undefined") { setHeatBeat(3); return; }
    const timers: number[] = [];
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setHeatBeat(3); return; }
      [1100, 2500, 3900].forEach((ms, i) => timers.push(window.setTimeout(() => setHeatBeat(i + 1), ms)));
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); timers.forEach(clearTimeout); };
  }, []);
  const showLive = useMemo((): Live | undefined => {
    if (!live) return live;
    const [hot, cold] = liveRows.filter((p) => gameNow(live, p.id, p.nfl).state === "in_game");
    if (!hot) return live;
    // Share of the game left, and each player's points as a share of his projection, at each beat
    const LEFT = [0.55, 0.4, 0.3, 0.25], HOT = [0.5, 0.82, 1.06, 1.06], COLD = [0.5, 0.62, 0.72, 0.72];
    const pts = (p: Player, r: number) => Math.round(eff(p, true) * r * 10) / 10;
    const points = { ...live.points, [hot.id]: pts(hot, HOT[heatBeat]) };
    const left = { ...live.left, [hot.nfl]: LEFT[heatBeat] };
    if (cold) { points[cold.id] = pts(cold, COLD[heatBeat]); left[cold.nfl] = LEFT[heatBeat]; }
    return { ...live, points, left };
  }, [live, heatBeat]); // eslint-disable-line react-hooks/exhaustive-deps
  const demo = useMemo(() => {
    const tags = activeTags(INITIAL_MANAGER_TAGS, 4);
    const needs = allNeeds();
    const mike = teamById("mike");
    const trade = findTrades(YOU, mike, tags, INITIAL_MY_TAGS, {}, 1)[0];
    const thin = needs.filter((n) => !n.team.you).sort((a, b) => a.groups[a.need].pct - b.groups[b.need].pct).slice(0, 3);
    const notes = INITIAL_MANAGER_TAGS.filter((t) => t.teamId === mike.id);
    return { needs, trade, mike, thin, notes, tags, you: needs.find((n) => n.team.you)! };
  }, []);

  // Ask, answered by the engine on the sample league: one of the app's own starter questions and the same trade math.
  // On a real league Source AI writes the words around these numbers. It sits far below the fold, so it's worked out
  // after the page has loaded, once the reader is within a screen or so of it (idle.whenNear), off the hero's path.
  const [askDemo, setAskDemo] = useState<{ q: string; a: Answer; deal?: Trade } | null>(null);
  const askCell = useRef<HTMLElement>(null);
  useEffect(() => whenNear(askCell.current, () => {
    const q = "Who should I trade with?";
    const a = ask(q, demo.tags, INITIAL_MY_TAGS, {}, []);
    setAskDemo({ q, a, deal: a.links.find((l) => l.trade)?.trade });
  }), [demo.tags]);
  // Set optimal lineup without the network: the engine's lineup and its own reasons (out, bye, projection)
  const optDemo = useMemo(() => {
    const cur = sleeperNow().mine;
    return resultFor(cur, bestUnderLocks(cur, lockedIn(live)), "off");
  }, [live]);
  const watched = useMemo(() => waiverRecs(YOU).find((r) => r.pick)?.fa ?? null, []);
  const [doc, setDoc] = useState<"legal" | "how" | null>(null);
  // The FAQ's "Still have a question?" opens the app's Ask screen as a sheet; its mark waves on view and on hover
  const [askOpen, setAskOpen] = useState(false);
  const [askWave, setAskWave] = useState(0);
  // The YOUR banner moves with the scroll: its track shifts left as the page goes down, wrapping by one run's width.
  const bandRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const band = bandRef.current, track = trackRef.current;
    if (!band || !track || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, on = false;
    const paint = () => {
      raf = 0;
      const run = (track.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
      if (!run) return;
      const x = ((window.scrollY * 0.45) % run + run) % run;
      track.style.transform = `translate3d(${-x}px, 0, 0)`;
    };
    const onScroll = () => { if (on && !raf) raf = requestAnimationFrame(paint); };
    const io = new IntersectionObserver((es) => { on = es.some((e) => e.isIntersecting); if (on) onScroll(); }, { rootMargin: "200px 0px" });
    io.observe(band);
    window.addEventListener("scroll", onScroll, { passive: true });
    paint();
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);
  // The sign-off's SOURCE runs past the page's width: measured once Clash has loaded and on every resize. Its letters
  // rise into place once, in stepped frames, when the footer first comes into view.
  const signRef = useRef<HTMLElement>(null);
  const wordRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = wordRef.current, foot = signRef.current;
    if (!el || !foot) return;
    const fit = () => {
      el.style.fontSize = "100px";
      // 112% of the page's width, centered, so S and E bleed off both sides (Zach: cropped, bleeding off the edges)
      const room = foot.clientWidth * 1.12, w = el.scrollWidth;
      if (w && room) el.style.fontSize = `${(100 * room) / w}px`;
    };
    fit();
    document.fonts?.ready.then(fit).catch(() => {});
    const ro = new ResizeObserver(fit); ro.observe(foot);
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { foot.classList.add("in"); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(foot);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  // The cast floating around the hero: the best players in the sample league, real Sleeper headshots
  const cast = useMemo(() => {
    const seen = new Set<string>();
    return TEAMS.flatMap((t) => t.roster).map(playerById).filter((p): p is Player => !!p && !/^[A-Z]{2,3}$/.test(p.id))
      .sort((a, b) => b.proj - a.proj).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, 7);
  }, []);

  // The same trade card and message the app's pitch sheet makes. It's below the fold, so it's drawn after the page has
  // loaded, once the reader is within a screen or so of it; its skeleton holds the card's exact size until then.
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const cardFig = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!demo.trade) return;
    let url: string | null = null, alive = true;
    const cancel = whenNear(cardFig.current, () => {
      drawCard(demo.trade!, "216, 242, 74", { photos: false }).then((b) => { if (b && alive) { url = URL.createObjectURL(b); setCardUrl(url); } });
    });
    return () => { alive = false; cancel(); if (url) URL.revokeObjectURL(url); };
  }, [demo.trade]);
  const cardIn = useLoadedIn(!cardUrl);

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
    el.querySelectorAll(".ld2-tag > span").forEach((n) => words.observe(n));
    return () => { io.disconnect(); words.disconnect(); };
  }, []);

  // Hero depth: pointer tilt, scroll parallax and the exploded layers on the two hero cards (heroDepth.ts)
  const env = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  useEffect(() => (hero.current ? heroDepth(hero.current, env.current) : undefined), []);

  // The trade idea's buttons start the sample league the way "Or explore a sample league" does, then the app opens
  // this deal: in the builder, or with its pitch written (demoHandoff.ts). A handoff left from an earlier visit is dropped.
  useEffect(() => clearHandoff(), []);
  const openDeal = (to: "trade" | "pitch") => (t: Trade) => { setHandoff({ to, partnerId: t.partnerId, give: t.give, get: t.get }); onDemo(); };

  const form = (id: string) => (
    <>
      <label htmlFor={id} className="ld2-label">Your <PlatformName /> username</label>
      <form className="ld2-form" onSubmit={(e) => { setErrFor(id); connect(e); }} noValidate>
        <span className="at" aria-hidden="true">@</span>
        <input id={id} value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }} aria-invalid={!!error && errFor === id} aria-describedby={`${id}-help`} name="username"
          placeholder="yourname…" autoComplete="username" autoCapitalize="none" spellCheck={false} />
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Finding your leagues…" : "Find my leagues"}</button>
      </form>
      <p id={`${id}-help`} className={error && errFor === id ? "ld2-error" : "ld2-help"} role={error && errFor === id ? "alert" : undefined}>{(errFor === id && error) || "Free. No password. Read only, so Source can't change anything in Sleeper."}</p>
    </>
  );
  const tagline = "Every offer judged by both starting lineups, then pitched around what the other manager needs.";
  // Each answer stands on its own, so search and AI answers can quote it without the question
  const faqs: [string, string][] = [
    ["What is Source?", "Source is a free trade tool for Sleeper fantasy football leagues. It reads your league, measures what every team needs at each starting slot, and builds trades that raise both teams' starting points. It also drafts the pitch, lineup fixes and waiver bids."],
    ["Is Source free?", "Yes. Source is free. Connect your Sleeper league with your username and use every screen, from trade ideas to waiver bids, at no cost."],
    ["Do you need my Sleeper password?", "No. Source only needs your Sleeper username. League data comes from Sleeper's public API, so there's no password and nothing to sign into."],
    ["Can Source make moves in my league?", "No. Source is read only, so it can't change anything in your Sleeper league. It drafts offers, lineup changes and waiver bids. You make every move in Sleeper yourself."],
    ["Where do trade values come from?", "Source blends public market values for your league's scoring format with a projection model for the rest of the season and each team's actual starting needs. Every offer is then judged by what it does to both starting lineups."],
    ["How does Ask work?", "Source AI answers questions about your league from its rosters, standings and matchups. Trade math comes from Source's own engine, and once in a while the AI cracks a joke. There's a daily limit, and past it Ask gives the built-in answer."],
    ["What does Set optimal lineup check?", "It starts from your best projected lineup, then reads player news, injury and practice reports, Vegas lines and kickoff weather. Every suggested move comes with its reason. You make the moves in Sleeper."],
    ["Does a pitch send on its own?", "No. Source writes the pitch and draws the share image in your browser. Nothing reaches the other manager until you share, copy or text it yourself."],
    ["Do sent offers sync across devices?", "Yes, in a connected Sleeper league. Offers you send and players you star on Waivers sync to your phone, tablet and desktop. A key that lives on your devices protects them, and a new device joins with a one-time code from Settings. The sample league stays on one device."],
    ["Will other managers see my notes?", "No. Tags and notes you log about league mates stay on your device. Source never shows them to other managers."],
    ["What data does Source keep?", "Tags, prices, settings and history stay in your browser. Sent offers and starred players are saved so they can sync, readable only with your device key. Delete my data in Settings clears this browser and the synced copies."],
    ["Does the win chance match Sleeper?", "Closely. Source uses the lineup you set in Sleeper and a model tuned to Sleeper's win probability, refreshed every 15 seconds while games are on."],
    ["Which platforms work?", "Source works with Sleeper today. Yahoo and ESPN are next, then MyFantasyLeague and CBS."],
  ];
  const faqLd = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

  return (
    <AvatarPhotos.Provider value={false}>
    <div className="landing ld2" ref={root}>
      <a className="skip-link" href="#ld-main">Skip to content</a>
      <div className="ld2-env" ref={env} aria-hidden="true">
        <i className="env-glow g1" /><i className="env-glow g2" /><i className="env-glow g3" />
        <div className="env-field"><div className="env-turf" /></div>
        <i className="env-grain" style={{ backgroundImage: GRAIN }} />
      </div>
      <nav className="ld-nav ld2-nav" aria-label="Source">
        <div className="brand" style={{ padding: 0 }}><BrandLogo layout="row" mark={52} word={30} tagline tag={11} label="Source" stage /></div>
        <button className="btn btn-sm btn-ghost" onClick={onDemo}>Try the demo</button>
      </nav>

      <main id="ld-main" tabIndex={-1}>
      <header className="ld-hero ld2-hero" ref={hero}>
        <div className="ld2-copy">
          <span className="ld2-eyebrow ld2-in"><PlatformLogo size={14} />For Sleeper leagues</span>
          <h1 className="ld2-h1 ld2-typed"><TypedHeadline lines={HEADLINES} /></h1>
          <p className="ld2-sub ld2-in" style={{ ["--i" as string]: 3 }}>Source reads your Sleeper league, learns what every team needs, and builds deals that help both sides.</p>
          <div className="ld2-in" style={{ ["--i" as string]: 4 }}>{form("ld-user")}</div>
          <button className="ld2-link ld2-in" style={{ ["--i" as string]: 5 }} onClick={onDemo}>Or explore a sample league<Icon name="chev" size={14} /></button>
          {/* This week's face-off from the sample league, the same card as Wire, before kickoff, live and final */}
          <FaceOffStates you={demo.you} partner={demo.mike.manager} />
        </div>

        <div className="ld2-stage">
        <div className="ld2-heads" aria-hidden="true">
          {cast.map((p, i) => (
            <span key={p.id} className={`ld2-head h${i}`} style={{ ["--i" as string]: i }}>
              <span className="ld2-head-in"><Avatar p={p} size={64} /><b>{p.name.split(" ").slice(-1)[0]}</b></span>
            </span>
          ))}
        </div>
        <div className="hd-card hd-trade" data-hd-pin=".ti-actions">
        <div className="hd-tilt"><div className="hd-pose">
        <div className="ld-preview ld2-preview">
          {demo.trade && (
            <article className="card nudge ld-preview-2 ld2-idea ld2-card c2">
              <span className="nudge-kind"><Icon name="trade" size={15} />Trade idea</span>
              {/* Styled as the card heading it is (h3), but read as level 2: it's the first heading after the h1 */}
              <h3 aria-level={2}>{demo.mike.name} needs <em>a TE.</em></h3>
              <TradeIdea t={demo.trade} onOpen={openDeal("trade")} onPitch={openDeal("pitch")} />
            </article>
          )}
        </div>
        </div></div>
        </div>
        </div>
      </header>

      {/* The banner under the hero (Zach, Oct 22, after northeasttomato.com's product strip): YOUR, over and over, in
          Clash on lime. It slides with the page as you scroll and stops when you stop, so it never loops on its own. */}
      <section className="ld2-yband" ref={bandRef} aria-label="Your fantasy Source">
        <div className="ld2-yband-track" ref={trackRef} aria-hidden="true">
          {[0, 1, 2].map((k) => (
            <span key={k} className="ld2-yband-run">
              {YOURS.map((w) => <span key={w} className="ld2-yband-item"><b>YOUR</b> {w}<i className="ld2-yband-dot" /></span>)}
            </span>
          ))}
        </div>
        <p className="sr-only">Your Fantasy Source: your trades, your lineup, your waivers, your league.</p>
      </section>

      <section className="ld2-tagwrap" aria-label="What Source does">
        <p className="ld2-tag">{tagline.split(" ").map((w, i) => <span key={i}>{w} </span>)}</p>
      </section>

      <LandingSteps trade={demo.trade} />

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
                        <span className="bar-track"><span className="bar-mid" /><span className={`bar-fill ${d.diff >= 0.05 ? "up" : d.diff <= -0.05 ? "down" : "flat"}`} style={{ width: `${w}%` }} /></span>
                        <span className="bar-val" style={{ color: d.diff >= 0.05 ? "var(--good)" : d.diff <= -0.05 ? "var(--bad)" : "var(--muted)" }}>{fmt(d.diff)}</span>
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
            <article className="card ld-cell ld2-reveal ld2-msg-cell">
              <h3>Pitch it where you talk</h3>
              <p>A message written around their need, ready for text, the group chat or Sleeper. You hit send.</p>
              <div className="ld2-phone">
                <PhoneChrome />
                <div className="ld2-sms">
                  <div className="ph-status" aria-hidden="true">
                    <span className="ph-time">12:41</span>
                    <span className="ph-island"><i /></span>
                    <StatusGlyphs />
                  </div>
                  <div className="sms-top">
                    <span className="sms-ib sms-back" aria-hidden="true"><Icon name="chev" size={24} /></span>
                    <span className="sms-id">
                      <ManagerAvatar src={demo.mike.avatar} name={demo.mike.manager} size={64} className="sms-av" />
                      <span className="sms-pill"><b>{demo.mike.manager}</b><Icon name="chev" size={12} /></span>
                      <span className="sms-team">{demo.mike.name}</span>
                    </span>
                    <span className="sms-ib sms-video" aria-hidden="true"><VideoIcon /></span>
                  </div>
                  <div className="sms-feed">
                    <span className="sms-day">Today</span>
                    <figure className="sms-img" ref={cardFig}>{cardUrl ? <img className={cardIn ? "tcard-in" : undefined} src={cardUrl} width={1080} height={cardHeight(demo.trade)} alt={`Trade offer card for ${demo.mike.manager}`} /> : <div className="tcard-skel" style={demo.trade ? { aspectRatio: `1080 / ${cardHeight(demo.trade)}` } : undefined} />}</figure>
                    <p className="sms-out">{draftPitch(demo.trade, "friendly")}</p>
                    <span className="sms-meta">Delivered</span>
                    <span className="sms-typing" role="img" aria-label={`${demo.mike.manager} is typing`}><i /><i /><i /></span>
                  </div>
                  <div className="sms-compose" aria-hidden="true">
                    <span className="sms-plus"><Icon name="plus" size={20} /></span>
                    <span className="sms-field"><span>Text Message</span><Icon name="mic" size={18} /></span>
                  </div>
                  <span className="ph-home" aria-hidden="true" />
                </div>
              </div>
            </article>
          )}
          {demo.trade && (
            <article className="card ld-cell ld2-reveal wide">
              <h3>Ideas both sides say yes to</h3>
              <p>Tell Source what a league mate said. It reads your notes, checks both lineups, tests the deals and keeps only the ones where both teams gain points.</p>
              <div className="ld2-notes">
                <span className="ld2-notes-k">Your notes on {demo.mike.manager}</span>
                <ul>{demo.notes.map((t) => <li key={t.id} className={t.kind === "wants" ? "want" : "no"}>{t.text}</li>)}</ul>
              </div>
              <FinderDemo run={() => ideaSteps(demo.mike, demo.tags, INITIAL_MY_TAGS, {}, 1)}>
                <TradeIdea t={demo.trade} onOpen={() => onDemo()} onPitch={() => onDemo()} />
              </FinderDemo>
            </article>
          )}
          <article className="card ld-cell ld2-reveal wide ld2-live" ref={liveCard}>
            <div className="ld2-live-head">
              <div><h3>Sunday, live</h3><p>Points so far, where each player is on pace to finish, and a win chance that tracks Sleeper's. Players heat up when they're beating their projection, cool off when they're not, and finals are set in stone.</p></div>
              <PlayCount c={playCount(live, starters.map((p) => p.nfl))} />
            </div>
            <div className="lu-list ld2-live-rows">
              {liveRows.map((p) => {
                const g = gameNow(showLive, p.id, p.nfl);
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

      <section className="ld-section ld2-new" aria-labelledby="ld-new">
        <h2 id="ld-new" className="ld-h2 ld2-reveal">Ask it. Set it. Take it anywhere.</h2>
        <div className="ld2-new-grid">
          <article className="card ld-cell ld2-reveal ld2-ask-cell" ref={askCell}>
            <h3>Ask anything about your league</h3>
            <p>Source AI reads your rosters, standings, matchups and trades. Trade questions run the same math as the builder, so the numbers hold up. Now and then it throws in a dry joke.</p>
            {askDemo && <div className="ld2-ask" ref={setInert}>
              <div className="ask-you-row"><p className="ask-you">{askDemo.q}</p></div>
              <div className="ask-card">
                <p className="ask-head">{askDemo.a.text}</p>
                {askDemo.a.points.length > 0 && <ul className={`ask-pts${askDemo.a.points.length > 1 ? " many" : ""}`}>{askDemo.a.points.map((p) => <li key={p}>{p}</li>)}</ul>}
                {askDemo.deal && <div className="ask-after"><AskShowBlock deal={askDemo.deal} onPlayer={() => {}} live={false} /></div>}
                {askDemo.deal && <div className="ask-after"><DealNumbers t={askDemo.deal} /></div>}
              </div>
            </div>}
          </article>
          <article className="card ld-cell ld2-reveal ld2-opt-cell">
            <h3>Set optimal lineup</h3>
            <p>One tap weighs this week's news, injury reports, Vegas lines and kickoff weather. Every move comes with its reason. You make it in Sleeper.</p>
            {optDemo.swaps.length > 0
              ? <div ref={setInert}><SwapRows rows={optDemo.swaps.slice(0, 2)} live={false} className="ld2-opt" /></div>
              : <p className="ld2-opt-none">{optDemo.summary}</p>}
          </article>
          <article className="card ld-cell ld2-reveal ld2-sync-cell">
            <h3>Works on every device</h3>
            <p>Offers you send and players you star follow your Sleeper account to your phone, tablet and desktop.</p>
            <ul className="ld2-sync">
              {demo.trade && (
                <li><span className="ld2-sync-ic"><Icon name="send" size={16} /></span>
                  <span className="ld2-sync-t"><b>Offer to {demo.mike.manager}</b><small>{demo.trade.give.map((id) => playerById(id).name.split(" ").slice(-1)[0]).join(" + ")} for {demo.trade.get.map((id) => playerById(id).name.split(" ").slice(-1)[0]).join(" + ")}</small></span>
                  <span className="ld2-sync-k">Sent</span></li>
              )}
              {watched && (
                <li><span className="ld2-sync-ic on"><Icon name="star" size={16} /></span>
                  <span className="ld2-sync-t"><b>{watched.name}</b><small>{watched.pos} · {watched.nfl}</small></span>
                  <span className="ld2-sync-k">Watching</span></li>
              )}
            </ul>
          </article>
        </div>
      </section>

      <section className="ld-trust ld2-trust" aria-labelledby="ld-private">
        <h2 id="ld-private" className="ld-h2 ld2-reveal">Private by default.</h2>
        <ul className="ld-trust-list">
          <li className="ld2-reveal"><Icon name="lock" size={22} /><div><b>No passwords</b><p>Connect with your Sleeper username. Your league is read straight from Sleeper's public API.</p></div></li>
          <li className="ld2-reveal"><Icon name="eye" size={22} /><div><b>Your notes stay yours</b><p>What you log about league mates is private and never shown to them.</p></div></li>
          <li className="ld2-reveal"><Icon name="send" size={22} /><div><b>Nothing sends on its own</b><p>Source drafts the offer. You decide if and where it goes.</p></div></li>
        </ul>
      </section>

      <section className="ld-section ld2-faq" aria-labelledby="ld-faq">
        {/* Heading and the Ask card stick together on tablet and desktop. On phones this wrapper drops out of the box
            tree, so the card can sit after the questions. */}
        <div className="ld2-faq-side">
          <h2 id="ld-faq" className="ld-h2 ld2-reveal">Questions, answered.</h2>
          {/* Opens Ask as a sheet. Asking leads to connect or the sample league, with the question carried in (LandingAsk) */}
          <div className="ld2-faq-askwrap ld2-reveal">
            <button type="button" className="ld2-faq-ask" aria-haspopup="dialog" onClick={() => setAskOpen(true)}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") setAskWave((w) => w + 1); }} onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setAskWave((w) => w + 1); }}>
              <AiMarkPlay size={20} replay={askWave} className="ld2-faq-ask-mark" />
              <span className="ld2-faq-ask-copy"><b>Still have a question?</b><span>Ask Source about the sample league and see how it answers.</span></span>
              <Icon name="chev" size={16} />
            </button>
          </div>
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd }} />
        <div className="ld2-faq-list ld2-reveal">
          {faqs.map(([q, a]) => (
            <details key={q}><summary>{q}<Icon name="chev" size={16} /></summary><p>{a}</p></details>
          ))}
        </div>
      </section>

      <section className="ld2-final ld2-reveal" aria-labelledby="ld-final">
        <div className="ld2-endfield" aria-hidden="true"><div className="env-turf" /></div>
        <FinalCtaPanel>
          <h2 id="ld-final" className="ld2-h1 ld2-final-h">See your first trade<br />in under a minute.</h2>
          <div className="ld2-final-form">{form("ld-user-2")}</div>
          <button className="ld2-link" onClick={onDemo}>Or explore a sample league<Icon name="chev" size={14} /></button>
        </FinalCtaPanel>
      </section>
      </main>

      {/* The sign-off (Zach, Oct 22): a few small lines over SOURCE, oversized so it bleeds off the sides and bottom, in
          Clash Grotesk Semibold. An impact statement, not a link: people reading it are already here. */}
      <footer className="ld-foot ld2-sign" ref={signRef}>
        <div className="ld2-sign-top">
          <p className="ld2-sign-lede">Every league has an insider. Make it you. Source reads every roster in your Sleeper league, so you know who needs what before the group chat does.</p>
          <div className="ld2-sign-col">
            <nav className="ld2-legal" aria-label="Legal">
              <button type="button" aria-haspopup="dialog" onClick={() => setDoc("how")}>How Source works</button>
              <button type="button" aria-haspopup="dialog" onClick={() => setDoc("legal")}>Terms and privacy</button>
            </nav>
            <p>Not affiliated with Sleeper. The {TEAMS.length}-team sample league uses made-up data.</p>
          </div>
        </div>
        <div className="ld2-sign-row">
          <span>Your fantasy <b>Source.</b></span>
          <span>© {new Date().getFullYear()} Source</span>
        </div>
        <div className="ld2-sign-bleed" aria-hidden="true">
          <p className="ld2-sign-word" ref={wordRef}>{"SOURCE".split("").map((c, i) => <span key={i} style={{ ["--i" as string]: i }}>{c}</span>)}</p>
        </div>
      </footer>
      {askOpen && <LandingAsk onClose={() => setAskOpen(false)} onDemo={onDemo} form={form} faqs={faqs} />}
      {doc && (
        <DetailSheet className="doc-sheet" onClose={() => setDoc(null)} title={<h2 className="ds-h">{doc === "how" ? "How Source works" : "Terms and legal"}</h2>}>
          <article className="doc">{doc === "how" ? <HowItWorksDoc /> : <LegalDoc dated />}</article>
        </DetailSheet>
      )}
    </div>
    </AvatarPhotos.Provider>
  );
}

// Inline so the stylesheet has no url() and Vite skips its PostCSS pass
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** Everything Source does, one headline at a time. The first is the promise; the rest rotate in behind it. */
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
  const [state, setState] = useState({ i: 0, n: 0, typing: true });
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setState({ i: 0, n: lines[0].length, typing: false }); return; }
    // Driven off the frame clock, so keystrokes land at an even pace instead of drifting with timers
    const TYPE = 56, ERASE = 24, HOLD_FIRST = 4200, HOLD = 3000, GAP = 320;
    let i = 0, phase: "type" | "hold" | "erase" | "gap" = "type", t0 = 0, raf = 0, visible = true, last = -1, started = false;
    // One loop at a time: resuming only re-arms it if it isn't already running
    const resume = () => { if (started && visible && !document.hidden && !raf) { t0 = 0; raf = requestAnimationFrame(tick); } };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; resume(); });
    if (ref.current) io.observe(ref.current);
    function tick(now: number) {
      raf = 0;
      if (!visible || document.hidden) return;
      const len = lines[i].length;
      // Picking up after a pause continues from the letter it stopped on, typing or erasing
      if (!t0) t0 = now - (phase === "type" ? Math.max(last, 0) * TYPE : phase === "erase" ? (len - Math.max(last, 0)) * ERASE : 0);
      const el = now - t0;
      let n = last, typing = false;
      if (phase === "type") { n = Math.min(len, Math.floor(el / TYPE)); typing = true; if (n >= len) { phase = "hold"; t0 = now; } }
      else if (phase === "hold") { n = len; if (el > (i === 0 ? HOLD_FIRST : HOLD)) { phase = "erase"; t0 = now; } }
      else if (phase === "erase") { n = Math.max(0, len - Math.floor(el / ERASE)); typing = true; if (n <= 0) { phase = "gap"; t0 = now; } }
      else { n = 0; if (el > GAP) { i = (i + 1) % lines.length; phase = "type"; t0 = now; last = 0; } }
      if (n !== last || phase === "hold") { last = n; setState((s) => (s.i === i && s.n === n && s.typing === typing ? s : { i, n, typing })); }
      raf = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", resume);
    const start = window.setTimeout(() => { started = true; resume(); }, 420);
    return () => { started = false; clearTimeout(start); cancelAnimationFrame(raf); raf = 0; io.disconnect(); document.removeEventListener("visibilitychange", resume); };
  }, [lines]);
  const full = lines[state.i];
  return (
    <>
      <span className="sr-only">{lines[0].replace("\n", " ")}</span>
      <span className="ld2-typed-box" ref={ref} aria-hidden="true">
        {lines.map((l) => <span key={l} className="ld2-typed-size">{l}</span>)}
        {/* The whole line is laid out from the first keystroke; untyped letters are just invisible, so nothing rewraps */}
        <span className="ld2-typed-live">
          <span className="ld2-typed-text">{full.slice(0, state.n)}</span>
          <i className={`ld2-caret${state.typing ? " on" : ""}`} />
          <span className="ld2-typed-rest">{full.slice(state.n)}</span>
        </span>
      </span>
    </>
  );
}

type At = "pre" | "live" | "final";
const AT: { v: At; label: string }[] = [{ v: "pre", label: "Projected" }, { v: "live", label: "Live" }, { v: "final", label: "Final" }];

/**
 * The hero face-off in each of its states: before kickoff, the sample Sunday live, and the same week final. Every
 * number is the engine's on the sample league (live.sampleWeek). The three cards share one grid cell and crossfade, so
 * switching never moves the page. It steps on every 4 seconds while it's on screen, and stops on hover, on focus,
 * and for good once someone picks a state. The caption under it says what the state means and what the marks are:
 * the crown is last season's champion, the cup is the week's winner once it's final.
 */
function FaceOffStates({ you, partner }: { you: TeamNeeds; partner: string }) {
  const weeks = useMemo(() => ({ pre: sampleWeek("pre"), live: sampleWeek("live"), final: sampleWeek("final") }), []);
  const [at, setAt] = useState<At>("pre");
  const [picked, setPicked] = useState(false);
  const [hold, setHold] = useState({ hover: false, focus: false });
  const [seen, setSeen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (picked || hold.hover || hold.focus || !seen || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setTimeout(() => setAt((a) => AT[(AT.findIndex((x) => x.v === a) + 1) % AT.length].v), 4000);
    return () => clearTimeout(id);
  }, [at, picked, hold.hover, hold.focus, seen]);
  return (
    <div ref={wrap} className="hd-states ld2-in" style={{ ["--i" as string]: 6 }}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHold((h) => ({ ...h, hover: true })); }}
      onPointerLeave={() => setHold((h) => ({ ...h, hover: false }))}
      onFocus={() => setHold((h) => ({ ...h, focus: true }))}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHold((h) => ({ ...h, focus: false })); }}>
      <div className="ld2-fo hd-card hd-fo" aria-hidden="true" ref={setInert}>
        <div className="hd-tilt"><div className="hd-pose">
          {AT.map(({ v }) => (
            <div key={v} className={`hd-face${at === v ? " on" : ""}`}>
              <Scoreboard you={you} partner={partner} extras={false} at={weeks[v]} />
            </div>
          ))}
        </div></div>
      </div>
      <div className="hd-seg"><Seg label="Show the face-off" value={at} options={AT} onChange={(v) => { setAt(v); setPicked(true); }} /></div>
      <div className="hd-caps">
        {AT.map(({ v }) => (
          <p key={v} className={`hd-cap${at === v ? " on" : ""}`} aria-hidden={at !== v}><Caption at={v} live={weeks[v]} /></p>
        ))}
      </div>
    </div>
  );
}

/** One state's caption, from that state's own numbers. Names read the way the card writes them ("You", "Jake"). */
function Caption({ at, live }: { at: At; live: ReturnType<typeof sampleWeek> }) {
  const opp = OPPONENT_ID ? teamById(OPPONENT_ID) : null;
  const ms = matchNow(live);
  if (!opp || !ms.opp) return <>No matchup this week.</>;
  const who = (mine: boolean) => (mine ? "You" : opp.manager);
  const be = (mine: boolean) => (mine ? "are" : "is");
  const n = (x: number) => <span className="num">{x.toFixed(1)}</span>;
  if (at === "final" && ms.result) {
    const r = ms.result, mine = r.letter === "W", margin = Math.abs(ms.me.scored - ms.opp.scored);
    if (r.letter === "T") return <>Final: a tie at {n(ms.me.scored)}.</>;
    return <>Final: {who(mine)} won by {n(margin)}. The <WinCup size={12} /> cup marks the winner.</>;
  }
  // The crown only shows on the card when last season's champion is in this matchup, so the caption names it only then
  const champ = LEAGUE.champion?.teamId;
  const champMine = champ === YOU.id ? true : champ === opp.id ? false : null;
  const pct = ms.chance ?? 50, mineLeads = pct >= 50, lead = mineLeads ? pct : 100 - pct;
  const an = /^(8\d?|11|18)$/.test(String(lead)) ? "an" : "a";
  const odds = at === "pre"
    ? <>{be(mineLeads)} projected to win, {n(mineLeads ? ms.me.proj : ms.opp.proj)} to {n(mineLeads ? ms.opp.proj : ms.me.proj)}</>
    : <>{mineLeads ? "have" : "has"} {an} <span className="num">{lead}%</span> chance to win this week</>;
  if (champMine === null) return <>{who(mineLeads)} {odds}.</>;
  const crown = <>{who(champMine)} {be(champMine)} last season's champion (the <span aria-hidden="true"><Trophy teamId={champ!} size={12} /></span> crown)</>;
  return champMine === mineLeads ? <>{crown} and {odds}.</> : <>{crown}. {who(mineLeads)} {odds}.</>;
}

/** The trade finder doing its thing: it runs through its steps when scrolled into view, then shows what it found. */
function FinderDemo({ run, children }: { run: () => Steps<Trade[]>; children: ReactNode }) {
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
      {/* Scan and result share one cell, so the card is its final size from the start and never grows */}
      <div className="ld2-finder-cell">
        <div className={`ld2-found${phase === "done" ? " on" : ""}`} aria-hidden={phase !== "done"}>{children}</div>
        {phase !== "done" && <IdeaScan run={run} onDone={() => setPhase("done")} key={phase} paused={phase === "wait"} />}
      </div>
      <button className={`ld2-again${phase === "done" ? "" : " off"}`} tabIndex={phase === "done" ? 0 : -1} aria-hidden={phase !== "done"} onClick={() => setPhase("scan")}><AiMark size={14} />Run it again</button>
    </div>
  );
}

/** The phone around the message demo: matte body, side buttons. Drawn in CSS (landing-phone.css), purely decorative. */
function PhoneChrome() {
  return (
    <span className="ph-chrome" aria-hidden="true">
      <i className="ph-btn ph-action" /><i className="ph-btn ph-vol-up" /><i className="ph-btn ph-vol-dn" /><i className="ph-btn ph-power" />
    </span>
  );
}

/** Signal, wifi and battery on the icon family's 1.25 line. */
function StatusGlyphs() {
  return (
    <span className="ph-glyphs">
      <svg viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"><path d="M1.6 10.4V8.6M6.2 10.4V6.6M10.8 10.4V4.4M15.4 10.4V1.6" /></svg>
      <svg viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"><path d="M1.2 4.4a9.6 9.6 0 0 1 13.6 0M3.6 6.9a6.2 6.2 0 0 1 8.8 0M6 9.3a2.8 2.8 0 0 1 4 0" /></svg>
      <svg viewBox="0 0 26 12" fill="none" stroke="currentColor" strokeWidth="1.25"><rect x="0.9" y="0.9" width="21.2" height="10.2" rx="3.2" opacity="0.55" /><rect x="2.9" y="2.9" width="14.6" height="6.2" rx="1.4" fill="currentColor" stroke="none" /><path d="M24.4 4.4v3.2" strokeLinecap="round" opacity="0.55" /></svg>
    </span>
  );
}

/** Video call: Lucide video (ISC), on the nav icons' line (set by drawn size, iconStroke.ts). */
function VideoIcon() {
  const stroke = useIconStroke(24);
  return (
    <svg ref={stroke.ref} style={stroke.style} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke.strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}
