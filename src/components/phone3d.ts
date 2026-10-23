/**
 * The hero's phones as a real 3D render (Zach, Oct 22): the phone model (public/models, packed from his
 * GLB by scripts/pack-phone.py) drawn with three.js in one canvas behind the phones' screens.
 *
 * The CSS still places every phone: each 3D phone copies its .hp-phone element's position and transform, so the
 * layout, the hover turn and the arrival rise all carry over, and the live app in the front phone's DOM screen sits
 * exactly on the model's glass. The phones behind show their screens as textures, since nothing in them takes input.
 *
 * Nothing loops: it draws once when ready, then only while a phone is moving (arrival, hover) or the page resizes.
 */

// three.js r182 (MIT), vendored: src/vendor/three
// @ts-ignore no bundled types
type Three = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Model measurements, in meters, from the source GLB */
const BODY_W = 0.078968; // Side_Panel width
const CX = 0.000021, CY = 0.081662; // body center
const GLASS_Z = 0.004322; // the screen's surface

type Head = {
  pb: number; ub: number; lo: number[]; hi: number[];
  meshes: { name: string; mat: number; n: number; pos: number; nrm: number; uv?: number; ulo?: number[]; uhi?: number[]; ind: number; ni: number }[];
  materials: { name: string; c: number[]; m: number; r: number; map?: number; nmap?: number; ns?: number; ao?: number; e?: number[]; emap?: number;
    blend?: 1; ds?: 1; ior?: number; cc?: number[]; ir?: number[]; an?: number }[];
  textures: { mime: string; off: number; len: number; skip?: 1 }[];
};

async function loadModel(T: Three, got: Promise<Response>) {
  // Gzipped by scripts/pack-phone.py, so it travels small whatever the host does with .pack files
  const res = await got;
  const buf = await new Response(res.body!.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  const hl = new DataView(buf).getUint32(0, true);
  const head: Head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const base = 4 + hl;
  const srgb = new Set<number>();
  head.materials.forEach((m) => { if (m.map != null) srgb.add(m.map); if (m.emap != null) srgb.add(m.emap); });
  const tex = await Promise.all(head.textures.map(async (t, i) => {
    if (t.skip) return null;
    const bmp = await createImageBitmap(new Blob([new Uint8Array(buf, base + t.off, t.len)], { type: t.mime }));
    const tx = new T.Texture(bmp);
    tx.flipY = false; tx.wrapS = tx.wrapT = T.RepeatWrapping;
    if (srgb.has(i)) tx.colorSpace = T.SRGBColorSpace;
    tx.needsUpdate = true;
    return tx;
  }));
  // v2 geometry (scripts/pack-phone.py): zigzag deltas in byte planes, low bytes then high, one plane pair per component
  const bytes = new Uint8Array(buf, base);
  const run = (off: number, n: number, out: Float32Array, stride: number, k: number, scale: number, add: number) => {
    let acc = 0;
    for (let i = 0; i < n; i++) { const z = bytes[off + i] | (bytes[off + n + i] << 8); acc += (z >>> 1) ^ -(z & 1); out[i * stride + k] = add + acc * scale; }
  };
  const geos = head.meshes.map((m) => {
    const g = new T.BufferGeometry();
    const p = new Float32Array(m.n * 3), pq = (1 << head.pb) - 1;
    for (let k = 0; k < 3; k++) run(m.pos + 2 * m.n * k, m.n, p, 3, k, (head.hi[k] - head.lo[k]) / pq, head.lo[k]);
    g.setAttribute("position", new T.BufferAttribute(p, 3));
    // Octahedral normals: two signed bytes per vertex, x plane then y plane
    const nx = new Int8Array(buf, base + m.nrm, m.n), ny = new Int8Array(buf, base + m.nrm + m.n, m.n), nr = new Float32Array(m.n * 3);
    for (let i = 0; i < m.n; i++) {
      let x = nx[i] / 127, y = ny[i] / 127; const z = 1 - Math.abs(x) - Math.abs(y);
      if (z < 0) { const ax = Math.abs(x); x = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1); y = (1 - ax) * (y >= 0 ? 1 : -1); }
      const l = Math.hypot(x, y, z) || 1; nr[i * 3] = x / l; nr[i * 3 + 1] = y / l; nr[i * 3 + 2] = z / l;
    }
    g.setAttribute("normal", new T.BufferAttribute(nr, 3));
    if (m.uv != null && m.ulo && m.uhi) {
      const uv = new Float32Array(m.n * 2), uq = (1 << head.ub) - 1;
      for (let k = 0; k < 2; k++) run(m.uv + 2 * m.n * k, m.n, uv, 2, k, (m.uhi[k] - m.ulo[k]) / uq, m.ulo[k]);
      g.setAttribute("uv", new T.BufferAttribute(uv, 2));
    }
    const ix = new Float32Array(m.ni); run(m.ind, m.ni, ix, 1, 0, 1, 0);
    g.setIndex(new T.BufferAttribute(Uint16Array.from(ix), 1));
    return g;
  });
  const mats = head.materials.map((d) => {
    const m = new T.MeshPhysicalMaterial({
      color: new T.Color().setRGB(d.c[0], d.c[1], d.c[2], T.LinearSRGBColorSpace), metalness: d.m, roughness: d.r,
      side: d.ds ? T.DoubleSide : T.FrontSide,
    });
    if (d.blend) { m.transparent = true; m.opacity = d.c[3]; m.depthWrite = false; }
    if (d.map != null) m.map = tex[d.map];
    if (d.nmap != null) { m.normalMap = tex[d.nmap]; m.normalScale = new T.Vector2(d.ns ?? 1, -(d.ns ?? 1)); }
    if (d.ao != null) m.aoMap = tex[d.ao];
    if (d.e) m.emissive = new T.Color().setRGB(d.e[0], d.e[1], d.e[2], T.LinearSRGBColorSpace);
    if (d.emap != null) m.emissiveMap = tex[d.emap];
    if (d.ior != null) m.ior = Math.min(2.333, Math.max(1, d.ior));
    if (d.cc) { m.clearcoat = d.cc[0]; m.clearcoatRoughness = d.cc[1]; }
    if (d.ir) { m.iridescence = d.ir[0]; m.iridescenceIOR = d.ir[1]; m.iridescenceThicknessRange = [100, d.ir[2]]; }
    if (d.an) m.anisotropy = d.an;
    m.name = d.name;
    return m;
  });
  return { head, geos, mats };
}

/** A soft studio for the reflections: a dark room with a big softbox up left, a strip light right and a dim floor */
function studio(T: Three, renderer: Three) {
  const room = new T.Scene();
  const box = new T.Mesh(new T.BoxGeometry(10, 10, 10), new T.MeshBasicMaterial({ color: 0x0b0c0c, side: T.BackSide }));
  room.add(box);
  const panel = (w: number, h: number, c: number, x: number, y: number, z: number, ry = 0, rx = 0) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(c), side: T.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); room.add(m);
  };
  panel(4, 3, 0xbfc3c6, -3.2, 2.6, 1.5, Math.PI / 2.6, -0.3); // key softbox, up left
  panel(0.6, 5, 0x9aa0a4, 4.6, 0.4, 0.5, -Math.PI / 2); // rim strip, right
  panel(3, 1, 0x5d6266, 0, 4.8, 0, 0, Math.PI / 2); // top
  panel(8, 8, 0x1a1c1c, 0, -4.9, 0, 0, -Math.PI / 2); // floor
  const pm = new T.PMREMGenerator(renderer);
  const env = pm.fromScene(room, 0.03).texture;
  pm.dispose();
  return env;
}

export type Phones3D = { kick: (ms?: number) => void; dispose: () => void };

/**
 * Builds the canvas inside `stage` and a 3D phone for each element in `phones`. `screens[i]` is the image for that
 * phone's screen, or null to leave its glass black (the front phone, whose live app sits on top in the DOM).
 */
export async function mountPhones3D(stage: HTMLElement, phones: HTMLElement[], screens: (string | null)[], dim: number[]): Promise<Phones3D> {
  // The model's download starts now, alongside the engine's, instead of after it (Zach, Oct 22: faster load)
  const model = fetch("/models/phone-model.pack");
  // @ts-ignore vendored ES module without types
  const T: Three = await import("../vendor/three/three.module.min.js");
  // WebGL draws offscreen and each frame is copied into a plain 2D canvas on the page. iPad Safari composited the
  // transparent WebGL layer as a dark box once the stuck nav's backdrop blur overlapped it (Zach, Oct 22); a 2D canvas
  // composites like any image
  const glc = document.createElement("canvas");
  const canvas = document.createElement("canvas");
  canvas.className = "hp-gl";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d")!;
  const renderer = new T.WebGLRenderer({ canvas: glc, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new T.Scene();
  scene.environment = studio(T, renderer);
  const key = new T.DirectionalLight(0xffffff, 1.2); key.position.set(-400, 600, 900); scene.add(key);

  const [{ geos, mats, head }, screenTex] = await Promise.all([
    loadModel(T, model),
    Promise.all(screens.map((src) => src ? new T.TextureLoader().loadAsync(src).then((t: Three) => { t.colorSpace = T.SRGBColorSpace; t.flipY = false; return t; }) : null)),
  ]);
  const screenMesh = head.meshes.findIndex((m) => m.name === "Front_Screen");
  const groups = phones.map((_, pi) => {
    const g = new T.Group(); g.matrixAutoUpdate = false;
    head.meshes.forEach((m, i) => {
      let mat = mats[m.mat];
      if (i === screenMesh) {
        mat = mat.clone();
        const tx = screenTex[pi];
        // The screen texture's UVs run over the model's screen; a screen image stands in for the app (or stays black)
        if (tx) { mat.emissiveMap = tx; mat.emissive = new T.Color(1, 1, 1); mat.emissiveIntensity = dim[pi] ?? 1; mat.color = new T.Color(0, 0, 0); }
        else { mat.emissiveMap = null; mat.emissive = new T.Color(0, 0, 0); }
      }
      const mesh = new T.Mesh(geos[i], mat);
      mesh.matrixAutoUpdate = false;
      g.add(mesh);
    });
    scene.add(g);
    return g;
  });
  const camera = new T.PerspectiveCamera();
  stage.prepend(canvas);

  // The canvas reaches past the stage so phones turned out to the sides aren't cut off
  const MX = 0.4, MY = 0.12;
  const layout = () => {
    const W = stage.clientWidth, H = stage.clientHeight;
    const mx = W * MX, my = H * MY;
    canvas.style.left = `${-mx}px`; canvas.style.top = `${-my}px`;
    canvas.style.width = `${W + 2 * mx}px`; canvas.style.height = `${H + 2 * my}px`;
    renderer.setSize(W + 2 * mx, H + 2 * my, false);
    canvas.width = glc.width; canvas.height = glc.height;
    const cs = getComputedStyle(stage);
    const P = parseFloat(cs.perspective) || 1600;
    const [ox, oy] = cs.perspectiveOrigin.split(" ").map(parseFloat);
    const n = 10, f = 6000, s = n / P;
    camera.projectionMatrix.makePerspective((-mx - ox) * s, (W + mx - ox) * s, (oy + my) * s, -(H + my - oy) * s, n, f);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.position.set(0, 0, P); camera.updateMatrixWorld(true);
    return { ox, oy };
  };
  let origin = layout();

  // Each phone copies its element's place: CSS box, `translate`, then `transform` about its origin, into three's
  // y-up space looking down -z from the CSS perspective distance
  const place = () => {
    phones.forEach((el, i) => {
      const cs = getComputedStyle(el);
      const W = el.offsetWidth, H = el.offsetHeight;
      const [tx, ty, tz] = (cs.translate && cs.translate !== "none" ? cs.translate.split(" ").map(parseFloat) : [0, 0, 0]).concat([0, 0, 0]);
      const [orx, ory] = cs.transformOrigin.split(" ").map(parseFloat);
      const t = new DOMMatrix(cs.transform === "none" ? undefined : cs.transform);
      const k = W / BODY_W;
      const m = new DOMMatrix()
        .scale(1, -1, 1).translate(-origin.ox, -origin.oy, 0)
        .translate(el.offsetLeft + tx, el.offsetTop + ty, tz || 0)
        .translate(orx, ory, 0).multiply(t).translate(-orx, -ory, 0)
        .translate(W / 2, H / 2, 0).scale(k, -k, k).translate(-CX, -CY, -GLASS_Z);
      groups[i].matrix.fromArray(m.toFloat64Array());
      groups[i].matrixWorldNeedsUpdate = true;
      groups[i].children.forEach((c: Three) => { c.matrixWorldNeedsUpdate = true; });
    });
  };
  // Stacking like the CSS phones (Zach, Oct 22): the phones behind are drawn first, then the front one over them
  // with fresh depth, so an angled back phone's near edge never cuts into the front phone
  renderer.autoClear = false;
  const front = groups[groups.length - 1];
  const draw = () => {
    place();
    renderer.clear();
    front.visible = false; renderer.render(scene, camera);
    renderer.clearDepth();
    groups.forEach((g: Three) => { g.visible = g === front; }); renderer.render(scene, camera);
    groups.forEach((g: Three) => { g.visible = true; });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(glc, 0, 0);
  };

  let raf = 0, until = 0;
  const loop = () => { draw(); raf = performance.now() < until ? requestAnimationFrame(loop) : 0; };
  const kick = (ms = 0) => { until = Math.max(until, performance.now() + ms); if (!raf) raf = requestAnimationFrame(loop); };
  const ro = new ResizeObserver(() => { origin = layout(); kick(); });
  ro.observe(stage);
  const onHover = () => kick(1200);
  stage.addEventListener("pointerenter", onHover); stage.addEventListener("pointerleave", onHover);
  phones.forEach((p) => { p.addEventListener("transitionrun", onHover); p.addEventListener("animationstart", () => kick(1600)); });
  draw();

  return {
    kick,
    dispose: () => {
      cancelAnimationFrame(raf); ro.disconnect();
      stage.removeEventListener("pointerenter", onHover); stage.removeEventListener("pointerleave", onHover);
      renderer.dispose(); geos.forEach((g: Three) => g.dispose()); canvas.remove();
    },
  };
}
