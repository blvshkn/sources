import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { mo } from "../motion";

/**
 * The app toast. It springs up from the bottom (action-motion.css) and can be flicked away sideways: drag past 80px,
 * or flick fast, and it flies off that way; let go short of that and it springs back. Auto-dismiss waits while a
 * finger or the mouse is holding it. Undo stays a plain button, and a press that starts on it never drags.
 * `seq` changes when the same message is sent again, which restarts the timer without replaying the entrance.
 */
export function SwipeToast({ msg, undo, seq, onClose }: { msg: string; undo?: () => void; seq: number; onClose: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false);
  const gone = useRef(false);
  const drag = useRef<{ x0: number; dx: number; t: number; v: number; id: number } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (held || gone.current) return;
    setLeaving(false);
    const ms = undo ? 5000 : 2800;
    const t = window.setTimeout(() => setLeaving(true), ms);
    const t2 = window.setTimeout(() => close.current(), ms + mo(160));
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [seq, held, undo]);

  const set = (x: number | null, opacity: number | null, cls?: "is-drag" | "is-settle") => {
    const n = el.current;
    if (!n) return;
    n.classList.toggle("is-drag", cls === "is-drag");
    n.classList.toggle("is-settle", cls === "is-settle");
    n.style.transform = x === null ? "" : `translateX(${x}px)`;
    n.style.opacity = opacity === null ? "" : String(opacity);
  };

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (gone.current || (e.pointerType === "mouse" && e.button !== 0) || (e.target as Element).closest("button")) return;
    drag.current = { x0: e.clientX, dx: 0, t: performance.now(), v: 0, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setHeld(true);
    set(0, null, "is-drag");
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const now = performance.now(), dx = e.clientX - d.x0;
    d.v = (dx - d.dx) / Math.max(1, now - d.t); d.dx = dx; d.t = now;
    set(dx, 1 - Math.min(0.7, Math.abs(dx) / 300), "is-drag");
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    // Past 80px, or a quick flick that has already moved a little, sends it away that way
    if (Math.abs(d.dx) > 80 || (Math.abs(d.v) > 0.6 && Math.abs(d.dx) > 16)) {
      gone.current = true;
      const dir = Math.sign(d.dx || d.v) || 1;
      set(dir * Math.max(420, window.innerWidth * 0.6), 0, "is-settle");
      window.setTimeout(() => close.current(), mo(240));
      return;
    }
    set(null, null, "is-settle");
    setHeld(false);
  };

  return (
    <div ref={el} className={`toast swipe-toast${leaving ? " leaving" : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <span>{msg}</span>
      {undo && <button className="toast-undo" onClick={() => { undo(); close.current(); }}>Undo</button>}
    </div>
  );
}
