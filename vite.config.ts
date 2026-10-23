import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// One id per build (the commit on Vercel). The app compares it with /version.json to offer a refresh after a deploy.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());
const version = (): Plugin => ({
  name: "source-version",
  apply: "build",
  generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id: BUILD_ID }) }); },
});

// base "./" keeps the build portable (GitHub Pages, any static host)
export default defineConfig({
  plugins: [react(), version()],
  base: "./",
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
});
