/** Sync error and recovery (approved Oct 22, motion-picks.html "Sync error and recovery"). Where the app says when it
 *  last read Sleeper (the sidebar's footer, Settings' connection row). A failed sync shouldn't feel broken: the icon
 *  gives one small nudge, the line morphs to say what happened, and Retry sits right there. When it works again the
 *  line morphs to "Synced just now" with a check. Until anything changes it's the plain line it always was. */
import { Morph } from "../gameDayMotion";
import { retrySync, useSyncHealth } from "../syncHealth";
import { ago } from "../sentOffers";
import { useNow } from "./SentOffers";
import { Icon } from "./ui";

export function SyncLine({ idle, className = "", as: Tag = "p" }: { idle: string; className?: string; as?: "p" | "span" }) {
  const h = useSyncHealth();
  const now = useNow();
  if (h.n === 0) return idle ? <Tag className={className}>{idle}</Tag> : null;
  const text = h.state === "err" ? "Couldn't reach Sleeper. Your last sync is still here." : h.state === "syncing" ? "Syncing with Sleeper…" : `Synced ${ago(h.at, now)}`;
  return (
    <Tag className={`${className} nm-sync is-${h.state}`.trim()} role="status">
      {/* Keyed on the change, so the nudge plays once each time it fails, never on a re-render */}
      <span key={h.n} className="nm-sync-ic" aria-hidden="true"><Icon name={h.state === "err" ? "alert" : h.state === "syncing" ? "clock" : "check"} size={14} /></span>
      <span className="nm-sync-t"><Morph k={text}>{text}</Morph></span>
      {h.state !== "ok" && <button type="button" className="nm-sync-retry" disabled={h.state === "syncing"} onClick={() => void retrySync()}>Retry</button>}
    </Tag>
  );
}
