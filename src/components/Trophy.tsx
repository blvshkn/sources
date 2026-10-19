import { LEAGUE } from "../data";
import { Tooltip } from "./Tooltip";

/** True for the team whose manager won last season. */
export const isChampion = (teamId: string) => LEAGUE?.champion?.teamId === teamId;
/** "2025 league champion", for labels. Empty when the team isn't last year's champ. */
export const championLabel = (teamId: string) => (isChampion(teamId) ? `${LEAGUE.champion!.season} league champion` : "");

/**
 * Small gold cup next to last season's champion. Drawn in the Sources line family: 1.6px stroke,
 * flat ends, round joins, with a soft fill in the bowl so it still reads at 13px.
 */
export function Trophy({ teamId, size = 15, focusable = false }: { teamId: string; size?: number; focusable?: boolean }) {
  const label = championLabel(teamId);
  if (!label) return null;
  return (
    <Tooltip content={<><span className="num">{LEAGUE.champion!.season}</span> league champion</>} focusable={focusable}>
      <span className="trophy" role="img" aria-label="Last season's champion">
        <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="butt" strokeLinejoin="round" aria-hidden="true">
          <path d="M7.5 4h9v4.8a4.5 4.5 0 0 1-9 0z" fill="currentColor" fillOpacity="0.22" />
          <path d="M7.5 6H5.2a.7.7 0 0 0-.7.8 3.6 3.6 0 0 0 3.4 3.1M16.5 6h2.3a.7.7 0 0 1 .7.8 3.6 3.6 0 0 1-3.4 3.1" />
          <path d="M12 13.3v3.2M8.5 20h7M10 16.5h4l.6 3.5H9.4z" />
        </svg>
      </span>
    </Tooltip>
  );
}
