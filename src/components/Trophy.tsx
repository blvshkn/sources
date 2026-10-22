import { LEAGUE } from "../data";
import { Tooltip } from "./Tooltip";
import { useIconStroke } from "./iconStroke";
import { PX } from "./pixelIcons";

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
  // The pixel trophy (Zach, Oct 22), the same one the icon set uses
  const [box, html] = PX.trophy;
  return <svg className="px-ic" viewBox={box} width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Crown({ size }: { size: number }) {
  const stroke = useIconStroke(size);
  return (
    <svg ref={stroke.ref} style={stroke.style} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke.strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Lucide chess-king (ISC) */}
      <path d="M4 20a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="m6.7 18-1-1C4.35 15.682 3 14.09 3 12a5 5 0 0 1 4.95-5c1.584 0 2.7.455 4.05 1.818C13.35 7.455 14.466 7 16.05 7A5 5 0 0 1 21 12c0 2.082-1.359 3.673-2.7 5l-1 1" />
      <path d="M10 4h4" />
      <path d="M12 2v6.818" />
    </svg>
  );
}
