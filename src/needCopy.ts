// A position as a need reads in copy: "a TE", "an RB". Its own module so first-run setup can use it without Overview.
import type { Pos } from "./data";

export function needCopy(pos: Pos) {
  return pos === "TE" ? "a TE" : pos === "QB" ? "a QB" : `${pos === "RB" ? "an RB" : "a WR"}`;
}
