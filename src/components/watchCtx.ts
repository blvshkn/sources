// The Waivers watchlist, shared with every player sheet so the header's Watch star works wherever a sheet opens.
// App provides it (the same synced set the Waivers page reads); without a provider the star doesn't show.
import { createContext, useContext } from "react";
import { FREE_AGENTS, LEAGUE, SPECIAL_FREE_AGENTS, WEEK, lockedThisWeek, type WaiverFA } from "../data";
import { lastWeek } from "../weeks";

export interface WatchApi {
  watch: Record<string, number>;
  onWatch: (next: (w: Record<string, number>) => Record<string, number>) => void;
  onToast: (m: string) => void;
}
export const WatchCtx = createContext<WatchApi | null>(null);
export const useWatchApi = () => useContext(WatchCtx);

/** The week waivers are working on: next week once most of the list has already played (or is on bye), or on
 *  Tuesday while waivers run. Waivers' default week and the week a Watch from a player sheet is for. */
export function waiverWeek() {
  if (WEEK >= lastWeek()) return WEEK;
  const pool: WaiverFA[] = [...FREE_AGENTS, ...SPECIAL_FREE_AGENTS.filter((fa) => (LEAGUE.specialSlots ?? []).includes(fa.pos))];
  const locked = pool.filter((fa) => lockedThisWeek(fa.nfl)).length;
  const tuesday = new Date().getDay() === 2;
  return (pool.length && locked / pool.length > 0.5) || tuesday ? WEEK + 1 : WEEK;
}

/** Watch or stop watching, with the same toasts as the Waivers star. */
export function toggleWatch(api: WatchApi, p: { id: string; name: string }, target: number) {
  if (api.watch[p.id] !== undefined) { api.onWatch((w) => { const n = { ...w }; delete n[p.id]; return n; }); api.onToast(`Stopped watching ${p.name}.`); }
  else { api.onWatch((w) => ({ ...w, [p.id]: target })); api.onToast(`Watching ${p.name} for week ${target}.`); }
}
