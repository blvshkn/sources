import { WEEK } from "../data";
import { lastWeek } from "../weeks";
import { Icon } from "./icons";

/** Small label under "Week N": where that week sits relative to now. */
export const weekLabel = (w: number) => (w === WEEK ? "This week" : w === WEEK + 1 ? "Next week" : w < WEEK ? "Final" : "Projected");

/** Prev / next week control shared by the Lineup list and the Start / Sit compare. */
export function WeekStepper({ week, onChange, min = 1, className = "" }: { week: number; onChange: (w: number) => void; min?: number; className?: string }) {
  const max = lastWeek();
  return (
    <div className={`lu-weeknav ${className}`.trim()}>
      <button className="btn btn-icon btn-sm" aria-label="Previous week" disabled={week <= min} onClick={() => onChange(week - 1)}><Icon name="chev" size={18} /></button>
      <span className="lu-weeknav-lbl" aria-live="polite"><b>Week {week}</b><span className="tiny muted">{weekLabel(week)}</span></span>
      <button className="btn btn-icon btn-sm" aria-label="Next week" disabled={week >= max} onClick={() => onChange(week + 1)}><Icon name="chev" size={18} /></button>
    </div>
  );
}
