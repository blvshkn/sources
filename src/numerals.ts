// Jersey numerals: our own digit outlines, drawn from simple geometry (rectangles, diagonals, and
// corners that are rounded, chamfered or notched). Every set is an original drawing tuned to suggest a
// team's number style (weight, width, corners, counters, contrast, terminals), never a copy of a team
// or maker typeface. Nothing here is traced from a font or a photo.
//
// Units: the cap height is 1000, y runs down from the top of the digit (0) to the baseline (1000) and x
// runs right from the digit's left edge. Each digit is a set of straight-edged contours (outer shapes
// plus counters); a corner pass then rounds, chamfers or notches each vertex by its role, which keeps
// every contour closed and simple so the outlines stroke cleanly.

const H = 1000;

type Tag = "n" | "t" | "f"; // plain vertex, stroke end, flat base
/** A vertex: x, y, its role, and an optional corner size (fraction of cap height) that overrides the
    set's size for that one corner. Big sizes turn a corner into a sweep (curved necks, curled tails). */
type V = [number, number, Tag?, number?];
interface Contour {
  p: V[];
  hole?: boolean;
}
interface Glyph {
  w: number;
  c: Contour[];
}

export type CornerKind = "round" | "chamfer" | "square" | "notch";
/** Corner size as a fraction of cap height: one value, or [along horizontal edges, along vertical edges]. */
export type CornerSize = number | [number, number];

/** One numeral set. Sizes are fractions of the cap height. */
export interface NumeralSet {
  /** Body width of a full digit. */
  w: number;
  /** Vertical stroke weight. */
  stem: number;
  /** Horizontal stroke weight (stem times contrast). */
  bar: number;
  /** Outside convex corners. */
  corner: CornerKind;
  ro: CornerSize;
  /** Concave corners on the outside contour (where strokes meet). */
  inner?: CornerKind;
  ri?: CornerSize;
  /** Counter corners. */
  counter?: CornerKind;
  rc?: CornerSize;
  /** Stroke ends: the free tips of stubs, flags, arms and bars. */
  term?: CornerKind;
  rt?: CornerSize;
  /** Corners that sit on the baseline at a stroke end (feet of 1, 2, 4, 7). */
  rf?: CornerSize;
  /** Curve tension: 0.55 draws a circular quarter, higher is squarer. */
  k?: number;
  /** Middle bar center, from the top. */
  mid?: number;
  /** Space between two digits. */
  gap: number;
  /** Stub-free stroke ends cut on an angle by this much instead of square. */
  cut?: number;
  /** Pointed stubs: the outer side of every hanging stub (2, 3, 5, 6) drops this much further than the
      inner side, so the stub ends in a spur instead of a flat cut. */
  spur?: number;
  /** Per-digit corner sizes, for a digit that is rounder or squarer than the rest of its set. */
  dig?: Partial<Record<string, { ro?: CornerSize; rc?: CornerSize; ri?: CornerSize }>>;
  /** `flare`: the stem widens by this much on each side from mid height to the base. */
  one: { w?: number; flag: number; ft?: number; fb: number; fj: number; foot?: number; footH?: number; flare?: number };
  /** Necks: square (a bar across), diag (a straight diagonal), curve (a diagonal that sweeps out of the
      bowl through big round elbows, sized by `curve`), or bevel (a square neck with 45 degree cuts of
      `bevel` at both elbows). */
  two: { neck: "square" | "diag" | "curve" | "bevel"; stub: number; dy?: number; curve?: number; bevel?: number };
  three: { stub: number; notch?: number; arm?: number };
  four: { type: "diag" | "open" | "closed"; cy?: number; xr?: number };
  five: { stub: number; flag?: number };
  /** `curl`: corner size at the tail side of the block 6 (its top left, the bottom right of the turned
      9), so the tail rolls round into its end. */
  six: { type?: "block" | "diag"; stub: number; bowl?: number; foot?: number; curl?: number };
  /** `weight`: the diagonal's weight as a share of the stem. */
  seven: { type?: "diag" | "bent"; stub: number; foot?: number; bend?: number; weight?: number };
  eight: { pinch?: number; top?: number };
}

// ---------------------------------------------------------------------------------------------
// Digit skeletons

interface Dims {
  W: number;
  s: number;
  b: number;
  m: number;
  sd: number;
  cut: number;
  sp: number;
}

function dims(n: NumeralSet): Dims {
  return { W: n.w * H, s: n.stem * H, b: n.bar * H, m: (n.mid ?? 0.5) * H, sd: n.stem * H * 0.96, cut: (n.cut ?? 0) * H, sp: (n.spur ?? 0) * H };
}

/** Horizontal thickness that gives a diagonal with run dxdy (x per unit y) a perpendicular weight of sd. */
const across = (sd: number, dxdy: number) => sd * Math.sqrt(1 + dxdy * dxdy);
const rect = (x0: number, y0: number, x1: number, y1: number, hole = true): Contour => ({ p: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], hole });

function zero(n: NumeralSet): Glyph {
  const { W, s, b } = dims(n);
  return { w: W, c: [rect(0, 0, W, H, false), rect(s, b, W - s, H - b)] };
}

function one(n: NumeralSet): Glyph {
  const { s, b } = dims(n);
  const o = n.one;
  const s1 = (o.w ?? 1) * s;
  const fw = o.flag * H;
  const F = (o.foot ?? 0) * H;
  const fh = (o.footH ?? 0.85) * b;
  const xs = Math.max(fw, F);
  const p: V[] = [];
  if (fw > 0) {
    p.push([xs - fw, (o.ft ?? 0) * H]);
    if ((o.ft ?? 0) > 0) p.push([xs, 0]);
  } else p.push([xs, 0]);
  p.push([xs + s1, 0]);
  const fl = (o.flare ?? 0) * H;
  if (F > 0) p.push([xs + s1, H - fh], [xs + s1 + F, H - fh, "t"], [xs + s1 + F, H, "f"], [xs - F, H, "f"], [xs - F, H - fh, "t"], [xs, H - fh]);
  else if (fl > 0) p.push([xs + s1, H * 0.55, "n", 0.4], [xs + s1 + fl, H, "f"], [xs - fl, H, "f"], [xs, H * 0.55, "n", 0.4]);
  else p.push([xs + s1, H, "f"], [xs, H, "f"]);
  if (fw > 0) p.push([xs, o.fj * H], [xs - fw, o.fb * H, "t"]);
  // A flared base can reach past the flag on the left: shift the digit so it starts at x = 0.
  const shift = F > 0 ? 0 : Math.max(0, fl - xs);
  const q = shift ? p.map(([x, y, t, r]) => [x + shift, y, t, r] as V) : p;
  return { w: xs + s1 + Math.max(F, fl) + shift, c: [{ p: q }] };
}

/** Top-left stroke end shared by 2 and 3: a stub hanging down, or a plain end that may be cut. */
function topLeft(d: Dims, stub: number): V[] {
  const { s, b, cut, sp } = d;
  if (stub > 0) return [[s, b], [s, b + stub, "t"], [0, b + stub + sp, "t"]];
  return [[cut, b, "t"], [0, 0, "t"]];
}
/** Bottom-left stroke end shared by 3 and 5, listed going up. */
function bottomLeft(d: Dims, stub: number): V[] {
  const { s, b, cut } = d;
  if (stub > 0) return [[0, H, "f"], [0, H - b - stub - d.sp, "t"], [s, H - b - stub, "t"], [s, H - b]];
  return [[0, H, "t"], [cut, H - b, "t"]];
}

function two(n: NumeralSet): Glyph {
  const d = dims(n);
  const { W, s, b, m, sd } = d;
  const stub = n.two.stub * H;
  const tl = topLeft(d, stub);
  const head: V[] = stub > 0 ? [[0, 0]] : [];
  if (n.two.neck === "bevel") {
    const bv = Math.min((n.two.bevel ?? 0.06) * H, b * 0.9);
    const p: V[] = [...head, [W, 0], [W, m + b / 2 - bv], [W - bv, m + b / 2], [s, m + b / 2], [s, H - b], [W, H - b, "t"], [W, H, "f"], [0, H, "f"], [0, m - b / 2 + bv], [bv, m - b / 2], [W - s, m - b / 2], [W - s, b], ...tl];
    return { w: W, c: [{ p }] };
  }
  if (n.two.neck === "square") {
    const p: V[] = [...head, [W, 0], [W, m + b / 2], [s, m + b / 2], [s, H - b], [W, H - b, "t"], [W, H, "f"], [0, H, "f"], [0, m - b / 2], [W - s, m - b / 2], [W - s, b], ...tl];
    return { w: W, c: [{ p }] };
  }
  // Diagonal neck: the right stroke runs down to `dy`, then a diagonal lands on the left end of the base.
  const di = (n.two.dy ?? 0.42) * H;
  const dxdy = (W - s) / (di - (H - b));
  const hd = across(sd, dxdy);
  const yo = di + (hd - s) / Math.abs(dxdy);
  // A curved neck rounds both elbows of the diagonal with big corners, so the stroke sweeps out of the
  // bowl and lands on the base in one curve.
  const cv = n.two.neck === "curve" ? (n.two.curve ?? 0.3) : undefined;
  const p: V[] = [...head, [W, 0], [W, yo, "n", cv], [hd, H - b, "n", cv && cv * 0.5], [W, H - b, "t"], [W, H, "f"], [0, H, "f"], [0, H - b], [W - s, di, "n", cv && cv * 0.75], [W - s, b], ...tl];
  return { w: W, c: [{ p }] };
}

function three(n: NumeralSet): Glyph {
  const d = dims(n);
  const { W, s, b, m } = d;
  const t3 = n.three;
  const stub = t3.stub * H;
  const nd = (t3.notch ?? 0) * H;
  const xm = (t3.arm ?? 0.3) * W;
  const right: V[] = nd > 0 ? [[W, m - nd], [W - nd, m], [W, m + nd]] : [];
  const tl = topLeft(d, stub);
  const head: V[] = stub > 0 ? [[0, 0]] : [];
  const p: V[] = [
    ...head,
    [W, 0],
    ...right,
    [W, H],
    ...bottomLeft(d, stub),
    [W - s, H - b],
    [W - s, m + b / 2],
    [xm, m + b / 2, "t"],
    [xm, m - b / 2, "t"],
    [W - s, m - b / 2],
    [W - s, b],
    ...tl,
  ];
  // A stub-free bottom end starts at the baseline corner, so drop its duplicate.
  return { w: W, c: [{ p: dedupe(p) }] };
}

function four(n: NumeralSet): Glyph {
  const { W, s, b, sd } = dims(n);
  const f = n.four;
  const cy = (f.cy ?? 0.68) * H;
  const xr = (f.xr ?? 0.58) * W;
  const top = cy - b / 2;
  const bot = cy + b / 2;
  const tail: V[] = [[xr + s, top], [W, top, "t"], [W, bot, "t"], [xr + s, bot], [xr + s, H, "f"], [xr, H, "f"], [xr, bot], [0, bot, "t"]];
  if (f.type === "diag") {
    const hd = across(sd * 0.84, xr / top);
    const yi = (hd * top) / xr;
    return { w: W, c: [{ p: [[xr, 0], [xr + s, 0], ...tail, [0, top]] }, { p: [[xr, yi], [xr, top], [hd, top]], hole: true }] };
  }
  if (f.type === "open") {
    return { w: W, c: [{ p: [[0, 0, "t"], [s, 0, "t"], [s, top], [xr, top], [xr, 0, "t"], [xr + s, 0, "t"], ...tail] }] };
  }
  return { w: W, c: [{ p: [[0, 0], [xr + s, 0], ...tail] }, rect(s, b, xr, top)] };
}

function five(n: NumeralSet): Glyph {
  const d = dims(n);
  const { W, s, b, m, cut } = d;
  const stub = n.five.stub * H;
  const fl = (n.five.flag ?? 0) * H;
  const topRight: V[] = fl > 0 ? [[W, 0], [W, b + fl + d.sp, "t"], [W - s, b + fl, "t"], [W - s, b]] : [[W, 0, "t"], [W - cut, b, "t"]];
  const p: V[] = [[0, 0], ...topRight, [s, b], [s, m - b / 2], [W, m - b / 2], [W, H], ...bottomLeft(d, stub), [W - s, H - b], [W - s, m + b / 2], [0, m + b / 2]];
  return { w: W, c: [{ p: dedupe(p) }] };
}

function sixBlock(n: NumeralSet): Glyph {
  const { W, s, b, m, cut, sp } = dims(n);
  const stub = n.six.stub * H;
  const cu = n.six.curl;
  const topRight: V[] = stub > 0 ? [[W, 0], [W, b + stub + sp, "t"], [W - s, b + stub, "t"], [W - s, b]] : [[W, 0, "t"], [W - cut, b, "t"]];
  return { w: W, c: [{ p: [[0, 0, "n", cu], ...topRight, [s, b, "n", cu && cu * 0.4], [s, m - b / 2], [W, m - b / 2], [W, H], [0, H]] }, rect(s, m + b / 2, W - s, H - b)] };
}

/** A 9 with a closed bowl on a straight diagonal leg. Turned over, it is the matching 6. */
function nineDiag(n: NumeralSet): Glyph {
  const { W, s, b, sd } = dims(n);
  const bb = (n.six.bowl ?? 0.62) * H;
  const xf = (n.six.foot ?? 0.12) * W;
  const yj = bb - b * 0.5;
  let hd = s;
  let dxdy = 0;
  for (let i = 0; i < 4; i++) {
    dxdy = (xf + hd - W) / (H - yj);
    hd = across(sd, dxdy);
  }
  const xL = xf + (bb - H) * dxdy;
  return { w: W, c: [{ p: [[0, 0], [W, 0], [W, yj], [xf + hd, H, "f"], [xf, H, "f"], [xL, bb], [0, bb]] }, rect(s, b, W - s, bb - b)] };
}

function seven(n: NumeralSet): Glyph {
  const d = dims(n);
  const { W, s, b } = d;
  const t7 = n.seven;
  const sd = d.sd * (t7.weight ?? 1);
  const stub = t7.stub * H;
  const xb = (t7.foot ?? 0.16) * W;
  const left: V[] = stub > 0 ? [[s, b], [s, b + stub, "t"], [0, b + stub, "t"], [0, 0]] : [[d.cut, b, "t"], [0, 0, "t"]];
  if (t7.type === "bent") {
    const yk2 = (t7.bend ?? 0.36) * H;
    const dxdy = (W - s - xb) / (yk2 - H);
    const hd = across(sd, dxdy);
    const yk = H + (W - xb - hd) / dxdy;
    return { w: W, c: [{ p: [[W, 0], [W, yk], [xb + hd, H, "f"], [xb, H, "f"], [W - s, yk2], [W - s, b], ...left] }] };
  }
  let hd = s;
  let dxdy = 0;
  for (let i = 0; i < 4; i++) {
    dxdy = (xb + hd - W) / (H - b);
    hd = across(sd, dxdy);
  }
  return { w: W, c: [{ p: [[W, 0], [W, b], [xb + hd, H, "f"], [xb, H, "f"], [W - hd, b], ...left] }] };
}

function eight(n: NumeralSet): Glyph {
  const { W, s, b, m } = dims(n);
  const p8 = (n.eight.pinch ?? 0) * H;
  const u = (n.eight.top ?? 0) * W;
  // The waist: the narrower top bowl steps out to the full bottom bowl through a 45 degree pinch.
  const q = Math.abs(p8 - u);
  const p: V[] = [[u, 0], [W - u, 0], [W - u, m - q], [W - p8, m], [W, m + p8], [W, H], [0, H], [0, m + p8], [p8, m], [u, m - q]];
  return { w: W, c: [{ p: dedupe(p) }, rect(s + u, b, W - s - u, m - b / 2), rect(s, m + b / 2, W - s, H - b)] };
}

/** Turn a digit over (180 degrees): a 6 becomes a 9 and back. Winding is unchanged. */
function turn(g: Glyph): Glyph {
  return { w: g.w, c: g.c.map((c) => ({ hole: c.hole, p: c.p.map(([x, y, t, r]) => [g.w - x, H - y, t, r] as V) })) };
}

function dedupe(p: V[]): V[] {
  const out: V[] = [];
  for (const v of p) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - v[0]) < 0.01 && Math.abs(last[1] - v[1]) < 0.01) {
      if (v[2] && !last[2]) last[2] = v[2];
      if (v[3] !== undefined && last[3] === undefined) last[3] = v[3];
      continue;
    }
    out.push([v[0], v[1], v[2], v[3]]);
  }
  while (out.length > 1 && Math.abs(out[0][0] - out[out.length - 1][0]) < 0.01 && Math.abs(out[0][1] - out[out.length - 1][1]) < 0.01) out.pop();
  // Drop vertices that sit on a straight line between their neighbors.
  return out.filter((v, i) => {
    const a = out[(i + out.length - 1) % out.length];
    const c = out[(i + 1) % out.length];
    return Math.abs((v[0] - a[0]) * (c[1] - v[1]) - (v[1] - a[1]) * (c[0] - v[0])) > 0.5;
  });
}

function glyph(n: NumeralSet, digit: string): Glyph {
  switch (digit) {
    case "0": return zero(n);
    case "1": return one(n);
    case "2": return two(n);
    case "3": return three(n);
    case "4": return four(n);
    case "5": return five(n);
    case "6": return n.six.type === "diag" ? turn(nineDiag(n)) : sixBlock(n);
    case "7": return seven(n);
    case "8": return eight(n);
    default: return n.six.type === "diag" ? nineDiag(n) : turn(sixBlock(n));
  }
}

// ---------------------------------------------------------------------------------------------
// Corners

const area = (p: V[]) => p.reduce((a, v, i) => {
  const w = p[(i + 1) % p.length];
  return a + v[0] * w[1] - w[0] * v[1];
}, 0);
const size = (c: CornerSize | undefined, horizontal: boolean) => (c === undefined ? 0 : typeof c === "number" ? c : horizontal ? c[0] : c[1]) * H;

interface Piece {
  a: [number, number];
  b: [number, number];
  ca?: [number, number];
  cb?: [number, number];
  mid?: [number, number];
}

/** Contours with their corners worked, as path data in digit units. Outer shapes wind one way and
    counters the other, so the nonzero fill opens the counters. */
function outline(base: NumeralSet, g: Glyph, digit: string): { c: Piece[][] } {
  const n: NumeralSet = { ...base, ...base.dig?.[digit] };
  const k = n.k ?? 0.56;
  const out: Piece[][] = [];
  for (const c of g.c) {
    let p = dedupe(c.p);
    if (area(p) < 0) p = [...p].reverse();
    const pieces: Piece[] = p.map((v, i) => {
      const prev = p[(i + p.length - 1) % p.length];
      const next = p[(i + 1) % p.length];
      const ux = v[0] - prev[0];
      const uy = v[1] - prev[1];
      const vx = next[0] - v[0];
      const vy = next[1] - v[1];
      const lu = Math.hypot(ux, uy);
      const lv = Math.hypot(vx, vy);
      const convex = ux * vy - uy * vx > 0;
      let kind: CornerKind;
      let cs: CornerSize | undefined;
      if (c.hole) {
        kind = n.counter ?? n.corner;
        cs = convex ? n.rc : n.ri;
      } else if (!convex) {
        kind = n.inner ?? "round";
        cs = n.ri;
      } else if (v[2] === "t") {
        kind = n.term ?? n.corner;
        cs = n.rt;
      } else if (v[2] === "f") {
        kind = n.term ?? n.corner;
        cs = n.rf ?? n.rt;
      } else {
        kind = n.corner;
        cs = n.ro;
      }
      // A vertex with its own size is a sweep: always round, whatever the set's corners are.
      if (v[3] !== undefined) {
        cs = v[3];
        kind = "round";
      }
      if (kind === "notch" && (!convex || c.hole)) kind = "chamfer";
      const lim = kind === "notch" ? 0.42 : 0.5;
      const da = Math.min(size(cs, Math.abs(ux) > Math.abs(uy)), lu * lim);
      const db = Math.min(size(cs, Math.abs(vx) > Math.abs(vy)), lv * lim);
      const P: [number, number] = [v[0], v[1]];
      if (kind === "square" || da < 0.5 || db < 0.5) return { a: P, b: P };
      const a: [number, number] = [v[0] - (ux / lu) * da, v[1] - (uy / lu) * da];
      const b: [number, number] = [v[0] + (vx / lv) * db, v[1] + (vy / lv) * db];
      if (kind === "chamfer") return { a, b };
      if (kind === "notch") return { a, b, mid: [a[0] + (vx / lv) * db, a[1] + (vy / lv) * db] };
      return { a, b, ca: [a[0] + (ux / lu) * da * k, a[1] + (uy / lu) * da * k], cb: [b[0] - (vx / lv) * db * k, b[1] - (vy / lv) * db * k] };
    });
    // Counters wind against the outer shape.
    out.push(c.hole ? reversePieces(pieces) : pieces);
  }
  return { c: out };
}

function reversePieces(ps: Piece[]): Piece[] {
  return [...ps].reverse().map((q) => ({ a: q.b, b: q.a, ca: q.cb, cb: q.ca, mid: q.mid }));
}

// ---------------------------------------------------------------------------------------------
// Layout

export interface NumberPath {
  /** Path data in artboard units. */
  d: string;
  /** Run width in artboard units. */
  width: number;
}

const cache = new Map<string, { g: Glyph; o: Piece[][] }>();
function cached(id: string, n: NumeralSet, digit: string) {
  const key = id + digit;
  let hit = cache.get(key);
  if (!hit) {
    const g = glyph(n, digit);
    hit = { g, o: outline(n, g, digit).c };
    cache.set(key, hit);
  }
  return hit;
}

function kern(n: NumeralSet, a: string, b: string): number {
  let k = 0;
  if (a === "7") k -= 0.035;
  if (b === "4" && n.four.type === "diag") k -= 0.03;
  if (a === "4") k -= 0.01;
  return k * H;
}

/** Widest run a number of `digits` can take in set `n`, in digit units. Used to size every number of
    a team the same, so 11 and 88 stand the same height. */
const fullRun = (n: NumeralSet, digits: number) => digits * n.w * H + (digits - 1) * n.gap * H;

/**
 * Path data for `num` (one or two digits) set in `n`, centered on x = cx with the baseline at y, the cap
 * height at most `cap` and the run no wider than `maxW` (all artboard units).
 */
export function numberPath(id: string, n: NumeralSet, num: string, cx: number, y: number, cap: number, maxW: number): NumberPath {
  const digits = num.split("");
  if (!digits.length) return { d: "", width: 0 };
  const sc = Math.min(cap / H, maxW / fullRun(n, digits.length));
  const glyphs = digits.map((d) => cached(id, n, d));
  let run = 0;
  const xs: number[] = [];
  glyphs.forEach((g, i) => {
    if (i > 0) run += n.gap * H + kern(n, digits[i - 1], digits[i]);
    xs.push(run);
    run += g.g.w;
  });
  const x0 = cx - (run * sc) / 2;
  const y0 = y - H * sc;
  const f = (p: [number, number], dx: number) => `${(x0 + (p[0] + dx) * sc).toFixed(1)} ${(y0 + p[1] * sc).toFixed(1)}`;
  const parts: string[] = [];
  glyphs.forEach((g, i) => {
    for (const ps of g.o) {
      const dx = xs[i];
      let s = `M${f(ps[0].b, dx)}`;
      for (let j = 1; j <= ps.length; j++) {
        const q = ps[j % ps.length];
        s += `L${f(q.a, dx)}`;
        if (q.ca && q.cb) s += `C${f(q.ca, dx)} ${f(q.cb, dx)} ${f(q.b, dx)}`;
        else {
          if (q.mid) s += `L${f(q.mid, dx)}`;
          if (q.b[0] !== q.a[0] || q.b[1] !== q.a[1]) s += `L${f(q.b, dx)}`;
        }
      }
      parts.push(s + "Z");
    }
  });
  return { d: parts.join(""), width: run * sc };
}

// ---------------------------------------------------------------------------------------------
// Families: each is an original construction. Teams pick a family and tune it.

const ANGLED_1 = { flag: 0.14, fb: 0.11, fj: 0.21 };

/** Classic square block: flat ends, near-square corners, rectangular counters. */
const BLOCK: NumeralSet = {
  w: 0.58, stem: 0.165, bar: 0.145, corner: "round", ro: 0.014, ri: 0.004, rc: 0.008, rt: 0.006, gap: 0.105, mid: 0.49,
  one: ANGLED_1,
  two: { neck: "square", stub: 0.09 },
  three: { stub: 0.09, arm: 0.3 },
  four: { type: "diag", cy: 0.68, xr: 0.58 },
  five: { stub: 0.09 },
  six: { stub: 0.09 },
  seven: { stub: 0, foot: 0.16 },
  eight: {},
};
/** Heavy wide block: big weight, small counters, footed 1. */
const HEAVY: NumeralSet = { ...BLOCK, w: 0.6, stem: 0.205, bar: 0.18, gap: 0.105, one: { flag: 0.13, fb: 0.12, fj: 0.22, foot: 0.11 } };
/** Condensed block: narrow body, tall rectangular counters. */
const NARROW: NumeralSet = { ...BLOCK, w: 0.5, stem: 0.15, bar: 0.135, gap: 0.105, one: { flag: 0.12, fb: 0.1, fj: 0.19 } };
/** Soft block: block weight with rounded outside corners and softened counters. */
const SOFT: NumeralSet = {
  ...BLOCK, w: 0.6, stem: 0.18, bar: 0.16, ro: 0.075, rc: 0.04, ri: 0.02, rt: 0.02, rf: 0.012,
  one: { flag: 0.13, fb: 0.12, fj: 0.22, foot: 0.1 },
  three: { stub: 0.08, arm: 0.32, notch: 0.035 },
  eight: { pinch: 0.03 },
};
/** Rounded condensed: stadium bowls and counters, soft ends. */
const ROUNDED: NumeralSet = {
  w: 0.53, stem: 0.165, bar: 0.15, corner: "round", ro: [0.13, 0.16], ri: 0.03, rc: [0.065, 0.09], rt: 0.025, rf: 0.012, gap: 0.105, mid: 0.49,
  one: { flag: 0.12, fb: 0.12, fj: 0.22 },
  two: { neck: "diag", stub: 0.07, dy: 0.44 },
  three: { stub: 0.07, arm: 0.34, notch: 0.04 },
  four: { type: "diag", cy: 0.68, xr: 0.58 },
  five: { stub: 0.07 },
  six: { stub: 0.06 },
  seven: { stub: 0, foot: 0.16 },
  eight: { pinch: 0.035 },
};
/** Geometric condensed: tall oval bowls, light horizontals, straight diagonal legs. */
const OVAL: NumeralSet = {
  w: 0.45, stem: 0.15, bar: 0.12, corner: "round", ro: [0.225, 0.26], ri: 0.05, rc: [0.075, 0.17], rt: 0.01, rf: 0.006, k: 0.6, gap: 0.105, mid: 0.47,
  one: { flag: 0.11, ft: 0.06, fb: 0.15, fj: 0.24 },
  two: { neck: "diag", stub: 0, dy: 0.46 },
  three: { stub: 0, arm: 0.36, notch: 0.05 },
  four: { type: "diag", cy: 0.7, xr: 0.56 },
  five: { stub: 0 },
  six: { type: "diag", stub: 0, bowl: 0.6, foot: 0.12 },
  seven: { stub: 0, foot: 0.14 },
  eight: { pinch: 0.045, top: 0.06 },
  cut: 0.04,
};
/** Rounded full: round bowls, curved necks and tails, wider than OVAL. */
const CURVY: NumeralSet = {
  ...ROUNDED, w: 0.52, stem: 0.165, bar: 0.14, ro: [0.2, 0.25], rc: [0.1, 0.17], ri: 0.05, rt: 0.02, k: 0.58,
  six: { stub: 0.05 },
  three: { stub: 0.05, arm: 0.36, notch: 0.05 },
  eight: { pinch: 0.05, top: 0.05 },
};
/** Chamfered: corners cut at 45 degrees, angled stroke ends. */
const CHAMFER: NumeralSet = {
  w: 0.54, stem: 0.17, bar: 0.155, corner: "chamfer", ro: 0.075, inner: "chamfer", ri: 0.02, counter: "chamfer", rc: 0.045, term: "square", rt: 0, gap: 0.105, mid: 0.49, cut: 0.05,
  one: { flag: 0.12, ft: 0.05, fb: 0.13, fj: 0.22 },
  two: { neck: "diag", stub: 0, dy: 0.42 },
  three: { stub: 0, arm: 0.32, notch: 0.04 },
  four: { type: "diag", cy: 0.68, xr: 0.58 },
  five: { stub: 0 },
  six: { stub: 0 },
  seven: { stub: 0, foot: 0.14 },
  eight: { pinch: 0.035 },
};
/** Octagonal: big chamfers on every corner, counters included. */
const OCTAGON: NumeralSet = { ...CHAMFER, w: 0.58, stem: 0.18, bar: 0.17, ro: 0.14, rc: 0.075, ri: 0.03, cut: 0, two: { neck: "square", stub: 0.08 }, three: { stub: 0.08, arm: 0.3 }, five: { stub: 0.08 }, six: { stub: 0.08 }, seven: { stub: 0.08, foot: 0.18 }, eight: {}, one: { flag: 0.13, fb: 0.13, fj: 0.24, foot: 0.08 } };
/** Notched block: square block with stepped bites taken out of the stroke ends. */
const NOTCHED: NumeralSet = {
  ...BLOCK, w: 0.6, stem: 0.19, bar: 0.165, ro: 0.006, term: "notch", rt: 0.038, rf: 0.0, counter: "chamfer", rc: 0.035,
  one: { flag: 0.13, fb: 0.13, fj: 0.24 },
  three: { stub: 0.09, arm: 0.28, notch: 0.05 },
  eight: { pinch: 0.05 },
};
/** Slab: block with a broad footed 1 and slightly clipped corners. */
const SLAB: NumeralSet = {
  ...BLOCK, w: 0.56, stem: 0.175, bar: 0.155, corner: "chamfer", ro: 0.03, counter: "round", rc: 0.02, rt: 0.008,
  one: { flag: 0.17, fb: 0.15, fj: 0.25, foot: 0.13, footH: 0.9 },
  two: { neck: "diag", stub: 0.08, dy: 0.4 },
  six: { stub: 0.08 },
};

export const FAMILIES = { BLOCK, HEAVY, NARROW, SOFT, ROUNDED, OVAL, CURVY, CHAMFER, OCTAGON, NOTCHED, SLAB } as const;
export type FamilyId = keyof typeof FAMILIES;

/** Per-team family and tuning. */
const TEAM: Record<string, [FamilyId, Partial<NumeralSet>?]> = {
  BUF: ["BLOCK", { w: 0.56, stem: 0.15, bar: 0.13, ro: 0.03, rc: 0.01, eight: { pinch: 0.04 }, three: { stub: 0.09, arm: 0.3, notch: 0.035 }, one: { flag: 0.14, fb: 0.12, fj: 0.21, foot: 0.12, footH: 0.8 }, seven: { stub: 0, foot: 0.18, weight: 0.8 } }],
  MIA: ["ROUNDED", { w: 0.52, ro: [0.07, 0.08], rc: 0.012, ri: 0.012 }],
  NE: ["NARROW", { w: 0.5, stem: 0.175, ro: 0.025, one: { flag: 0.12, fb: 0.1, fj: 0.19, foot: 0.09 } }],
  NYJ: ["HEAVY", { w: 0.6, stem: 0.21, bar: 0.19 }],
  BAL: ["CURVY", { w: 0.54, stem: 0.14, bar: 0.12, ro: [0.26, 0.32], rc: [0.17, 0.27], dig: { "8": { ro: [0.24, 0.2], rc: [0.12, 0.11] } } }],
  CIN: ["CURVY", { w: 0.44, stem: 0.135, bar: 0.125, ro: [0.17, 0.24], rc: [0.07, 0.15], spur: 0.04, one: { flag: 0.08, ft: 0.03, fb: 0.09, fj: 0.16 }, six: { stub: 0.05, curl: 0.3 } }],
  CLE: ["BLOCK", { w: 0.5, stem: 0.165, bar: 0.15, ro: 0.03, rc: 0.006 }],
  PIT: ["OVAL", { w: 0.42, stem: 0.14, bar: 0.115, ro: [0.21, 0.25], rc: [0.07, 0.16], six: { type: "diag", stub: 0, bowl: 0.6, foot: 0.26 } }],
  // Angular and light, with pointed stub ends.
  HOU: ["CHAMFER", { w: 0.54, stem: 0.155, bar: 0.145, spur: 0.05 }],
  // Heavy block with clipped corners, square counters and a footed 1.
  IND: ["CHAMFER", { w: 0.58, stem: 0.2, bar: 0.18, ro: 0.07, counter: "square", rc: 0, ri: 0.01, cut: 0, one: { flag: 0.13, fb: 0.13, fj: 0.24, foot: 0.1 }, two: { neck: "square", stub: 0.09 }, three: { stub: 0.09, arm: 0.3 }, five: { stub: 0.09 }, six: { stub: 0.09 }, seven: { stub: 0, foot: 0.18 } }],
  JAX: ["ROUNDED", { w: 0.5, stem: 0.145, bar: 0.13, ro: [0.09, 0.11], rc: [0.05, 0.07], one: { flag: 0.12, fb: 0.12, fj: 0.22, flare: 0.035 }, two: { neck: "diag", stub: 0.06, dy: 0.44 }, six: { stub: 0.05, curl: 0.22 } }],
  TEN: ["SOFT", { ro: 0.055, rc: 0.02 }],
  DEN: ["ROUNDED", { w: 0.5, stem: 0.14, bar: 0.13, one: { flag: 0.08, fb: 0.08, fj: 0.16 } }],
  KC: ["HEAVY", { w: 0.6, ro: 0.02 }],
  LV: ["BLOCK", { w: 0.56, stem: 0.185, ro: 0.006 }],
  // Wide, heavy and leaning (the slant is in jerseys.ts): softly rounded outside corners, narrow square
  // counters, square 2 neck, short stubs, a flat-topped flag on the 1 and no foot.
  LAC: ["ROUNDED", { w: 0.58, stem: 0.21, bar: 0.16, ro: [0.11, 0.12], rc: 0.012, ri: 0.015, one: { flag: 0.14, ft: 0, fb: 0.12, fj: 0.2 }, two: { neck: "square", stub: 0.075 }, three: { stub: 0.075, arm: 0.36 }, five: { stub: 0.075 }, six: { stub: 0.07 } }],
  DAL: ["CHAMFER", { w: 0.56, stem: 0.18, bar: 0.16, ro: 0.035, counter: "chamfer", rc: 0.004, ri: 0.01, cut: 0, one: { flag: 0.13, fb: 0.13, fj: 0.24, foot: 0.1 }, two: { neck: "square", stub: 0.09 }, three: { stub: 0.09, arm: 0.3, notch: 0.04 }, five: { stub: 0.09 }, six: { stub: 0.09 }, seven: { stub: 0, foot: 0.18 }, eight: { pinch: 0.04 } }],
  NYG: ["BLOCK", { w: 0.52, stem: 0.165, bar: 0.15, ro: 0.02, one: { flag: 0.13, fb: 0.11, fj: 0.2, foot: 0.07 }, six: { stub: 0 }, four: { type: "diag", cy: 0.66, xr: 0.6 } }],
  PHI: ["SLAB", { corner: "round", ro: 0.07, rc: 0.04 }],
  WAS: ["NARROW", { w: 0.48, stem: 0.16, ro: 0.012, rc: 0.004 }],
  CHI: ["OVAL", { w: 0.42, stem: 0.13, bar: 0.11, one: { flag: 0, fb: 0, fj: 0 }, two: { neck: "diag", stub: 0.04, dy: 0.46 }, six: { stub: 0.04 }, cut: 0 }],
  DET: ["ROUNDED", { w: 0.51, ro: [0.1, 0.13], rc: [0.07, 0.09] }],
  GB: ["SOFT", { w: 0.58, stem: 0.19, ro: 0.04, rc: 0.02, dig: { "8": { ro: 0.13, rc: 0.06 } } }],
  // Heavy wide block with pointed stubs (the spur) and a long square flag on the 1.
  MIN: ["HEAVY", { w: 0.6, stem: 0.2, bar: 0.18, ro: 0.07, rc: 0.006, spur: 0.05, one: { flag: 0.16, ft: 0, fb: 0.14, fj: 0.14 }, two: { neck: "square", stub: 0.1 }, three: { stub: 0.1, arm: 0.3 }, five: { stub: 0.1 }, six: { stub: 0.1 } }],
  ATL: ["NARROW", { w: 0.52, stem: 0.165, bar: 0.15 }],
  // Block with small clipped corners, square counters, footed 1, notched 3 and 8.
  CAR: ["CHAMFER", { w: 0.58, stem: 0.18, bar: 0.16, ro: 0.05, counter: "square", rc: 0, ri: 0.01, cut: 0, one: { flag: 0.13, fb: 0.13, fj: 0.24, foot: 0.1 }, two: { neck: "square", stub: 0.09 }, three: { stub: 0.09, arm: 0.3, notch: 0.04 }, five: { stub: 0.09 }, six: { stub: 0.09 }, seven: { stub: 0, foot: 0.18 }, eight: { pinch: 0.04 } }],
  NO: ["HEAVY", { w: 0.56, stem: 0.185, bar: 0.165, two: { neck: "bevel", stub: 0.08, bevel: 0.08 }, six: { stub: 0.05 }, four: { type: "closed", cy: 0.68, xr: 0.52 } }],
  TB: ["OCTAGON", { stem: 0.17, bar: 0.155, mid: 0.46 }],
  ARI: ["BLOCK", { w: 0.54, rc: 0.04, ro: 0.018 }],
  // Round bowls, a curved 2 neck, a 9 whose tail rolls round, a long sloped flag on the 1, no foot.
  LAR: ["CURVY", { w: 0.52, stem: 0.17, bar: 0.15, ro: [0.2, 0.24], rc: [0.08, 0.14], one: { flag: 0.13, ft: 0, fb: 0.12, fj: 0.24 }, two: { neck: "curve", stub: 0.06, dy: 0.46, curve: 0.5 }, six: { stub: 0.06, curl: 0.3 } }],
  SF: ["HEAVY", { w: 0.58, stem: 0.2 }],
  SEA: ["CHAMFER", { w: 0.5, stem: 0.16, one: { flag: 0.15, ft: 0.04, fb: 0.15, fj: 0.25 } }],
};

// ---------------------------------------------------------------------------------------------
// Font numerals: an openly licensed Google Fonts face (OFL or Apache) chosen per team because its
// digits share the team's number style, set as SVG text so the number stays live text. Metrics are
// measured once from the font (see `m`), so sizing and centering never wait on the font to load:
// until it arrives the browser shows a fallback, then repaints in place at the same size.

/** Digit metrics in units of 1/1000 em: `cap` is the height of a flat-topped digit, `base` how far
    flat-bottomed digits sit below the baseline, and `d` gives each digit 0 to 9 as [advance, ink left,
    ink right] measured from the pen position. */
export interface FontMetrics {
  cap: number;
  base: number;
  d: [number, number, number][];
}

export interface FontNumerals {
  kind: "font";
  family: string;
  weight: number;
  /** Horizontal scale, for a face that is a touch narrower or wider than the team's numbers. */
  scaleX?: number;
  /** Extra space between digits, in 1/1000 em. */
  track?: number;
  /** Slant in degrees, positive leans right. */
  skew?: number;
  m: FontMetrics;
}

/** One number set as text: an x per digit (the pen positions), the baseline, the font size and a
    transform for scaleX and skew around the number's center. */
export interface NumberText {
  text: string;
  x: string;
  y: number;
  size: number;
  width: number;
  transform?: string;
}

/**
 * `num` set in font `f`, centered on cx with the ink bottom on y, the cap height at most `cap` and the
 * run no wider than `maxW`. Every number of a team is sized against the widest possible run, so 11
 * and 88 stand the same height, as with the drawn sets.
 */
export function numberText(f: FontNumerals, num: string, cx: number, y: number, cap: number, maxW: number): NumberText {
  const digits = num.split("").map(Number);
  if (!digits.length) return { text: "", x: "", y, size: 0, width: 0 };
  const sx = f.scaleX ?? 1;
  const tr = f.track ?? 0;
  // The widest run: the widest digit repeated, less its side bearings at the two ends.
  const wide = f.m.d.reduce((a, g) => (g[0] > a[0] ? g : a));
  const full = digits.length * wide[0] + (digits.length - 1) * tr - (wide[0] - (wide[2] - wide[1]));
  const sc = Math.min(cap / f.m.cap, maxW / (full * sx));
  const pens: number[] = [];
  let pen = 0;
  digits.forEach((g, i) => {
    pens.push(pen);
    pen += f.m.d[g][0] + (i < digits.length - 1 ? tr : 0);
  });
  const first = f.m.d[digits[0]];
  const last = f.m.d[digits[digits.length - 1]];
  const left = pens[0] + first[1];
  const right = pens[pens.length - 1] + last[2];
  const mid = (left + right) / 2;
  const xs = pens.map((p) => (cx + (p - mid) * sc).toFixed(1)).join(" ");
  const parts = [sx !== 1 ? `scale(${sx} 1)` : "", f.skew ? `skewX(${-f.skew})` : ""].filter(Boolean);
  return {
    text: num,
    x: xs,
    y: y - f.m.base * sc,
    size: 1000 * sc,
    width: (right - left) * sc * sx,
    transform: parts.length ? `translate(${cx} ${y}) ${parts.join(" ")} translate(${-cx} ${-y})` : undefined,
  };
}

/** Teams whose numbers are set in a font, with the face's measured digit metrics. */
type Metric = [number, number, number];
const font = (family: string, weight: number, cap: number, d: Metric[], o: Partial<FontNumerals> = {}): FontNumerals => ({ kind: "font", family, weight, m: { cap, base: 0, d }, ...o });
// Measured with canvas text metrics at 1000 px from the Google Fonts files.
const OSWALD_640: Metric[] = [[546, 47, 500], [384, 16, 313], [509, 31, 484], [509, 31, 484], [519, 16, 516], [505, 31, 484], [534, 47, 500], [432, 16, 406], [518, 31, 484], [533, 31, 484]];
const ANTONIO_650: Metric[] = [[471, 47, 422], [355, 31, 281], [451, 63, 422], [454, 47, 422], [451, 31, 438], [451, 63, 406], [451, 47, 422], [451, 47, 422], [451, 31, 406], [451, 31, 406]];
const ANTONIO_520: Metric[] = [[436, 47, 391], [396, 47, 297], [429, 63, 406], [430, 47, 391], [429, 31, 422], [429, 63, 391], [429, 47, 406], [429, 31, 406], [429, 31, 391], [429, 31, 391]];
const CHAKRA_700: Metric[] = [[652, 47, 609], [382, 16, 313], [574, 31, 547], [603, 31, 563], [579, 0, 578], [606, 31, 563], [622, 47, 578], [522, 0, 500], [638, 47, 594], [627, 47, 578]];
const CHAKRA_600: Metric[] = [[644, 47, 594], [374, 16, 313], [566, 31, 531], [595, 31, 547], [571, 0, 563], [598, 47, 563], [614, 47, 578], [514, 0, 484], [630, 47, 578], [619, 47, 563]];
const TOMORROW_600: Metric[] = [[682, 47, 641], [455, 47, 422], [672, 47, 625], [668, 47, 625], [672, 16, 641], [666, 47, 625], [695, 47, 641], [569, 16, 547], [689, 47, 641], [699, 63, 656]];
const TOMORROW_700: Metric[] = [[692, 47, 656], [478, 47, 453], [683, 47, 641], [695, 63, 656], [709, 16, 688], [708, 63, 672], [715, 47, 672], [603, 0, 578], [696, 47, 656], [730, 63, 688]];
const BIG_SHOULDERS_700: Metric[] = [[467, 31, 438], [252, 31, 219], [451, 31, 422], [464, 31, 422], [474, 16, 453], [474, 31, 438], [459, 31, 438], [439, 16, 422], [460, 31, 422], [459, 31, 422]];
const BIG_SHOULDERS_800: Metric[] = [[487, 31, 453], [263, 31, 234], [470, 31, 453], [484, 31, 453], [492, 16, 484], [494, 31, 453], [479, 31, 453], [462, 16, 438], [480, 31, 453], [479, 31, 438]];
const LEAGUE_GOTHIC: Metric[] = [[354, 31, 328], [240, 16, 203], [363, 31, 328], [352, 16, 328], [351, 16, 344], [342, 16, 313], [342, 16, 313], [307, 16, 297], [340, 16, 328], [342, 16, 313]];
const FJALLA: Metric[] = [[520, 47, 469], [403, 0, 406], [476, 31, 438], [489, 31, 453], [532, 31, 516], [498, 47, 453], [508, 47, 469], [409, 16, 406], [504, 31, 469], [508, 47, 469]];
const RAJDHANI_700: Metric[] = [[536, 47, 484], [334, 16, 281], [493, 31, 453], [509, 31, 469], [541, 31, 531], [506, 31, 469], [525, 47, 484], [431, 16, 422], [542, 47, 500], [525, 31, 484]];
const FONT_TEAM: Record<string, FontNumerals> = {
  TEN: font("Tomorrow", 600, 750, TOMORROW_600, { scaleX: 0.8 }),
  WAS: font("Tomorrow", 600, 750, TOMORROW_600, { scaleX: 0.78 }),
  SF: font("Tomorrow", 700, 750, TOMORROW_700, { scaleX: 0.72 }),
  TB: font("Tomorrow", 700, 750, TOMORROW_700, { scaleX: 0.72 }),
  // Condensed rounded rectangles with flat sides.
  CLE: font("Big Shoulders", 800, 813, BIG_SHOULDERS_800, { scaleX: 1.15 }),
  // Tall, narrow and round, with a slight lean.
  PIT: font("League Gothic", 400, 750, LEAGUE_GOTHIC, { skew: 5 }),
  // Tall, narrow and round, with a footed 1.
  PHI: font("Fjalla One", 400, 844, FJALLA, { scaleX: 0.82 }),
  // Squared bowls with softened corners and an angled flag.
  SEA: font("Rajdhani", 700, 656, RAJDHANI_700, { scaleX: 0.78 }),
  // Angular, light, pointed.
  HOU: font("Rajdhani", 700, 656, RAJDHANI_700, { scaleX: 0.84 }),
  // Clipped block, footed 1 and 4, a diagonal 2: the classic pro block in its current cut.
  KC: font("Tomorrow", 600, 750, TOMORROW_600, { scaleX: 0.82 }),
  LV: font("Tomorrow", 600, 750, TOMORROW_600, { scaleX: 0.72 }),
  NO: font("Tomorrow", 600, 750, TOMORROW_600, { scaleX: 0.78 }),
  NYG: font("Tomorrow", 600, 750, TOMORROW_600, { scaleX: 0.74 }),
  NYJ: font("Tomorrow", 700, 750, TOMORROW_700, { scaleX: 0.82 }),
  // Clipped corners, clipped counters, flag-only 1.
  NE: font("Chakra Petch", 700, 703, CHAKRA_700, { scaleX: 0.84 }),
  // Clipped corners and clipped counters, a footless 1 with a short flag.
  ARI: font("Chakra Petch", 600, 703, CHAKRA_600, { scaleX: 0.72 }),
  ATL: font("Chakra Petch", 700, 703, CHAKRA_700, { scaleX: 0.85 }),
  // Clipped block with a footed 1 and 4.
  DET: font("Tomorrow", 600, 750, TOMORROW_600, { scaleX: 0.82 }),
  GB: font("Tomorrow", 700, 750, TOMORROW_700, { scaleX: 0.78 }),
  // Condensed rounded rectangles, a 9 on a straight leg (opsz settles on the display cut at jersey sizes).
  DEN: font("Big Shoulders", 700, 813, BIG_SHOULDERS_700, { scaleX: 1.04 }),
  // Narrow, rounded, light: oval counters and plain stroke ends.
  BAL: font("Antonio", 650, 859, ANTONIO_650, { scaleX: 1.06 }),
  CIN: font("Antonio", 520, 859, ANTONIO_520),
  // Condensed with clipped corners and square counters.
  MIA: font("Chakra Petch", 700, 703, CHAKRA_700, { scaleX: 0.72 }),
  JAX: font("Chakra Petch", 700, 703, CHAKRA_700, { scaleX: 0.78 }),
  // Round bowls, a straight 7 and a 9 whose tail turns to a flat end; a touch wider than the face.
  LAR: font("Oswald", 640, 813, OSWALD_640, { scaleX: 1.08 }),
};

/** Number setting for a team: a font, or one of the drawn sets above. */
export type TeamNumerals = FontNumerals | { kind: "drawn"; id: string; set: NumeralSet };
const numeralsCache = new Map<string, TeamNumerals>();
export function teamNumerals(team: string): TeamNumerals {
  let t = numeralsCache.get(team);
  if (!t) {
    t = FONT_TEAM[team] ?? { kind: "drawn", ...numeralSet(team) };
    numeralsCache.set(team, t);
  }
  return t;
}

/** Google Fonts families (with weights) the team fonts use, for the stylesheet link. */
export const FONT_FAMILIES = (): string[] => [...new Set(Object.values(FONT_TEAM).map((f) => `${f.family}:${f.weight}`))];

const resolved = new Map<string, NumeralSet>();
/** The numeral set for a team, with a cache key for its outlines. */
export function numeralSet(team: string): { id: string; set: NumeralSet } {
  const id = TEAM[team] ? team : "_";
  let set = resolved.get(id);
  if (!set) {
    const [fam, over] = TEAM[team] ?? ["BLOCK"];
    set = { ...FAMILIES[fam], ...over };
    resolved.set(id, set);
  }
  return { id, set };
}

/** Family name for a team, for review sheets. */
export const familyOf = (team: string): FamilyId => (TEAM[team] ?? ["BLOCK"])[0];
