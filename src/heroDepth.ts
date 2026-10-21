/**
 * Landing hero depth: pointer tilt, scroll parallax and the exploded-layers moment for the two hero cards
 * (the face-off and the trade idea), plus the floating players' drift.
 *
 * One rAF loop, woken by scroll or pointer input and stopped as soon as everything has settled, so an idle
 * hero does no work. Rects are cached on resize and when the hero comes back into view; the loop only reads
 * scrollY and the pointer. Everything stops while the hero is offscreen. Reduced motion skips all of it:
 * the cards keep their static depth from hero-depth.css.
 *
 * Markup: each card is `.hd-card > .hd-tilt > .hd-pose > card`. This file owns `.hd-tilt`'s transform
 * (scroll offset plus pointer tilt); CSS owns `.hd-pose` and the layers, which transition on `.is-x`.
 */

const TILT = 5; // degrees at the card's edge
const EXPLODE_IN = 900, BEAT = 320, SETTLE = 700;

interface Card {
  el: HTMLElement; tilt: HTMLElement;
  // Where the scroll offset goes: the face-off's whole block (pills and caption ride with it), else the tilt itself
  shift: HTMLElement | null; off: number; lastShift: string;
  // Cached, untransformed geometry in document coordinates, and this breakpoint's scroll rate
  x: number; y: number; w: number; h: number; rate: number;
  rx: number; ry: number; vx: number; vy: number; last: string;
  hover: boolean; focus: boolean; intro: 0 | 1 | 2; // 0 not played, 1 playing, 2 done
}

export function heroDepth(hero: HTMLElement, env: HTMLElement | null): () => void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const born = performance.now();
  const timers: number[] = [];

  const cards: Card[] = [...hero.querySelectorAll<HTMLElement>(".hd-card")].map((el) => ({
    el, tilt: el.querySelector<HTMLElement>(".hd-tilt") ?? el, shift: el.closest<HTMLElement>(".hd-states"), off: 0, lastShift: "",
    x: 0, y: 0, w: 1, h: 1, rate: 0, rx: 0, ry: 0, vx: 0, vy: 0, last: "", hover: false, focus: false, intro: 0,
  }));
  const heads = [...hero.querySelectorAll<HTMLElement>(".ld2-head")];

  let raf = 0, inView = true, px = -1, py = -1, hasPointer = false;
  let hero0 = { x: 0, y: 0, w: 1, h: 1 };
  // Players: eased pointer offset across the hero, -1..1
  let hmx = 0, hmy = 0, lastHeads = "";
  // Page background: eased pointer offset across the window, as before
  let emx = 0, emy = 0, etx = 0, ety = 0, lastEnv = "";

  const measure = () => {
    const sy = scrollY, sx = scrollX;
    const r = hero.getBoundingClientRect();
    hero0 = { x: r.left + sx, y: r.top + sy, w: r.width || 1, h: r.height || 1 };
    for (const c of cards) {
      const b = c.el.getBoundingClientRect();
      // A shifted block's rect includes the offset it has now; take it back out so the cache is the resting spot
      c.x = b.left + sx; c.y = b.top + sy - (c.shift ? c.off : 0); c.w = b.width || 1; c.h = b.height || 1;
      c.rate = parseFloat(getComputedStyle(c.el).getPropertyValue("--hd-rate")) || 0;
      // Where the buttons sit in the card, from layout (offsets ignore every transform, so it's right mid explode too).
      // The exploded pose turns around this line, so the buttons stay where they were while the layers fly apart.
      const pose = c.el.querySelector<HTMLElement>(".hd-pose"), pin = c.el.dataset.hdPin ? c.el.querySelector<HTMLElement>(c.el.dataset.hdPin) : null;
      if (pose && pin) {
        let y = pin.offsetHeight / 2, n: HTMLElement | null = pin;
        while (n && n !== pose) { y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
        if (n === pose) c.el.style.setProperty("--hd-oy", `${Math.round(y)}px`);
      }
    }
  };

  const setX = (c: Card) => c.el.classList.toggle("is-x", c.hover || c.focus || c.intro === 1);

  const frame = () => {
    raf = 0;
    const sy = scrollY;
    let busy = false;

    // Page background (outside the hero, so it runs wherever the page is)
    emx += (etx - emx) * 0.12; emy += (ety - emy) * 0.12;
    if (Math.abs(etx - emx) > 0.002 || Math.abs(ety - emy) > 0.002) busy = true;
    const envKey = `${Math.min(sy, 2400)}|${emx.toFixed(3)}|${emy.toFixed(3)}`;
    if (env && envKey !== lastEnv) {
      lastEnv = envKey;
      env.style.setProperty("--sy", String(Math.min(sy, 2400)));
      env.style.setProperty("--mx", emx.toFixed(3));
      env.style.setProperty("--my", emy.toFixed(3));
    }

    if (inView) {
      const cx = px - scrollX, cy = py; // client coords of the pointer
      const over = fine && hasPointer && px >= hero0.x && px <= hero0.x + hero0.w && cy + sy >= hero0.y && cy + sy <= hero0.y + hero0.h;

      // Players drift with the pointer, nearer ones more (their --d in CSS), only while it's over the hero
      const tmx = over ? Math.max(-1, Math.min(1, ((px - hero0.x) / hero0.w) * 2 - 1)) : 0;
      const tmy = over ? Math.max(-1, Math.min(1, ((cy + sy - hero0.y) / hero0.h) * 2 - 1)) : 0;
      hmx += (tmx - hmx) * 0.1; hmy += (tmy - hmy) * 0.1;
      if (Math.abs(tmx - hmx) > 0.002 || Math.abs(tmy - hmy) > 0.002) busy = true;
      const headKey = `${sy}|${hmx.toFixed(3)}|${hmy.toFixed(3)}`;
      if (headKey !== lastHeads) {
        lastHeads = headKey;
        for (const h of heads) {
          h.style.setProperty("--sy", String(sy));
          h.style.setProperty("--mx", hmx.toFixed(3));
          h.style.setProperty("--my", hmy.toFixed(3));
        }
      }

      for (const c of cards) {
        const off = sy * c.rate;
        const ccx = c.x - scrollX + c.w / 2, ccy = c.y + off - sy + c.h / 2;
        // Toward the pointer: the card turns its face to it, strongest at its own edge, capped beyond that
        const nx = over ? Math.max(-1, Math.min(1, (cx - ccx) / (c.w * 0.6))) : 0;
        const ny = over ? Math.max(-1, Math.min(1, (cy - ccy) / (c.h * 0.6))) : 0;
        const tx = -ny * TILT, ty = nx * TILT;
        // A soft spring: quick to follow, no overshoot you can see
        c.vx = (c.vx + (tx - c.rx) * 0.07) * 0.78; c.vy = (c.vy + (ty - c.ry) * 0.07) * 0.78;
        c.rx += c.vx; c.ry += c.vy;
        if (Math.abs(tx - c.rx) > 0.01 || Math.abs(ty - c.ry) > 0.01 || Math.abs(c.vx) > 0.005 || Math.abs(c.vy) > 0.005) busy = true;
        else { c.rx = tx; c.ry = ty; c.vx = c.vy = 0; }
        const move = `translate3d(0, ${off.toFixed(1)}px, 0)`, turn = `rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg)`;
        const t = c.shift ? turn : `${move} ${turn}`;
        if (t !== c.last) { c.last = t; c.tilt.style.transform = t; }
        if (c.shift && move !== c.lastShift) { c.lastShift = move; c.off = off; c.shift.style.transform = move; }

        // Hovering a card explodes it (desktop). The cached rect is the card at rest, so the target doesn't move
        // under the pointer while the layers fly apart.
        const top = c.y + off - sy;
        const hov = over && cx >= c.x - scrollX && cx <= c.x - scrollX + c.w && cy >= top && cy <= top + c.h;
        if (hov !== c.hover) { c.hover = hov; setX(c); }
      }
      hero.classList.toggle("hd-active", over || cards.some((c) => c.hover || c.focus || c.intro === 1 || c.rx !== 0 || c.ry !== 0));
    }
    if (busy) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  const onScroll = () => kick();
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    hasPointer = true; px = e.clientX + scrollX; py = e.clientY;
    etx = e.clientX / innerWidth * 2 - 1; ety = e.clientY / innerHeight * 2 - 1;
    kick();
  };
  const onLeave = () => { hasPointer = false; kick(); };

  // The tilt and the explode must never swallow a click. A press that starts on a button in a card can end on the
  // card beside it once the layers have moved under the pointer, and the browser then sends the click to the card,
  // not the button. If the press ends inside the same card, not on another button, it still counts as that button's.
  let downBtn: HTMLElement | null = null, downAt = 0;
  // A press inside a button's box on screen is that button's, even where the browser's 3D hit test picks a plane
  // behind it (Chrome can, at fractional pointer positions).
  const btnAt = (e: PointerEvent) => {
    const t = (e.target as Element).closest<HTMLElement>(".hd-card button");
    if (t) return t;
    if (!(e.target as Element).closest(".hd-card")) return null;
    return [...hero.querySelectorAll<HTMLElement>(".hd-card button")].find((b) => {
      const r = b.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    }) ?? null;
  };
  const onDown = (e: PointerEvent) => { downBtn = btnAt(e); downAt = performance.now(); };
  const onUp = (e: PointerEvent) => {
    const b = downBtn; downBtn = null;
    if (!b || performance.now() - downAt > 800) return;
    const t = e.target as Element, card = b.closest(".hd-card"), up = btnAt(e);
    // The browser clicks the button itself when the press starts and ends on it; otherwise click it here
    if (card && card.contains(t) && !t.closest("button") && (!up || up === b)) b.click();
  };
  hero.addEventListener("pointerdown", onDown); hero.addEventListener("pointerup", onUp);

  // Keyboard focus inside a card (or the face-off's own controls) explodes it too, on desktop, the same as hover.
  // Only while a key put focus there (:focus-visible), so a click on a button doesn't hold the card open.
  const focusOff: (() => void)[] = [];
  if (fine) for (const c of cards) {
    const scope = c.el.closest<HTMLElement>(".hd-states") ?? c.el;
    const sync = () => {
      const f = !!scope.querySelector(":focus-visible");
      if (f !== c.focus) { c.focus = f; setX(c); hero.classList.toggle("hd-active", true); kick(); }
    };
    const out = () => requestAnimationFrame(sync);
    scope.addEventListener("focusin", sync); scope.addEventListener("focusout", out);
    focusOff.push(() => { scope.removeEventListener("focusin", sync); scope.removeEventListener("focusout", out); });
  }

  // The one-time explode and settle: each card once, the first time most of it is on screen, after its entrance
  const play = (c: Card) => {
    if (c.intro) return;
    c.intro = 1;
    const wait = Math.max(0, born + 1500 - performance.now());
    timers.push(window.setTimeout(() => {
      c.el.classList.add("is-intro"); setX(c); hero.classList.add("hd-active");
      timers.push(window.setTimeout(() => {
        c.intro = 2; setX(c);
        timers.push(window.setTimeout(() => { c.el.classList.remove("is-intro"); kick(); }, SETTLE));
      }, EXPLODE_IN + BEAT));
    }, wait));
  };
  const seen = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const c = cards.find((k) => k.el === e.target);
    if (c) { play(c); seen.unobserve(e.target); }
  }), { threshold: 0.6 });
  cards.forEach((c) => seen.observe(c.el));

  // Offscreen: no loop, no float animation, no hover state
  const vis = new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    hero.classList.toggle("hd-off", !inView);
    if (inView) { measure(); kick(); return; }
    // Out of view nothing moves, so nothing keeps a compositor hint or an exploded hover
    hero.classList.remove("hd-active");
    cards.forEach((c) => { if (c.hover) { c.hover = false; setX(c); } });
  });
  vis.observe(hero);

  const ro = new ResizeObserver(() => { measure(); kick(); });
  ro.observe(hero);
  // The cards glide in for about a second and a half; measure again once they've landed
  timers.push(window.setTimeout(() => { measure(); kick(); }, 1700));

  measure();
  addEventListener("scroll", onScroll, { passive: true });
  if (fine) { addEventListener("pointermove", onMove, { passive: true }); document.documentElement.addEventListener("pointerleave", onLeave); }
  kick();

  return () => {
    removeEventListener("scroll", onScroll);
    removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    focusOff.forEach((f) => f());
    hero.removeEventListener("pointerdown", onDown); hero.removeEventListener("pointerup", onUp);
    seen.disconnect(); vis.disconnect(); ro.disconnect();
    timers.forEach(clearTimeout);
    cancelAnimationFrame(raf);
  };
}
