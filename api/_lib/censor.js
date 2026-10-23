// Profanity, slurs, racist terms and tropes, and anything abhorrent (Zach, Oct 23): Ask pixelates them in the chat
// (src/components/Censored.tsx). One list, also usable server side (maskFoul).
// Catches odd spellings: leetspeak (5h1t, n199er), stretched letters (fuuuck), symbols inside (f*ck, n!gg@, f.u.c.k),
// letters spaced out (f u c k), dropped vowels (fck, btch), and starred words (f**k). Short words match whole only, so
// football names like Dickson, Cockrell or Bass stay readable.

// Word starts: anything beginning with these (after cleanup)
const STEMS = [
  // profanity
  "fuck", "fuk", "fck", "fuq", "phuck", "phuk", "fvck", "shit", "sht", "bitch", "biatch", "btch", "cunt", "motherf", "mofo",
  "asshole", "bullshit", "dickhead", "dipshit", "jackass", "dumbass", "smartass", "badass", "goddamn", "cocksuck", "douche",
  "whore", "slut", "twat", "wank", "skank", "bastard", "pussies",
  // racist slurs and terms
  "nigg", "nigr", "nigah", "niga", "niglet", "negroid", "kike", "chink", "wetback", "raghead", "towelhead", "beaner",
  "jigaboo", "jiggaboo", "pickaninn", "golliwog", "zipperhead", "slanteye", "chinaman", "sandnig", "spearchuck", "coonass",
  "redskin", "halfbreed", "squaw", "cameljock",
  // homophobic, transphobic, ableist
  "faggot", "fagot", "fggt", "tranny", "trannie", "shemale", "retard", "mongoloid", "spastic",
  // hate symbols and slogans written as one word
  "heilhitler", "siegheil", "whitepower", "1488",
];
// Whole words only (with an s, es, ed, ing, er, ers or y ending)
const WHOLE = [
  "ass", "asses", "arse", "dick", "cock", "pussy", "piss", "pissed", "prick", "damn", "cum", "porn", "rape", "rapist", "hoe",
  "spic", "spick", "gook", "coon", "fag", "dyke", "paki", "jap", "nip", "wop", "dago", "kraut", "yid", "heeb", "hymie",
  "honky", "sambo", "injun", "gyp", "gypped", "gyppo", "negro", "darkie", "darky", "mulatto", "coolie", "slant", "spook",
  "spaz", "homo", "lesbo", "poof", "poofter", "nazi", "kkk", "jewed",
];
// Racist tropes and hate phrases: every word in the phrase is hidden
const PHRASES = [
  "porch monkey", "tar baby", "camel jockey", "sand monkey", "jungle bunny", "spear chucker", "go back to africa",
  "go back to mexico", "go back to china", "go back to your country", "go back where you came from", "white power",
  "white pride", "heil hitler", "sieg heil", "gas the jews", "jew them down", "jew him down", "fourteen words",
  "fried chicken and watermelon", "act white", "acting white", "thug culture",
].map((p) => p.split(" "));
// Full forms a starred word (f**k, n****r) is checked against
const FULL = ["fuck", "fucking", "fucker", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "asshole", "dick", "cock", "pussy", "motherfucker", "bullshit", "whore", "slut", "retard", "chink", "kike", "spic", "damn"];

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 6: "g", 7: "t", 8: "b", 9: "g", "@": "a", "$": "s", "!": "i", "|": "i", "+": "t", "€": "e", "£": "l" };
const ACCENTS = /[̀-ͯ]/g;
/** Lowercase, accents off, look-alikes swapped in, everything but letters and * dropped */
const plain = (w) => String(w).normalize("NFKD").replace(ACCENTS, "").toLowerCase()
  .replace(/[0-9@$!|+€£]/g, (c) => LEET[c] ?? c).replace(/[^a-z*]/g, "");
const squash = (w) => w.replace(/(.)\1+/g, "$1");
const SUFFIX = /(?:s|es|ed|ing|in|er|ers|y|z)$/;

function hit(w) {
  if (!w) return false;
  if (w.includes("*")) {
    const pat = new RegExp(`^${w.replace(/\*+/g, "[a-z]{1,4}")}(?:s|es|ed|ing|in|er|ers|y|z)?$`);
    return FULL.some((f) => pat.test(f)) || hit(w.replace(/\*/g, ""));
  }
  for (const x of [w, squash(w)]) {
    if (STEMS.some((s) => x.startsWith(s))) return true;
    if (WHOLE.includes(x) || WHOLE.includes(x.replace(SUFFIX, ""))) return true;
  }
  return false;
}

/** True when one word (punctuation and all) is profane or abhorrent */
export function isFoul(word) {
  const raw = String(word);
  // Keep digits that stand for themselves (1488) before the look-alike swap
  if (/^1488$/.test(raw.replace(/\D/g, "")) && /\d/.test(raw)) return true;
  return hit(plain(raw));
}

/** Splits text into [text, foul?] runs, keeping every space and punctuation mark where it was */
export function splitFoul(text) {
  const parts = String(text ?? "").split(/(\s+)/).filter((p) => p !== "");
  // Word tokens with their leading and trailing punctuation set apart ("fuck!" hides "fuck", keeps "!")
  const toks = parts.map((part) => {
    if (/^\s+$/.test(part)) return { space: true, part };
    const m = part.match(/^([("'“‘[]*)(.*?)([)\]"'”’.,!?;:]*)$/s);
    const [pre, core, post] = m ? [m[1], m[2], m[3]] : ["", part, ""];
    return { space: false, part, pre, core, post, foul: !!core && isFoul(core) };
  });
  const words = toks.map((t, i) => (t.space ? null : i)).filter((i) => i !== null);
  const norm = (i) => squash(plain(toks[i].core));
  // Letters spaced out: "f u c k", "n i g g a"
  for (let a = 0; a < words.length; a++) {
    let b = a;
    while (b < words.length && /^[a-z0-9@$!*]$/i.test(toks[words[b]].core)) b++;
    if (b - a >= 3) {
      for (let s = a; s < b; s++) for (let e = b; e - s >= 3; e--) {
        if (hit(words.slice(s, e).map((i) => plain(toks[i].core)).join(""))) { for (let k = s; k < e; k++) toks[words[k]].foul = true; s = e - 1; break; }
      }
    }
    a = Math.max(a, b - 1);
  }
  // Tropes and hate phrases
  for (const ph of PHRASES) {
    for (let a = 0; a + ph.length <= words.length; a++) {
      if (ph.every((w, j) => norm(words[a + j]) === squash(w))) for (let j = 0; j < ph.length; j++) toks[words[a + j]].foul = true;
    }
  }
  // Two hidden words in a row become one block, space and all
  const out = [];
  const push = (t, f) => { if (!t) return; const last = out[out.length - 1]; if (last && last[1] === f) last[0] += t; else out.push([t, f]); };
  toks.forEach((t, i) => {
    if (t.space) { const prev = toks[i - 1], next = toks[i + 1]; push(t.part, !!(prev?.foul && next?.foul && !prev.post && !next.pre)); return; }
    if (!t.foul) { push(t.part, false); return; }
    push(t.pre, false); push(t.core, true); push(t.post, false);
  });
  return out;
}

/** The text with each foul word replaced by asterisks of the same length */
export function maskFoul(text) {
  return splitFoul(text).map(([t, f]) => (f ? t.replace(/\S/g, "*") : t)).join("");
}
