// Builds a single-file preview for a claude.ai Artifact: React loads from cdnjs,
// app code and CSS are inlined. Usage: node scripts/build-artifact.mjs [esbuild path]
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const shim = (f) => resolve(root, "scripts/shims", f);
const out = resolve(root, "dist-artifact");
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [resolve(root, "src/main.tsx")],
  bundle: true, minify: true, format: "iife", target: "es2020",
  jsx: "automatic", outdir: out, entryNames: "app",
  alias: { react: shim("react.cjs"), "react-dom/client": shim("react-dom.cjs"), "react/jsx-runtime": shim("jsx-runtime.cjs") },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const js = readFileSync(resolve(out, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync(resolve(out, "app.css"), "utf8");
const html = `<title>Sources</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@500;600&display=swap">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;
writeFileSync(resolve(out, "index.html"), html);
console.log("wrote", resolve(out, "index.html"), (html.length / 1024).toFixed(1) + "KB");
