import { splitFoul } from "../../api/_lib/censor.js";

/** One hidden word: a pixel block the width of the word, read out as "hidden word". The word itself isn't in the page. */
export function Pixelated({ n }: { n: number }) {
  return <span className="px-cens" role="img" aria-label="hidden word" style={{ ["--n" as string]: Math.min(Math.max(n, 3), 14) }} />;
}

/** Chat text with profanity, slurs and anything abhorrent pixelated (Zach, Oct 23). Everything else reads as typed. */
export function Censored({ text }: { text: string }) {
  const runs = splitFoul(text);
  if (!runs.some(([, f]) => f)) return <>{text}</>;
  return <>{runs.map(([t, f], i) => (f ? <Pixelated key={i} n={t.length} /> : t))}</>;
}

/** Text for screen readers with each hidden word spoken as "hidden word" */
export const spokenClean = (text: string) => splitFoul(text).map(([t, f]) => (f ? "hidden word" : t)).join("");
