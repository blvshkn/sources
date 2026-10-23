import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent as RMouseEvent } from "react";
import { useErrorHaptic } from "../haptics";
import { setInert } from "../inert";
import { BrandLogo } from "./BrandLogo";
import { INITIAL_MANAGER_TAGS, INITIAL_MY_TAGS, TEAMS, YOU, playerById, teamById, type Player } from "../data";
import { activeTags, allNeeds, applyFormat, ask, DEFAULT_FORMAT, findTrades, fmt, groupsFor, waiverRecs } from "../engine";
import { SLeague, SleeperError, findLeagues, findUser } from "../sleeper";
import { Icon, PosBadge } from "./ui";
import { Scoreboard } from "./Scoreboard";
import { useCursorLight } from "./useCursorLight";
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
import { eff, fits } from "../engine";
import { AiMark, AiMarkPlay } from "./WorkingLoader";
import { LandingAsk } from "./LandingAsk";
import { AskShowBlock, DealNumbers } from "./AskShow";
import { LandingOptimal } from "./LandingOptimal";
import { resultFor } from "../optimalLineup";
import { bestUnderLocks, sleeperNow } from "../lineupWhatIf";
import { DetailSheet } from "./DetailSheet";
import { HowItWorksDoc, LegalDoc } from "./About";
import { PX } from "./pixelIcons";
import { PixelTrophy, trophyPointer } from "../gameDayMotion";
import { FinalCtaPanel } from "./FinalCta";
import { LandingSteps } from "./LandingSteps";
import { LandingLive } from "./LandingLive";
import { LandingNotesCard } from "./LandingNotesCard";
import { AcceptCell, DealRows, PtsCell as DealPts, dealWhy } from "./dealRows";
import { acceptance, verdict } from "../engine";
import type { Team } from "../data";
import { SplitHead, useSplitHeads } from "./SplitHead";
import { heroDepth } from "../heroDepth";
import { clearHandoff, setHandoff } from "../demoHandoff";
import { sampleWeek, matchNow } from "../live";
import { LEAGUE, OPPONENT_ID } from "../data";
import { Seg } from "./ui";
import { Trophy } from "./Trophy";
import { whenNear } from "../idle";
import type { TeamNeeds } from "../engine";

/** The tagline as stacked caps with chips set inside the lines, each beside the word it shows (Zach, Oct 22: they had
 *  all landed at the right edge): the trade icon in "every offer", a player on each side of "starting lineups" (both
 *  sides' lineups), the send icon in "then pitched", the other manager's photo in "other manager". `br` ends a line. */
const TAG_STACK: (string | { p: number } | { icon: "trade" | "send" | "group" } | { mgr: true } | { br: true })[] = [
  "EVERY", { icon: "trade" }, "OFFER", { br: true },
  "JUDGED BY BOTH", { br: true },
  { p: 0 }, "STARTING", { p: 1 }, "LINEUPS,", { br: true },
  "THEN", { icon: "send" }, "PITCHED", { br: true },
  "AROUND WHAT THE", { br: true },
  "OTHER", { mgr: true }, "MANAGER", { br: true },
  "NEEDS.",
]

/** The page-wide scatter: how far down the page (%), which side, how far in, and depth (0 near, 1 middle, 2 far) */
const SCATTER: { top: number; side: "l" | "r"; x: string; d: 0 | 1 | 2 }[] = [
  { top: 9, side: "r", x: "6%", d: 2 }, { top: 14, side: "l", x: "-34px", d: 0 }, { top: 21, side: "r", x: "3%", d: 1 },
  { top: 28, side: "l", x: "9%", d: 2 }, { top: 35, side: "r", x: "-30px", d: 0 }, { top: 43, side: "l", x: "2%", d: 1 },
  { top: 51, side: "r", x: "11%", d: 2 }, { top: 58, side: "l", x: "-36px", d: 0 }, { top: 66, side: "r", x: "2%", d: 1 },
  { top: 74, side: "l", x: "7%", d: 2 }, { top: 82, side: "r", x: "-32px", d: 0 }, { top: 90, side: "l", x: "4%", d: 1 },
];

/** Each hero player's depth: 0 near (large, sharp, kept clear of the screens), 1 middle, 2 far (small, blurred) */
const HEAD_DEPTH = [0, 2, 1, 0, 1, 2, 2];

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
  useErrorHaptic(error);
  const [errFor, setErrFor] = useState("ld-user");

  applyFormat(DEFAULT_FORMAT);
  // The page's base color (landing-type.css, html.ld2-on): a class on <html> while the landing is up. It used to be
  // html:has(.ld2), which made every node React added restyle the whole document (~0.5s a time on a mid phone)
  useLayoutEffect(() => {
    document.documentElement.classList.add("ld2-on");
    return () => document.documentElement.classList.remove("ld2-on");
  }, []);
  // Headshots for the sample league are matched by name, so the landing needs the player id table too
  useEffect(() => { loadJerseyNumbers(); }, []);
  useEffect(() => {
    const prev = document.title;
    document.title = "Source: fantasy football trades for Sleeper leagues";
    // Safari's toolbar tint follows theme-color: match the landing's bottom edge while it's open (Zach, Oct 22)
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')], was = metas.map((m) => m.content);
    metas.forEach((m) => { m.content = "#101211"; });
    return () => { document.title = prev; metas.forEach((m, i) => { m.content = was[i]; }); };
  }, []);
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
  // When the sample lineup is already right there'd be nothing to show (Zach, Oct 22), so the card starts from the
  // optimal lineup with two starters swapped for the closest bench player who fits, and shows the moves that undo it.
  const optDemo = useMemo(() => {
    // Locks don't apply to the illustration (on a game night most of the sample roster is locked and nothing could
    // move), and live data doesn't either, so the card shows the same two moves from first paint on (Zach, Oct 22)
    const cur = sleeperNow().mine, open = bestUnderLocks(cur, () => false);
    const res = resultFor(cur, open, "off");
    if (res.swaps.length >= 2) return res;
    const before = open.map((s) => ({ ...s }));
    const bench = YOU.roster.filter((id) => !open.some((s) => s.id === id));
    const picks = before.flatMap((s, i) => {
      if (!s.id) return [];
      const was = eff(playerById(s.id), true);
      const b = bench.map((id) => playerById(id)).filter((p) => fits(s.slot, p.pos) && eff(p, true) < was)
        .sort((x, y) => eff(y, true) - eff(x, true))[0];
      return b ? [{ i, id: b.id, loss: was - eff(b, true) }] : [];
    }).sort((x, y) => x.loss - y.loss);
    const used = new Set<string>();
    for (const k of picks) { if (used.size === 2) break; if (used.has(k.id)) continue; before[k.i].id = k.id; used.add(k.id); }
    return resultFor(before, open, "off");
  }, []);
  const watched = useMemo(() => waiverRecs(YOU).find((r) => r.pick)?.fa ?? null, []);
  const [doc, setDoc] = useState<"legal" | "how" | null>(null);
  // The FAQ's "Still have a question?" opens the app's Ask screen as a sheet; its mark waves on view and on hover
  const [askOpen, setAskOpen] = useState(false);
  const [askWave, setAskWave] = useState(0);
  // Hero phones: each screen draws the app at its 390px width and scales it to fit (--hp-s)
  const phonesRef = useRef<HTMLDivElement>(null);
  const foSec = useRef<HTMLElement>(null);
  // The sticky nav (Zach, Oct 22): it stays with the logo all the way down, takes a backdrop once the page moves, and
  // once the hero's username field is out of sight it offers "Find my leagues", which opens that field in the nav.
  const [stuck, setStuck] = useState(false);
  const [navCta, setNavCta] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const navBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const heroForm = document.getElementById("ld-user")?.closest(".ld2-in");
    let io: IntersectionObserver | undefined;
    if (heroForm) {
      io = new IntersectionObserver(([en]) => {
        const gone = !en.isIntersecting && en.boundingClientRect.top < 0;
        setNavCta(gone);
      }, { rootMargin: "-72px 0px 0px 0px" });
      io.observe(heroForm);
    }
    return () => { window.removeEventListener("scroll", onScroll); io?.disconnect(); };
  }, []);
  // The banner screen (Zach, Oct 22): a pinned stretch. While it scrolls through, the YOUR banner blows in from the
  // side like cloth in the wind and settles at the top, then the tagline lights word by word in the middle; both
  // leave together at the end. Everything here is driven by the scroll, so nothing moves while you're still.
  const yourRef = useRef<HTMLDivElement>(null);
  // The tagline's words carry the display gradient, lit by the cursor (Zach, Oct 22; useCursorLight.ts)
  const tagRef = useRef<HTMLParagraphElement>(null);
  useCursorLight(tagRef);
  useEffect(() => {
    const el = yourRef.current;
    if (!el) return;
    const words = [...el.querySelectorAll<HTMLElement>(".ld2-tag-stack > span")];
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) { el.style.setProperty("--yin", "1"); words.forEach((w) => w.classList.add("on")); return; }
    let raf = 0, lit = -1, flat = false;
    const letters = [...el.querySelectorAll<HTMLElement>(".ld2-yband .yl")];
    const run = el.querySelector<HTMLElement>(".ld2-yband-run");
    let xs: number[] = [];
    const measure = () => { xs = letters.map((l) => (l.offsetParent === run ? 0 : (l.offsetParent as HTMLElement | null)?.offsetLeft ?? 0) + l.offsetLeft + l.offsetWidth / 2 + ((l.closest(".ld2-yband-run") as HTMLElement | null)?.offsetLeft ?? 0)); };
    const band = el.querySelector<HTMLElement>(".ld2-yband"), lime = el.querySelector<SVGPathElement>(".yb-wave path");
    // The banner's height, so the tagline can center in exactly the space under it (landing-type.css --bandh)
    const setBand = () => { if (band) el.style.setProperty("--bandh", `${band.offsetHeight}px`); };
    setBand(); window.addEventListener("resize", setBand, { passive: true });
    // The lime: the band's box bent along the same curve the letters ride (amp, f and ph match the letters below)
    // Points every 4px so the curve reads as one smooth wave, not a chain of bends (Zach, Oct 23). The ends stay square.
    const drawLime = (amp: number, f: number, ph: number) => {
      if (!band || !lime) return;
      const W = band.clientWidth, H = band.clientHeight, step = 4, top: string[] = [], bot: string[] = [];
      for (let x = -step; x <= W + step; x += step) {
        const y = amp * Math.sin(x * f - ph);
        top.push(`${x},${y.toFixed(2)}`); bot.unshift(`${x},${(H + y).toFixed(2)}`);
      }
      lime.setAttribute("d", `M${top.join("L")}L${bot.join("L")}Z`);
    };
    const wave = (k: number) => {
      if (k < 0.002) { if (!flat) { letters.forEach((l) => { l.style.transform = ""; }); drawLime(0, 1, 0); flat = true; } return; }
      flat = false;
      if (!xs.length) measure();
      const w = run?.offsetWidth || 1;
      const shift = ((window.scrollY * 0.45) % w + w) % w; // the track's own scroll offset (the band effect above)
      // Scrunched (Zach, Oct 22: "more dramatic but not too crazy"): tighter waves, a little taller, and the letters
      // gather into each dip like fabric bunching, then spread out again as it flattens
      // Phones get a proper wave too (Zach, Oct 23: it came in as a tipped strip with corners): taller for their width
      // and about one and a half waves across the screen
      const vw = window.innerWidth;
      const amp = Math.min(40, Math.max(18, vw * 0.045)) * k, len = Math.max(240, vw * 0.3), ph = window.scrollY / 70;
      const f = (2 * Math.PI) / len, gather = amp * 0.6;
      drawLime(amp, f, ph);
      letters.forEach((l, i) => {
        const x = xs[i] - shift, a = x * f - ph;
        const y = amp * Math.sin(a);
        const dx = gather * Math.cos(a);
        // Each piece narrows by exactly how far its neighbors close in, so the strip bunches without tearing
        const sx = 1 - gather * f * Math.sin(a);
        const r = Math.atan(amp * f * Math.cos(a));
        l.style.transform = `translate3d(${dx.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${r.toFixed(4)}rad) scaleX(${sx.toFixed(3)})`;
      });
    };
    window.addEventListener("resize", () => { xs = []; flat = false; }, { passive: true });
    const paint = () => {
      raf = 0;
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      // 0 as the screen's top reaches the bottom of the window, 1 once it has scrolled through its pinned length
      const run = Math.max(1, r.height - vh);
      const enter = Math.min(1, Math.max(0, (vh - r.top) / vh));
      const p = Math.min(1, Math.max(0, -r.top / run));
      const ease = 1 - Math.pow(1 - enter, 3);
      el.style.setProperty("--yin", ease.toFixed(3));
      // The wave (Zach, Oct 22): while it blows in, the strip ripples along its length, each letter's piece of lime
      // riding the curve and tipped to its slope. It flattens as the strip's left end reaches the screen's edge.
      wave(1 - ease);
      const n = Math.round(Math.min(1, Math.max(0, (p - 0.05) / 0.75)) * words.length);
      if (n !== lit) { lit = n; words.forEach((w, i) => w.classList.toggle("on", i < n)); }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
    window.addEventListener("scroll", kick, { passive: true }); window.addEventListener("resize", kick);
    paint();
    return () => { window.removeEventListener("scroll", kick); window.removeEventListener("resize", kick); cancelAnimationFrame(raf); };
  }, []);
  // The real app in the phones: once the page has settled and the stage is near the screen, each phone loads the
  // sample league in an embedded frame (App.tsx IN_FRAME). The front phone everywhere; the two behind it from 1024px.
  // The phones are pre-rendered stills of the 3D phone (public/phones/phone-image-*.webp, Zach, Oct 22: no live 3D; iPad Safari
  // drew a dark box with it, and the engine and model were the page's heaviest load). ?gl=3d still mounts the live
  // render (phone3d.ts) for re-rendering the stills with scripts/render-phones.mjs; ?gl=0 shows the screens alone.
  const glMode = typeof window === "undefined" ? "" : new URLSearchParams(location.search).get("gl");
  const live3d = glMode === "3d" && typeof WebGL2RenderingContext !== "undefined";
  const [gl, setGl] = useState<"try" | "on" | "off">(() => (live3d ? "try" : glMode === "0" ? "off" : "on"));
  useEffect(() => {
    const stage = phonesRef.current;
    if (!stage || gl !== "try") return;
    let alive = true, gone: (() => void) | null = null;
    const give = window.setTimeout(() => { if (alive) setGl("off"); }, 12000);
    const phones = [".hp-left", ".hp-right", ".hp-front"].map((s) => stage.querySelector<HTMLElement>(s)!);
    import("./phone3d").then(({ mountPhones3D }) => mountPhones3D(stage, phones, ["/phones/trade-screen.webp", "/phones/waivers-screen.webp", null], [0.62, 0.62, 1]))
      .then((p) => { if (!alive) { p.dispose(); return; } gone = p.dispose; window.clearTimeout(give); setGl("on"); p.kick(1800); })
      .catch(() => { if (alive) setGl("off"); });
    return () => { alive = false; window.clearTimeout(give); gone?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The message phone in "Pitch it where you talk" is the same 3D iPhone (Zach, Oct 22: "This should be the rendered
  // phone"), face on. It loads once the cell is near, and waits out of sight until it has drawn.
  const smsPhone = useRef<HTMLDivElement>(null);
  const [smsGl, setSmsGl] = useState<"try" | "on" | "off">(() => (live3d ? "try" : glMode === "0" ? "off" : "on"));
  useEffect(() => {
    const el = smsPhone.current;
    if (!el || smsGl !== "try") return;
    let alive = true, gone: (() => void) | null = null, give = 0;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      give = window.setTimeout(() => { if (alive) setSmsGl("off"); }, 12000);
      const body = el.querySelector<HTMLElement>(".ph-chrome")!;
      import("./phone3d").then(({ mountPhones3D }) => mountPhones3D(el, [body], [null], [1]))
        .then((p) => { if (!alive) { p.dispose(); return; } gone = p.dispose; window.clearTimeout(give); setSmsGl("on"); p.kick(600); })
        .catch(() => { if (alive) setSmsGl("off"); });
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => { alive = false; io.disconnect(); window.clearTimeout(give); gone?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Hero players' parallax: the scroll position, for their per-depth drift (landing-type.css .hp-head). Where the
  // browser runs scroll-driven animations (Safari 26, Chrome), the CSS does it on the compositor at the screen's frame
  // rate and only needs the page's scroll length (--maxs); the scroll listener is the fallback (Zach, Oct 22: 60fps)
  useEffect(() => {
    if (typeof CSS === "undefined" || !CSS.supports("animation-timeline: scroll()")) return;
    // Set on the two layers that drift, not on <html>: a custom property on the root is inherited by every element, so
    // each change (the page growing as images and sections arrive) restyled the whole document, ~400ms a time on a phone
    const root = document.documentElement;
    const els = [phonesRef.current, scatterRef.current].filter((e): e is HTMLDivElement => !!e);
    let last = "";
    const measure = () => {
      const v = String(Math.max(1, root.scrollHeight - window.innerHeight));
      if (v !== last) { last = v; els.forEach((el) => el.style.setProperty("--maxs", v)); }
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(document.body);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); els.forEach((el) => el.style.removeProperty("--maxs")); };
  }, []);
  useEffect(() => {
    const stage = phonesRef.current;
    if (!stage || matchMedia("(prefers-reduced-motion: reduce)").matches || (typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()"))) return;
    let raf = 0;
    const paint = () => { raf = 0; stage.style.setProperty("--hsy", String(Math.round(window.scrollY))); };
    const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
    window.addEventListener("scroll", kick, { passive: true }); paint();
    return () => { window.removeEventListener("scroll", kick); cancelAnimationFrame(raf); };
  }, []);
  // The bottom edge blur fades out over the last screen and a half of the page, so it's gone by the sign-off and
  // Safari never paints it as a dark box behind its toolbar (Zach, Oct 22). Scroll-driven only.
  const edgeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = edgeRef.current;
    if (!el) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      // Gone by the time the sign-off's top reaches 60% of the screen, so SOURCE and the footer are never blurred
      const vh = window.innerHeight, foot = signRef.current?.getBoundingClientRect().top ?? Infinity;
      el.style.opacity = Math.min(1, Math.max(0, (foot - vh * 0.85) / (vh * 0.5))).toFixed(3);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
    window.addEventListener("scroll", kick, { passive: true }); window.addEventListener("resize", kick); paint();
    return () => { window.removeEventListener("scroll", kick); window.removeEventListener("resize", kick); cancelAnimationFrame(raf); };
  }, []);
  // Tilt parallax (Zach, Oct 22): on phones and tablets the floating players and the dots down the page shift with the
  // device's movement. iOS asks permission, which it only allows from a tap: the end of a scroll swipe doesn't count and
  // fails, so every tap asks until iOS gives an answer. Eased, and it stops when the device does.
  useEffect(() => {
    // Set on the two layers that move, not the document, so a tilt restyles only them (60fps, Zach Oct 22)
    const els = [phonesRef.current, scatterRef.current].filter((e): e is HTMLDivElement => !!e);
    if (!els.length || !matchMedia("(hover: none) and (pointer: coarse)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let bx: number | null = null, by: number | null = null, tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const step = () => {
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      els.forEach((el) => { el.style.setProperty("--gx", x.toFixed(3)); el.style.setProperty("--gy", y.toFixed(3)); });
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(step) : 0;
    };
    const on = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      if (bx === null || by === null) { bx = e.gamma; by = e.beta; }
      tx = Math.max(-1, Math.min(1, (e.gamma - bx) / 20)); ty = Math.max(-1, Math.min(1, (e.beta - by) / 20));
      if (!raf) raf = requestAnimationFrame(step);
    };
    const start = () => window.addEventListener("deviceorientation", on, { passive: true });
    const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    let ask: (() => void) | null = null;
    const stopAsking = () => { if (ask) window.removeEventListener("click", ask); };
    if (D && typeof D.requestPermission === "function") {
      ask = () => { D.requestPermission!().then((r) => { stopAsking(); if (r === "granted") start(); }).catch(() => { /* not a tap: ask on the next one */ }); };
      // Taps only: a touchend also ends every scroll swipe, and iOS put the prompt up mid-scroll (Zach, Oct 23)
      window.addEventListener("click", ask);
    } else start();
    return () => { window.removeEventListener("deviceorientation", on); stopAsking(); cancelAnimationFrame(raf); };
  }, []);
  const [appsGo, setAppsGo] = useState<"none" | "front" | "all">("none");
  useEffect(() => {
    const stage = phonesRef.current;
    if (!stage) return;
    let idle = 0, quiet = 0, io: IntersectionObserver | null = null, later: (() => void) | null = null;
    const start = () => {
      io = new IntersectionObserver((es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io?.disconnect();
        const go = () => setAppsGo(matchMedia("(min-width: 1024px)").matches ? "all" : "front");
        // The embedded app boots on the page's own thread, so it waits until the arrivals have played and the reader
        // has stopped scrolling for a beat; booting mid-scroll made the players hitch (Zach, Oct 23)
        const boot = () => {
          if (later) window.removeEventListener("scroll", later);
          idle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 1200) as unknown as number;
        };
        later = () => { clearTimeout(quiet); quiet = window.setTimeout(boot, 1200); };
        window.addEventListener("scroll", later, { passive: true });
        quiet = window.setTimeout(boot, 3000);
      }, { rootMargin: "200px 0px" });
      io.observe(stage);
    };
    if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
    return () => { io?.disconnect(); clearTimeout(quiet); if (later) window.removeEventListener("scroll", later); window.removeEventListener("load", start); if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle); clearTimeout(idle); };
  }, []);
  useEffect(() => {
    const stage = phonesRef.current;
    if (!stage) return;
    const scrs = [...stage.querySelectorAll<HTMLElement>(".hp-scr")];
    const fit = () => scrs.forEach((s) => {
      const k = s.clientWidth / 390;
      s.style.setProperty("--hp-s", String(k));
      // The screen's height in app pixels, so the embedded app reaches the very bottom of the glass
      s.style.setProperty("--hp-h", String(s.clientHeight / k));
    });
    fit();
    const ro = new ResizeObserver(fit); scrs.forEach((s) => ro.observe(s));
    return () => ro.disconnect();
  }, []);
  // The YOUR banner moves with the scroll: its track shifts left as the page goes down, wrapping by one run's width.
  const bandRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const band = bandRef.current, track = trackRef.current;
    if (!band || !track || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, on = false;
    const paint = () => {
      raf = 0;
      const run = track.querySelector<HTMLElement>(".ld2-yband-run")?.offsetWidth ?? 0;
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
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { foot.classList.add("in"); io.disconnect(); } }, { threshold: 0.1 });
    io.observe(foot);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);

  // The cast floating around the hero: the best players in the sample league, real Sleeper headshots
  const cast = useMemo(() => {
    const seen = new Set<string>();
    return TEAMS.flatMap((t) => t.roster).map(playerById).filter((p): p is Player => !!p && !/^[A-Z]{2,3}$/.test(p.id))
      .sort((a, b) => b.proj - a.proj).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, 7);
  }, []);
  // Players for the page-wide scatter: the next best players after the hero's cast, at set spots and depths
  const scatter = useMemo(() => {
    const used = new Set(cast.map((p) => p.id));
    const pool = TEAMS.flatMap((t) => t.roster).map(playerById).filter((p): p is Player => !!p && !/^[A-Z]{2,3}$/.test(p.id) && !used.has(p.id))
      .sort((a, b) => b.proj - a.proj).filter((p, i, a) => a.findIndex((q) => q.id === p.id) === i);
    return SCATTER.map((s, i) => ({ ...s, p: pool[i] })).filter((s) => s.p);
  }, [cast]);
  const scatterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scatterRef.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches || (typeof CSS !== "undefined" && CSS.supports("animation-timeline: scroll()"))) return;
    let raf = 0;
    const paint = () => { raf = 0; el.style.setProperty("--sy", String(window.scrollY)); };
    const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
    window.addEventListener("scroll", kick, { passive: true });
    paint();
    return () => { window.removeEventListener("scroll", kick); cancelAnimationFrame(raf); };
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
  // Section headings converge as they scroll in (SplitHead.tsx, after getdropset.app)
  useSplitHeads(root);
  useEffect(() => {
    const el = root.current; if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px 8% 0px" });
    el.querySelectorAll(".ld2-reveal").forEach((n) => io.observe(n));
    const words = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("on", e.isIntersecting || e.boundingClientRect.top < 0)), { rootMargin: "0px 0px -45% 0px" });
    el.querySelectorAll(".ld2-tag:not(.ld2-tag-stack) > span").forEach((n) => words.observe(n));
    return () => { io.disconnect(); words.disconnect(); };
  }, []);

  // Hero depth: pointer tilt, scroll parallax and the exploded layers on the two hero cards (heroDepth.ts)
  const env = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  useEffect(() => (hero.current ? heroDepth(hero.current, env.current) : undefined), []);
  useEffect(() => (foSec.current ? heroDepth(foSec.current, null) : undefined), []);

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
        {/* The field lines are one drawing (public/field-lines*.png, Zach Oct 22), the same in the app; the glow is CSS */}
        <picture className="env-lines"><source media="(min-width: 861px)" srcSet="/field-lines.png" /><img src="/field-lines-phone.png" width={860} height={944} alt="" decoding="async" /></picture>
        <i className="env-grain" style={{ backgroundImage: GRAIN }} />
      </div>
      <nav className={`ld-nav ld2-nav${stuck ? " stuck" : ""}`} aria-label="Source">
        <div className="brand" style={{ padding: 0 }}><BrandLogo layout="row" mark={52} word={30} tagline tag={11} label="Source" stage /></div>
        <div className="ld2-navright">
          {/* Once the hero's username field has scrolled away, the nav carries it: "Find my leagues" opens the same field here */}
          <div className={`ld2-navcta${navCta ? " on" : ""}`} aria-hidden={!navCta || undefined}>
            <button ref={navBtn} className="btn btn-sm btn-primary" tabIndex={navCta ? undefined : -1} onClick={() => setFindOpen(true)} aria-haspopup="dialog">Find my leagues</button>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onDemo}>Try the demo</button>
        </div>
      </nav>

      {/* The bottom edge blur (Zach, Oct 22, from his portfolio): the page softens as it scrolls toward the bottom of the
          screen. Stacked backdrop blurs, each masked to a band, so it deepens smoothly to the edge. */}
      <div className="ld2-edgeblur" ref={edgeRef} aria-hidden="true"><i /><i /><i /><i /></div>
      <main id="ld-main" tabIndex={-1}>
      {/* Players scattered down the page (Zach, Oct 22): near ones large and sharp out in the margins, far ones small,
          blurred and faint behind the sections. They drift at their own rate as the page scrolls. */}
      <div className="sc-layer" ref={scatterRef} aria-hidden="true">
        {scatter.map(({ p, top, side, x, d }, i) => (
          <span key={p.id} className={`sc-p sc-d${d} sc-${side}`} style={{ top: `${top}%`, [side === "l" ? "left" : "right"]: x, ["--i" as string]: i }}>
            <Avatar p={p} size={120} badge={false} />
          </span>
        ))}
      </div>
      <header className="ld-hero ld2-hero" ref={hero}>
        <div className="ld2-copy">
          <span className="ld2-eyebrow ld2-in"><PlatformLogo size={14} />For Sleeper leagues</span>
          <h1 className="ld2-h1 ld2-typed"><TypedHeadline lines={HEADLINES} /></h1>
          <p className="ld2-sub ld2-in" style={{ ["--i" as string]: 3 }}>Source reads your Sleeper league, learns what every team needs, and builds deals that help both sides.</p>
          <div className="ld2-in" style={{ ["--i" as string]: 4 }}>{form("ld-user")}</div>
          <button className="ld2-link ld2-in" style={{ ["--i" as string]: 5 }} onClick={onDemo}>Or explore a sample league<Icon name="chev" size={14} /></button>
        </div>

        {/* Our phone, three times (Zach, Oct 22): the trade idea face on, Sunday live and Set optimal lineup behind it at
            angles. Real components from the sample league, drawn at the app's 390 width and scaled to each screen. Players
            float around them at different depths, the near ones sharp, the far ones small and soft. */}
        <div className={`ld2-stage hp-stage gl-${gl}`} ref={phonesRef}>
          <div className="hp-heads" aria-hidden="true">
            {cast.map((p, i) => (
              <span key={p.id} className={`hp-head d${HEAD_DEPTH[i] ?? 2} h${i}`} style={{ ["--i" as string]: i }}>
                <Avatar p={p} size={96} badge={false} />
                {(HEAD_DEPTH[i] ?? 2) < 2 && <b>{p.name.split(" ").slice(-1)[0]}</b>}
              </span>
            ))}
          </div>
          <div className="hp-phone hp-back hp-left ld2-phone" aria-hidden="true" ref={setInert}>
            <div className="hp-scr">
              <PhoneStatus />
              <PhoneApp tab="trade" go={gl === "off" ? appsGo : "none"} front={false} />
              <span className="ph-home hp-home" aria-hidden="true" />
              <img className="hp-poster" src="/phones/trade.webp" width={780} height={1590} alt="" decoding="async" loading="lazy" />
            </div>
          </div>
          <div className="hp-phone hp-back hp-right ld2-phone" aria-hidden="true" ref={setInert}>
            <div className="hp-scr">
              <PhoneStatus />
              <PhoneApp tab="waivers" go={gl === "off" ? appsGo : "none"} front={false} />
              <span className="ph-home hp-home" aria-hidden="true" />
              <img className="hp-poster" src="/phones/waivers.webp" width={780} height={1590} alt="" decoding="async" loading="lazy" />
            </div>
          </div>
          {!live3d && gl === "on" && <>
            <img className="hp-r hp-r-left" src="/phones/phone-image-left.webp" width={807} height={1541} alt="" decoding="async" />
            <img className="hp-r hp-r-right" src="/phones/phone-image-right.webp" width={818} height={1540} alt="" decoding="async" />
            <img className="hp-r hp-r-front" src="/phones/phone-image-front.webp" width={920} height={1875} alt="" decoding="async" fetchPriority="high" />
          </>}
          <div className="hp-phone hp-front ld2-phone">
            <div className="hp-scr" onClick={tapThrough}>
              <PhoneStatus />
              <PhoneApp tab="wire" go={appsGo} front={true} />
              <span className="ph-home hp-home" aria-hidden="true" />
              <img className="hp-poster" src="/phones/wire.webp" width={780} height={1590} alt="" decoding="async" fetchPriority="high" />
            </div>
          </div>
        </div>
      </header>


      {/* The matchup in its own section (Zach, Oct 22: the hero was too busy). The same Wire card, before kickoff, live
          and final, with room around it. */}
      <section className="ld-section ld2-fosec" aria-labelledby="ld-fo" ref={foSec}>
        <SplitHead id="ld-fo" a="Your matchup," b="before, during, after." />
        <FaceOffStates you={demo.you} partner={demo.mike.manager} />
      </section>

      {/* One screen: the YOUR banner over the stacked tagline (Zach, Oct 22) */}
      <div className="ld2-yourscreen" ref={yourRef}>
      {/* The YOUR banner (Zach, Oct 22, after northeasttomato.com's product strip; moved down to sit over the tagline): YOUR, over and over, in
          Clash on lime. It slides with the page as you scroll and stops when you stop, so it never loops on its own. */}
      <section className="ld2-yband" ref={bandRef} aria-label="Your fantasy Source">
        <svg className="yb-wave" aria-hidden="true" focusable="false"><path /></svg>
        <div className="ld2-yband-tracks" ref={trackRef} aria-hidden="true">
          <div className="ld2-yband-track yb-tx" aria-hidden="true">
            {[0, 1, 2].map((k) => (
              <span key={k} className="ld2-yband-run">
                {/* The words, on their own layer above all the lime, so no piece can cover a neighbor's letters */}
                {YOURS.map((w) => (
                  <span key={w} className="ld2-yband-item">
                    {[..."YOUR"].map((c, i) => <span key={`b${i}`} className="yl yl-b">{c}</span>)}
                    {[..." " + w + " "].map((c, i) => <span key={`w${i}`} className="yl">{c === " " ? "\u00a0" : c}</span>)}
                    <span className="yl yl-dot"><i className="ld2-yband-dot" /></span>
                    <span className="yl">{"\u00a0"}</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
        <p className="sr-only">Your Fantasy Source: your trades, your lineup, your waivers, your league.</p>
      </section>
      <section className="ld2-tagwrap" aria-label="What Source does">
        {/* Stacked caps with chips between the words (Zach, Oct 22, after maggie-app.com): headshots from the sample
            league and lime pixel-icon tiles. Each word and chip lights as it scrolls into the reading line. */}
        <p className="ld2-tag ld2-tag-stack" ref={tagRef}>
          <span className="sr-only">{tagline}</span>
          {TAG_STACK.map((s, i) => typeof s === "string"
            ? <span key={i} aria-hidden="true">{s} </span>
            : "br" in s ? <br key={i} />
            : <span key={i} className={`ld2-chip${"icon" in s ? " ld2-chip-ic" : ""}`} aria-hidden="true">
                {"icon" in s ? <Icon name={s.icon} size={64} /> : "mgr" in s ? <ManagerAvatar src={demo.mike.avatar} name={demo.mike.manager} size={96} className="ld2-chip-mgr" /> : cast[s.p] ? <Avatar p={cast[s.p]} size={96} badge={false} /> : null}
              </span>)}
        </p>
      </section>
      </div>

      {/* The trade idea, large and in its own section (Zach, Oct 22: not in the phone, further down where trades are the
          subject). The same card as Overview, with the hero's depth: tilt on pointer, layers that lift apart. */}
      {demo.trade && (
        <section className="ld-section ld2-tradesec" aria-labelledby="ld-trades">
          <div className="ld2-tradesec-copy">
            <SplitHead id="ld-trades" a="Every deal," b="built for both sides." />
            <p className="ld2-tradesec-sub">Source finds the trade the other manager is already shopping for, checks it against both starting lineups, and only shows it when you both come out ahead.</p>
          </div>
          {/* The deal the way the trade builder reads it (Zach, Oct 22: "so you can see it's a win win"): both sides,
              the verdict, points and value for each team, and their odds. Same pieces as Trade.tsx, read only. */}
          <LandingDeal trade={demo.trade} them={demo.mike} run={() => ideaSteps(demo.mike, demo.tags, INITIAL_MY_TAGS, {}, 1)} onOpen={() => openDeal("trade")(demo.trade!)} onPitch={() => openDeal("pitch")(demo.trade!)} />
        </section>
      )}

      {/* Sunday live, its own section (Zach, Oct 22: "show live things and celebrate the sweat"; LandingLive.tsx) */}
      <LandingLive />

      <LandingSteps trade={demo.trade} />

      <section className="ld-section" aria-labelledby="ld-how">
        <SplitHead id="ld-how" a="Built on your league," b="not a value chart." />
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
              <div className={`ld2-phone ld2-phone3d gl-${smsGl}`} ref={smsPhone}>
                <PhoneChrome />
                {!live3d && smsGl === "on" && <img className="ld2-phone3d-img" src="/phones/phone-image-sms.webp" width={945} height={1958} alt="" decoding="async" loading="lazy" />}
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
          {/* Notes, the offer he turned down and why, and asking Source to make it work (Zach, Oct 22; the trade
              itself now lives in the trade section's readout) */}
          <LandingNotesCard them={demo.mike} notes={demo.notes} tags={demo.tags} avoid={demo.trade} onOpen={openDeal("trade")} />
        </div>
      </section>

      <section className="ld-section ld2-new" aria-labelledby="ld-new">
        <SplitHead id="ld-new" a="Ask it. Set it." b="Take it anywhere." />
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
            {/* The Lineup tab's Set optimal lineup, played from a script with the engine's moves (LandingOptimal.tsx) */}
            {optDemo.swaps.length > 0
              ? <LandingOptimal res={optDemo} />
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
        <SplitHead id="ld-private" a="Private" b="by default." />
        <ul className="ld-trust-list">
          <li className="ld2-reveal"><Icon name="lock" size={22} /><div><b>No passwords</b><p>Connect with your Sleeper username. Your league is read straight from Sleeper's public API.</p></div></li>
          <li className="ld2-reveal"><Icon name="eye" size={22} /><div><b>Your notes stay yours</b><p>What you log about league mates is private and never shown to them.</p></div></li>
          <li className="ld2-reveal"><Icon name="send" size={22} /><div><b>Nothing sends on its own</b><p>Source drafts the offer. You decide if and where it goes.</p></div></li>
          <li className="ld2-reveal"><Icon name="shield" size={22} /><div><b>Locked to your devices</b><p>Offers and starred players sync with a key that lives on your devices. Delete my data clears every copy.</p></div></li>
        </ul>
      </section>

      <section className="ld-section ld2-faq" aria-labelledby="ld-faq">
        {/* Heading and the Ask card stick together on tablet and desktop. On phones this wrapper drops out of the box
            tree, so the card can sit after the questions. */}
        <div className="ld2-faq-side">
          <SplitHead id="ld-faq" a="Questions," b="answered." />
          {/* Opens Ask as a sheet. Asking leads to connect or the sample league, with the question carried in (LandingAsk) */}
          <div className="ld2-faq-askwrap ld2-reveal">
            <button type="button" className="ld2-faq-ask" aria-haspopup="dialog" onClick={() => setAskOpen(true)}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") setAskWave((w) => w + 1); }} onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setAskWave((w) => w + 1); }}>
              <AiMarkPlay size={20} replay={askWave} className="ld2-faq-ask-mark" />
              <span className="ld2-faq-ask-copy"><b>Still have a question?</b><span>Ask how Source works, what it costs, or what it does with your league.</span></span>
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
        <span className="ld2-endlines" aria-hidden="true"><picture><source media="(min-width: 861px)" srcSet="/field-lines.png" /><img src="/field-lines-phone.png" width={860} height={944} alt="" decoding="async" /></picture></span>
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
      {/* Find my leagues from the nav (Zach, Oct 22): a modal on desktop, a sheet on phones, with the hero's form */}
      {findOpen && (
        <DetailSheet className="lda-sheet ldf-sheet" onClose={() => { setFindOpen(false); requestAnimationFrame(() => navBtn.current?.focus()); }} label="Find my leagues"
          title={<h2 className="ds-h">Find your leagues</h2>}>
          <div className="ldf-body">
            <p className="ldf-sub">Type your Sleeper username and Source pulls in every league you're in. No password, nothing to sign into.</p>
            <div className="lda-form">{form("ld-find-user")}</div>
            <div className="lda-or" aria-hidden="true"><span>or</span></div>
            <button type="button" className="btn btn-secondary lda-demo" onClick={onDemo}>Try the sample league</button>
          </div>
        </DetailSheet>
      )}
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
    let i = 0, phase: "type" | "hold" | "erase" | "gap" = "type", t0 = 0, raf = 0, visible = true, last = -1, started = false, done = false;
    // One pass through every line, then it rests on the first (Zach, Oct 22: no looping); a tap plays it again
    const replay = () => { if (!done) return; done = false; i = 0; phase = "erase"; t0 = 0; last = lines[0].length; resume(); };
    const host = ref.current?.closest("h1"); host?.addEventListener("click", replay);
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
      else if (phase === "hold") { n = len; if (done) { setState({ i, n, typing: false }); return; } if (el > (i === 0 ? HOLD_FIRST : HOLD)) { phase = "erase"; t0 = now; } }
      else if (phase === "erase") { n = Math.max(0, len - Math.floor(el / ERASE)); typing = true; if (n <= 0) { phase = "gap"; t0 = now; } }
      else { n = 0; if (el > GAP) { i = (i + 1) % lines.length; if (i === 0) done = true; phase = "type"; t0 = now; last = 0; } }
      if (n !== last || phase === "hold") { last = n; setState((s) => (s.i === i && s.n === n && s.typing === typing ? s : { i, n, typing })); }
      raf = requestAnimationFrame(tick);
    }
    document.addEventListener("visibilitychange", resume);
    const start = window.setTimeout(() => { started = true; resume(); }, 420);
    return () => { started = false; clearTimeout(start); cancelAnimationFrame(raf); raf = 0; io.disconnect(); document.removeEventListener("visibilitychange", resume); host?.removeEventListener("click", replay); };
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
    // One pass through the states, then it rests on Final; the tabs replay any of them (Zach, Oct 22: no looping)
    const i = AT.findIndex((x) => x.v === at);
    if (i >= AT.length - 1) return;
    const id = window.setTimeout(() => setAt(AT[i + 1].v), 4000);
    return () => clearTimeout(id);
  }, [at, picked, hold.hover, hold.focus, seen]);
  return (
    <div ref={wrap} className="hd-states ld2-in" style={{ ["--i" as string]: 6 }}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setHold((h) => ({ ...h, hover: true })); }}
      onPointerLeave={() => setHold((h) => ({ ...h, hover: false }))}
      onPointerMove={trophyPointer} onPointerDown={trophyPointer}
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
    return <>Final: {who(mine)} won by {n(margin)}. The <span className="ld2-cap-troph" aria-hidden="true"><PixelTrophy /></span> trophy marks the winner.</>;
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
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setPhase((p) => (p === "wait" ? "scan" : p)); io.disconnect(); } }, { rootMargin: "0px 0px 0px 0px" });
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
      <button className={`ld2-again${phase === "done" ? "" : " off"}`} tabIndex={phase === "done" ? 0 : -1} aria-hidden={phase !== "done"} onClick={() => setPhase("scan")}><Icon name="replay" size={14} />Replay</button>
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

/** The real app inside a hero phone: the sample league in an embedded frame, opened on `tab`, drawn at 390 wide under
 *  the status bar and scaled with the screen (--hp-s). The static screen beside it is the poster until it has drawn.
 *  Only the front phone takes input; the two behind it are pictures of the app running. */
/** On touch screens the front phone's app ignores touches so a swipe scrolls the page, not the app (landing-type.css
 *  .hp-frame). Taps still reach it (Zach, Oct 23: "I should be able to click and tap on these"): the tap's spot on the
 *  phone is mapped into the frame and the control under it, or the nearest one within a fingertip, is clicked. */
const PRESS = "button, a[href], [role='button'], [role='tab'], [role='option'], summary, label, input, [tabindex]:not([tabindex='-1'])";
function tapThrough(e: RMouseEvent<HTMLElement>) {
  const fr = e.currentTarget.querySelector<HTMLIFrameElement>(".hp-frame.on");
  if (!fr || getComputedStyle(fr).pointerEvents !== "none") return;
  let d: Document | null = null;
  try { d = fr.contentDocument; } catch { return; }
  if (!d) return;
  const b = fr.getBoundingClientRect();
  const x = ((e.clientX - b.left) / b.width) * fr.offsetWidth, y = ((e.clientY - b.top) / b.height) * fr.offsetHeight;
  for (const [dx, dy] of [[0, 0], [0, -10], [0, 10], [-10, 0], [10, 0], [-14, -14], [14, -14], [-14, 14], [14, 14]]) {
    const hit = d.elementFromPoint(x + dx, y + dy)?.closest<HTMLElement>(PRESS);
    if (hit) { e.preventDefault(); hit.click(); return; }
  }
}

function PhoneApp({ tab, go, front }: { tab: string; go: "none" | "front" | "all"; front: boolean }) {
  const [ready, setReady] = useState(false);
  if (go === "none" || (go === "front" && !front)) return null;
  return (
    <iframe className={`hp-frame${ready ? " on" : ""}`} src={`/?frame=demo#${tab}`} title={front ? "Source, the sample league" : ""}
      tabIndex={front ? undefined : -1} aria-hidden={front ? undefined : true} loading="lazy"
      onLoad={(e) => { const f = e.currentTarget; window.setTimeout(() => setReady(true), 900); try { f.contentWindow?.document.documentElement.classList.add(front ? "frame-front" : "frame-back"); } catch { /* cross origin: fine */ } }} />
  );
}

/** The phone's status bar: time, the island and the glyphs */
function PhoneStatus() {
  return (
    <div className="ph-status" aria-hidden="true">
      <span className="ph-time">9:41</span>
      <span className="ph-island"><i /></span>
      <StatusGlyphs />
    </div>
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
  return <svg className="px-ic" width="24" height="24" viewBox={PX.video[0]} fill="currentColor" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: PX.video[1] }} />;
}

/** The landing's trade readout: Trade.tsx's builder card for one deal, without the editing. */
function LandingDeal({ trade, them, run, onOpen, onPitch }: { trade: Trade; them: Team; run: () => Steps<Trade[]>; onOpen: () => void; onPitch: () => void }) {
  const v = verdict(trade);
  const acc = trade.accept ?? acceptance(trade, YOU, them);
  const side = (title: string, ids: string[], get?: boolean) => (
    <div className={`qs ld2-deal-side${get ? " get" : ""}`}>
      <span className="eyebrow">{title}</span>
      <ul className="qs-list">
        {ids.map((id) => { const p = playerById(id); return (
          <li key={id} className="qs-item">
            <span className="qs-av"><Avatar p={p} size={34} /></span>
            <span className="qs-who"><span className="qs-pn">{p.name}</span><span className="qs-pm"><b className={`lu-pos p-${p.pos}`}>{p.pos}</b><span aria-hidden="true">·</span>{p.nfl}</span></span>
            <span className="qs-pts">{eff(p, true).toFixed(1)}</span>
          </li>
        ); })}
      </ul>
    </div>
  );
  return (
    <div className="builder ld2-deal ld2-reveal">
      <section className="card deal ttb-card" aria-label={`A trade with ${them.manager}`}>
        <p className="ld2-deal-with"><ManagerAvatar src={them.avatar} name={them.manager} size={24} />Trading with <b>{them.name}</b></p>
        <div className="ld2-deal-lists">
          {side("You send", trade.give)}
          {side("You get", trade.get, true)}
        </div>
        {/* Source reads the deal when it scrolls into view (the finder's steps), then the readout appears in the same
            space, so the card never changes size; Replay replays the read (Zach, Oct 22: the Ideas card's
            interactions move here) */}
        <FinderDemo run={run}>
          <div className="dv">
            <div className="dv-main">
              {/* Already written (Zach, Oct 22: "it should already be filled"): no typing in, so nothing below it moves */}
              <div className="dv-read"><div className={`dv-verdict ${v.tone === "warn" ? "neutral" : v.tone}`}><b>{v.label}</b><p>{dealWhy(v.label, trade.youDelta, trade.adjGive, trade.adjGet, them.manager)}</p></div></div>
              <DealRows
                cols={[{ id: "you", head: "You", you: true }, { id: them.id, head: them.manager }]}
                rows={[
                  { label: "Points per week", tip: "Starting lineups only. Bench players don't count.", cells: [
                    <DealPts key="y" you d={trade.youDelta} before={trade.youBefore} after={trade.youAfter} />,
                    <DealPts key="t" d={trade.themDelta} before={trade.themBefore} after={trade.themAfter} />] },
                  { label: "Trade value", tip: "Market value, the plain sum of each player's value.", cells: [
                    <span key="y" className="dv-v"><b className="dv-n">{trade.marketGive.toLocaleString()}</b><small className="dv-s">you give</small></span>,
                    <span key="t" className="dv-v"><b className="dv-n">{trade.marketGet.toLocaleString()}</b><small className="dv-s">you get</small></span>],
                    extra: <span className="dv-bar" aria-hidden="true"><i style={{ flex: Math.max(1, trade.marketGive) }} /><i style={{ flex: Math.max(1, trade.marketGet) }} /></span> },
                  { label: "Will they accept", cls: "dv-accrow", cells: [<span key="y" className="dv-v dv-none" />, <AcceptCell key="t" a={acc} />],
                    extra: <span className={`dv-accbar ${acc.label === "Likely yes" ? "is-likely" : acc.label === "Worth a shot" ? "is-maybe" : "is-long"}`} aria-hidden="true"><i style={{ width: `${Math.round(acc.p * 100)}%` }} /></span> },
                ]} />
              <div className="dv-actions">
                <button className="linkish small" onClick={onOpen}>Try the demo</button>
                <button className="btn btn-primary" onClick={onPitch}><Icon name="pen" size={16} />Write pitch</button>
              </div>
            </div>
          </div>
        </FinderDemo>
      </section>
    </div>
  );
}
