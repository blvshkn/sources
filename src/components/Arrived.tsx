import type { ReactNode } from "react";
import { useArrived } from "../motionOnce";

/** Renders its children only while `on`, and tells them whether this is the render where the state was newly reached
 *  (first arrival this visit, or it just turned true). Stays mounted while off, so it sees the state go false. */
export function Arrived({ k, on, children }: { k: string; on: boolean; children: (play: boolean) => ReactNode }) {
  const play = useArrived(k, on);
  return on ? <>{children(play)}</> : null;
}
