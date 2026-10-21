import { LEAGUE } from "../data";
import { Tooltip } from "./Tooltip";
import { useIconStroke } from "./iconStroke";

/** True for the team whose manager won last season. */
export const isChampion = (teamId: string) => LEAGUE?.champion?.teamId === teamId;
/** "2025 league champion", for labels. Empty when the team isn't last year's champ. */
export const championLabel = (teamId: string) => (isChampion(teamId) ? `${LEAGUE.champion!.season} league champion` : "");

/**
 * Small gold crown next to last season's league champion. The cup is kept for a matchup win (WinCup), so the
 * two never read as the same thing. Sources line family, with a soft fill in the crown so it reads at 11 to 13px.
 */
export function Trophy({ teamId, size = 15, focusable = false }: { teamId: string; size?: number; focusable?: boolean }) {
  const label = championLabel(teamId);
  if (!label) return null;
  return (
    <Tooltip content={<><span className="num">{LEAGUE.champion!.season}</span> league champion</>} focusable={focusable}>
      <span className="trophy crown" role="img" aria-label="Last season's league champion"><Crown size={size} /></span>
    </Tooltip>
  );
}

/** The same cup on the side that won a final matchup (the face-off). Decorative: the card's label says who won. */
export function WinCup({ size = 16 }: { size?: number }) {
  return <span className="trophy fo-won" aria-hidden="true"><Cup size={size} /></span>;
}

function Cup({ size }: { size: number }) {
  const stroke = useIconStroke(size);
  return (
    <svg ref={stroke.ref} style={stroke.style} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke.strokeWidth} strokeLinecap="butt" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.5 4h9v4.8a4.5 4.5 0 0 1-9 0z" fill="currentColor" fillOpacity="0.22" />
      <path d="M7.5 6H5.2a.7.7 0 0 0-.7.8 3.6 3.6 0 0 0 3.4 3.1M16.5 6h2.3a.7.7 0 0 1 .7.8 3.6 3.6 0 0 1-3.4 3.1" />
      <path d="M12 13.3v3.2M8.5 20h7M10 16.5h4l.6 3.5H9.4z" />
    </svg>
  );
}

function Crown({ size }: { size: number }) {
  const stroke = useIconStroke(size);
  return (
    <svg ref={stroke.ref} style={stroke.style} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke.strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 17.5 3.6 8.4l4.9 3.8L12 6l3.5 6.2 4.9-3.8-.9 9.1z" fill="currentColor" fillOpacity="0.22" />
      <path d="M5 20.5h14" />
    </svg>
  );
}
