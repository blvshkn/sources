import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPE, type RefObject } from "react";
import { useTrace } from "../think";
import { ThinkingTrace, Words, useReveal, wordCount } from "./ThinkingTrace";
import { useBackClose } from "../backClose";
import { useReducedMotion } from "motion/react";
import { usePullToDismiss } from "./sheetDrag";
import { spring, type SpringRun } from "./sheetSpring";
import { useFocusTrap } from "./focusTrap";
import { Trade } from "../engine";
import { LEAGUE_NAME, WEEK, YOU, playerById, teamById, sleeperUrl } from "../data";
import { Audience, Tone, draftPitch, draftPitchSteps, reasonsFor } from "../pitch";
import { sleeperId, teamColors } from "../jersey";
import { AiLabel, Icon, Seg } from "./ui";
import { ShareCard, canShareFile } from "./ShareCard";
import { MARK } from "./Logo";
import { WORDMARK, WORD_FONT, WORD_WEIGHT } from "./BrandLogo";

/** Short tap on Android when the share goes through. iOS Safari ignores it. */
const haptic = () => { try { navigator.vibrate?.(10); } catch { /* unsupported */ } };

// Apple's momentum projection (Designing Fluid Interfaces, WWDC 2018)
const project = (v: number, d = 0.998) => ((v / 1000) * d) / (1 - d);
const rubberband = (x: number, dim: number, c = 0.55) => (x * dim * c) / (dim + c * Math.abs(x));

type Method = "text" | "group" | "app" | "share";
type LeagueApp = "Sleeper" | "ESPN" | "Yahoo";
const APP_URL: Record<LeagueApp, string> = {
  Sleeper: "https://sleeper.com/",
  ESPN: "https://fantasy.espn.com/football/",
  Yahoo: "https://football.fantasysports.yahoo.com/",
};
export const CARD_LINK = "sources-orpin.vercel.app";

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => {
  const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
  window.setTimeout(() => res(null), 2500);
});

/**
 * Draws the shareable trade card: a 4:5 portrait graphic written from the other manager's side, so it
 * reads as an offer to them. It links back to Sources, which is how the growth loop starts.
 */
/**
 * The landing's field, projected the same way: a turf plane tipped back in perspective. Long lines run away
 * from you and meet at the horizon, two rows of hash marks cross them, and it all fades out toward the edges.
 * No grid of horizontal lines, so it reads as a football field rather than graph paper.
 */
function drawField(g: CanvasRenderingContext2D, W: number, H: number, A: (o: number) => string, fadeFrom = H * 0.64) {
  const f = document.createElement("canvas"); f.width = W; f.height = H;
  const h = f.getContext("2d"); if (!h) return;
  const hy = H * 0.44, K = H - hy, vx = W / 2;
  // Plane point (x across, z away) to screen; z = 1 is the bottom edge of the card
  const sx = (x: number, z: number) => vx + (x * K) / z, sy = (z: number) => hy + K / z;
  const zFar = 9;
  h.lineCap = "round";
  // Long lines, the same spacing the landing uses
  h.strokeStyle = A(0.2); h.lineWidth = 2;
  for (let x = -3.2; x <= 3.2001; x += 0.32) { h.beginPath(); h.moveTo(sx(x, 1), sy(1)); h.lineTo(sx(x, zFar), sy(zFar)); h.stroke(); }
  // Two rows of hash marks, short ticks running away from you
  h.strokeStyle = "rgba(242,244,241,0.16)";
  for (const z of [1.5, 2.4]) {
    h.lineWidth = 2.2 / z;
    for (let x = -3.2; x <= 3.2001; x += 0.046) { h.beginPath(); h.moveTo(sx(x, z), sy(z)); h.lineTo(sx(x, z + 0.07 * z), sy(z + 0.07 * z)); h.stroke(); }
  }
  // Fade like the landing: strongest at the bottom middle, gone by the sides and the horizon
  h.globalCompositeOperation = "destination-in";
  const m = h.createRadialGradient(W / 2, H, 0, W / 2, H, Math.max(W * 0.72, K * 1.25));
  m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(0.45, "rgba(0,0,0,0.85)"); m.addColorStop(1, "rgba(0,0,0,0)");
  h.fillStyle = m; h.fillRect(0, 0, W, H);
  // And nothing behind the players: the lines only start once the roster rows are done
  const v = h.createLinearGradient(0, fadeFrom, 0, Math.min(H, fadeFrom + H * 0.16)); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,1)");
  h.fillStyle = v; h.fillRect(0, 0, W, H);
  g.drawImage(f, 0, 0);
}

/** The card is shared outside the app, so it defaults to initials in team colors: no player likeness or NFL marks. Pass { photos: true } to opt in to headshots. */
/** The card is shared outside the app, so it defaults to initials in team colors: no player likeness or NFL marks. Pass { photos: true } to opt in to headshots.
 *  It reads from the receiver's side: what they get, what they send, and one plain line on what it does for them.
 *  The card grows with the deal: every player keeps a full-size row, and the image gets taller instead of cramming. */
export async function drawCard(t: Trade, accentRgb?: string, opts: { photos?: boolean } = {}): Promise<Blob | null> {
  const them = teamById(t.partnerId);
  const rs = reasonsFor(t).slice(0, 3);
  const W = 1080, X = 72, ROW = 112, AV = 80;
  // Layout first, so the canvas is exactly as tall as the deal needs (never shorter than a 4:5 post)
  const TOP = 420;                        // header, league line, greeting, "from" line
  const sectionH = (n: number) => 44 + n * ROW;
  const PANEL = rs.length ? 130 + rs.length * 96 : 0;
  const H = Math.max(1350, TOP + sectionH(t.give.length) + 76 + sectionH(t.get.length) + 48 + PANEL + 150);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  // The wordmark is set in Clash Grotesk (src/fonts.ts loads it as a FontFace). Ask for it by name so it's in before
  // the first letter is drawn; a canvas never waits for a font on its own.
  try { await document.fonts?.load(`${WORD_WEIGHT} 28px ${WORD_FONT}`, WORDMARK); } catch { /* falls back to Geist */ }
  try { await document.fonts?.ready; } catch { /* fonts optional */ }
  const F = (w: number, px: number) => `${w} ${px}px 'Geist', system-ui, sans-serif`;
  // Numbers use Geist Mono, the same as everywhere else in the app
  const FM = (w: number, px: number) => `${w} ${px}px 'Geist Mono', ui-monospace, monospace`;
  const css = getComputedStyle(document.documentElement), RGB = accentRgb || css.getPropertyValue("--lime-rgb").trim() || "216, 242, 74", A = (o: number) => `rgba(${RGB},${o})`;
  const LIME = css.getPropertyValue("--lime").trim() || "#D8F24A", INK = "#F2F4F1", MUTED = "#9BA09C", FAINT = "#858B86";
  // The panel's label and before/after lines are the smallest type on the card and it's usually seen shrunk in a thread,
  // so they sit a step brighter than MUTED: 7.3:1 on the panel instead of 5.5:1
  const SUB = "#B4B9B5";
  const GOOD = css.getPropertyValue("--good").trim() || "#7BE08F";
  const track = (txt: string, x: number, y: number, sp2: number) => { let cx = x; for (const ch of txt) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + sp2; } return cx; };

  // Night field: dark turf, a floodlight glow, faint yard lines that only start below the players
  // Cut out with rounded corners: everything outside the card is transparent, so a shared image has no square corners
  const RAD = 56;
  g.beginPath(); if (g.roundRect) g.roundRect(0, 0, W, H, RAD); else g.rect(0, 0, W, H); g.clip();
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#181A19"); bg.addColorStop(1, "#0F1110");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.85, -60, 0, W * 0.85, -60, 820);
  glow.addColorStop(0, A(0.26)); glow.addColorStop(1, A(0));
  g.fillStyle = glow; g.fillRect(0, 0, W, H);

  // Header
  // The logo, as in Figma's "Logo": the two-lane mark, 4/56 of its size apart from SOURCES in Clash Grotesk Medium at
  // 24/56 of it. The mark's artwork starts a fifth of the way into its square, so the square sits that far left of X
  // and the artwork lines up with everything under it.
  const MK = 80, mx = X - MK * 0.2, my = 92 - MK / 2;
  g.save(); g.translate(mx + MK / 2, my + MK / 2); g.scale(MK / 100, MK / 100);
  g.strokeStyle = LIME; g.lineWidth = 5.26; g.lineJoin = "round"; g.lineCap = "butt";
  for (const d of MARK) g.stroke(new Path2D(d));
  g.restore();
  g.fillStyle = INK; g.font = `${WORD_WEIGHT} ${MK * 24 / 56}px ${WORD_FONT}`; g.fillText(WORDMARK, mx + MK + MK * 4 / 56, 104);
  g.fillStyle = LIME; g.font = F(700, 22); const tag = "TRADE OFFER"; let tw = 0; for (const ch of tag) tw += g.measureText(ch).width + 5; track(tag, W - X - tw, 102, 5);
  // Two runs: the words in Geist, the week number in Geist Mono like every other number
  g.fillStyle = MUTED; g.font = F(500, 26); const wk = `${LEAGUE_NAME || "Your league"} · Week `; g.fillText(wk, X, 160);
  const wkX = X + g.measureText(wk).width; g.font = FM(500, 26); g.fillText(`${WEEK}`, wkX, 160);
  g.fillStyle = INK; g.font = F(700, 78); g.fillText(`${them.manager},`, X, 266, W - X * 2);
  g.fillStyle = LIME; g.fillText("let's make a deal.", X, 350, W - X * 2);
  // Who it's from, so a screenshot in a group chat still makes sense
  g.fillStyle = MUTED; g.font = F(500, 26); const from = YOU && YOU.manager && YOU.manager !== "You" ? `${YOU.name} (${YOU.manager})` : YOU?.name ?? "a league mate"; g.fillText(`An offer from ${from}`, X, 398, W - X * 2);

  // Players
  const imgs = await Promise.all([...t.give, ...t.get].map((id) => { const s = opts.photos === true ? sleeperId(playerById(id)) : undefined; return s ? loadImg(`https://sleepercdn.com/content/nfl/players/thumb/${s}.jpg`) : Promise.resolve(null); }));
  let y = TOP + 50, k = 0;
  const side = (label: string, hint: string, ids: string[], hot: boolean) => {
    g.fillStyle = hot ? LIME : MUTED; g.font = F(700, 22); const ex = track(label, X, y, 4);
    g.fillStyle = FAINT; g.font = F(500, 22); g.fillText(hint, ex + 14, y);
    y += 22;
    ids.forEach((id) => {
      const p = playerById(id), img = imgs[k++], cy = y + ROW / 2;
      g.save(); g.beginPath(); g.arc(X + AV / 2, cy, AV / 2, 0, Math.PI * 2); g.closePath(); const [tc1, tc2] = teamColors(p.nfl); g.fillStyle = img ? "#1E2723" : tc1; g.fill(); g.clip();
      if (img) {
        // Sleeper thumbs aren't square: crop to cover the circle instead of squashing the face
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, sq = Math.min(iw, ih);
        g.drawImage(img, (iw - sq) / 2, 0, sq, sq, X, cy - AV / 2, AV, AV);
      }
      else { g.fillStyle = tc2; g.font = F(700, AV * 0.36); g.textAlign = "center"; g.fillText(p.name.split(" ").map((w) => w[0]).slice(0, 2).join(""), X + AV / 2, cy + AV * 0.13); g.textAlign = "left"; }
      g.restore();
      g.strokeStyle = hot ? A(0.55) : "rgba(255,255,255,0.14)"; g.lineWidth = 3; g.beginPath(); g.arc(X + AV / 2, cy, AV / 2, 0, Math.PI * 2); g.stroke();
      g.fillStyle = INK; g.font = F(700, 44); g.fillText(p.name, X + AV + 28, cy + 2, W - X * 2 - AV - 28);
      g.fillStyle = MUTED; g.font = F(500, 26); g.fillText(`${p.pos} · ${p.nfl}`, X + AV + 28, cy + 38);
      y += ROW;
    });
  };
  side("YOU GET", "", t.give, true);
  // Swap divider
  y += 30; g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 2; g.beginPath(); g.moveTo(X, y); g.lineTo(W - X, y); g.stroke();
  g.fillStyle = "#151D19"; g.beginPath(); g.arc(W / 2, y, 26, 0, Math.PI * 2); g.fill(); g.strokeStyle = "rgba(255,255,255,0.18)"; g.stroke();
  g.strokeStyle = MUTED; g.lineWidth = 3; g.lineCap = "round";
  g.beginPath(); g.moveTo(W / 2 - 7, y - 11); g.lineTo(W / 2 - 7, y + 11); g.moveTo(W / 2 - 13, y + 5); g.lineTo(W / 2 - 7, y + 11); g.lineTo(W / 2 - 1, y + 5);
  g.moveTo(W / 2 + 7, y + 11); g.lineTo(W / 2 + 7, y - 11); g.moveTo(W / 2 + 1, y - 5); g.lineTo(W / 2 + 7, y - 11); g.lineTo(W / 2 + 13, y - 5); g.stroke();
  y += 60;
  side("YOU SEND", "", t.get, false);

  // The field sits under the bottom of the card, starting just below the last player
  drawField(g, W, H, A, Math.min(H * 0.9, y + 20));

  // What it does for them, in one plain line. A loss for them never goes on the card, and neither does our gain.
  if (rs.length) {
    const py = y + 40, ph = PANEL - 40;
    g.beginPath(); g.roundRect?.(X, py, W - X * 2, ph, 24); if (!g.roundRect) g.rect(X, py, W - X * 2, ph);
    g.fillStyle = "#141716"; g.fill(); g.fillStyle = A(0.09); g.fill(); g.strokeStyle = A(0.35); g.lineWidth = 2; g.stroke();
    g.fillStyle = SUB; g.font = F(700, 20); track("WHY THIS WORKS FOR YOU", X + 32, py + 48, 4);
    // One line per reason: the number big and green, what it means beside it, the before/after under it
    // Text starts on one column, after the widest number
    // Every number at the same large size, text on one column after the widest
    g.font = FM(700, 64); const bw = Math.max(...rs.map((r) => g.measureText(r.big).width));
    rs.forEach((r, i) => {
      const ry = py + 128 + i * 96;
      g.fillStyle = GOOD; g.font = FM(700, 64); g.fillText(r.big, X + 30, ry);
      g.fillStyle = INK; g.font = F(600, 30); g.fillText(r.line, X + 56 + bw, r.detail ? ry - 16 : ry - 6, W - X * 2 - bw - 88);
      if (r.detail) { g.fillStyle = SUB; g.font = F(500, 24); g.fillText(r.detail, X + 56 + bw, ry + 16, W - X * 2 - bw - 88); }
    });
  }

  // Footer
  g.fillStyle = FAINT; g.font = F(500, 22); g.fillText(`Made with Sources · ${CARD_LINK}`, X, H - X - 4);
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}

/** The draft streaming in over the box it lands in, matched to the box's own type and padding. */
function PitchStream({ text, box, onDone }: { text: string; box: RefObject<HTMLTextAreaElement | null>; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const b = box.current, el = ref.current;
    if (!b || !el) return;
    const c = getComputedStyle(b);
    for (const k of ["padding", "font", "lineHeight", "letterSpacing", "borderWidth", "borderStyle", "borderRadius"] as const) el.style[k] = c[k];
  }, [box]);
  const total = wordCount(text);
  const k = useReveal(total, total > 0);
  const finished = useRef(onDone);
  finished.current = onDone;
  useEffect(() => {
    if (!total || k < total) return;
    const id = window.setTimeout(() => finished.current(), 320); // lets the last words finish fading in
    return () => window.clearTimeout(id);
  }, [k, total]);
  return <div ref={ref} className="pitch-stream" aria-hidden="true"><Words text={text} k={k} /></div>;
}

export function PitchSheet({ trade, onClose, onSent, onRecord, onMark }: {
  trade: Trade; onClose: () => void; onSent: (msg: string, via?: string) => void;
  /** Saves the deal to Sent offers. Called on every send: a share, a copy, an email or a text. */
  onRecord?: (pitch: string, via: string) => void;
  /** "Mark as sent", for an offer that went out some other way. Saves it and says so. */
  onMark?: (pitch: string) => void;
}) {
  const them = teamById(trade.partnerId);
  const [tone, setTone] = useState<Tone>("friendly");
  const [method, setMethod] = useState<Method>("text");
  // The card is drawn once when the sheet opens and kept as a Blob, so Share image can hand it to the share sheet
  // inside the tap (iOS drops the share if anything async runs first)
  const [card, setCard] = useState<{ blob: Blob; url: string; file: File } | null>(null);
  const cardRef = useRef(card);
  cardRef.current = card;
  const fileName = `sources-trade-${them.manager.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  useEffect(() => {
    let url: string | null = null, alive = true;
    drawCard(trade).then((b) => { if (b && alive) { url = URL.createObjectURL(b); setCard({ blob: b, url, file: new File([b], fileName, { type: "image/png" }) }); } });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [trade]); // eslint-disable-line react-hooks/exhaustive-deps
  const cardUrl = card?.url ?? null;
  const [shareOpen, setShareOpen] = useState(false);
  // Once anything here sends the deal, it's in Sent offers, and the Mark as sent button says so
  const [saved, setSaved] = useState(false);
  const record = (via: string) => { setSaved(true); onRecord?.(text, via); };
  const [app, setApp] = useState<LeagueApp>("Sleeper");
  const audience: Audience = method === "group" ? "group" : "dm";
  const [text, setText] = useState(() => draftPitch(trade, "friendly"));
  const [edited, setEdited] = useState(false);
  const drag = useRef<{ start: number; hist: { y: number; t: number }[] } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  // Our own share view traps focus while it's up, so this sheet lets go
  useFocusTrap(sheet, !shareOpen);
  const scrim = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Presentation state lives in refs so every frame writes straight to the DOM.
  const yRef = useRef(0);
  const run = useRef<SpringRun | null>(null);
  const stop = () => { run.current?.stop(); run.current = null; };
  const closing = useRef(false);
  const reduce = useReducedMotion() ?? false;

  const height = () => (sheet.current?.offsetHeight ?? 600) + 40;
  const apply = (y: number) => {
    yRef.current = y;
    if (sheet.current) sheet.current.style.transform = `translate3d(0, ${y}px, 0)`;
    if (scrim.current) scrim.current.style.opacity = String(Math.min(1, Math.max(0, 1 - y / height())));
  };
  /** Spring in Apple's terms: damping ratio + response (s). Motion runs it from the live value and carries velocity. */
  const springTo = (target: number, damping: number, response: number, velocity: number, done?: () => void) => {
    stop();
    if (reduce) { apply(target); done?.(); return; }
    run.current = spring(yRef.current, target, velocity, damping, response, apply, () => { run.current = null; apply(target); done?.(); });
  };
  const dismiss = (velocity = 0) => {
    if (closing.current) return;
    closing.current = true;
    if (reduce) { sheet.current?.classList.add("fading"); scrim.current?.classList.add("fading"); window.setTimeout(onClose, 160); return; }
    // Leave the way it came in: straight down, no bounce.
    springTo(height(), 1, 0.3, Math.max(velocity, 0), onClose);
  };

  // Enter from below, critically damped.
  useEffect(() => {
    apply(reduce ? 0 : height());
    if (!reduce) springTo(0, 1, 0.35, 0);
    return stop;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Each draft is written as real steps (pitch.ts draftPitchSteps), then streams into the box
  const { trace, result, start } = useTrace<string>();
  const [streaming, setStreaming] = useState<string | null>(null);
  useEffect(() => { start(() => draftPitchSteps(trade, tone, audience)); }, [tone, trade, audience]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (result !== undefined) { setText(result); setEdited(false); setStreaming(result); } }, [result]);
  const writing = trace.status === "thinking" || trace.status === "working";
  const covered = writing || streaming !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const down = (e: RPE) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    stop(); // grab it mid-flight: continue from where it is on screen
    closing.current = false;
    drag.current = { start: e.clientY - yRef.current, hist: [{ y: e.clientY, t: performance.now() }] };
  };
  const move = (e: RPE) => {
    if (!drag.current) return;
    const raw = e.clientY - drag.current.start;
    apply(raw < 0 ? rubberband(raw, 200) : raw); // resist upward, track 1:1 downward
    drag.current.hist = [...drag.current.hist.slice(-4), { y: e.clientY, t: performance.now() }];
  };
  const up = () => {
    if (!drag.current) return;
    const h = drag.current.hist;
    const a = h[0], b = h[h.length - 1];
    const v = b.t - a.t > 0 ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0; // px/s
    drag.current = null;
    const landing = yRef.current + project(v);
    if (landing > Math.min(height() * 0.35, 240)) dismiss(v);
    else springTo(0, 0.8, 0.3, v); // a flick earns a little bounce
  };

  // Pull down from anywhere on the sheet once it's scrolled to the top
  useBackClose(() => dismiss());
  usePullToDismiss(sheet,
    (y) => { stop(); closing.current = false; apply(y); },
    (y, v) => { if (y + project(v) > Math.min(height() * 0.35, 240)) dismiss(v); else springTo(0, 0.8, 0.3, v); });

  const copy = async (): Promise<boolean> => {
    try { await navigator.clipboard.writeText(text); return true; } catch { textRef.current?.select(); return false; }
  };
  /**
   * Share image. Where the browser can share a file (iOS, Android, Safari and Edge on some desktops) it opens the native
   * share sheet with the card, the message and a title. The message is copied first, in the same tap, because most
   * messaging apps keep only the image: whichever one he picks, the text is ready to paste. Everywhere else it opens
   * our own share view (ShareCard). Nothing here awaits before share() is called, so the tap still counts as the gesture.
   */
  const shareImage = () => {
    const c = cardRef.current;
    if (!c) { onSent("The card is still drawing. Try again in a second."); return; }
    if (!canShareFile(c.file)) { setShareOpen(true); return; }
    let copied: Promise<boolean>;
    try { copied = navigator.clipboard.writeText(text).then(() => true, () => false); } catch { copied = Promise.resolve(false); }
    let shared: Promise<void>;
    try { shared = navigator.share({ files: [c.file], text, title: `Trade offer for ${them.manager}` }); } catch (e) { shared = Promise.reject(e); }
    copied.then((ok) => { if (ok) onSent("Message copied"); });
    shared.then(
      async () => { haptic(); record("share sheet"); onSent((await copied) ? "Shared. The message is copied too." : "Shared.", "share sheet"); },
      (e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return; // closed the share sheet: nothing to say
        setShareOpen(true); // the share sheet refused the file: fall back to ours
      });
  };

  const primary = async () => {
    if (method === "text") { record("text"); onSent("Opening Messages with your pitch. Sources will ask tomorrow if they replied.", "text"); window.location.href = `sms:?&body=${encodeURIComponent(text)}`; }
    if (method === "group") { const ok = await copy(); record("group chat"); onSent(ok ? "Copied for the group chat. Paste it in." : "Couldn't copy automatically. The message is selected, so copy it from the box.", "group chat"); }
    if (method === "app") { const ok = await copy(); record(app); window.open(app === "Sleeper" ? sleeperUrl() : APP_URL[app], "_blank", "noopener"); onSent(ok ? `Pitch copied. Paste it into the trade note in ${app}.` : `Opening ${app}. Copy the message from the box first.`, app); }
    if (method === "share") shareImage();
  };
  const primaryLabel = { text: "Open Messages", group: "Copy for group chat", app: `Copy and open ${app}`, share: "Share" }[method];

  return (
    <div className="scrim-wrap">
      <div ref={scrim} className="scrim" onPointerDown={() => dismiss()} aria-hidden="true" />
      <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-labelledby="pitch-title"
        style={{ transform: reduce ? undefined : "translate3d(0, 100vh, 0)" }}>
        <div className="sheet-handle" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-hidden="true" />
        {/* Pinned in the corner while the sheet scrolls (icon-center.css) */}
        <button className="ps-x" onClick={() => dismiss()} aria-label="Close"><Icon name="x" size={18} /></button>
        <div className="row sheet-grab" style={{ justifyContent: "space-between" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div>
            <span className="stamp">Pitch for {them.manager}</span>
            <h2 id="pitch-title" style={{ marginTop: 10 }}>Send the offer</h2>
          </div>
        </div>

        {trade.warnings.length > 0 && (
          <div className="presend">
            <b className="small">Before you send</b>
            {trade.warnings.map((w) => <div key={w} className="warning"><Icon name="alert" size={16} /><span>{w}</span></div>)}
          </div>
        )}

        <figure className="tcard" aria-label="Trade card that goes with your message">
          {cardUrl ? <img src={cardUrl} alt={`Trade offer card: ${them.manager} gets ${trade.give.map((id) => playerById(id).name).join(" and ")}, I get ${trade.get.map((id) => playerById(id).name).join(" and ")}.`} /> : <span className="tcard-skel" aria-hidden="true" />}
          <figcaption>This card goes with your message.</figcaption>
        </figure>

        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <span className="small" style={{ fontWeight: 600 }}>Tone</span>
          <Seg<Tone> label="Tone" value={tone} onChange={setTone} options={[{ v: "straight", label: "Straight" }, { v: "friendly", label: "Friendly" }, { v: "trash", label: "Trash talk" }]} />
        </div>
        <label htmlFor="pitch-text" className="row" style={{ justifyContent: "space-between" }}>
          <AiLabel />
          {edited && <span className="tiny muted">Edited by you</span>}
        </label>
        <ThinkingTrace trace={trace} compact verb={{ doing: "Writing", done: "Wrote it in" }} />
        <div className="pitch-box" aria-busy={covered}>
          <textarea id="pitch-text" ref={textRef} value={text} readOnly={covered} className={covered ? "streaming" : undefined} onChange={(e) => { setText(e.target.value); setEdited(true); }} />
          {covered && <PitchStream key={writing ? "wait" : streaming ?? ""} text={writing ? "" : streaming ?? ""} box={textRef} onDone={() => setStreaming(null)} />}
        </div>

        <div className="send-methods" role="radiogroup" aria-label="How to send">
          {([["text", "msg", "Text message", "Messages, card attached"], ["group", "group", "Group chat", "Tuned for an audience"], ["app", "app", "League app", "Copy + open trade screen"], ["share", "share", "Share sheet", "WhatsApp, Discord, Slack"]] as [Method, "msg" | "group" | "app" | "share", string, string][]).map(([m, ic, label, sub]) => (
            <button key={m} role="radio" aria-checked={method === m} className="method" onClick={() => setMethod(m)}>
              <Icon name={ic} size={18} /><span><b>{label}</b><small>{sub}</small></span>
            </button>
          ))}
        </div>
        {method === "app" && (
          <div className="row wrap">
            <span className="tiny muted">League app</span>
            <Seg<LeagueApp> label="League app" value={app} onChange={setApp} options={[{ v: "Sleeper", label: "Sleeper" }, { v: "ESPN", label: "ESPN" }, { v: "Yahoo", label: "Yahoo" }]} />
          </div>
        )}
        {method === "app" && app === "Sleeper" && <p className="tiny muted">Sleeper's API is read-only, so Sources can't propose the trade inside Sleeper. It copies the pitch and opens Sleeper for you.</p>}

        <div className="sa2">
          <button className="btn btn-primary sa2-main" onClick={primary}><Icon name="send" size={18} />{primaryLabel}</button>
          <div className="sa2-row">
            <button className="btn sa2-sub" onClick={async () => { const ok = await copy(); if (ok) record("copied"); onSent(ok ? "Message copied" : "Couldn't copy automatically. The message is selected, so copy it from the box."); }}><Icon name="copy" size={16} />Copy message</button>
            <button className="btn sa2-sub" onClick={shareImage}><Icon name="share" size={16} />Share image</button>
          </div>
        </div>
        <div className="so-sheet-foot">
          <p className="tiny muted">Nothing sends until you hit send in your messaging app.</p>
          {onMark && (
            <button type="button" className={`so-mark${saved ? " is-saved" : ""}`} aria-pressed={saved}
              onClick={() => { if (saved) return; setSaved(true); onMark(text); }}>
              <Icon name={saved ? "check" : "send"} size={16} /><span>{saved ? "In Sent offers" : "Mark as sent"}</span>
            </button>
          )}
        </div>
      </div>
      {shareOpen && card && (
        <ShareCard url={card.url} blob={card.blob} fileName={fileName} text={text} subject={`Trade offer for ${them.manager}`}
          alt={`Trade offer card for ${them.manager}`} onToast={(m) => onSent(m)} onShared={record} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
