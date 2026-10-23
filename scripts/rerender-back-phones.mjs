// Re-renders the two 3D back phones (public/phones/phone-image-left|right.webp) with their current screen images,
// at the same pose and crop as before, so only the screens change. Run against a build served at <site> whose
// phone3d.ts pixel-ratio cap is lifted (the workflow does both).
//   node scripts/rerender-back-phones.mjs <site> <outdir>
import { chromium } from 'playwright';
import sharp from 'sharp';
const [site = 'http://localhost:8765', out = 'public/phones'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 3 });
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.goto(`${site}/?gl=3d`, { waitUntil: 'load' });
await p.waitForSelector('.hp-stage.gl-on', { timeout: 300000 });
await p.waitForTimeout(4000);
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
    await new Promise((r) => setTimeout(r, 3000));
    return st.querySelector('canvas.hp-gl').toDataURL('image/png');
  }, k);
  const target = `${out}/phone-image-${k}.webp`;
  const { width, height } = await sharp(target).metadata();
  const png = Buffer.from(url.split(',')[1], 'base64');
  const info = await sharp(await sharp(png).trim({ threshold: 1 }).toBuffer())
    .resize(width, height, { fit: 'fill' }).webp({ quality: 86, alphaQuality: 100 }).toFile(target);
  console.log(k, info.width, info.height, info.size);
}
await b.close();
