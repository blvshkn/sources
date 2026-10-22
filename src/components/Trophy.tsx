import { LEAGUE } from "../data";
import { Tooltip } from "./Tooltip";
import { PX } from "./pixelIcons";

/** True for the team whose manager won last season. */
export const isChampion = (teamId: string) => LEAGUE?.champion?.teamId === teamId;
/** "2025 league champion", for labels. Empty when the team isn't last year's champ. */
export const championLabel = (teamId: string) => (isChampion(teamId) ? `${LEAGUE.champion!.season} league champion` : "");

/**
 * Small gold crown next to last season's league champion. The cup is kept for a matchup win (WinCup), so the
 * two never read as the same thing. Pixel, like the icon set (Oct 22).
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
  // The pixel crown (Zach, Oct 22): the old Lucide chess-king traced onto the 16 grid, rounded pixel corners like the
  // rest of the pixel set
  return <svg className="px-ic crown-px" viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: CROWN }} />;
}

const CROWN = '<path d="M10.7 4.5L13.3 4.5A0.18 0.18 0 0 1 13.5 4.68L13.5 5.32A0.18 0.18 0 0 1 13.3 5.5L10.7 5.5A0.18 0.18 0 0 1 10.5 5.32L10.5 4.68A0.18 0.18 0 0 1 10.7 4.5ZM13.5 6.32L13.5 5.68A0.18 0.18 0 0 1 13.7 5.5L14.3 5.5A0.18 0.18 0 0 1 14.5 5.68L14.5 6.32A0.18 0.18 0 0 1 14.3 6.5L13.7 6.5A0.18 0.18 0 0 1 13.5 6.32ZM2.68 4.5L5.32 4.5A0.18 0.18 0 0 1 5.5 4.68L5.5 5.32A0.18 0.18 0 0 1 5.32 5.5L2.68 5.5A0.18 0.18 0 0 1 2.5 5.32L2.5 4.68A0.18 0.18 0 0 1 2.68 4.5ZM12.5 11.5L12.5 10.7A0.18 0.18 0 0 1 12.7 10.5L13.3 10.5A0.18 0.18 0 0 1 13.5 10.7L13.5 11.5L14.3 11.5A0.18 0.18 0 0 1 14.5 11.7L14.5 14.3A0.18 0.18 0 0 1 14.3 14.5L1.68 14.5A0.18 0.18 0 0 1 1.5 14.3L1.5 11.7A0.18 0.18 0 0 1 1.68 11.5L2.5 11.5L2.5 10.7A0.18 0.18 0 0 1 2.68 10.5L3.32 10.5A0.18 0.18 0 0 1 3.5 10.7L3.5 11.5L12.5 11.5ZM14.3 10.5L13.7 10.5A0.18 0.18 0 0 1 13.5 10.3L13.5 9.68A0.18 0.18 0 0 1 13.7 9.5L14.3 9.5A0.18 0.18 0 0 1 14.5 9.68L14.5 10.3A0.18 0.18 0 0 1 14.3 10.5ZM15.5 6.68L15.5 9.32A0.18 0.18 0 0 1 15.3 9.5L14.7 9.5A0.18 0.18 0 0 1 14.5 9.32L14.5 6.68A0.18 0.18 0 0 1 14.7 6.5L15.3 6.5A0.18 0.18 0 0 1 15.5 6.68ZM2.5 13.5L13.5 13.5L13.5 12.5L2.5 12.5L2.5 13.5ZM9.5 6.32L9.5 5.68A0.18 0.18 0 0 1 9.68 5.5L10.3 5.5A0.18 0.18 0 0 1 10.5 5.68L10.5 6.32A0.18 0.18 0 0 1 10.3 6.5L9.68 6.5A0.18 0.18 0 0 1 9.5 6.32ZM8.5 6.5L9.32 6.5A0.18 0.18 0 0 1 9.5 6.68L9.5 7.32A0.18 0.18 0 0 1 9.32 7.5L6.68 7.5A0.18 0.18 0 0 1 6.5 7.32L6.5 6.68A0.18 0.18 0 0 1 6.68 6.5L7.5 6.5L7.5 3.5L6.68 3.5A0.18 0.18 0 0 1 6.5 3.32L6.5 2.68A0.18 0.18 0 0 1 6.68 2.5L7.5 2.5L7.5 1.68A0.18 0.18 0 0 1 7.68 1.5L8.32 1.5A0.18 0.18 0 0 1 8.5 1.68L8.5 2.5L9.32 2.5A0.18 0.18 0 0 1 9.5 2.68L9.5 3.32A0.18 0.18 0 0 1 9.32 3.5L8.5 3.5L8.5 6.5ZM1.5 6.68L1.5 9.32A0.18 0.18 0 0 1 1.32 9.5L0.68 9.5A0.18 0.18 0 0 1 0.5 9.32L0.5 6.68A0.18 0.18 0 0 1 0.68 6.5L1.32 6.5A0.18 0.18 0 0 1 1.5 6.68ZM1.5 10.3L1.5 9.68A0.18 0.18 0 0 1 1.68 9.5L2.32 9.5A0.18 0.18 0 0 1 2.5 9.68L2.5 10.3A0.18 0.18 0 0 1 2.32 10.5L1.68 10.5A0.18 0.18 0 0 1 1.5 10.3ZM1.68 5.5L2.32 5.5A0.18 0.18 0 0 1 2.5 5.68L2.5 6.32A0.18 0.18 0 0 1 2.32 6.5L1.68 6.5A0.18 0.18 0 0 1 1.5 6.32L1.5 5.68A0.18 0.18 0 0 1 1.68 5.5ZM5.5 6.32L5.5 5.68A0.18 0.18 0 0 1 5.68 5.5L6.32 5.5A0.18 0.18 0 0 1 6.5 5.68L6.5 6.32A0.18 0.18 0 0 1 6.32 6.5L5.68 6.5A0.18 0.18 0 0 1 5.5 6.32Z"/>';
