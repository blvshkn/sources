// Recaptures the landing's phone screens from the live app, so the images shown before the app loads match it
// exactly (Zach, Oct 23: the tab bar sits above the home bar in the live render; the old images had it lower).
// Each phone's whole glass (status bar, the app under it, the tab bar and home bar) is captured at 780px wide from
// the landing with ?gl=0, where every phone runs the real app.
//   node scripts/capture-phone-screens.mjs <site> <outdir>
// Writes wire.webp (front poster), trade.webp and waivers.webp (back posters) and trade-screen.webp and
// waivers-screen.webp (the screens painted into the 3D back phones).
import { chromium } from 'playwright';
import sharp from 'sharp';
const [site = 'https://fantasysource.app', out = 'public/phones'] = process.argv.slice(2);
const b = await chromium.launch();
async function grab(sel) {
  const probe = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await probe.goto(`${site}/?gl=0`, { waitUntil: 'load' });
  const w = await probe.$eval(`${sel} .hp-scr`, (e) => e.clientWidth);
  await probe.close();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 780 / w });
  await p.goto(`${site}/?gl=0`, { waitUntil: 'load' });
  await p.waitForFunction((s) => document.querySelector(`${s} .hp-frame.on`), sel, { timeout: 90000 });
  await p.waitForTimeout(8000);
  const buf = await (await p.$(`${sel} .hp-scr`)).screenshot({ animations: 'disabled' });
  await p.close();
  return sharp(buf).resize({ width: 780 }).png().toBuffer();
}
const shots = { wire: await grab('.hp-front'), trade: await grab('.hp-left'), waivers: await grab('.hp-right') };
for (const [k, buf] of Object.entries(shots)) {
  const info = await sharp(buf).webp({ quality: 84 }).toFile(`${out}/${k}.webp`);
  console.log(k, info.width, info.height, info.size);
  if (k !== 'wire') {
    // The 3D textures are the same screen at the glass's 780 x 1692
    await sharp(buf).resize(780, 1692, { fit: 'fill' }).webp({ quality: 84 }).toFile(`${out}/${k}-screen.webp`);
  }
}
await b.close();
