import { createContext, useContext, useState } from "react";
import { Player } from "../data";
import { sleeperId, teamColors, useJerseys } from "../jersey";
import { avatarSrc } from "../sleeper";

// Headshots and team marks come from Sleeper's image CDN, keyed by the same ids as the API.
const headshot = (id: string) => `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`;
/** Sleeper's full-size headshot, for big placements (the player header); falls back to the thumb if it fails */
const headshotHi = (id: string) => `https://sleepercdn.com/content/nfl/players/${id}.jpg`;
export const teamLogo = (team: string) => `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`;
/** ESPN's 500px team marks, for big placements (the player header) where Sleeper's small logo goes soft. ESPN spells
 *  Washington "wsh"; every other code matches. Callers fall back to teamLogo if it fails to load. */
export const teamLogoHi = (team: string) => `https://a.espncdn.com/i/teamlogos/nfl/500/${team === "WAS" ? "wsh" : team.toLowerCase()}.png`;
const isTeam = (id: string) => /^[A-Z]{2,3}$/.test(id);
const initials = (name: string) => name.replace(/\b(Jr|Sr|II|III|IV)\.?$/i, "").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/** Set false to show initials only, with no headshots or team marks (the public landing uses this, so no player likeness or NFL marks are used in marketing). */
export const AvatarPhotos = createContext(true);

/** Player headshot with a team badge, or a team mark for defenses. Falls back to initials in team colors. */
export function Avatar({ p, size = 40, ring, badge = true, cut = false }: { p: Pick<Player, "id" | "name" | "nfl">; size?: number; ring?: "warn" | "bad"; badge?: boolean; text?: string;
  /** Sheets and modals: a large cutout headshot (no circle, fading out at the bottom, the full-size photo). Its box
   *  size comes from CSS (headshots.css) so every sheet shows heads at the same optical size. */
  cut?: boolean }) {
  useJerseys();
  const photos = useContext(AvatarPhotos);
  const [failed, setFailed] = useState(false);
  const [hiFailed, setHiFailed] = useState(false);
  const hi = (cut || size >= 80) && !hiFailed;
  const [logoFailed, setLogoFailed] = useState(false);
  const [c1, c2] = teamColors(p.nfl);
  const team = isTeam(p.id);
  const sid = team ? undefined : sleeperId(p);
  const showPhoto = photos && !team && sid && !failed;
  const showTeamMark = photos && team && !logoFailed;
  return (
    <span className={`av${ring ? ` ring-${ring}` : ""}${team ? " av-team" : ""}${cut && showPhoto ? " av-cut" : ""}`} style={{ width: size, height: size, ["--team" as string]: c1 }} role="img" aria-label={team ? `${p.nfl} defense` : p.name}>
      {showPhoto ? (
        <img className="av-photo" src={hi ? headshotHi(sid!) : headshot(sid!)} alt="" loading="lazy" decoding="async" width={size} height={size} onError={() => (hi ? setHiFailed(true) : setFailed(true))} />
      ) : showTeamMark ? (
        <img className="av-logo" src={teamLogo(p.nfl)} alt="" loading="lazy" decoding="async" onError={() => setLogoFailed(true)} />
      ) : (
        <span className="av-initials" style={{ background: c1, color: c2, fontSize: size * 0.36 }}>{team ? p.nfl : initials(p.name)}</span>
      )}
      {photos && badge && !team && p.nfl && p.nfl !== "FA" && (
        <span className="av-badge" style={{ width: size * 0.5, height: size * 0.5 }}>
          <img src={teamLogo(p.nfl)} alt="" loading="lazy" decoding="async" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }} />
        </span>
      )}
    </span>
  );
}

const nameInitials = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/** A manager, account or league picture from Sleeper (a URL or an avatar id, or a list to try in order).
 *  Initials when there's none, when photos are off, or when every image fails, so a broken URL never leaves an empty circle.
 *  Photos off only drops Sleeper's images: our own files (the demo league's managers, under /demo/) still show.
 *  alt stays empty when the name is printed beside the picture; pass the manager's name when it isn't. */
export function ManagerAvatar({ src, name, size = 40, className = "tp-av", alt = "" }: { src?: string | null | (string | null | undefined)[]; name: string; size?: number; className?: string; alt?: string }) {
  const photos = useContext(AvatarPhotos);
  const [failed, setFailed] = useState<string[]>([]);
  const url = (Array.isArray(src) ? src : [src]).map((v) => avatarSrc(v)).find((u): u is string => !!u && !failed.includes(u) && (photos || (u.startsWith("/") && !u.startsWith("//"))));
  const style = { width: size, height: size };
  return url
    ? <img className={className} style={style} src={url} alt={alt} width={size} height={size} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed((f) => [...f, url])} />
    : <span className={`${className} tp-av-ini`} style={{ ...style, fontSize: size * 0.36 }} aria-hidden="true">{nameInitials(name)}</span>;
}
