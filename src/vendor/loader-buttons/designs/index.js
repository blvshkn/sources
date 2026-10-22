// Ours, not the package's: the package's designs/index.js registers all 25 loaders. Source only ships
// Braille Flipwave, so this list holds that one design and the package's registry.js reads it unchanged.
// The design itself is vendored from "loader-buttons" v0.1.0 by Jaimin Kataria, Apache-2.0 per its package.json.
import brailleFlipwave from "./25-braille-flipwave.js";

export default [brailleFlipwave];
