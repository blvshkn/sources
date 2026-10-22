// Vendored from the npm package "loader-buttons" v0.1.0 by Jaimin Kataria
// (https://github.com/Appllama/25-unique-loaders, packages/loader-buttons).
// License: Apache-2.0, per the package.json. See the NOTICE section in README.md.
// Changed from the package: colors (the --lb-ink and --lb-paper lines in the style block) and, for Sources' pixel
// icons (Oct 22), each dot's shape: a pixel circle (a 4 x 4 block with its corners cut) instead of a round dot,
// and the timing: frames step at 12 a second (PIXEL_FPS) instead of every display frame.

const DURATION = 2.9;
const PIXEL_FPS = 12;
const FLIP_DURATION = 0.31;
const CURL_START = 0.74;
const CURL_STEP = 0.024;
const CURL_DURATION = 0.21;
const RETURN_START = 1.66;
const RETURN_DURATION = 0.36;

const FLIP_DELAYS = [
  0.035, 0.092, 0.151, 0.213, 0.278,
  0.108, 0.166, 0.224, 0.286, 0.348,
  0.179, 0.239, 0.299, 0.359, 0.419,
  0.247, 0.308, 0.369, 0.431, 0.493,
  0.316, 0.378, 0.439, 0.501, 0.544,
];

// A single clockwise coil, beginning on the outer rim and ending at the center.
const CURL_ORDER = [
   0,  1,  2,  3,  4,
  15, 16, 17, 18,  5,
  14, 23, 24, 19,  6,
  13, 22, 21, 20,  7,
  12, 11, 10,  9,  8,
];

// Signed lean turns the timed spiral into a shallow fold toward the center.
const CURL_TILTS = [
  14.5, 13.2, 12.0, 10.8,  9.7,
  11.8, 10.4,  9.1,  7.9,  6.8,
   8.7,  7.2, 10.5, -7.1, -8.4,
  -9.8, -8.1, -9.3, -10.6, -11.7,
 -12.2, -13.5, -14.7, -13.4, -12.1,
];

// Center-out return timing is deliberately irregular so the final seat feels made.
const RETURN_DELAYS = [
  0.440, 0.374, 0.314, 0.351, 0.414,
  0.338, 0.220, 0.142, 0.204, 0.326,
  0.281, 0.108, 0.000, 0.087, 0.258,
  0.321, 0.183, 0.119, 0.171, 0.301,
  0.428, 0.361, 0.292, 0.337, 0.402,
];

const DOT_METRICS = Array.from({ length: 25 }, (_, index) => {
  const row = Math.floor(index / 5);
  const column = index % 5;
  const distance = Math.hypot(row - 2, column - 2);
  const proximity = Math.max(0, 1 - distance / 2.15);
  return { distance, proximity: proximity * proximity };
});

const closedRoots = new WeakMap();

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const easeInOutCubic = (value) => (
  value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
);

const easeOutBack = (value) => {
  const overshoot = 1.28;
  const shifted = value - 1;
  return 1 + (overshoot + 1) * shifted * shifted * shifted
    + overshoot * shifted * shifted;
};

const smoothstep = (edge0, edge1, value) => {
  const progress = clamp01((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
};

const pulse = (time, start, duration) => {
  const progress = clamp01((time - start) / duration);
  return Math.sin(Math.PI * progress);
};

const normalizeTime = (time) => {
  if (!Number.isFinite(time)) return 0;
  return ((time % DURATION) + DURATION) % DURATION;
};

export default {
  id: "braille-flipwave",
  name: "Braille Flipwave",
  kind: "dom",
  technique: "Authored 3D dot-matrix flip choreography",
  label: "Flipping",

  mount(container) {
    let shadow = closedRoots.get(container);
    if (!shadow) {
      shadow = container.attachShadow({ mode: "closed" });
      closedRoots.set(container, shadow);
    }

    const style = document.createElement("style");
    style.textContent = `
      :host {
        position: relative;
        display: block;
        width: 100%;
        height: 100%;
        contain: paint;
        /* Sources recolor: the dots take the app's ink, their flipped faces the surface they sit on */
        --lb-ink-c: var(--lb-ink, var(--ink, rgb(31, 31, 30)));
        --lb-paper-c: var(--lb-paper, var(--surface, rgb(255, 255, 252)));
      }

      .stage {
        --fit: 1;
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        overflow: hidden;
        contain: paint layout style;
        perspective: 38px;
        perspective-origin: 50% 47%;
        pointer-events: none;
      }

      .matrix {
        position: relative;
        display: grid;
        width: 23px;
        height: 23px;
        grid-template-columns: repeat(5, 4.6px);
        grid-template-rows: repeat(5, 4.6px);
        place-items: center;
        transform: scale(var(--fit));
        transform-style: preserve-3d;
        isolation: isolate;
      }

      .matrix::before {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(
          circle at center,
          color-mix(in srgb, var(--lb-ink-c) 10.5%, transparent) 0 1.12px,
          transparent 1.3px
        ) 0 0 / 4.6px 4.6px;
        transform: translateY(0.72px) scaleY(0.72);
        transform-origin: center;
        pointer-events: none;
        z-index: 0;
      }

      .dot {
        position: relative;
        width: 3.15px;
        height: 3.15px;
        border-radius: 50%;
        transform-style: preserve-3d;
        transform-origin: 50% 50% -0.24px;
        will-change: transform, opacity;
        z-index: 1;
      }

      .dot::before,
      .dot::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 0;
        clip-path: polygon(25% 0, 75% 0, 75% 25%, 100% 25%, 100% 75%, 75% 75%, 75% 100%, 25% 100%, 25% 75%, 0 75%, 0 25%, 25% 25%);
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }

      .dot::before {
        background: radial-gradient(
          circle at 38% 31%,
          color-mix(in srgb, color-mix(in srgb, var(--lb-ink-c) 82%, #fff) 96%, transparent) 0 20%,
          color-mix(in srgb, var(--lb-ink-c) 96%, transparent) 61%,
          color-mix(in srgb, color-mix(in srgb, var(--lb-ink-c) 80%, #000) 94%, transparent) 100%
        );
        box-shadow: 0 0.42px 0.62px rgba(10, 10, 10, 0.24);
        transform: translateZ(0.18px);
      }

      .dot::after {
        background: radial-gradient(
          circle at 36% 29%,
          color-mix(in srgb, color-mix(in srgb, var(--lb-paper-c) 96%, var(--lb-ink-c)) 96%, transparent) 0 23%,
          color-mix(in srgb, color-mix(in srgb, var(--lb-paper-c) 88%, var(--lb-ink-c)) 94%, transparent) 60%,
          color-mix(in srgb, color-mix(in srgb, var(--lb-paper-c) 72%, var(--lb-ink-c)) 90%, transparent) 100%
        );
        box-shadow: 0 0.48px 0.68px rgba(25, 25, 24, 0.18);
        transform: rotateX(180deg) translateZ(0.18px);
      }
    `;

    const stage = document.createElement("div");
    stage.className = "stage";
    stage.setAttribute("aria-hidden", "true");

    const matrix = document.createElement("div");
    matrix.className = "matrix";

    const fragment = document.createDocumentFragment();
    const dots = [];
    const lastTransforms = Array(25).fill("");
    const lastOpacities = Array(25).fill("");

    for (let index = 0; index < 25; index += 1) {
      const dot = document.createElement("i");
      dot.className = "dot";
      fragment.append(dot);
      dots.push(dot);
    }

    matrix.append(fragment);
    stage.append(matrix);
    shadow.replaceChildren(style, stage);

    let destroyed = false;

    const applyFrame = (timeSeconds) => {
      if (destroyed) return;

      const time = normalizeTime(timeSeconds);
      const dipIn = smoothstep(1.405, 1.535, time);
      const dipOut = 1 - smoothstep(1.595, 1.735, time);
      const centerDip = dipIn * dipOut;

      for (let index = 0; index < dots.length; index += 1) {
        const { distance, proximity } = DOT_METRICS[index];

        const flipProgress = clamp01(
          (time - FLIP_DELAYS[index]) / FLIP_DURATION,
        );
        const flipped = easeInOutCubic(flipProgress);
        const flipEdge = Math.sin(Math.PI * flipProgress);

        const curl = pulse(
          time,
          CURL_START + CURL_ORDER[index] * CURL_STEP,
          CURL_DURATION,
        );

        const returnProgress = clamp01(
          (time - RETURN_START - RETURN_DELAYS[index]) / RETURN_DURATION,
        );
        const returned = easeOutBack(returnProgress);
        const returnEdge = Math.sin(Math.PI * returnProgress);
        const rebound = Math.max(0, returned - 1);

        const depression = centerDip * proximity;
        const centerWeight = index === 12 ? 1 : 0;

        const rotation = 180 * flipped * (1 - returned)
          + curl * CURL_TILTS[index]
          + centerDip * centerWeight * 11;
        const scale = 1
          - flipEdge * 0.055
          + curl * 0.13
          - depression * (0.055 + centerWeight * 0.245)
          - returnEdge * 0.035
          + rebound * 0.7;
        const depth = flipEdge * 0.34
          + curl * 0.82
          - depression * (0.25 + centerWeight * 1.08)
          + returnEdge * 0.18;
        const opacity = Math.max(0.5, Math.min(1,
          0.82
          + flipped * (1 - returned) * 0.15
          - flipEdge * 0.13
          + curl * 0.025
          - depression * (0.03 + centerWeight * 0.16)
          - returnEdge * 0.045,
        ));

        const transform = `translateZ(${depth.toFixed(3)}px) rotateX(${rotation.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
        const opacityValue = opacity.toFixed(4);

        if (transform !== lastTransforms[index]) {
          dots[index].style.transform = transform;
          lastTransforms[index] = transform;
        }
        if (opacityValue !== lastOpacities[index]) {
          dots[index].style.opacity = opacityValue;
          lastOpacities[index] = opacityValue;
        }
      }
    };

    applyFrame(0);

    return {
      render(timeSeconds, deltaSeconds) {
        void deltaSeconds;
        // Sources pixel motion (Zach, Oct 22): the flip wave advances in 16-bit frames, 12 a second, instead of
        // gliding, so the pixel dots step the way the pixel icons do.
        applyFrame(Math.floor(timeSeconds * PIXEL_FPS) / PIXEL_FPS);
      },

      resize(widthCssPixels, heightCssPixels, devicePixelRatio) {
        void devicePixelRatio;
        if (destroyed) return;

        const width = Number.isFinite(widthCssPixels) ? widthCssPixels : 30;
        const height = Number.isFinite(heightCssPixels) ? heightCssPixels : 30;
        const fit = Math.max(0.1, Math.min(1, Math.min(width, height) / 30));
        stage.style.setProperty("--fit", fit.toFixed(4));
      },

      reset() {
        applyFrame(0);
      },

      destroy() {
        if (destroyed) return;
        destroyed = true;
        stage.remove();
        style.remove();
        dots.length = 0;
        lastTransforms.length = 0;
        lastOpacities.length = 0;
      },
    };
  },
};
