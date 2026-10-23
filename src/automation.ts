/** People only past the landing page (Zach, Oct 23): an AI agent or crawler can read the landing page, but once
 *  someone enters a username (or opens the demo), an automated browser gets a "Source is for people" screen instead
 *  of the app. Checked once in the browser, so it costs nothing on the server.
 *  What it catches: browsers driven by automation tools (navigator.webdriver, which Playwright, Puppeteer, Selenium
 *  and most agent browsers set), headless browsers, and AI crawlers and agents that name themselves in their user
 *  agent. What it can't: an assistant steering a person's own everyday browser looks like that person. Source's own
 *  paid calls (Ask, lineup) stay behind Vercel BotID on the server (src/botid.ts, api/_lib/guard.js). */
const AGENT_UA = /HeadlessChrome|\bHeadless\b|PhantomJS|Puppeteer|Playwright|Selenium|webdriver|GPTBot|ChatGPT|OAI-SearchBot|ClaudeBot|Claude-User|Claude-Web|Claude-SearchBot|anthropic|PerplexityBot|Perplexity-User|Google-Extended|GoogleOther|Bytespider|CCBot|Diffbot|Amazonbot|meta-externalagent|cohere|YouBot|MistralAI|DuckAssistBot|Applebot-Extended|\b(?:bot|crawler|spider|scraper)\b|bot\//i;

export function isAutomated(): boolean {
  if (typeof navigator === "undefined") return false;
  try {
    if (navigator.webdriver) return true;
    return AGENT_UA.test(navigator.userAgent || "");
  } catch { return false; }
}
