// Profanity, slurs and other abhorrent words (Zach, Oct 23): Ask pixelates them in the chat (src/components/Censored.tsx)
// and the saved question log (api/_lib/ask-log.js) stores them as asterisks. One list for both.
// Matched per word, after undoing common disguises (f*ck stays caught by the stems, 5h1t, fuuuck). Football words that
// contain one of these (Dickson, Cockrell, Shitta, Scunthorpe) are left alone because short words match whole only.

// Word starts: anything beginning with these
const STEMS = ["fuck", "fuk", "fck", "phuck", "shit", "sht", "bitch", "biatch", "cunt", "nigg", "nigr", "motherf", "asshole", "bullshit", "dickhead", "faggot", "fagot", "retard", "whore", "slut", "twat", "wank", "kike", "chink", "wetback", "raghead", "towelhead", "beaner", "tranny", "trannie", "jackass", "dumbass", "goddamn", "cocksuck", "douche"];
// Whole words only (with an s, es, ed, ing, er or y ending)
const WHOLE = ["ass", "asses", "dick", "cock", "pussy", "piss", "pissed", "prick", "bastard", "damn", "spic", "spick", "gook", "coon", "fag", "dyke", "paki", "jap", "nazi", "hoe", "skank", "cum", "porn", "rape", "rapist", "negro", "darkie", "gyp", "gypped", "retarded", "homo", "lesbo"];

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", "$": "s", "!": "i", "|": "i", "+": "t" };
const plain = (w) => String(w).toLowerCase().replace(/[013457 8@$!|+]/g, (c) => LEET[c] ?? c).replace(/[^a-z*]/g, "");
const squash = (w) => w.replace(/(.)\1+/g, "$1");
const SUFFIX = /(?:s|es|ed|ing|er|ers|y)$/;

function hit(w) {
  if (!w) return false;
  for (const x of [w, squash(w)]) {
    if (STEMS.some((s) => x.startsWith(s))) return true;
    if (WHOLE.includes(x) || WHOLE.includes(x.replace(SUFFIX, ""))) return true;
  }
  // Starred-out spellings: f*ck, sh*t, b*tch
  if (w.includes("*") && /^(?:f\*+c?k|f\*+k|sh\*+t|b\*+tch|c\*+nt|n\*+g)/.test(w)) return true;
  return false;
}

/** True when one word (punctuation and all) is profane or abhorrent */
export function isFoul(word) {
  return hit(plain(word));
}

/** Splits text into [text, foul?] runs, keeping every space and punctuation mark where it was */
export function splitFoul(text) {
  const out = [];
  for (const part of String(text ?? "").split(/(\s+)/)) {
    if (!part) continue;
    // Keep leading and trailing punctuation outside the hidden part ("fuck!" hides "fuck", keeps "!")
    const m = part.match(/^([("'“‘]*)(.*?)([)"'”’.,!?;:]*)$/s);
    const [pre, core, post] = m ? [m[1], m[2], m[3]] : ["", part, ""];
    if (!/\s/.test(part) && core && isFoul(core)) {
      if (pre) out.push([pre, false]);
      out.push([core, true]);
      if (post) out.push([post, false]);
    } else out.push([part, false]);
  }
  return out;
}

/** The text with each foul word replaced by asterisks of the same length */
export function maskFoul(text) {
  return splitFoul(text).map(([t, f]) => (f ? "*".repeat(t.length) : t)).join("");
}
