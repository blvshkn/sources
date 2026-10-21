// Static half of the dismiss lint. Every overlay has to close the same way: a tap or click outside, Escape (topmost
// layer only), focus back to the opener. That behavior lives in one place, src/components/useDismiss.ts, plus the
// shells built on it (DetailSheet, useSwapMenu, Select, the sheets).
//
// Rule: any element that renders aria-expanded, role="dialog" or aria-modal must sit in a component (or hook) that
// goes through useDismiss, useSwapMenu or DetailSheet, or that renders a component which does (found automatically,
// so <PartnerProfile>, <Select>, <PairSheet> and friends count). Things that aren't overlays (accordions, "show more"
// toggles, inline panels in the page flow) and destructive asks that must not close from outside opt out with a
// comment on the same line or up to three lines above:
//
//   // dismiss-exempt: inline accordion
//   {/* dismiss-exempt: destructive */}
//
// Run:   node scripts/check-dismiss-static.mjs
// Exits 1 and prints file:line for each violation.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = join(root, "src");
const HOOK = join(src, "components", "useDismiss.ts");

const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx|ts)$/.test(f) && !f.endsWith(".d.ts")) files.push(p); } };
walk(src);

const DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*(?::[^=]+)?=)/;
const OVERLAY = /aria-expanded|"aria-expanded"|role=["{]?"?dialog"?|aria-modal/;
const EXEMPT = /dismiss-exempt:\s*\S/;

/** Split a file into its top-level declarations: { name, start, end, body } (lines are 0-based). */
function blocks(lines) {
  const out = [];
  lines.forEach((l, i) => { const m = DECL.exec(l); if (m) out.push({ name: m[1] ?? m[2], start: i }); });
  out.forEach((b, k) => { b.end = k + 1 < out.length ? out[k + 1].start - 1 : lines.length - 1; b.body = lines.slice(b.start, b.end + 1).join("\n"); });
  return out;
}

const parsed = files.filter((f) => f !== HOOK).map((f) => { const lines = readFileSync(f, "utf8").split("\n"); return { f, lines, blocks: blocks(lines) }; });

// Components and hooks that dismiss through the shared path, grown to a fixpoint: a component that renders one of
// them is covered too.
const covered = new Set(["useDismiss", "useSwapMenu", "DetailSheet"]);
const uses = (body, name) => (name.startsWith("use") ? new RegExp(`\\b${name}\\s*(<[^>()]*>)?\\(`) : new RegExp(`<${name}[\\s/>]`)).test(body);
for (let grew = true; grew;) {
  grew = false;
  for (const { blocks: bs } of parsed) for (const b of bs) {
    if (covered.has(b.name)) continue;
    if ([...covered].some((c) => uses(b.body, c))) { covered.add(b.name); grew = true; }
  }
}

const bad = [];
let checked = 0, exempt = 0;
for (const { f, lines, blocks: bs } of parsed) {
  lines.forEach((l, i) => {
    // Only .tsx renders elements; a .ts file naming these is a selector (chartReveal.ts), not an overlay
    if (!f.endsWith(".tsx") || !OVERLAY.test(l) || /^\s*(\/\/|\*|\/\*)/.test(l)) return;
    checked++;
    if ([0, 1, 2, 3].some((k) => i - k >= 0 && EXEMPT.test(lines[i - k]))) { exempt++; return; }
    const b = bs.filter((x) => x.start <= i).at(-1);
    if (b && covered.has(b.name)) return;
    bad.push(`${relative(root, f)}:${i + 1}  ${b ? `in ${b.name}: ` : ""}${l.trim().slice(0, 110)}`);
  });
}

console.log(`check-dismiss-static: ${checked} overlay attributes, ${exempt} exempt, ${bad.length} not going through useDismiss / DetailSheet / useSwapMenu`);
if (bad.length) {
  console.log("\nEach of these needs the shared dismiss path, or a `// dismiss-exempt: <reason>` comment if it isn't an overlay:\n");
  for (const b of bad) console.log("  " + b);
  process.exit(1);
}
