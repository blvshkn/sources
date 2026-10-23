/** A player handed to the Lineup's Compare from somewhere else (Zach, Oct 23: Compare from his sheet on Overview should
 *  open with him already picked). Set right before going to roster:compare; Lineup reads it once and clears it. */
let seed: string | undefined;
export const requestCompare = (id: string) => { seed = id; };
export const takeCompare = (): string | undefined => { const s = seed; seed = undefined; return s; };
