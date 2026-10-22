import { useState } from "react";
import { LEAGUE } from "../data";

type Platform = "sleeper" | "yahoo" | "espn";
const DOMAIN: Record<Platform, string> = { sleeper: "sleeper.com", yahoo: "football.fantasysports.yahoo.com", espn: "espn.com" };
const NAME: Record<Platform, string> = { sleeper: "Sleeper", yahoo: "Yahoo", espn: "ESPN" };
/** Platforms with an official logo file in public/platforms. None yet, so nothing asks for a file that isn't there (a 404 on every load). */
const LOCAL = new Set<Platform>();
const favicon = (p: Platform) => `https://www.google.com/s2/favicons?domain=${DOMAIN[p]}&sz=64`;

/** The connected platform's own icon, shown next to its name. Uses an official logo file dropped in
 *  public/platforms/<platform>.svg when there is one, otherwise the platform's site icon. Never redrawn by us. */
export function PlatformLogo({ platform = (LEAGUE?.platform ?? "sleeper") as Platform, size = 16 }: { platform?: Platform; size?: number }) {
  const [src, setSrc] = useState(LOCAL.has(platform) ? `/platforms/${platform}.svg` : favicon(platform));
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="plat-logo mono" style={{ width: size, height: size, fontSize: size * 0.6 }} aria-hidden="true">{NAME[platform][0]}</span>;
  return (
    <img className="plat-logo" src={src} width={size} height={size} alt="" aria-hidden="true" loading="lazy" decoding="async"
      onError={() => (src.startsWith("/platforms/") ? setSrc(favicon(platform)) : setFailed(true))} />
  );
}

/** "Sleeper" with its logo in front. */
export const PlatformName = ({ platform, size = 16 }: { platform?: Platform; size?: number }) =>
  <span className="plat-name"><PlatformLogo platform={platform} size={size} />{NAME[platform ?? (LEAGUE?.platform ?? "sleeper") as Platform]}</span>;
