// A player's info line in a lineup or matchup row: position, team and opponent, kickoff. The parts sit on one line
// with a dot between them; when the line is too narrow, the kickoff shortens ("Mon 8:15p"), and only if it still can't
// fit does a part move to the next line, which never starts with a dot or an indent (meta-line.css).
import type { ReactNode } from "react";

/** "Mon 8:15 PM" to "Mon 8:15p". Anything without a time stays as it is. */
export const shortKick = (s: string) => s.replace(/\s([AP])M$/, (_, a: string) => a.toLowerCase());

/** A kickoff that shortens when its line is tight. The full time stays for screen readers either way. */
export function Kick({ when }: { when: string }) {
  const short = shortKick(when);
  if (short === when) return <>{when}</>;
  return <span className="kt"><span className="kt-l">{when}</span><span className="kt-s" aria-hidden="true">{short}</span></span>;
}

/** Splits "@ HOU · Sun 1:00 PM" (gameInAt, kickLine) into its parts, the kickoff as a Kick. */
export const gameParts = (line: string): ReactNode[] =>
  line.split(" · ").filter(Boolean).map((x, i) => (i > 0 && /\d:\d\d\s[AP]M$/.test(x) ? <Kick key={i} when={x} /> : x));

/** The parts of an info line, each its own item so the dots between them can drop at a wrap. */
export function MetaParts({ parts }: { parts: ReactNode[] }) {
  return <>{parts.filter((x) => x !== null && x !== undefined && x !== false && x !== "").map((x, i) => <span key={i} className="mp">{x}</span>)}</>;
}
