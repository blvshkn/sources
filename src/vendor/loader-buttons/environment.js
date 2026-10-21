// Vendored from the npm package "loader-buttons" v0.1.0 by Jaimin Kataria
// (https://github.com/Appllama/25-unique-loaders, packages/loader-buttons).
// License: Apache-2.0, per the package.json. See the NOTICE section in README.md.
// This file is unchanged from the package.

/**
 * Shared browser plumbing. Every helper here is lazily created so importing the
 * package on a server (SSR, tests) never touches `window` or `document`.
 */

export function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function currentDevicePixelRatio() {
  if (!isBrowser()) return 1;
  const value = window.devicePixelRatio;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/* ------------------------------------------------------------------ *
 * Reduced motion
 * ------------------------------------------------------------------ */

let reducedMotionQuery = null;
const reducedMotionListeners = new Set();

function reducedMotionHandler(event) {
  for (const listener of [...reducedMotionListeners]) {
    try {
      listener(event.matches);
    } catch (error) {
      console.error("[loader-buttons] reduced-motion listener failed", error);
    }
  }
}

function ensureReducedMotionQuery() {
  if (reducedMotionQuery || !isBrowser() || typeof window.matchMedia !== "function") {
    return reducedMotionQuery;
  }
  reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  return reducedMotionQuery;
}

/** Does the visitor ask for reduced motion right now? */
export function prefersReducedMotion() {
  return Boolean(ensureReducedMotionQuery()?.matches);
}

/** Subscribe to reduced-motion changes. Returns an unsubscribe function. */
export function onReducedMotionChange(listener) {
  const query = ensureReducedMotionQuery();
  if (!query) return () => {};

  if (reducedMotionListeners.size === 0) {
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", reducedMotionHandler);
    } else if (typeof query.addListener === "function") {
      // Safari < 14
      query.addListener(reducedMotionHandler);
    }
  }

  reducedMotionListeners.add(listener);

  return () => {
    if (!reducedMotionListeners.delete(listener)) return;
    if (reducedMotionListeners.size > 0) return;
    if (typeof query.removeEventListener === "function") {
      query.removeEventListener("change", reducedMotionHandler);
    } else if (typeof query.removeListener === "function") {
      query.removeListener(reducedMotionHandler);
    }
  };
}

/* ------------------------------------------------------------------ *
 * Device pixel ratio
 * ------------------------------------------------------------------ */

const dprListeners = new Set();
let dprValue = 1;
let dprQuery = null;
let dprQueryHandler = null;
let dprWindowListenerAttached = false;

function notifyDprListeners() {
  const next = currentDevicePixelRatio();
  if (next === dprValue) return;
  dprValue = next;
  for (const listener of [...dprListeners]) {
    try {
      listener(next);
    } catch (error) {
      console.error("[loader-buttons] device-pixel-ratio listener failed", error);
    }
  }
}

function detachDprQuery() {
  if (!dprQuery || !dprQueryHandler) return;
  if (typeof dprQuery.removeEventListener === "function") {
    dprQuery.removeEventListener("change", dprQueryHandler);
  } else if (typeof dprQuery.removeListener === "function") {
    dprQuery.removeListener(dprQueryHandler);
  }
  dprQuery = null;
  dprQueryHandler = null;
}

function attachDprQuery() {
  if (!isBrowser() || typeof window.matchMedia !== "function") return;
  detachDprQuery();

  const ratio = currentDevicePixelRatio();
  let query;
  try {
    query = window.matchMedia(`(resolution: ${ratio}dppx)`);
  } catch {
    // `resolution` is unsupported (older Safari); the resize listener covers us.
    return;
  }

  dprQuery = query;
  dprQueryHandler = () => {
    notifyDprListeners();
    // The query only matches the previous ratio, so re-arm against the new one.
    attachDprQuery();
  };

  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", dprQueryHandler);
  } else if (typeof query.addListener === "function") {
    query.addListener(dprQueryHandler);
  }
}

/**
 * Subscribe to device-pixel-ratio changes (monitor swap, browser zoom).
 * Returns an unsubscribe function.
 */
export function onDevicePixelRatioChange(listener) {
  if (!isBrowser()) return () => {};

  if (dprListeners.size === 0) {
    dprValue = currentDevicePixelRatio();
    attachDprQuery();
    if (!dprWindowListenerAttached) {
      window.addEventListener("resize", notifyDprListeners, { passive: true });
      dprWindowListenerAttached = true;
    }
  }

  dprListeners.add(listener);

  return () => {
    if (!dprListeners.delete(listener)) return;
    if (dprListeners.size > 0) return;
    detachDprQuery();
    if (dprWindowListenerAttached) {
      window.removeEventListener("resize", notifyDprListeners);
      dprWindowListenerAttached = false;
    }
  };
}

/* ------------------------------------------------------------------ *
 * Shared observers
 * ------------------------------------------------------------------ */

const intersectionObservers = new Map();

/**
 * Observe an element's visibility using an observer shared by every element
 * that requested the same `rootMargin`/`threshold` pair.
 */
export function observeVisibility(element, rootMargin, threshold, callback) {
  if (!isBrowser() || typeof IntersectionObserver === "undefined") {
    // Without the API, assume the element is visible so motion still runs.
    callback(true);
    return () => {};
  }

  const key = `${rootMargin}|${threshold}`;
  let record = intersectionObservers.get(key);

  if (!record) {
    const targets = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const handler = targets.get(entry.target);
          if (!handler) continue;
          try {
            handler(entry.isIntersecting);
          } catch (error) {
            console.error("[loader-buttons] visibility listener failed", error);
          }
        }
      },
      { rootMargin, threshold },
    );
    record = { observer, targets };
    intersectionObservers.set(key, record);
  }

  record.targets.set(element, callback);
  record.observer.observe(element);

  return () => {
    if (!record.targets.delete(element)) return;
    record.observer.unobserve(element);
    if (record.targets.size === 0) {
      record.observer.disconnect();
      intersectionObservers.delete(key);
    }
  };
}

let resizeObserver = null;
let resizeTargets = null;

/** Observe an element's box using one shared ResizeObserver. */
export function observeSize(element, callback) {
  if (!isBrowser() || typeof ResizeObserver === "undefined") return () => {};

  if (!resizeObserver) {
    resizeTargets = new Map();
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const handler = resizeTargets.get(entry.target);
        if (!handler) continue;
        const box = entry.contentRect;
        try {
          handler(box.width, box.height);
        } catch (error) {
          console.error("[loader-buttons] resize listener failed", error);
        }
      }
    });
  }

  resizeTargets.set(element, callback);
  resizeObserver.observe(element);

  return () => {
    if (!resizeTargets?.delete(element)) return;
    resizeObserver.unobserve(element);
    if (resizeTargets.size === 0) {
      resizeObserver.disconnect();
      resizeObserver = null;
      resizeTargets = null;
    }
  };
}
