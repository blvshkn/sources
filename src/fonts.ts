// Clash Grotesk (Indian Type Foundry, Fontshare) for headers, in two weights: Medium (500) and Semibold (600).
// It loads here through the FontFace API rather than a CSS @font-face, so no stylesheet carries a file reference.
// Vite turns each import into the built, hashed asset URL; index.html preloads the same files so they're in flight early.
import clashMedium from "./assets/fonts/ClashGrotesk-Medium.woff2";
import clashSemibold from "./assets/fonts/ClashGrotesk-Semibold.woff2";

const FACES: [string, string][] = [[clashMedium, "500"], [clashSemibold, "600"]];

try {
  if (typeof FontFace !== "undefined" && document.fonts) {
    for (const [src, weight] of FACES) {
      const face = new FontFace("Clash Grotesk", `url(${JSON.stringify(src)}) format("woff2")`, { weight, style: "normal", display: "swap" });
      document.fonts.add(face);
      // Start the fetch now rather than at first use, so headers swap in as early as possible
      face.load().catch(() => { /* the fallback stack (Geist) stays */ });
    }
  }
} catch { /* old browser: Geist stays */ }
