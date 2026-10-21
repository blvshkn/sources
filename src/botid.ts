// Vercel BotID (https://vercel.com/docs/botid): runs an invisible challenge in the page and attaches its result to
// the app's own fetches to these paths. The functions behind them (api/_lib/guard.js) call checkBotId and refuse
// anything that looks automated before spending on Sources AI or Odds API credits. Nothing for people to click.
// Imported first in main.tsx so it's in place before any fetch. vercel.json carries the rewrites BotID needs.
// Basic mode by default. If Deep Analysis is turned on in the dashboard, set VITE_BOTID_CHECK_LEVEL=deepAnalysis
// (and BOTID_CHECK_LEVEL=deepAnalysis for the functions) so both sides ask for the same level.
import { initBotId } from "botid/client/core";

const env = (import.meta as { env?: Record<string, string | undefined> }).env;
const deep = env?.VITE_BOTID_CHECK_LEVEL === "deepAnalysis";
const level = deep ? { advancedOptions: { checkLevel: "deepAnalysis" as const } } : {};

try {
  initBotId({
    protect: [
      { path: "/api/ask", method: "POST", ...level },
      { path: "/api/lineup", method: "POST", ...level },
      { path: "/api/lineup-signals", method: "POST", ...level },
    ],
  });
} catch {
  // If the challenge can't start, the server check fails and the app shows its built-in answers. Nothing breaks.
}
