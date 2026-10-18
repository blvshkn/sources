import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { Trade, fmt, needsFor } from "../engine";
import { playerById, teamById, sleeperUrl } from "../data";
import { Audience, Tone, draftPitch } from "../pitch";
import { AiLabel, Delta, Icon, PosBadge, Seg } from "./ui";

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

/** Draws the shareable trade card. It links back to Sources, which is how the growth loop starts. */
async function drawCard(t: Trade): Promise<Blob | null> {
  const them = teamById(t.partnerId);
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 630;
  const g = c.getContext("2d");
  if (!g) return null;
  try { await document.fonts?.ready; } catch { /* fonts optional */ }
  const css = getComputedStyle(document.documentElement);
  const v = (k: string, f: string) => css.getPropertyValue(k).trim() || f;
  g.fillStyle = "#13161b"; g.fillRect(0, 0, 1200, 630);
  g.fillStyle = v("--stamp", "#f2b134"); g.fillRect(0, 0, 1200, 10);
  g.fillStyle = "#f2b134"; g.font = "800 30px 'Big Shoulders Display', Impact, sans-serif";
  g.fillText("PER SOURCES", 64, 84);
  g.fillStyle = "#ffffff"; g.font = "800 64px 'Big Shoulders Display', Impact, sans-serif";
  g.fillText(`A trade that works for ${them.manager}`.toUpperCase(), 64, 158);
  const col = (x: number, label: string, ids: string[]) => {
    g.fillStyle = "#9aa3ae"; g.font = "600 24px Figtree, system-ui, sans-serif"; g.fillText(label, x, 238);
    ids.forEach((id, i) => {
      const p = playerById(id);
      g.fillStyle = "#ffffff"; g.font = "700 40px Figtree, system-ui, sans-serif"; g.fillText(p.name, x, 292 + i * 76);
      g.fillStyle = "#9aa3ae"; g.font = "500 22px 'IBM Plex Mono', monospace"; g.fillText(`${p.pos} · ${p.nfl}`, x, 324 + i * 76);
    });
  };
  col(64, `${them.manager.toUpperCase()} GETS`, t.give);
  col(640, "I GET", t.get);
  g.fillStyle = "#1f242c"; g.fillRect(64, 450, 1072, 92);
  g.font = "700 34px 'IBM Plex Mono', monospace";
  g.fillStyle = "#4ade80"; g.fillText(`${them.manager} ${fmt(t.themDelta)} pts/wk`, 92, 508);
  g.fillStyle = t.youDelta >= 0 ? "#4ade80" : "#f87171"; g.fillText(`Me ${fmt(t.youDelta)} pts/wk`, 660, 508);
  g.fillStyle = "#9aa3ae"; g.font = "500 22px Figtree, system-ui, sans-serif";
  g.fillText(`Starting lineup points, weekly projections · ${CARD_LINK}`, 64, 592);
  return new Promise((res) => c.toBlob((b) => res(b), "image/png"));
}

export function PitchSheet({ trade, onClose, onSent }: { trade: Trade; onClose: () => void; onSent: (msg: string, via?: string) => void }) {
  const them = teamById(trade.partnerId);
  const need = needsFor(them).need;
  const [tone, setTone] = useState<Tone>("friendly");
  const [method, setMethod] = useState<Method>("text");
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
    if (landing > height() * 0.5) dismiss(v);
    else springTo(0, 0.8, 0.3, v); // a flick earns a little bounce
  };

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
    if (method === "group") { const ok = await copy(); onSent(ok ? "Copied for the group chat. Paste it in." : "Selected. Copy it and paste in the group chat.", "group chat"); }
    if (method === "app") { const ok = await copy(); window.open(app === "Sleeper" ? sleeperUrl() : APP_URL[app], "_blank", "noopener"); onSent(ok ? `Pitch copied. Paste it into the trade note in ${app}.` : `Opening ${app}. Copy the pitch from the box.`, app); }
    if (method === "share") await share();
  };
  const primaryLabel = { text: "Open Messages", group: "Copy for group chat", app: `Copy and open ${app}`, share: "Share…" }[method];

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

        <figure className="pitch-card" aria-label="Shareable trade card">
          <div className="pc-top"><span className="pc-stamp">Per sources</span><span className="pc-link">{CARD_LINK}</span></div>
          <div className="pc-title">A trade that works for {them.manager}</div>
          <div className="pc-cols">
            <div><span className="pc-k">{them.manager} gets</span>{trade.give.map((id) => <div key={id} className="pc-p"><PosBadge pos={playerById(id).pos} />{playerById(id).name}</div>)}</div>
            <div><span className="pc-k">I get</span>{trade.get.map((id) => <div key={id} className="pc-p"><PosBadge pos={playerById(id).pos} />{playerById(id).name}</div>)}</div>
          </div>
          <div className="pc-nums"><span>{them.manager} <Delta n={trade.themDelta} />/wk</span><span>Me <Delta n={trade.youDelta} />/wk</span></div>
          <figcaption className="pc-why">Fills their {need} spot. Starting lineup points from weekly projections.</figcaption>
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

        <div className="row wrap send-actions">
          <button className="btn btn-primary" onClick={primary}><Icon name="send" size={16} />{primaryLabel}</button>
          <button className="btn" onClick={async () => { const ok = await copy(); onSent(ok ? "Pitch copied." : "Selected. Press Copy to grab the pitch."); }}><Icon name="copy" size={16} />Copy text</button>
          <button className="btn btn-ghost" onClick={saveCard}><Icon name="share" size={16} />Save card</button>
        </div>
        <p className="tiny muted">Nothing sends until you hit send in your messaging app. Sources preps it, you send it.</p>
      </div>
    </div>
  );
}
