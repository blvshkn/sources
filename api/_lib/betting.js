// Betting questions (Zach, Oct 23): Source's terms don't allow betting of any kind. It's a fantasy trade calculator,
// and Vegas lines only feed point projections. Ask answers these with a fixed reply and never sends them to the model.
// One copy for the app (src/askAi.ts answers right away, no request) and api/ask.js (for anything that reaches it).

// Fantasy talk that sounds like betting stays allowed: "best bet to start", "safe bet", "I bet he scores", "my odds of
// making the playoffs", "spread the ball around".
const WORDS = [
  /\bgambl\w*/, /\bwager\w*/, /\bparlays?\b/, /\bsports?\s?books?\b/, /\bbookies?\b/,
  /\bprop\s?bets?\b/, /\bplayer\s?props?\b/, /\bprops?\s+(?:bets?|lines?|picks?|plays?)\b/, /\bmoney\s?lines?\b/,
  /\bover\s*\/\s*under\b/, /\bo\/u\b/, /\bpoint\s+spreads?\b/, /\b(?:against|cover(?:s|ing|ed)?)\s+the\s+spread\b/, /\bats\b/,
  /\b(?:vegas|betting|sportsbook|book)\s+(?:odds|lines?|totals?|favorites?)\b/, /\bbetting\b/, /\bbettors?\b/,
  /\banytime\s+(?:td|touchdown)\b/, /\b(?:first|last)\s+(?:td|touchdown)\s+scorer\b/, /\bteasers?\b/, /\bround\s?robin\b/,
  /\b(?:draft\s?kings|fan\s?duel|prize\s?picks|underdog\s+fantasy|bet\s?mgm|bet\s?365|caesars|bovada|fanatics\s+sportsbook|hard\s?rock\s+bet|espn\s?bet|sleeper\s+picks|betr|parlayplay)\b/,
  /\bdfs\b/, /\bdaily\s+fantasy\b/, /\bunits?\s+on\b/,
  // "bet" itself, unless it's the fantasy figure of speech
  /(?<!\b(?:best|safe|safest|safer|good|better|sure|solid|smart|risky|decent|great|top|i|you)\s)\bbet(?:s|ting)?\b(?!\s+(?:to\s+start|start|play|option|at\s+(?:rb|wr|te|qb|flex)))/,
  // "I bet he scores" is fine; "should I bet on the Chiefs" isn't
  /\b(?:i|you|we)\s+bet\s+(?:on|against|money|the\s+(?:over|under)|\$|\d)/, /\b(?:should|can|could|would|do|to)\s+(?:i|you|we)\s+bet\b/,
];

/** True when a question is about betting of any kind */
export function isBetting(q) {
  const s = String(q || "").toLowerCase();
  return WORDS.some((re) => re.test(s));
}

/** Ask's reply to a betting question */
export const NO_BETTING = {
  text: "Source doesn't answer betting questions. It's a fantasy trade calculator for better trades and your optimal lineup, and its terms don't allow betting of any kind.",
  points: ["Vegas lines only help shape point projections.", "Ask about a trade, a start or sit, or a waiver pickup instead."],
};
