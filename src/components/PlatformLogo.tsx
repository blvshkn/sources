import { useState } from "react";
import { LEAGUE } from "../data";

type Platform = "sleeper" | "yahoo" | "espn";
const DOMAIN: Record<Platform, string> = { sleeper: "sleeper.com", yahoo: "football.fantasysports.yahoo.com", espn: "espn.com" };
const NAME: Record<Platform, string> = { sleeper: "Sleeper", yahoo: "Yahoo", espn: "ESPN" };

/** The connected platform's own icon, shown next to its name. Uses an official logo file dropped in
 *  public/platforms/<platform>.svg when there is one, otherwise the platform's site icon. Never redrawn by us. */
export function PlatformLogo({ platform = (LEAGUE?.platform ?? "sleeper") as Platform, size = 16 }: { platform?: Platform; size?: number }) {
  const [src, setSrc] = useState(`/platforms/${platform}.svg`);
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="plat-logo mono" style={{ width: size, height: size, fontSize: size * 0.6 }} aria-hidden="true">{NAME[platform][0]}</span>;
  return (
    <img className="plat-logo" src={src} width={size} height={size} alt="" aria-hidden="true" loading="lazy" decoding="async"
      onError={() => (src.startsWith("/platforms/") ? setSrc(`https://www.google.com/s2/favicons?domain=${DOMAIN[platform]}&sz=64`) : setFailed(true))} />
  );
}

/** "Sleeper" with its logo in front. */
export const PlatformName = ({ platform, size = 16 }: { platform?: Platform; size?: number }) =>
  <span className="plat-name"><PlatformLogo platform={platform} size={size} />{NAME[platform ?? (LEAGUE?.platform ?? "sleeper") as Platform]}</span>;
