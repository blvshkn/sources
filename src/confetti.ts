/** 16-bit confetti for an accepted offer (approved Oct 22, motion-picks.html "Offer accepted or declined"). One burst
 *  up out of the status pill, then a short shower across the card: pieces on a 4px grid, squares and 4x8 ribbons that
 *  flip as they fall, slow down in the air and fade out. About two seconds on screen, once. Draws on a canvas laid
 *  over `host` (it needs position: relative) and removes the canvas when it's done. Reduced motion: nothing. */
import { mo } from "./motion";

const COLS = ["#7BE08F", "#F2BE55", "#F4F6F2", "#8CC8F2", "#F1AA98", "#55B068"];
const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type Piece = { x: number; y: number; vx: number; vy: number; c: string; h: number; ph: number; sp: number; t0: number };

export function confetti(host: HTMLElement, from: DOMRect): () => void {
  if (reduce()) return () => {};
  const hr = host.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement("canvas");
  cv.className = "nm-confetti";
  cv.setAttribute("aria-hidden", "true");
  cv.width = Math.round(hr.width * dpr); cv.height = Math.round(hr.height * dpr);
  host.appendChild(cv);
  const g = cv.getContext("2d");
  if (!g) { cv.remove(); return () => {}; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.imageSmoothingEnabled = false;
  const W = hr.width, H = hr.height, x0 = from.left + from.width / 2 - hr.left, y0 = from.top + from.height / 2 - hr.top;
  const P: Piece[] = [];
  for (let k = 0; k < 70; k++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 4.2 + Math.random() * 4.5;
    P.push({ x: x0, y: y0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: COLS[k % COLS.length], h: k % 3 ? 4 : 8, ph: Math.random() * 6.28, sp: 0.15 + Math.random() * 0.2, t0: 0 });
  }
  for (let k = 0; k < 46; k++) {
    P.push({ x: Math.random() * W, y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 0.8, vy: 1 + Math.random() * 1.5, c: COLS[k % COLS.length], h: k % 2 ? 4 : 8, ph: Math.random() * 6.28, sp: 0.12 + Math.random() * 0.2, t0: 14 + Math.random() * 16 });
  }
  // The preview steps once per 60fps frame for 130 frames. Here each step is a 60fps frame at the app's pace, so the
  // whole thing runs as long on screen as it does there whatever the display's refresh rate.
  const T = 130, FRAME = mo(1000 / 60 / 1.75);
  const t0 = performance.now();
  let f = 0, raf = 0;
  const step = (now: number) => {
    const want = Math.max(0, Math.min(T, Math.floor((now - t0) / FRAME)));
    while (f < want) {
      f++;
      for (const q of P) {
        if (f < q.t0) continue;
        q.vy += 0.16; q.vx *= 0.985; q.vy *= 0.985; if (q.vy > 2.6) q.vy = 2.6;
        q.x += q.vx + Math.sin(f * 0.08 + q.ph) * 0.35; q.y += q.vy; q.ph += q.sp;
      }
    }
    g.clearRect(0, 0, W, H);
    g.globalAlpha = Math.max(0, Math.min(1, (T - f) / 30));
    for (const q of P) {
      if (f < q.t0) continue;
      const flip = Math.abs(Math.cos(q.ph));
      const h = q.h === 8 ? (flip > 0.66 ? 8 : flip > 0.33 ? 4 : 0) : 4;
      if (!h) continue;
      g.fillStyle = q.c;
      g.fillRect(Math.round(q.x / 4) * 4, Math.round(q.y / 4) * 4, 4, h);
    }
    g.globalAlpha = 1;
    if (f < T) raf = requestAnimationFrame(step); else cv.remove();
  };
  raf = requestAnimationFrame(step);
  return () => { cancelAnimationFrame(raf); cv.remove(); };
}
