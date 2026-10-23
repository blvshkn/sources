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

/** The terms' betting clause, word for word. The Terms page (src/components/About.tsx) shows this same text, so Ask
 *  always quotes the current version. */
export const BETTING_TERMS = "Source is a calculation tool for fantasy football trades and lineups. It doesn't support prop bets, sports betting, real-money wagers or daily fantasy contests, and it doesn't link to or take bets for any sportsbook. Vegas lines appear only as one input to point projections, to help estimate how a game might play out. They aren't picks or betting advice, and nothing in Source is financial advice.";

/** Ask's reply to a betting question: kind, a quote of the terms, and a turn back to fantasy (Zach, Oct 23) */
export const NO_BETTING = {
  text: `Thanks for asking! Source sticks to fantasy football, so it can't help with betting of any kind. Here's what our terms say: "${BETTING_TERMS}"`,
  points: ["Happy to help with a trade, a start or sit, or a waiver pickup instead. What's on your mind for your team?"],
};
