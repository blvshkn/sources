import { createContext, useContext } from "react";
import { Icon } from "./ui";

/** League name, week/format line and the opener for the switcher. Provided once by App. */
export const LeagueCtx = createContext<{ name: string; line: string; open: () => void } | null>(null);

/** The league selector that sits where a page title used to. `title` stays for screen readers. */
export function LeagueSwitch({ title }: { title: string }) {
  const l = useContext(LeagueCtx);
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {l && (
        <button className="top-league page-league" onClick={l.open} aria-haspopup="dialog">
          <span className="top-league-n"><b>{l.name}</b><span className="sr-only"> (switch league)</span><small>{l.line}</small></span>
          <Icon name="switch" size={16} />
        </button>
      )}
    </>
  );
}
