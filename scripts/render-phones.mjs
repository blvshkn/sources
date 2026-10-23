// Renders the landing's phone stills (public/phones/hp-left|right|front.webp) from the live 3D (?gl=3d) at the 1280px pose.
// Serve a build whose phone3d.ts pixel-ratio cap is lifted as render.html, then: node scripts/render-phones.mjs <outdir>.
// Crop each PNG to its alpha, and update the offsets in landing-type.css (.hp-r-*) from info.json. scripts/render-sms-phone.mjs does the message phone.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const out = process.argv[2];
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 3 });
await p.route(u => !u.href.startsWith('http://localhost'), r => r.abort());
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.goto('http://localhost:8765/render.html?gl=3d', { waitUntil: 'load' });
await p.waitForSelector('.hp-stage.gl-on', { timeout: 60000 });
await p.waitForTimeout(3000);
const res = {};
const POSE = { left: [-1.20, -0.42], right: [0.20, -0.58], front: [-0.5, -0.5] };
for (const k of ['left', 'right', 'front']) {
  const info = await p.evaluate(async ([k, POSE]) => {
    const st = document.querySelector('.hp-stage');
    document.querySelectorAll('.hp-head, .hp-scr').forEach(e => e.style.visibility = 'hidden');
    for (const o of ['left', 'right', 'front']) {
      const el = st.querySelector('.hp-' + o);
      el.style.transition = 'none';
      el.style.translate = o === k ? '' : '8000px 0';
      el.dispatchEvent(new Event('transitionrun'));
    }
    st.dispatchEvent(new Event('pointerenter'));
    await new Promise(r => setTimeout(r, 2500));
    const c = st.querySelector('canvas.hp-gl'), cr = c.getBoundingClientRect(), sr = st.getBoundingClientRect();
    const el = st.querySelector('.hp-' + k), pw = el.offsetWidth, H = el.offsetHeight;
    const [tx, ty] = POSE[k];
    const ox = sr.left + el.offsetLeft + tx * pw, oy = sr.top + el.offsetTop + ty * H;
    return { url: c.toDataURL('image/png'), cr: { x: cr.left, y: cr.top, w: cr.width, h: cr.height }, cw: c.width, pw, H, ox, oy };
  }, [k, POSE]);
  fs.writeFileSync(`${out}/${k}.png`, Buffer.from(info.url.split(',')[1], 'base64'));
  delete info.url; res[k] = info;
}
fs.writeFileSync(`${out}/info.json`, JSON.stringify(res, null, 1));
await b.close();
console.log(JSON.stringify(res));
