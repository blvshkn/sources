// Re-renders the two 3D back phones (public/phones/phone-image-left|right.webp) with screens shot from the live app,
// at the same pose and crop as before, so only the screens change (Zach, Oct 23: every image shows the tab bar where
// the live app draws it).
//   node scripts/rerender-back-phones.mjs screens <live site> <outdir>   then build, then
//   node scripts/rerender-back-phones.mjs render <local build> <outdir>
// 1. Screens: the live landing with ?gl=0 runs the real app in every phone. The phones are flattened (their 3D tilt
//    removed) and each back phone's glass is shot whole, status bar and home bar included, at 780 x 1692.
// 2. Render: the local build (pixel-ratio cap lifted, see the workflow) draws the 3D phones with those screens, and
//    each back phone is cropped to its alpha and fitted to the image it replaces.
import { chromium } from 'playwright';
import sharp from 'sharp';
const [phase, site, out = 'public/phones'] = process.argv.slice(2);
const live = site, local = site;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

if (phase === 'screens') {
// ---- 1. Screens from the live app ----
const FLAT = `.hp-stage, .hp-stage * { transform-style: flat !important; }
  .hp-stage, .hp-phone { transform: none !important; translate: none !important; rotate: none !important; scale: none !important; perspective: none !important; }
  .hp-heads, .hp-head, .sc-layer, .hp-r, canvas.hp-gl, .hp-poster { display: none !important; }`;
for (const k of ['left', 'right']) {
  const probe = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await probe.goto(`${live}/?gl=0`, { waitUntil: 'load' });
  const w = await probe.$eval(`.hp-${k} .hp-scr`, (e) => e.clientWidth);
  await probe.close();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 780 / w, timezoneId: 'America/New_York', reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(`${live}/?gl=0`, { waitUntil: 'load' });
  await p.waitForFunction((s) => document.querySelector(`${s} .hp-frame.on`), `.hp-${k}`, { timeout: 120000 });
  await p.addStyleTag({ content: FLAT });
  await p.waitForTimeout(8000);
  const buf = await (await p.$(`.hp-${k} .hp-scr`)).screenshot({ animations: 'disabled' });
  const name = k === 'left' ? 'trade' : 'waivers';
  const info = await sharp(buf).resize(780, 1692, { fit: 'fill' }).webp({ quality: 86 }).toFile(`${out}/${name}-screen.webp`);
  console.log(`${name}-screen`, info.width, info.height, info.size);
  await ctx.close();
}

}
if (phase === 'render') {
// ---- 2. The 3D render, from the local build that now carries those screens ----
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 3 });
await p.emulateMedia({ reducedMotion: 'reduce' });
p.on('console', (m) => { if (m.type() === 'error') console.log('page error:', m.text()); });
await p.goto(`${local}/?gl=3d`, { waitUntil: 'load' });
// The first paint already carries gl-on in its markup, so wait for the canvas itself
await p.waitForSelector('canvas.hp-gl', { timeout: 600000 });
await p.waitForTimeout(8000);
for (const k of ['left', 'right']) {
  const url = await p.evaluate(async (k) => {
    const st = document.querySelector('.hp-stage');
    document.querySelectorAll('.hp-head, .hp-scr').forEach((e) => (e.style.visibility = 'hidden'));
    for (const o of ['left', 'right', 'front']) {
      const el = st.querySelector('.hp-' + o);
      el.style.transition = 'none';
      el.style.translate = o === k ? '' : '8000px 0';
      el.dispatchEvent(new Event('transitionrun'));
    }
    st.dispatchEvent(new Event('pointerenter'));
    await new Promise((r) => setTimeout(r, 4000));
    return st.querySelector('canvas.hp-gl').toDataURL('image/png');
  }, k);
  const target = `${out}/phone-image-${k}.webp`;
  const { width, height } = await sharp(target).metadata();
  const png = Buffer.from(url.split(',')[1], 'base64');
  const info = await sharp(await sharp(png).trim({ threshold: 1 }).toBuffer())
    .resize(width, height, { fit: 'fill' }).webp({ quality: 86, alphaQuality: 100 }).toFile(target);
  console.log(`phone-image-${k}`, info.width, info.height, info.size);
}
}
await b.close();
