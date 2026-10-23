import { useState } from "react";
import { LeagueSwitch } from "./LeagueSwitch";
import { Format, FadeWeeks, Scoring, formatLabel } from "../engine";
import { LEAGUE, LEAGUE_NAME, LeagueFormat, YOU } from "../data";
import { Icon, Seg, useSticky, PageTabs } from "./ui";
import { PlatformLogo } from "./PlatformLogo";
import { DetailSheet } from "./DetailSheet";
import { HowItWorksDoc, LegalDoc } from "./About";
import { Account, accountLabel } from "../accounts";
import { SyncDevicesRow } from "./SyncDevices";
import { ManagerAvatar } from "./Avatar";
import { SyncLine } from "./SyncLine";

export type Level = "light" | "standard" | "hands";
export const PUSH_CAP: Record<Level, number> = { light: 2, standard: 5, hands: 10 };

const PLATFORMS: { name: string; how: string; when: "MVP" | "v1" | "Later" | "n/a" }[] = [
  { name: "Sleeper", how: "Username only (public, read-only API)", when: "MVP" },
  { name: "Yahoo", how: "Official sign-in on Yahoo's page (OAuth)", when: "v1" },
  { name: "ESPN", how: "League ID for public leagues; private leagues read on your device, never stored on our servers", when: "v1" },
  { name: "MyFantasyLeague", how: "Official API with access you grant", when: "Later" },
  { name: "CBS", how: "Needs a technical check", when: "Later" },
  { name: "NFL.com", how: "Not needed; leagues moved to ESPN", when: "n/a" },
];
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} className={`switch${on ? " on" : ""}`} onClick={() => onChange(!on)} aria-label={label}>
      <span />
    </button>
  );
}

/** "Member of X · Commish: Jake", or "Commish of X" when this account runs the league. Sleeper may not say. */
function leagueRole(userId: string) {
  const c = LEAGUE.commish ?? [];
  if (c.some((x) => x.userId === userId)) return `Commish of ${LEAGUE_NAME}`;
  return c.length ? `Member of ${LEAGUE_NAME} · Commish: ${c.map((x) => x.name).join(", ")}` : `Member of ${LEAGUE_NAME}`;
}

export function Settings({ username, demo, leagueFormat, onRefresh, refreshed = "", format, setFormat, level, setLevel, fade, setFade, dismissed, resetDismissed, onDisconnect, onDelete, onReplay, paused, onResume, hiddenCount, onUnhide, passed = [], onBringBack, onClearPassed, accounts = [], activeUserId = "", onRemoveAccount, onAddAccount, onSwitchLeague, syncUser = "" }: {
  username: string;
  demo: boolean;
  leagueFormat: LeagueFormat;
  onRefresh: () => void;
  /** When Sleeper's data was last read ("Refreshed 9:23 PM"), shown under the connection line */
  refreshed?: string;
  format: Format; setFormat: (f: Format) => void;
  level: Level; setLevel: (l: Level) => void;
  fade: FadeWeeks; setFade: (f: FadeWeeks) => void;
  dismissed: Record<string, number>; resetDismissed: () => void;
  onDisconnect: () => void; onDelete: () => void; onReplay: () => void;
  /** Navigates to another tab. Nothing in Settings uses it since the docs open in a sheet; kept for callers. */
  onGo?: (tab: string) => void;
  paused: { id: string; manager: string }[]; onResume: (id: string) => void;
  hiddenCount: number; onUnhide: () => void;
  /** Players you said you're not interested in. One list per league, shared by trade ideas and every waiver suggestion. */
  passed?: { id: string; name: string }[]; onBringBack?: (p: { id: string; name: string }) => void; onClearPassed?: () => void;
  accounts?: Account[]; activeUserId?: string;
  onRemoveAccount?: (userId: string) => void; onAddAccount?: () => void; onSwitchLeague?: () => void;
  /** The Sleeper user whose offers and watchlist sync, or "" in the demo */
  syncUser?: string;
}) {
  const [view, setView] = useSticky<"league" | "nudges" | "privacy" | "about">("settings.view", "league", ["league", "nudges", "privacy", "about"]);
  // How it works and the terms open over Settings (sheet on phones, modal from 768px) instead of replacing it
  const [doc, setDoc] = useState<"how" | "legal" | null>(null);
  const [confirm, setConfirm] = useState<"none" | "disconnect" | "delete">("none");
  const muted = Object.entries(dismissed).filter(([, n]) => n >= 2).map(([k]) => k);
  return (
    <>
      <header className="page-head">
        <div>
          <LeagueSwitch title="Settings" />
        </div>
      </header>

      <PageTabs value={view} onChange={setView} options={[{ v: "league", label: "League", icon: "plug" }, { v: "nudges", label: "Nudges", icon: "spark" }, { v: "privacy", label: "Privacy", icon: "lock" }, { v: "about", label: "About", icon: "app" }]} />

      {view === "league" && <>
      <section className="card settings-group">
        <h2 className="section-title">League connection</h2>
        <div className="set-row acc-conn">
          <span className="set-ic"><PlatformLogo size={20} /></span>
          <span className="grow" style={{ minWidth: 0 }}><span className="set-brandline"><b>Sleeper</b>{refreshed && <span className="small muted set-when">{refreshed}</span>}</span><SyncLine as="span" className="set-sync" idle="" /><span className="small muted" style={{ display: "block" }}>{demo ? "Not connected. You're exploring the demo league." : accounts.length > 1 ? `${LEAGUE_NAME} via @${username} · read-only` : `Connected as @${username} · ${LEAGUE_NAME} · read-only`}</span></span>
          {demo ? <button className="btn btn-sm btn-primary" onClick={onDisconnect}><PlatformLogo size={16} />Connect Sleeper</button> : (
            <span className="row wrap">
              {/* Main action on the right (Zach, Oct 23). Disconnect asks to confirm in place: Cancel, then the red
                  Disconnect in the same slot, so focus stays on it; Refresh holds its spot at the end */}
              {confirm === "disconnect"
                ? <button className="btn btn-sm btn-ghost" onClick={() => setConfirm("none")}>Cancel</button> : null}
              {confirm === "disconnect"
                ? <button className="btn btn-sm btn-danger" onClick={onDisconnect}><PlatformLogo size={16} />{accounts.length > 1 ? "Disconnect all" : "Disconnect Sleeper"}</button>
                : <button className="btn btn-sm" onClick={() => setConfirm("disconnect")}>Disconnect</button>}
              <button className="btn btn-sm" onClick={onRefresh}>Refresh</button>
            </span>
          )}
        </div>
        {demo && (
          // The demo's own account row, so the picture and the league role read the way a connected account's do
          <div className="acc-list">
            <h3 className="acc-list-h">Sleeper accounts</h3>
            <ul>
              <li className="acc-item">
                <ManagerAvatar src={[YOU.avatar]} name={YOU.name} size={36} className="acc-av" />
                <span className="acc-who"><b>Demo account</b><small>{leagueRole(YOU.id)}</small></span>
                <span className="acc-inuse">In use</span>
              </li>
            </ul>
          </div>
        )}
        {!demo && accounts.length > 0 && (
          <div className="acc-list">
            <h3 className="acc-list-h">Sleeper accounts</h3>
            <ul>
              {accounts.map((a) => {
                const label = accountLabel(a);
                const owns = a.userId === activeUserId;
                return (
                  <li key={a.userId} className="acc-item">
                    <ManagerAvatar src={owns ? [LEAGUE.userPhoto, a.avatar, LEAGUE.userAvatar] : [a.avatar]} name={a.name || a.username} size={36} className="acc-av" />
                    <span className="acc-who">
                      <b>{label}</b>
                      <small>{owns ? leagueRole(a.userId) : label !== `@${a.username}` ? `@${a.username}` : "In the league switcher"}</small>
                    </span>
                    {owns
                      ? <span className="acc-inuse">In use</span>
                      : <button className="btn btn-sm btn-ghost acc-remove" onClick={() => onRemoveAccount?.(a.userId)} aria-label={`Remove @${a.username}`}>Remove</button>}
                  </li>
                );
              })}
            </ul>
            <button className="acc-addrow" onClick={onAddAccount}>
              <span className="acc-plus"><Icon name="plus" size={18} /></span>
              <span className="lsw-n"><b>Add another Sleeper account</b><small>Username only. Your current league stays open.</small></span>
            </button>
            {accounts.length > 1 && <p className="tiny muted">To remove @{username}, switch to a league on another account first.</p>}
          </div>
        )}
        <div className="note-good"><Icon name="lock" size={16} /><span><b>No passwords, ever.</b> Source connects with your username or the platform's official sign-in. Source never asks for or stores a fantasy app password.</span></div>
        <p className="tiny muted">Next up: {PLATFORMS.filter((p) => p.when === "v1").map((p) => p.name).join(" and ")}. Later: {PLATFORMS.filter((p) => p.when !== "v1" && p.when !== "MVP" && p.when !== "n/a").map((p) => p.name).join(" and ")}.</p>
        <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={demo || !onSwitchLeague ? onReplay : onSwitchLeague}>{demo ? "Run setup again" : "Switch league"}</button>
      </section>

      <section className="card settings-group">
        <h2 className="section-title">Devices</h2>
        <SyncDevicesRow user={syncUser} demo={demo} />
      </section>

      <section className="card settings-group">
        <h2 className="section-title">League format</h2>
        <div className="set-row">
          <span className="grow"><b>Scoring</b><span className="small muted" style={{ display: "block" }}>{demo ? "Changes every projection, need and trade." : `Your league is set to ${formatLabel(leagueFormat)}. Changing it here only changes how Source scores.`}</span></span>
          <Seg<Scoring> label="Scoring" value={format.scoring} onChange={(v) => setFormat({ ...format, scoring: v })}
            options={[{ v: "ppr", label: "PPR" }, { v: "half", label: "Half" }, { v: "std", label: "Standard" }]} />
        </div>
        <div className="set-row">
          <span className="grow"><b>Superflex</b><span className="small muted" style={{ display: "block" }}>Adds a slot any QB, RB, WR or TE can fill.</span></span>
          <Toggle label="Superflex" on={format.superflex} onChange={(v) => setFormat({ ...format, superflex: v })} />
        </div>
        <div className="set-row">
          <span className="grow"><b>TE Premium</b><span className="small muted" style={{ display: "block" }}>+0.5 per TE reception.</span></span>
          <Toggle label="TE Premium" on={format.tePremium} onChange={(v) => setFormat({ ...format, tePremium: v })} />
        </div>
        <p className="tiny muted">{demo ? "Demo projections are PPR. Half, Standard and TE Premium use estimated receptions by position." : "Projections come from Sleeper for every scoring type. TE Premium adds half a point per projected TE reception."} Trade values: {LEAGUE.valueSource}.</p>
      </section>
      </>}

      {view === "nudges" && <>
      <section className="card settings-group">
        <h2 className="section-title">Nudges</h2>
        <div className="set-row">
          <span className="grow"><b>Nudge level</b><span className="small muted" style={{ display: "block" }}>Up to {PUSH_CAP[level]} push notifications a week. In-app nudges stay inline and never block a screen.</span></span>
          <Seg<Level> label="Nudge level" value={level} onChange={setLevel}
            options={[{ v: "light", label: "Light" }, { v: "standard", label: "Standard" }, { v: "hands", label: "Hands-on" }]} />
        </div>
        <ul className="small level-list">
          <li><b>Light:</b> the two most important nudges, lineup and offer alerts. No tips.</li>
          <li><b>Standard:</b> top nudges, roster tag suggestions, and live builder tips.</li>
          <li><b>Hands-on:</b> everything, including patterns and stale-tag checks.</li>
        </ul>
        <div className="set-row">
          <span className="grow"><b>What Source learned</b><span className="small muted" style={{ display: "block" }}>{muted.length ? `Showing fewer: ${muted.join(", ")} nudges.` : "Tap \"Not useful\" on a nudge and Source shows fewer like it."}</span></span>
          {muted.length > 0 && <button className="btn btn-sm" onClick={resetDismissed}>Reset</button>}
        </div>
        <div className="set-row ps-set">
          <span className="grow"><b>Players you passed on</b><span className="small muted" style={{ display: "block" }}>{passed.length ? "Source won't suggest them in trade ideas, waiver picks or nudges. They still show on Waivers, dimmed." : "Tap \"Not interested\" on any suggestion and Source stops suggesting him."}</span></span>
          {passed.length > 1 && onClearPassed && <button className="btn btn-sm" onClick={onClearPassed}>Clear all</button>}
        </div>
        {passed.length > 0 && (
          <ul className="ps-list" aria-label="Players you passed on">
            {passed.map((p) => (
              <li key={p.id}><span>{p.name}</span>{onBringBack && <button className="btn btn-sm" onClick={() => onBringBack(p)} aria-label={`Bring back ${p.name}`}>Bring back</button>}</li>
            ))}
          </ul>
        )}
        <div className="set-row">
          <span className="grow"><b>Trade ideas you passed on</b><span className="small muted" style={{ display: "block" }}>{hiddenCount ? `${hiddenCount} hidden after you said they won't work.` : "Tap \"Won't work\" on a trade idea to tell Source why."}</span></span>
          {hiddenCount > 0 && <button className="btn btn-sm" onClick={onUnhide}>Show again</button>}
        </div>
        {paused.map((p) => (
          <div key={p.id} className="set-row">
            <span className="grow"><b>Paused: {p.manager}</b><span className="small muted" style={{ display: "block" }}>No trade ideas with {p.manager} until you turn them back on.</span></span>
            <button className="btn btn-sm" onClick={() => onResume(p.id)}>Resume</button>
          </div>
        ))}
        <p className="tiny muted">Nudges line up with real deadlines: waivers, lineup lock, and the trade deadline.</p>
      </section>

      <section className="card settings-group">
        <h2 className="section-title">Intent tags</h2>
        <div className="set-row">
          <span className="grow"><b>Tags fade after</b><span className="small muted" style={{ display: "block" }}>Interest changes week to week. Faded tags stop filtering suggestions until you confirm them.</span></span>
          <Seg label="Tag fade" value={String(fade) as "2" | "4" | "6"} onChange={(v) => setFade(Number(v) as FadeWeeks)}
            options={[{ v: "2", label: "2 wks" }, { v: "4", label: "4 wks" }, { v: "6", label: "6 wks" }]} />
        </div>
      </section>
      </>}

      {view === "privacy" && <>
      <section className="card settings-group">
        <h2 className="section-title">Privacy and trust</h2>
        <ul className="trust">
          <li><b>No passwords, ever.</b> Your Sleeper username is all it takes.</li>
          <li><b>Tags are private.</b> What you note about a league mate is never shown to them.</li>
          <li><b>Collect the minimum.</b> No email, no account. Rosters are public on Sleeper already.</li>
          <li><b>Synced lists stay yours.</b> Sent offers and starred players sync only to devices you pair with a one-time code. Your Sleeper ids alone can't read them.</li>
          <li><b>AI sees the league, not your notes.</b> Ask and Set optimal lineup send league data to Anthropic. Tags stay here.</li>
          <li><b>Questions without names.</b> Source keeps questions to improve answers, with names stripped and nothing tied to you.</li>
          <li><b>One tap to leave.</b> Disconnect, or delete your data, any time.</li>
          <li><b>No selling data.</b> Said plainly in the privacy policy.</li>
          <li><b>Show our work.</b> Every verdict explains why, and every value shows when it last changed.</li>
          <li><b>Nothing sends on its own.</b> Source preps the message. You tap send.</li>
        </ul>
        <div className="set-row danger-row">
          <span className="grow"><b>Delete your data</b><span className="small muted" style={{ display: "block" }}>Removes your connection, tags, prices and history from this device, plus your synced offers, watchlist and sync key. Paired devices stop syncing. This can't be undone.</span></span>
          {confirm === "delete" ? (
            <span className="row"><button className="btn btn-sm btn-ghost" onClick={() => setConfirm("none")}>Cancel</button><button className="btn btn-sm btn-danger" onClick={onDelete}><Icon name="trash" size={14} />Delete my data</button></span>
          ) : <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirm("delete")}>Delete my data</button>}
        </div>
      </section>
      </>}

      {view === "about" && <>
      <section className="card settings-group">
        <h2 className="section-title">About Source</h2>
        <button className="set-link" aria-haspopup="dialog" onClick={() => setDoc("how")}><span className="grow"><b>How Source works</b><span className="small muted">Where the data comes from and what goes into each number</span></span><Icon name="chev" size={16} /></button>
        <button className="set-link" aria-haspopup="dialog" onClick={() => setDoc("legal")}><span className="grow"><b>Terms and legal</b><span className="small muted">Terms of use, privacy, and names, images and likenesses</span></span><Icon name="chev" size={16} /></button>
      </section>
      </>}
      {doc && (
        <DetailSheet className="doc-sheet" onClose={() => setDoc(null)} title={<h2 className="ds-h">{doc === "how" ? "How Source works" : "Terms and legal"}</h2>}>
          <article className="doc">{doc === "how" ? <HowItWorksDoc /> : <LegalDoc dated />}</article>
        </DetailSheet>
      )}
    </>
  );
}
