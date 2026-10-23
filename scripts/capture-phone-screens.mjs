// Recaptures the landing's phone posters from the live app, so the image shown before the app loads matches it
// exactly (Zach, Oct 23: the tab bar sits above the home bar in the live render; the old images had it lower).
// Each poster is the app exactly as the phone's frame loads it (/?frame=demo#tab) at the glass's 390 x 847, 2x, in
// Eastern time. The phone's status bar and home bar sit on top of it on the page, as they do over the live app.
// Shot straight from the frame URL, not from the landing, where the phones are tilted in 3D.
//   node scripts/capture-phone-screens.mjs <site> <outdir>
import { chromium } from 'playwright';
import sharp from 'sharp';
const [site = 'https://fantasysource.app', out = 'public/phones'] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 847 }, deviceScaleFactor: 2, timezoneId: 'America/New_York', reducedMotion: 'reduce' });
for (const [name, tab, front] of [['wire', 'wire', true], ['trade', 'trade', false], ['waivers', 'waivers', false]]) {
  const p = await ctx.newPage();
  await p.goto(`${site}/?frame=demo#${tab}`, { waitUntil: 'load' });
  // The class the landing adds to each frame once it loads
  await p.evaluate((f) => document.documentElement.classList.add(f ? 'frame-front' : 'frame-back'), front);
  await p.waitForTimeout(8000);
  const buf = await p.screenshot({ animations: 'disabled' });
  const info = await sharp(buf).resize({ width: 780 }).webp({ quality: 84 }).toFile(`${out}/${name}.webp`);
  console.log(name, info.width, info.height, info.size);
  await p.close();
}
await b.close();
