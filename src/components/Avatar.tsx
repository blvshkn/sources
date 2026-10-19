import { createContext, useContext, useState } from "react";
import { Player } from "../data";
import { sleeperId, teamColors, useJerseys } from "../jersey";

// Headshots and team marks come from Sleeper's image CDN, keyed by the same ids as the API.
const headshot = (id: string) => `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`;
export const teamLogo = (team: string) => `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`;
const isTeam = (id: string) => /^[A-Z]{2,3}$/.test(id);
const initials = (name: string) => name.replace(/\b(Jr|Sr|II|III|IV)\.?$/i, "").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/** Set false to show initials only, with no headshots or team marks (the public landing uses this, so no player likeness or NFL marks are used in marketing). */
export const AvatarPhotos = createContext(true);

/** Player headshot with a team badge, or a team mark for defenses. Falls back to initials in team colors. */
export function Avatar({ p, size = 40, ring, badge = true }: { p: Pick<Player, "id" | "name" | "nfl">; size?: number; ring?: "warn" | "bad"; badge?: boolean; text?: string }) {
  useJerseys();
  const photos = useContext(AvatarPhotos);
  const [failed, setFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [c1, c2] = teamColors(p.nfl);
  const team = isTeam(p.id);
  const sid = team ? undefined : sleeperId(p);
  const showPhoto = photos && !team && sid && !failed;
  const showTeamMark = photos && team && !logoFailed;
  return (
    <span className={`av${ring ? ` ring-${ring}` : ""}${team ? " av-team" : ""}`} style={{ width: size, height: size, ["--team" as string]: c1 }} role="img" aria-label={team ? `${p.nfl} defense` : p.name}>
      {showPhoto ? (
        <img className="av-photo" src={headshot(sid!)} alt="" loading="lazy" decoding="async" width={size} height={size} onError={() => setFailed(true)} />
      ) : showTeamMark ? (
        <img className="av-logo" src={teamLogo(p.nfl)} alt="" loading="lazy" decoding="async" onError={() => setLogoFailed(true)} />
      ) : (
        <span className="av-initials" style={{ background: c1, color: c2, fontSize: size * 0.36 }}>{team ? p.nfl : initials(p.name)}</span>
      )}
      {photos && badge && !team && p.nfl && p.nfl !== "FA" && (
        <span className="av-badge" style={{ width: size * 0.42, height: size * 0.42 }}>
          <img src={teamLogo(p.nfl)} alt="" loading="lazy" decoding="async" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }} />
        </span>
      )}
    </span>
  );
}
