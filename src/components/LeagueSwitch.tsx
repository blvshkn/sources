import { createContext, useContext, type ReactNode } from "react";
import { Icon } from "./ui";
import { PlatformLogo } from "./PlatformLogo";

/** League name, format/week line and the opener for the switcher. Provided once by App. */
export const LeagueCtx = createContext<{ name: string; line: string; open: () => void } | null>(null);

/** Where a page title used to be: a slim league selector (phones), then format · week · page meta. */
export function LeagueSwitch({ title, meta }: { title: string; meta?: ReactNode }) {
  const l = useContext(LeagueCtx);
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {l && (
        <button className="page-league" onClick={l.open} aria-haspopup="dialog">
          <PlatformLogo size={20} />
          <b>{l.name}</b><span className="sr-only"> (switch league)</span>
          <Icon name="switch" size={16} />
        </button>
      )}
      <p className="page-meta">{l?.line}{meta ? <> · {meta}</> : null}</p>
    </>
  );
}
