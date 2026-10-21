// What the engine's step generators yield (engine.ts askSteps, scanTrades, ...). Plain types and one helper, no UI,
// so the engine can report its progress without knowing who's watching. think.ts turns these into a trace.

/** Something a step read or touched, shown as a chip beside it: a team, a player, a feed. */
export interface Chip { label: string; kind?: "team" | "player" | "feed" | "pos"; /** The platform's own icon after the label (PlatformLogo) */ logo?: "sleeper" | "yahoo" | "espn" }

/** `{n}` in a label is replaced by the live count. `done` on an "n" event rewrites the finished label. */
export type TraceEv =
  | { t: "think"; text: string }
  | { t: "step"; doing: string; done: string; n?: number; chips?: Chip[] }
  | { t: "n"; n: number; chip?: Chip; done?: string };

export type Steps<R> = Generator<TraceEv, R, undefined>;

/** Runs a step generator straight through with no UI. The engine's plain functions (ask, findTrades...) are this. */
export function drain<R>(g: Steps<R>): R {
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}
