// Vendored from the npm package "loader-buttons" v0.1.0 by Jaimin Kataria
// (https://github.com/Appllama/25-unique-loaders, packages/loader-buttons).
// License: Apache-2.0, per the package.json. See the NOTICE section in README.md.
// This file is unchanged from the package.

import designs from "./designs/index.js";

/**
 * Every bundled loader, in gallery order. Each entry follows the module
 * contract documented in `designs/CONTRACT.md`.
 */
export { designs };

const byId = new Map(designs.map((design) => [design.id, design]));

/** Map of `id -> design`, useful for building pickers. */
export const designsById = Object.freeze(Object.fromEntries(byId));

/** Every bundled loader id, in gallery order. */
export const designIds = Object.freeze(designs.map((design) => design.id));

function isDesign(value) {
  return Boolean(value) && typeof value === "object" && typeof value.mount === "function";
}

/**
 * Resolve a design id, a design object, or an index into a design.
 * Throws a descriptive error rather than failing later inside `mount`.
 */
export function resolveDesign(design) {
  if (isDesign(design)) return design;

  if (typeof design === "number" && Number.isInteger(design)) {
    const found = designs[design];
    if (found) return found;
    throw new RangeError(
      `[loader-buttons] design index ${design} is out of range (0-${designs.length - 1}).`,
    );
  }

  if (typeof design === "string") {
    const found = byId.get(design);
    if (found) return found;
    throw new Error(
      `[loader-buttons] unknown design "${design}". Available ids: ${designIds.join(", ")}.`,
    );
  }

  if (design == null) {
    throw new Error("[loader-buttons] a `design` option is required.");
  }

  throw new TypeError(
    "[loader-buttons] `design` must be a design id, a design object, or an index.",
  );
}

/** Look up a design by id without throwing. */
export function getDesign(id) {
  return byId.get(id);
}

/** All designs of one rendering kind: `webgl`, `canvas`, `svg`, or `dom`. */
export function designsByKind(kind) {
  return designs.filter((design) => design.kind === kind);
}
