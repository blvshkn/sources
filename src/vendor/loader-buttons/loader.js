// Vendored from the npm package "loader-buttons" v0.1.0 by Jaimin Kataria
// (https://github.com/Appllama/25-unique-loaders, packages/loader-buttons).
// License: Apache-2.0, per the package.json. See the NOTICE section in README.md.
// This file is unchanged from the package.

import { getSharedClock, DEFAULT_FPS } from "./clock.js";
import {
  currentDevicePixelRatio,
  isBrowser,
  observeSize,
  observeVisibility,
  onDevicePixelRatioChange,
  onReducedMotionChange,
  prefersReducedMotion,
} from "./environment.js";
import { resolveDesign } from "./registry.js";

export const loaderDefaults = Object.freeze({
  fps: DEFAULT_FPS,
  speed: 1,
  phaseOffset: 0,
  paused: false,
  maxDpr: 3,
  size: 30,
  pauseOffscreen: true,
  respectReducedMotion: true,
  releaseWebGLOffscreen: true,
  releaseDelay: 1200,
  rootMargin: "120px 0px",
  threshold: 0.01,
});

const NOOP_VISUAL = {
  render() {},
  resize() {},
  reset() {},
  destroy() {},
};

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Mount a single loader animation into an element you own.
 *
 * This is the headless layer: it drives the shared frame loop, off-screen
 * pausing, device-pixel-ratio changes, reduced motion, and WebGL context
 * recycling. It adds no styling and no markup of its own beyond the canvas or
 * SVG the design itself creates.
 */
export function mountLoader(element, options = {}) {
  if (!isBrowser()) {
    throw new Error("[loader-buttons] mountLoader requires a browser environment.");
  }
  if (!element || typeof element.appendChild !== "function") {
    throw new TypeError("[loader-buttons] mountLoader expects a DOM element.");
  }

  let design = resolveDesign(options.design);

  const clock = options.clock ?? getSharedClock(options.fps ?? loaderDefaults.fps);
  const pauseOffscreen = options.pauseOffscreen !== false;
  const respectReducedMotion = options.respectReducedMotion !== false;
  const releaseWebGLOffscreen = options.releaseWebGLOffscreen !== false;
  const releaseDelay = Math.max(
    0,
    toFiniteNumber(options.releaseDelay, loaderDefaults.releaseDelay),
  );
  const rootMargin = options.rootMargin ?? loaderDefaults.rootMargin;
  const threshold = toFiniteNumber(options.threshold, loaderDefaults.threshold);
  const fallbackSize = Math.max(1, toFiniteNumber(options.size, loaderDefaults.size));
  const onError = typeof options.onError === "function" ? options.onError : null;
  const onFrame = typeof options.onFrame === "function" ? options.onFrame : null;

  let maxDpr = Math.max(1, toFiniteNumber(options.maxDpr, loaderDefaults.maxDpr));
  let speed = Math.max(0, toFiniteNumber(options.speed, loaderDefaults.speed));
  let phaseOffset = Math.max(0, toFiniteNumber(options.phaseOffset, loaderDefaults.phaseOffset));

  let localTime = phaseOffset;
  let paused = Boolean(options.paused);
  let reducedMotion = respectReducedMotion && prefersReducedMotion();
  let visible = !pauseOffscreen;
  let destroyed = false;
  let failed = false;

  let visual = null;
  let visualHost = null;
  let releaseTimer = 0;
  let unsubscribeFrames = null;
  let lastWidth = 0;
  let lastHeight = 0;
  let lastDpr = 0;

  /* ---------------------------------------------------- visual lifecycle */

  function measure() {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width > 0 ? rect.width : fallbackSize,
      height: rect.height > 0 ? rect.height : fallbackSize,
    };
  }

  function reportFailure(error, stage) {
    failed = true;
    element.setAttribute("data-loader-error", "");
    console.error(`[loader-buttons] "${design.id}" failed to ${stage}`, error);
    onError?.(error, { design, stage });
  }

  function applyResize(width, height, force = false) {
    if (!visual) return;
    const dpr = Math.min(maxDpr, Math.max(1, currentDevicePixelRatio()));
    if (!force && width === lastWidth && height === lastHeight && dpr === lastDpr) {
      return;
    }
    lastWidth = width;
    lastHeight = height;
    lastDpr = dpr;
    try {
      visual.resize?.(width, height, dpr);
    } catch (error) {
      reportFailure(error, "resize");
    }
  }

  function drawFrame(delta) {
    if (!visual || failed) return;
    try {
      visual.render?.(localTime, delta);
    } catch (error) {
      reportFailure(error, "render");
      syncSubscription();
    }
  }

  function ensureVisual() {
    if (visual) return visual;
    if (destroyed) return NOOP_VISUAL;

    if (releaseTimer) {
      clearTimeout(releaseTimer);
      releaseTimer = 0;
    }

    // Each mount gets a throwaway host of its own. A design may attach a closed
    // shadow root to whatever it is handed, and a shadow root can never be
    // detached again -- so the host, not the slot, is what we discard later.
    visualHost = document.createElement("span");
    visualHost.style.cssText = "position:relative;display:block;width:100%;height:100%;";
    element.append(visualHost);

    try {
      visual = design.mount(visualHost) ?? NOOP_VISUAL;
      element.removeAttribute("data-loader-error");
      failed = false;
    } catch (error) {
      visual = NOOP_VISUAL;
      reportFailure(error, "mount");
      return visual;
    }

    const { width, height } = measure();
    applyResize(width, height, true);
    drawFrame(0);
    return visual;
  }

  function disposeVisual() {
    if (!visual) return;
    try {
      visual.destroy?.();
    } catch (error) {
      console.error(`[loader-buttons] "${design.id}" failed to destroy`, error);
    }
    visual = null;
    visualHost = null;
    lastWidth = 0;
    lastHeight = 0;
    lastDpr = 0;
    element.replaceChildren();
  }

  function scheduleRelease() {
    if (!releaseWebGLOffscreen || design.kind !== "webgl") return;
    if (!visual || releaseTimer || destroyed) return;

    releaseTimer = setTimeout(() => {
      releaseTimer = 0;
      if (destroyed || visible) return;
      disposeVisual();
    }, releaseDelay);
  }

  /* ---------------------------------------------------------- frame loop */

  function shouldAnimate() {
    return !destroyed && !failed && !paused && !reducedMotion && visible;
  }

  function handleFrame(delta) {
    if (!shouldAnimate()) return;
    const scaledDelta = delta * speed;
    localTime += scaledDelta;
    ensureVisual();
    drawFrame(scaledDelta);
    onFrame?.(localTime, scaledDelta);
  }

  function syncSubscription() {
    const wanted = shouldAnimate();
    if (wanted && !unsubscribeFrames) {
      unsubscribeFrames = clock.subscribe(handleFrame);
    } else if (!wanted && unsubscribeFrames) {
      unsubscribeFrames();
      unsubscribeFrames = null;
    }
  }

  /* ------------------------------------------------------------ observers */

  const stopWatchingVisibility = pauseOffscreen
    ? observeVisibility(element, rootMargin, threshold, (isVisible) => {
        if (destroyed || visible === isVisible) return;
        visible = isVisible;
        if (visible) {
          if (releaseTimer) {
            clearTimeout(releaseTimer);
            releaseTimer = 0;
          }
          ensureVisual();
        } else {
          scheduleRelease();
        }
        syncSubscription();
      })
    : () => {};

  const stopWatchingSize = observeSize(element, (width, height) => {
    if (destroyed || !visual) return;
    applyResize(width > 0 ? width : fallbackSize, height > 0 ? height : fallbackSize);
    if (!shouldAnimate()) drawFrame(0);
  });

  const stopWatchingDpr = onDevicePixelRatioChange(() => {
    if (destroyed || !visual) return;
    const { width, height } = measure();
    applyResize(width, height, true);
    if (!shouldAnimate()) drawFrame(0);
  });

  const stopWatchingReducedMotion = respectReducedMotion
    ? onReducedMotionChange((matches) => {
        if (destroyed) return;
        reducedMotion = matches;
        syncSubscription();
      })
    : () => {};

  /* ------------------------------------------------------ public instance */

  const instance = {
    element,

    get design() {
      return design;
    },
    get time() {
      return localTime;
    },
    get speed() {
      return speed;
    },
    get paused() {
      return paused;
    },
    get visible() {
      return visible;
    },
    get animating() {
      return shouldAnimate();
    },
    get reducedMotion() {
      return reducedMotion;
    },
    get failed() {
      return failed;
    },
    get destroyed() {
      return destroyed;
    },
    get clock() {
      return clock;
    },

    /** Resume motion. */
    play() {
      if (destroyed || !paused) return instance;
      paused = false;
      ensureVisual();
      syncSubscription();
      return instance;
    },

    /** Freeze on the current frame. */
    pause() {
      if (destroyed || paused) return instance;
      paused = true;
      syncSubscription();
      return instance;
    },

    /** Flip between play and pause. */
    toggle() {
      return paused ? instance.play() : instance.pause();
    },

    /** Restart the animation from its phase offset. */
    reset() {
      if (destroyed) return instance;
      localTime = phaseOffset;
      ensureVisual();
      try {
        visual?.reset?.();
      } catch (error) {
        reportFailure(error, "reset");
      }
      drawFrame(0);
      return instance;
    },

    /** Jump to an absolute time, in seconds, and repaint. */
    seek(seconds) {
      if (destroyed) return instance;
      localTime = Math.max(0, toFiniteNumber(seconds, localTime));
      ensureVisual();
      drawFrame(0);
      return instance;
    },

    /** Repaint the current frame without advancing time. */
    renderFrame() {
      if (destroyed) return instance;
      ensureVisual();
      drawFrame(0);
      return instance;
    },

    /** Time multiplier. `0` freezes, `2` runs at double speed. */
    setSpeed(nextSpeed) {
      speed = Math.max(0, toFiniteNumber(nextSpeed, speed));
      return instance;
    },

    /** Change the restart point used by `reset()`. */
    setPhaseOffset(seconds) {
      phaseOffset = Math.max(0, toFiniteNumber(seconds, phaseOffset));
      return instance;
    },

    /** Cap the pixel density the design renders at. */
    setMaxDpr(nextMaxDpr) {
      maxDpr = Math.max(1, toFiniteNumber(nextMaxDpr, maxDpr));
      if (!visual) return instance;
      const { width, height } = measure();
      applyResize(width, height, true);
      if (!shouldAnimate()) drawFrame(0);
      return instance;
    },

    /** Swap in another loader, keeping every other setting. */
    setDesign(nextDesign) {
      if (destroyed) return instance;
      const resolved = resolveDesign(nextDesign);
      if (resolved === design) return instance;

      if (releaseTimer) {
        clearTimeout(releaseTimer);
        releaseTimer = 0;
      }
      disposeVisual();
      design = resolved;
      failed = false;
      element.removeAttribute("data-loader-error");
      localTime = phaseOffset;

      if (visible) ensureVisual();
      syncSubscription();
      return instance;
    },

    /** Re-measure the host element and repaint. */
    refresh() {
      if (destroyed || !visual) return instance;
      const { width, height } = measure();
      applyResize(width, height, true);
      if (!shouldAnimate()) drawFrame(0);
      return instance;
    },

    /** Remove every listener, free the visual, and empty the host element. */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (releaseTimer) {
        clearTimeout(releaseTimer);
        releaseTimer = 0;
      }
      unsubscribeFrames?.();
      unsubscribeFrames = null;
      stopWatchingVisibility();
      stopWatchingSize();
      stopWatchingDpr();
      stopWatchingReducedMotion();
      disposeVisual();
    },
  };

  if (visible) ensureVisual();
  syncSubscription();

  return instance;
}
