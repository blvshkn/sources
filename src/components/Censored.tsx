import { maskFoul, splitFoul } from "../../api/_lib/censor.js";

/** One hidden word: a pixel block the width of the word, read out as "hidden word". The word itself isn't in the page. */
export function Pixelated({ n }: { n: number }) {
  return <span className="px-cens" role="img" aria-label="hidden word" style={{ ["--n" as string]: Math.min(Math.max(n, 3), 24) }} />;
}

/** Chat text with profanity, slurs, racist terms and tropes, and anything abhorrent pixelated (Zach, Oct 23).
 *  Everything else reads as typed. */
export function Censored({ text }: { text: string }) {
  const runs = splitFoul(text);
  if (!runs.some(([, f]) => f)) return <>{text}</>;
  return <>{runs.map(([t, f], i) => (f ? <Pixelated key={i} n={t.length} /> : t))}</>;
}

/** For text shown a word at a time (the streaming answer): each word of `text` with its hidden letters already worked
 *  out against the whole sentence, so phrases and spaced-out letters ("f u c k") are caught too. */
export function cleanWords(text: string): ({ t: string; hide: boolean }[])[] {
  const words = text.split(/(\s+)/);
  const masked = maskFoul(text).split(/(\s+)/);
  return words.map((w, i) => {
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

/** Text for screen readers with each hidden word spoken as "hidden word" */
export const spokenClean = (text: string) => splitFoul(text).map(([t, f]) => (f ? "hidden word" : t)).join("");
