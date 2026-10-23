import Filter from "bad-words";
import { maskFoul } from "../../api/_lib/censor.js";

// Bad words in the Ask chat (Zach, Oct 23): only the bad words are hidden, blurred out on black, everything else reads
// as typed. A word is bad when the bad-words list flags it, or when our own list does (api/_lib/censor.js: slurs,
// racist tropes and odd spellings like f u c k, n****r, 5h1t).
const filter = new Filter();
const badWord = (w: string) => { const c = w.replace(/[^a-zA-Z]/g, ""); return !!c && filter.isProfane(c); };

/** One hidden word, blurred on black. Screen readers hear "hidden word"; copying it pastes a friendly word instead. */
export function Pixelated({ word }: { word: string }) {
  return <span className="px-cens" role="img" aria-label="hidden word"><span aria-hidden="true">{word}</span></span>;
}

/** Each word of `text` with its hidden parts marked, worked out against the whole sentence (so phrases and spaced out
 *  letters are caught). Spaces come back as their own entries. */
export function cleanWords(text: string): ({ t: string; hide: boolean }[])[] {
  const words = text.split(/(\s+)/);
  const masked = maskFoul(text).split(/(\s+)/);
  return words.map((w, i) => {
    if (/^\s*$/.test(w)) return [{ t: w, hide: false }];
    if (badWord(w)) return [{ t: w, hide: true }];
    const m = masked[i] ?? w;
    if (m === w) return [{ t: w, hide: false }];
    const out: { t: string; hide: boolean }[] = [];
    for (let c = 0; c < w.length; c++) {
      const hide = m[c] === "*";
      const last = out[out.length - 1];
      if (last && last.hide === hide) last.t += w[c]; else out.push({ t: w[c], hide });
    }
    return out;
  });
}

/** Chat text with only its bad words hidden */
export function Censored({ text }: { text: string }) {
  const words = cleanWords(text);
  if (!words.some((w) => w.some((r) => r.hide))) return <>{text}</>;
  return <>{words.flatMap((w, i) => w.map((r, j) => (r.hide ? <Pixelated key={`${i}-${j}`} word={r.t} /> : r.t)))}</>;
}

/** Text for screen readers with each hidden word spoken as "hidden word" */
export const spokenClean = (text: string) =>
  cleanWords(text).map((w) => w.map((r) => (r.hide ? "hidden word" : r.t)).join("")).join("");

// ---- Copying (Zach, Oct 23): a bad word copied out of the chat pastes as a friendly one ----
const SWAPS: [RegExp, string][] = [
  [/^(?:f|ph)[^a-z]*u?[^a-z]*(?:c|k|q)/i, "fudge"], [/^s[^a-z]*h[^a-z]*[i1!*]?[^a-z]*t/i, "shoot"], [/^damn|^goddamn/i, "darn"],
  [/^hell$/i, "heck"], [/^b[^a-z]*[i1!*]?[^a-z]*t?[^a-z]*ch/i, "buddy"], [/^(?:ass|arse)/i, "rear"], [/^crap/i, "crud"],
];
const swapFor = (w: string) => {
  const word = (SWAPS.find(([re]) => re.test(w.replace(/^[^a-z0-9]+/i, "")))?.[1]) ?? "friend";
  return /^[A-Z]/.test(w.replace(/^[^a-z]+/i, "")) ? word[0].toUpperCase() + word.slice(1) : word;
};
/** The text with every hidden word swapped for a friendly one */
export const friendly = (text: string) =>
  cleanWords(text).map((w) => w.map((r) => (r.hide ? swapFor(r.t) : r.t)).join("")).join("");

if (typeof document !== "undefined") {
  document.addEventListener("copy", (e) => {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !e.clipboardData) return;
    // Only text from the chat, where hidden words can show
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
    if (!el?.closest("[class*=\"ask\"]") && !el?.querySelector(".px-cens")) return;
    const frag = sel.getRangeAt(0).cloneContents();
    frag.querySelectorAll(".sr-only").forEach((n) => n.remove());
    const text = frag.textContent ?? "";
    const clean = friendly(text);
    if (clean === text) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", clean);
  });
}
