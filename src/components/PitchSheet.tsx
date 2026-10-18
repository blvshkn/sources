import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { usePullToDismiss } from "./sheetDrag";
import { Trade, fmt, needsFor } from "../engine";
import { LEAGUE_NAME, WEEK, playerById, teamById, sleeperUrl } from "../data";
import { Audience, Tone, draftPitch } from "../pitch";
import { sleeperId } from "../jersey";
import { AiLabel, Icon, Seg } from "./ui";

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
async function drawCard(t: Trade): Promise<Blob | null> {
  const them = teamById(t.partnerId);
  const W = 1080, H = 1350, X = 72;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  try { await document.fonts?.ready; } catch { /* fonts optional */ }
  const F = (w: number, px: number) => `${w} ${px}px 'Roboto Flex', system-ui, sans-serif`;
  const LIME = "#D8F24A", INK = "#F2F4F1", MUTED = "#9BA09C", FAINT = "#858B86";
  const track = (txt: string, x: number, y: number, sp: number) => { let cx = x; for (const ch of txt) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + sp; } return cx; };

  // Night field: dark turf, a floodlight glow, faint yard lines
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#181A19"); bg.addColorStop(1, "#0F1110");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.85, -60, 0, W * 0.85, -60, 820);
  glow.addColorStop(0, "rgba(216,242,74,0.26)"); glow.addColorStop(1, "rgba(216,242,74,0)");
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,255,255,0.045)"; g.lineWidth = 2;
  for (let y = 120; y < H; y += 120) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); for (let x = 40; x < W; x += 54) { g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x, y + 8); g.stroke(); } }

  // Header
  g.fillStyle = LIME; g.beginPath(); g.arc(X + 9, 92, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = INK; g.font = F(600, 34); g.fillText("sources", X + 30, 104);
  g.fillStyle = LIME; g.font = F(700, 22); const tag = "TRADE OFFER"; let tw = 0; for (const ch of tag) tw += g.measureText(ch).width + 5; track(tag, W - X - tw, 102, 5);
  g.fillStyle = MUTED; g.font = F(500, 26); g.fillText(`${LEAGUE_NAME || "Your league"} · Week ${WEEK}`, X, 160);
  g.fillStyle = INK; g.font = F(700, 78); g.fillText(`${them.manager},`, X, 270, W - X * 2);
  g.fillStyle = LIME; g.fillText("let's make a deal.", X, 356, W - X * 2);

  // Players
  const total = t.give.length + t.get.length;
  const rowH = total <= 3 ? 122 : total <= 4 ? 108 : 94, av = rowH - 30;
  const imgs = await Promise.all([...t.give, ...t.get].map((id) => { const s = sleeperId(playerById(id)); return s ? loadImg(`https://sleepercdn.com/content/nfl/players/thumb/${s}.jpg`) : Promise.resolve(null); }));
  let y = 440, k = 0;
  const side = (label: string, ids: string[], hot: boolean) => {
    g.fillStyle = hot ? LIME : MUTED; g.font = F(700, 22); track(label, X, y, 4); y += 26;
    ids.forEach((id) => {
      const p = playerById(id), img = imgs[k++], cy = y + rowH / 2;
      g.save(); g.beginPath(); g.arc(X + av / 2, cy, av / 2, 0, Math.PI * 2); g.closePath(); g.fillStyle = "#1E2723"; g.fill(); g.clip();
      if (img) g.drawImage(img, X, cy - av / 2, av, av);
      else { g.fillStyle = INK; g.font = F(700, av * 0.36); g.textAlign = "center"; g.fillText(p.name.split(" ").map((w) => w[0]).slice(0, 2).join(""), X + av / 2, cy + av * 0.13); g.textAlign = "left"; }
      g.restore();
      g.strokeStyle = hot ? "rgba(216,242,74,0.55)" : "rgba(255,255,255,0.14)"; g.lineWidth = 3; g.beginPath(); g.arc(X + av / 2, cy, av / 2, 0, Math.PI * 2); g.stroke();
      g.fillStyle = INK; g.font = F(700, Math.round(rowH * 0.4)); g.fillText(p.name, X + av + 28, cy + 2, W - X * 2 - av - 28);
      g.fillStyle = MUTED; g.font = F(500, 26); g.fillText(`${p.pos} · ${p.nfl}`, X + av + 28, cy + 38);
      y += rowH;
    });
  };
  side("YOU GET", t.give, true);
  // Swap divider
  y += 14; g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 2; g.beginPath(); g.moveTo(X, y); g.lineTo(W - X, y); g.stroke();
  g.fillStyle = "#151D19"; g.beginPath(); g.arc(W / 2, y, 26, 0, Math.PI * 2); g.fill(); g.strokeStyle = "rgba(255,255,255,0.18)"; g.stroke();
  g.strokeStyle = MUTED; g.lineWidth = 3; g.lineCap = "round";
  g.beginPath(); g.moveTo(W / 2 - 7, y - 11); g.lineTo(W / 2 - 7, y + 11); g.moveTo(W / 2 - 13, y + 5); g.lineTo(W / 2 - 7, y + 11); g.lineTo(W / 2 - 1, y + 5);
  g.moveTo(W / 2 + 7, y + 11); g.lineTo(W / 2 + 7, y - 11); g.moveTo(W / 2 + 1, y - 5); g.lineTo(W / 2 + 7, y - 11); g.lineTo(W / 2 + 13, y - 5); g.stroke();
  y += 44;
  side("I GET", t.get, false);

  // Impact panel
  const py = H - 340, ph = 196;
  g.fillStyle = "rgba(216,242,74,0.09)"; g.strokeStyle = "rgba(216,242,74,0.35)"; g.lineWidth = 2;
  g.beginPath(); g.roundRect?.(X, py, W - X * 2, ph, 24); if (!g.roundRect) g.rect(X, py, W - X * 2, ph); g.fill(); g.stroke();
  g.fillStyle = MUTED; g.font = F(700, 20); track("YOUR STARTERS", X + 32, py + 50, 4);
  g.fillStyle = t.themDelta >= 0 ? LIME : "#F28B82"; g.font = F(700, 96); const big = fmt(t.themDelta); g.fillText(big, X + 28, py + 150);
  const bw = g.measureText(big).width; g.fillStyle = INK; g.font = F(500, 32); g.fillText("pts / week", X + 40 + bw, py + 148);
  g.fillStyle = MUTED; g.font = F(700, 20); g.textAlign = "right"; track("", 0, 0, 0);
  g.fillText("MINE", W - X - 32, py + 50); g.fillStyle = INK; g.font = F(600, 40); g.fillText(`${fmt(t.youDelta)}/wk`, W - X - 32, py + 100);
  g.textAlign = "left";
  const need = needsFor(them).need;
  if (t.give.some((id) => playerById(id).pos === need)) { g.fillStyle = MUTED; g.font = F(500, 26); g.fillText(`Upgrades your starting ${need}.`, X, py + ph + 50); }

  // Footer
  g.fillStyle = FAINT; g.font = F(500, 22); g.fillText(`Made with Sources · ${CARD_LINK}`, X, H - 40);
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}

export function PitchSheet({ trade, onClose, onSent }: { trade: Trade; onClose: () => void; onSent: (msg: string, via?: string) => void }) {
  const them = teamById(trade.partnerId);
  const [tone, setTone] = useState<Tone>("friendly");
  const [method, setMethod] = useState<Method>("text");
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null, alive = true;
    drawCard(trade).then((b) => { if (b && alive) { url = URL.createObjectURL(b); setCardUrl(url); } });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [trade]);
  const [app, setApp] = useState<LeagueApp>("Sleeper");
  const audience: Audience = method === "group" ? "group" : "dm";
  const [text, setText] = useState(() => draftPitch(trade, "friendly"));
  const [edited, setEdited] = useState(false);
  const drag = useRef<{ start: number; hist: { y: number; t: number }[] } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Presentation state lives in refs so every frame writes straight to the DOM.
  const yRef = useRef(0);
  const vRef = useRef(0);
  const raf = useRef(0);
  const closing = useRef(false);
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const height = () => (sheet.current?.offsetHeight ?? 600) + 40;
  const apply = (y: number) => {
    yRef.current = y;
    if (sheet.current) sheet.current.style.transform = `translate3d(0, ${y}px, 0)`;
    if (scrim.current) scrim.current.style.opacity = String(Math.min(1, Math.max(0, 1 - y / height())));
  };
  /** Spring in Apple's terms: damping ratio + response (s). Starts from the live value and carries velocity. */
  const springTo = (target: number, damping: number, response: number, velocity: number, done?: () => void) => {
    cancelAnimationFrame(raf.current);
    if (reduce) { apply(target); vRef.current = 0; done?.(); return; }
    const k = (2 * Math.PI / response) ** 2;
    const c = (4 * Math.PI * damping) / response;
    let v = velocity;
    let y = yRef.current;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      for (let i = 0; i < 4; i++) { const a = -k * (y - target) - c * v; v += (a * dt) / 4; y += (v * dt) / 4; }
      vRef.current = v;
      if (Math.abs(v) < 4 && Math.abs(y - target) < 0.5) { apply(target); vRef.current = 0; done?.(); return; }
      apply(y);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
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
    return () => cancelAnimationFrame(raf.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setText(draftPitch(trade, tone, audience)); setEdited(false); }, [tone, trade, audience]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const down = (e: RPE) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    cancelAnimationFrame(raf.current); // grab it mid-flight: continue from where it is on screen
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
  usePullToDismiss(sheet,
    (y) => { cancelAnimationFrame(raf.current); closing.current = false; apply(y); },
    (y, v) => { if (y + project(v) > Math.min(height() * 0.35, 240)) dismiss(v); else springTo(0, 0.8, 0.3, v); });

  const copy = async (): Promise<boolean> => {
    try { await navigator.clipboard.writeText(text); return true; } catch { textRef.current?.select(); return false; }
  };
  const share = async () => {
    try {
      const blob = await drawCard(trade);
      const file = blob ? new File([blob], "sources-trade.png", { type: "image/png" }) : null;
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (file && nav.canShare?.({ files: [file] })) await navigator.share({ text, files: [file] });
      else if ("share" in navigator) await navigator.share({ text });
      else { await copy(); onSent("Sharing isn't available here, so the pitch is copied. Paste it into WhatsApp, Discord or Slack.", "share sheet"); return; }
      onSent("Shared. Sources will ask tomorrow if they replied.", "share sheet");
    } catch { /* user cancelled */ }
  };
  const saveCard = async () => {
    const blob = await drawCard(trade);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `sources-trade-${them.manager.toLowerCase()}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const primary = async () => {
    if (method === "text") { onSent("Opening Messages with your pitch. Sources will ask tomorrow if they replied.", "text"); window.location.href = `sms:?&body=${encodeURIComponent(text)}`; }
    if (method === "group") { const ok = await copy(); onSent(ok ? "Copied for the group chat. Paste it in." : "Couldn't copy automatically. The message is selected, so copy it from the box.", "group chat"); }
    if (method === "app") { const ok = await copy(); window.open(app === "Sleeper" ? sleeperUrl() : APP_URL[app], "_blank", "noopener"); onSent(ok ? `Pitch copied. Paste it into the trade note in ${app}.` : `Opening ${app}. Copy the message from the box first.`, app); }
    if (method === "share") await share();
  };
  const primaryLabel = { text: "Open Messages", group: "Copy for group chat", app: `Copy and open ${app}`, share: "Share" }[method];

  return (
    <div className="scrim-wrap">
      <div ref={scrim} className="scrim" onPointerDown={() => dismiss()} aria-hidden="true" />
      <div ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-labelledby="pitch-title"
        style={{ transform: reduce ? undefined : "translate3d(0, 100vh, 0)" }}>
        <div className="sheet-handle" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-hidden="true" />
        <div className="row sheet-grab" style={{ justifyContent: "space-between" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div>
            <span className="stamp">Pitch for {them.manager}</span>
            <h2 id="pitch-title" style={{ marginTop: 10 }}>Send the offer</h2>
          </div>
          <button className="btn btn-sm btn-ghost" onPointerDown={(e) => e.stopPropagation()} onClick={() => dismiss()} aria-label="Close"><Icon name="x" size={18} /></button>
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
        <textarea id="pitch-text" ref={textRef} value={text} onChange={(e) => { setText(e.target.value); setEdited(true); }} />

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
            <button className="btn sa2-sub" onClick={async () => { const ok = await copy(); onSent(ok ? "Message copied." : "Couldn't copy automatically. The message is selected, so copy it from the box."); }}><Icon name="copy" size={16} />Copy text</button>
            <button className="btn sa2-sub" onClick={saveCard}><Icon name="share" size={16} />Save card</button>
          </div>
        </div>
        <p className="tiny muted">Nothing sends until you hit send in your messaging app.</p>
      </div>
    </div>
  );
}
