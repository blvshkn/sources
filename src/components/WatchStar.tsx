import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";

/**
 * The star inside a Watch toggle: the outline star when off, the same star filled lime when on (action-motion.css).
 * Turning it on (a tap, never a mount or a star that was already on) sets data-slam on the button for one beat, so
 * the star lifts a little, slams down with a small squash and the button dips on impact. It stays close to its own
 * size, no ring and no sparkles (Zach). Turning it off just empties the star.
 */
export function WatchStar({ on, size = 16 }: { on: boolean; size?: number }) {
  const prev = useRef(on);
  const box = useRef<HTMLSpanElement>(null);
  const [slam, setSlam] = useState(0);
  useEffect(() => {
    if (on && !prev.current) setSlam((n) => n + 1);
    prev.current = on;
  }, [on]);
  useEffect(() => {
    const btn = box.current?.closest("button");
    if (!slam || !btn) return;
    // Restart even mid-slam: drop the attribute, force a style read, set it again
    btn.removeAttribute("data-slam"); void btn.offsetWidth; btn.setAttribute("data-slam", "");
    const t = window.setTimeout(() => btn.removeAttribute("data-slam"), 1000);
    return () => window.clearTimeout(t);
  }, [slam]);
  return <span ref={box} className="wstar" data-on={on || undefined}><Icon name="star" size={size} /></span>;
}
