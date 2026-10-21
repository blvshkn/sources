// Vendored from the npm package "loader-buttons" v0.1.0 by Jaimin Kataria
// (https://github.com/Appllama/25-unique-loaders, packages/loader-buttons).
// License: Apache-2.0, per the package.json. See the NOTICE section in README.md.
// This file is unchanged from the package.

import { isBrowser } from "./environment.js";

export const DEFAULT_FPS = 30;
const MIN_FPS = 1;
const MAX_FPS = 120;
/** Longest delta a single frame may report, so tab-switches never jump time. */
const MAX_FRAME_DELTA_SECONDS = 0.05;

function clampFps(fps) {
  const value = Number(fps);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_FPS;
  return Math.min(MAX_FPS, Math.max(MIN_FPS, value));
}

/**
 * One requestAnimationFrame loop shared by any number of loaders.
 *
 * The loop starts itself when the first subscriber arrives and stops when the
 * last one leaves, so a page full of paused or off-screen buttons costs nothing.
 */
export function createClock(options = {}) {
  let fps = clampFps(options.fps ?? DEFAULT_FPS);
  let minimumFrameDuration = 1000 / fps;
  const pauseWhenHidden = options.pauseWhenHidden !== false;
  const autoStart = options.autoStart !== false;

  const subscribers = new Set();
  let frameRequest = 0;
  let previousTime = 0;
  let previousPaintTime = 0;
  let running = false;
  let stoppedManually = false;
  let destroyed = false;
  let visibilityAttached = false;

  function now() {
    return isBrowser() && typeof performance !== "undefined"
      ? performance.now()
      : Date.now();
  }

  function documentIsHidden() {
    return pauseWhenHidden && isBrowser() && document.hidden === true;
  }

  function tick(frameTime) {
    frameRequest = 0;
    if (!running) return;

    if (documentIsHidden()) {
      // Wait for `visibilitychange` instead of burning frames in a hidden tab.
      running = false;
      return;
    }

    if (
      previousPaintTime &&
      frameTime - previousPaintTime < minimumFrameDuration - 0.5
    ) {
      frameRequest = requestAnimationFrame(tick);
      return;
    }

    const delta = Math.min(
      MAX_FRAME_DELTA_SECONDS,
      Math.max(0, (frameTime - previousTime) / 1000),
    );
    previousTime = frameTime;
    previousPaintTime = frameTime;

    // Iterate a copy: a subscriber may unsubscribe (or destroy itself) mid-frame.
    for (const subscriber of [...subscribers]) {
      if (!subscribers.has(subscriber)) continue;
      try {
        subscriber(delta, frameTime);
      } catch (error) {
        console.error("[loader-buttons] frame callback failed", error);
      }
    }

    if (!running) return;
    frameRequest = requestAnimationFrame(tick);
  }

  function handleVisibilityChange() {
    if (destroyed || document.hidden) return;
    if (subscribers.size > 0 && !stoppedManually) start();
  }

  function attachVisibilityListener() {
    if (visibilityAttached || !isBrowser() || !pauseWhenHidden) return;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visibilityAttached = true;
  }

  function start() {
    if (destroyed || !isBrowser()) return;
    stoppedManually = false;
    // Attach before the hidden-tab bail-out, otherwise a clock started in a
    // background tab would never hear that the tab came back.
    attachVisibilityListener();
    if (frameRequest || documentIsHidden()) {
      running = !documentIsHidden();
      return;
    }
    running = true;
    previousTime = now();
    previousPaintTime = 0;
    frameRequest = requestAnimationFrame(tick);
  }

  function stopLoop() {
    running = false;
    if (frameRequest) {
      cancelAnimationFrame(frameRequest);
      frameRequest = 0;
    }
  }

  return {
    /** Subscribe to frames. The callback receives `(deltaSeconds, frameTime)`. */
    subscribe(callback) {
      if (destroyed) return () => {};
      subscribers.add(callback);
      if (autoStart && !stoppedManually) start();
      return () => {
        subscribers.delete(callback);
        if (subscribers.size === 0) stopLoop();
      };
    },
    /** Start the loop by hand (only needed with `autoStart: false`). */
    start,
    /** Stop the loop. It stays stopped until `start()` is called again. */
    stop() {
      stoppedManually = true;
      stopLoop();
    },
    /** Change the frame budget. Values are clamped to 1-120fps. */
    setFps(nextFps) {
      fps = clampFps(nextFps);
      minimumFrameDuration = 1000 / fps;
      previousPaintTime = 0;
    },
    get fps() {
      return fps;
    },
    get running() {
      return running;
    },
    get size() {
      return subscribers.size;
    },
    /** Tear the clock down and drop every subscriber. */
    destroy() {
      destroyed = true;
      stopLoop();
      subscribers.clear();
      if (visibilityAttached) {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        visibilityAttached = false;
      }
    },
  };
}

const sharedClocks = new Map();

/**
 * The clock used when no `clock` option is passed. One clock exists per fps
 * value, so buttons that share a frame budget also share a single RAF loop.
 */
export function getSharedClock(fps = DEFAULT_FPS) {
  const key = clampFps(fps);
  let clock = sharedClocks.get(key);
  if (!clock) {
    clock = createClock({ fps: key });
    sharedClocks.set(key, clock);
  }
  return clock;
}
