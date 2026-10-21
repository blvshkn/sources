// Shorthand declaration so a woff2 import type-checks even where vite/client types aren't installed. It merges with
// Vite's own `*.woff2` declaration (a string URL) instead of clashing with it.
declare module "*.woff2";
