// Dismiss lint, the browser half. Zach's rule: modals and sheets close on a click or tap outside them, unless they're
// a destructive ask or confirmation. This opens every overlay it can reach in demo mode, at 390 (touch) and 1440
// (mouse), and for each one:
//   1. taps or clicks outside it and checks it closed. Modals and sheets must take that tap on their scrim, so it
//      can't also hit what's underneath. Menus and dropdowns close on pointerdown and may let the click through.
//   2. opens it again, presses Escape, checks it closed and that focus went back to whatever opened it.
//   3. for the exempt destructive confirmations, checks they stay up through both.
// It also runs the static half (scripts/check-dismiss-static.mjs). Prints a table, exits 1 on any failure.
//
// Run (Playwright and Chromium must be installed; PLAYWRIGHT points at the module if it isn't resolvable):
//   node scripts/check-dismiss.mjs                      builds dist with Vite into a temp dir and serves it
//   node scripts/check-dismiss.mjs --html build.html    a single-file build (the shim build agents use)
//   node scripts/check-dismiss.mjs --url https://sources-orpin.vercel.app
//   options: --shots <dir> saves dismiss-<overlay>-<width>.png of each overlay open; --only <text> filters by name;
//            --widths 390,1440
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const pw = await import(process.env.PLAYWRIGHT ?? (existsSync("/opt/npm-tools/node_modules/playwright/index.mjs") ? "/opt/npm-tools/node_modules/playwright/index.mjs" : "playwright"));
const shots = arg("--shots");
if (shots) mkdirSync(shots, { recursive: true });
const only = arg("--only");
// 1024 only runs what exists as an overlay just there (the slide-over inbox, which docks from 1241px)
const widths = (arg("--widths") ?? "390,1024,1440").split(",").map(Number);

// ---- Where the app comes from --------------------------------------------------------------------------------------
let base, server;
if (arg("--url")) base = arg("--url").replace(/\/$/, "") + "/";
else if (arg("--html")) base = "file://" + resolve(arg("--html"));
else {
  const out = mkdtempSync(join(tmpdir(), "dismiss-"));
  const r = spawnSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { cwd: root, stdio: "inherit" });
  if (r.status) { console.error("vite build failed; pass --html or --url instead"); process.exit(1); }
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
  server = createServer((q, s) => {
    let p = join(out, decodeURIComponent(q.url.split("?")[0].split("#")[0]));
    if (!existsSync(p) || p.endsWith("/")) p = join(out, "index.html");
    s.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }); s.end(readFileSync(p));
  }).listen(0);
  base = `http://127.0.0.1:${server.address().port}/`;
}
const local = (u) => u.startsWith("file:") || u.startsWith(base);

// ---- The overlays --------------------------------------------------------------------------------------------------
// kind "modal": a scrim covers the page and must take the outside tap. kind "menu": lightweight, closes on
// pointerdown and the tap may go through. `at` lists the widths where it exists as an overlay (default 390 and 1440).
const SCRIM = ".ps-scrim, .scrim, .ibx-scrim, .onboard";
const q = (sel) => (p) => p.evaluate((s) => !!document.querySelector(s), sel);
const ideas = async (p) => { await p.click("button:has-text('Ideas')"); await p.waitForSelector(".ti-nope", { timeout: 20000 }); };
const O = [
  { name: "League switcher", kind: "modal", tab: "wire", opener: ".page-league, .lsw-btn", open: q(".ps.lsw") },
  { name: "Inbox slide-over", kind: "modal", tab: "wire", at: [390, 1024], opener: ".top-bell", open: (p) => p.evaluate(() => !!document.querySelector(".shell.inbox-open")),
    fullWidth: 390, note: "Full width at 390 (nothing outside it); docks as a page column from 1241px" },
  { name: "Full matchup sheet", kind: "modal", tab: "wire", opener: ".sb2-open", open: q(".ps-matchup") },
  { name: "Player sheet", kind: "modal", tab: "wire", opener: ".thr .wk-row", open: q(".ps-player") },
  { name: "Claim details (DetailSheet)", kind: "modal", tab: "waivers", opener: ".wv-row[aria-haspopup=dialog]", open: q(".wv-sheet") },
  { name: "Team needs (DetailSheet)", kind: "modal", tab: "league", opener: ".nc-card[aria-haspopup=dialog]", open: q(".nd-sheet") },
  { name: "How Sources works (DetailSheet)", kind: "modal", tab: "settings", pre: (p) => p.click(".page-tabs button:has-text('About'), [role=tab]:has-text('About'), button:has-text('About')"), opener: ".set-link", open: q(".doc-sheet") },
  { name: "Partner profile", kind: "modal", tab: "trade", opener: ".tr-profile", open: q(".ps-partner") },
  { name: "Idea feedback", kind: "modal", tab: "trade", pre: ideas, opener: ".ti-nope", open: q(".ps.fb") },
  { name: "Pitch sheet", kind: "modal", tab: "trade", pre: ideas, opener: ".ti-actions .btn-primary", open: q(".scrim-wrap .sheet") },
  { name: "Onboarding (FirstRun)", kind: "modal", landing: true, opener: "button:has-text('Try the demo')", open: q(".onboard") },
  { name: "Select (Waivers sort)", kind: "menu", tab: "waivers", opener: ".wv2-sort", open: q(".sel-menu[data-state=open]") },
  { name: "Team picker", kind: "menu", tab: "trade", opener: ".tp-btn", open: q(".tp-pop") },
  { name: "Add a team", kind: "menu", tab: "trade", opener: ".mt-add", open: q(".mt-menu") },
  { name: "Add player picker", kind: "menu", tab: "trade", opener: ".qs-add", open: q(".qs-pick") },
  { name: "Player search results", kind: "menu", tab: "trade", at: [1440], input: ".ttb-find input", type: "ja", open: q(".ttb-find .psr-list") },
  { name: "Player search (phone)", kind: "menu", tab: "trade", at: [390], opener: ".ttb-search", open: q(".psr .psr-clear[aria-label='Close search']") },
  { name: "Waivers typeahead", kind: "menu", tab: "waivers", input: ".wv-search input", type: "a", open: q(".wv-ta-list") },
  { name: "Lineup swap menu", kind: "menu", tab: "roster", opener: ".lu-row.tap[aria-expanded=false]", open: q(".lu-row[aria-expanded=true]") },
  { name: "Matchup swap menu", kind: "menu", tab: "matchup", opener: ".mu-mine[aria-expanded=false]:not(.is-locked)", open: q(".mu-mine[aria-expanded=true]") },
  { name: "Tooltip (hover)", kind: "menu", tab: "trade", at: [1440], tab: "waivers", hover: ".ps-end .tt-wrap", open: q(".tt:not([data-closing])"), focusOk: true },
  { name: "Swap menu inside matchup sheet (topmost)", kind: "nested", tab: "wire", opener: ".sb2-open", inner: ".mus-body .mu-mine[aria-expanded=false]:not(.is-locked)",
    open: q(".mus-body .mu-mine[aria-expanded=true]"), outer: q(".ps-matchup") },
  // A sheet over a menu: Compare from an open swap card. Its scrim takes the tap and Escape closes it alone; the swap
  // list under it (and the matchup sheet under that) stay open.
  { name: "Compare sheet over Lineup swap list", kind: "stack", tab: "roster", opener: ".lu-list .lu-row.tap[aria-expanded=false]", steps: [".lu-list .lu-row[aria-expanded=true] > .sw-cmp"],
    open: q(".cmp-sheet"), outer: q(".lu-list .lu-row[aria-expanded=true]") },
  { name: "Compare sheet over matchup swap list", kind: "stack", tab: "wire", opener: ".sb2-open", steps: [".mus-body .mu-mine[aria-expanded=false]:not(.is-locked)", ".mu-row[data-sw] > .sw-cmp"],
    open: q(".cmp-sheet"), outer: (p) => p.evaluate(() => !!document.querySelector(".ps-matchup .mu-mine[aria-expanded=true]")) },
  { name: "Delete my data confirm", kind: "exempt", tab: "settings", pre: (p) => p.click("button:has-text('Privacy')"), opener: ".danger-row .btn-danger-ghost", open: q(".danger-row .btn-danger"),
    note: "Destructive: removes data. Inline confirm, stays until Delete or Cancel" },
];

// ---- Helpers -------------------------------------------------------------------------------------------------------
const settle = (p, ms = 450) => p.waitForTimeout(ms);
async function fresh(p, o, tries = 2) {
  try { await load(p, o); } catch (e) { if (!tries) throw e; await p.waitForTimeout(500); await fresh(p, o, tries - 1); }
}
async function load(p, o) {
  if (o.landing) {
    await p.goto(base); await p.evaluate(() => { localStorage.clear(); });
  } else {
    await p.goto(base); await p.evaluate(() => { localStorage.clear(); localStorage.setItem("sources.session", JSON.stringify({ mode: "demo" })); });
    await p.goto(base + "#" + o.tab);
  }
  await p.reload(); await settle(p, 1300);
  if (o.pre) { await o.pre(p).catch(() => {}); await settle(p, 400); }
}
/** Marks the element that opens the overlay, so focus return can be checked against it. */
async function mark(p, sel) {
  await p.evaluate(() => document.querySelectorAll("[data-dz-opener]").forEach((e) => e.removeAttribute("data-dz-opener")));
  const l = p.locator(sel).locator("visible=true").first();
  if (!(await l.count())) return false;
  await l.evaluate((el) => { el.setAttribute("data-dz-opener", ""); el.scrollIntoView({ block: "center" }); });
  return true;
}
async function press(p, touch, sel) {
  const l = p.locator(sel).first();
  if (touch) await l.tap(); else await l.click();
}
async function openIt(p, o, touch) {
  if (o.hover) { if (!(await mark(p, o.hover))) return false; await p.locator("[data-dz-opener]").hover(); await settle(p, 900); return o.open(p); }
  if (o.input) {
    if (!(await mark(p, o.input))) return false;
    await press(p, touch, "[data-dz-opener]"); await p.locator("[data-dz-opener]").fill(""); await p.keyboard.type(o.type); await settle(p);
    return o.open(p);
  }
  if (!(await mark(p, o.opener))) return false;
  await press(p, touch, "[data-dz-opener]"); await settle(p, 600);
  if (o.inner) { if (!(await mark(p, o.inner))) return false; await press(p, touch, "[data-dz-opener]"); await settle(p); }
  // A stack: each step opens the next layer; the last one opened is the overlay under test, and focus should go back to it
  for (const st of o.steps ?? []) { if (!(await mark(p, st))) return false; await press(p, touch, "[data-dz-opener]"); await settle(p, 600); }
  return o.open(p);
}
/** A point outside the overlay: on the scrim for a modal, on plain page content (nothing tappable) for a menu. */
async function outsidePoint(p, o) {
  return p.evaluate(({ kind, SCRIM }) => {
    const W = innerWidth, H = innerHeight;
    const overlay = document.querySelector(".sel-menu, .tp-pop, .mt-menu, .qs-pick, .psr, .wv-ta-list, .lu-row[aria-expanded=true], .mu-row.open, .tt, .ps, .sheet, .onboard-card, .rail.ibx, .danger-row");
    const opener = document.querySelector("[data-dz-opener]");
    const interactive = "a, button, input, select, textarea, label, summary, [role=button], [role=tab], [role=switch], [role=option], [tabindex]:not([tabindex='-1']), .tt-wrap, nav, header, .topbar, .tabbar";
    // Keep clear of menus by a margin, so a tap can't graze one mid-animation
    const boxes = kind === "modal" ? [] : [...document.querySelectorAll(".sel-menu, .tp-pop, .mt-menu, .qs-pick, .psr-list, .wv-ta-list, .mu-row.open, .lu-row[aria-expanded=true], .tt")].map((e) => e.getBoundingClientRect());
    const near = (x, y) => boxes.some((r) => x > r.left - 16 && x < r.right + 16 && y > r.top - 16 && y < r.bottom + 16);
    for (let y = 60; y < H - 90; y += 19) for (let x = 12; x < W - 12; x += 23) {
      const el = document.elementFromPoint(x, y);
      if (!el || (kind !== "nested" && near(x, y))) continue;
      if (kind === "modal" || kind === "stack") { if (el.matches(SCRIM)) return { x, y }; continue; }
      if (kind === "nested") {
        // Inside the sheet, outside the open menu and its row, on nothing tappable
        if (el.closest(".mus-body") && !el.closest(".mu-row.open, [data-dz-opener]") && !el.closest(interactive)) return { x, y };
        continue;
      }
      if (opener?.contains(el) || el.closest("[data-dz-opener]") || el.closest(".ps, .sheet, .sel-menu, .tp, .tp-pop, .mt-addteam, .mt-menu, .qs-row, .qs-pick, .psr, .wv-ta, .lu-row, .mu-row, .tt, .rail.ibx, .danger-row, .set-row")) continue;
      if (overlay?.contains(el) || el.closest(interactive) || el.matches(SCRIM)) continue;
      return { x, y };
    }
    return null;
  }, { kind: o.kind, SCRIM });
}
async function tapAt(p, touch, pt) {
  await p.evaluate(() => { window.__dzClick = null; document.addEventListener("click", (e) => { window.__dzClick ??= e.target instanceof Element ? (e.target.className?.baseVal ?? e.target.className) + "|" + e.target.tagName : "?"; }, { capture: true, once: true }); });
  if (touch) await p.touchscreen.tap(pt.x, pt.y); else await p.mouse.click(pt.x, pt.y);
  await settle(p);
  return p.evaluate(() => window.__dzClick);
}
const focusBack = (p) => p.evaluate(() => { const a = document.activeElement, o = document.querySelector("[data-dz-opener]"); return !!o && !!a && (o === a || o.contains(a)); });

// ---- Run -----------------------------------------------------------------------------------------------------------
const browser = await pw.chromium.launch();
const rows = [];
for (const w of widths) {
  const touch = w < 768;
  const ctx = await browser.newContext({ hasTouch: touch, isMobile: false, viewport: { width: w, height: touch ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await ctx.route("**/*", (r) => (local(r.request().url()) ? r.continue() : r.abort()));
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  p.setDefaultNavigationTimeout(60000);
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  for (const o of O) {
    if (only && !o.name.toLowerCase().includes(only.toLowerCase())) continue;
    if (!(o.at ?? [390, 1440]).includes(w)) { if ([390, 1440].includes(w)) rows.push({ o, w, outside: "n/a", escape: "n/a", focus: "n/a", note: o.note ?? "" }); continue; }
    const r = { o, w, outside: "", escape: "", focus: "", note: o.note ?? "" };
    rows.push(r);
    try {
      await fresh(p, o);
      if (!(await openIt(p, o, touch))) { r.outside = r.escape = r.focus = "FAIL"; r.note = "couldn't open it"; continue; }
      if (shots) await p.screenshot({ path: join(shots, `dismiss-${o.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}-${w}.png`), timeout: 30000 });
      // 1. Outside
      const pt = o.fullWidth === w ? null : await outsidePoint(p, o);
      if (o.fullWidth === w) r.outside = "n/a (full width)";
      else if (!pt) { r.outside = "FAIL"; r.note = "no outside point found"; }
      else {
        const hit = await tapAt(p, touch, pt);
        const closed = !(await o.open(p));
        if (o.kind === "exempt") r.outside = closed ? "FAIL (closed)" : "stays";
        else if (o.kind === "nested") r.outside = closed && (await o.outer(p)) ? "ok" : closed ? "FAIL (sheet closed too)" : "FAIL";
        else if (o.kind === "stack") r.outside = !closed ? "FAIL" : hit && !/scrim/.test(hit) ? `FAIL (tap reached ${hit})` : (await o.outer(p)) ? "ok" : "FAIL (layer under closed too)";
        else if (!closed) { r.outside = "FAIL"; r.note = `still open after a tap at ${pt.x},${pt.y} on ${hit}`; }
        else if (o.kind === "modal" && hit && !/scrim|onboard/.test(hit)) r.outside = `FAIL (tap reached ${hit})`;
        else r.outside = "ok";
      }
      // 2. Escape, from a fresh open
      if (o.kind !== "exempt" && !r.outside.startsWith("FAIL")) { /* reopen below */ }
      if (o.kind === "nested") {
        // Reopen the menu inside the still-open sheet; Escape closes the menu only
        if (!(await o.outer(p))) { await fresh(p, o); await openIt(p, o, touch); }
        else if (!(await o.open(p))) { await mark(p, o.inner); await press(p, touch, "[data-dz-opener]"); await settle(p); }
      } else if (o.kind === "stack" && (await o.outer(p))) {
        // The layer under it is still up: open the top one again from its own button
        if (!(await o.open(p))) { await mark(p, o.steps[o.steps.length - 1]); await press(p, touch, "[data-dz-opener]"); await settle(p, 600); }
      } else if (!(await o.open(p))) {
        await fresh(p, o);
        if (!(await openIt(p, o, touch))) { r.escape = r.focus = "FAIL"; r.note ||= "couldn't reopen"; continue; }
      }
      await p.keyboard.press("Escape"); await settle(p);
      const closed = !(await o.open(p));
      if (o.kind === "exempt") { r.escape = closed ? "FAIL (closed)" : "stays"; r.focus = "n/a"; continue; }
      r.escape = o.kind === "nested" || o.kind === "stack" ? (closed && (await o.outer(p)) ? "ok (under stays)" : "FAIL") : closed ? "ok" : "FAIL";
      r.focus = o.focusOk ? "n/a" : (await focusBack(p)) ? "ok" : "FAIL";
    } catch (e) {
      r.outside ||= "FAIL"; r.escape ||= "FAIL"; r.focus ||= "FAIL"; r.note = String(e.message).split("\n")[0].slice(0, 80);
    }
    finally { process.stderr.write(`  ${w} ${o.name}: ${r.outside} / ${r.escape} / ${r.focus}\n`); }
  }
  if (errors.length) rows.push({ o: { name: "page errors" }, w, outside: "FAIL", escape: "", focus: "", note: errors[0].slice(0, 80) });
  await ctx.close();
}
await browser.close();
server?.close();

// ---- Report --------------------------------------------------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad("Overlay", 42)}${pad("Width", 7)}${pad("Kind", 8)}${pad("Outside", 26)}${pad("Escape", 18)}${pad("Focus", 7)}Note`);
console.log("-".repeat(130));
for (const r of rows) console.log(`${pad(r.o.name, 42)}${pad(r.w, 7)}${pad(r.o.kind ?? "", 8)}${pad(r.outside, 26)}${pad(r.escape, 18)}${pad(r.focus, 7)}${r.note}`);
const failed = rows.filter((r) => [r.outside, r.escape, r.focus].some((x) => String(x).startsWith("FAIL")));

const st = spawnSync(process.execPath, [join(root, "scripts/check-dismiss-static.mjs")], { encoding: "utf8" });
process.stdout.write("\n" + st.stdout);
console.log(`\n${failed.length ? `${failed.length} FAILED` : "All overlays dismiss as they should."}${st.status ? " Static check FAILED." : ""}`);
process.exit(failed.length || st.status ? 1 : 0);
