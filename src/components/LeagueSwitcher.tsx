import { useEffect, useRef, useState } from "react";
import { useBackClose } from "../backClose";
import { SleeperError, findLeagues, findUser, managerAvatar, teamAvatarIn } from "../sleeper";
import { LEAGUE, LEAGUE_NAME } from "../data";
import { Account, accountLabel } from "../accounts";
import { Icon } from "./ui";
import { usePullToDismiss } from "./sheetDrag";
import { useFocusTrap } from "./focusTrap";
import { useDismiss } from "./useDismiss";
import { PlatformLogo } from "./PlatformLogo";
import { ManagerAvatar } from "./Avatar";
import { Marked } from "./Marked";
import { SEARCH_AT } from "./Select";
import { matchPlayer, type Match } from "../search";
import { mo } from "../motion";

type Row = { id: string; name: string; teams: number; avatar?: string | null };
type Group = Row[] | { error: string } | null;

const toRows = (leagues: { league_id: string; name: string; total_rosters: number; avatar?: string | null }[]): Row[] =>
  leagues.map((l) => ({ id: l.league_id, name: l.name, teams: l.total_rosters, avatar: l.avatar }));

/** Switch between leagues on every connected Sleeper account, or connect another one, without leaving the app. */
export function LeagueSwitcher({ accounts, activeUserId, adding = false, demo, onPick, onAdd, onConnect, onClose }: {
  accounts: Account[]; activeUserId?: string; adding?: boolean; demo: boolean;
  onPick: (leagueId: string, userId: string) => void; onAdd: (a: Account) => void; onConnect: () => void; onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [groups, setGroups] = useState<Record<string, Group>>({});
  /** Each account's own Sleeper picture, by user id. */
  const [pics, setPics] = useState<Record<string, string | null>>({});
  /** Your team picture in each league, by "leagueId:userId". Fetched lazily; the personal picture shows until it lands. */
  const [teamPics, setTeamPics] = useState<Record<string, string | null>>({});
  const loadTeamPics = (userId: string, rows: Row[]) => rows.forEach((r) => {
    teamAvatarIn(r.id, userId).then((url) => setTeamPics((t) => ({ ...t, [`${r.id}:${userId}`]: url }))).catch(() => {});
  });
  const [formOpen, setFormOpen] = useState(adding && !demo);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const sheet = useRef<HTMLElement>(null);
  useFocusTrap(sheet);
  const scrim = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const close = () => {
    if (sheet.current) { sheet.current.style.transition = ""; sheet.current.style.transform = ""; }
    if (scrim.current) { scrim.current.style.transition = ""; scrim.current.style.opacity = ""; }
    setShown(false); window.setTimeout(onClose, mo(220));
  };

  const load = (userId: string) => {
    setGroups((g) => ({ ...g, [userId]: null }));
    findLeagues(userId)
      .then(({ leagues }) => { const rows = toRows(leagues); setGroups((g) => ({ ...g, [userId]: rows })); loadTeamPics(userId, rows); })
      .catch(() => setGroups((g) => ({ ...g, [userId]: { error: "Couldn't reach Sleeper. Try again in a minute." } })));
  };

  useEffect(() => {
    requestAnimationFrame(() => setShown(true));
    if (formOpen) input.current?.focus(); else closeBtn.current?.focus();
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    if (!demo) accounts.forEach((a) => {
      load(a.userId);
      findUser(a.username).then((u) => setPics((p) => ({ ...p, [a.userId]: managerAvatar(u) }))).catch(() => {});
    });
    return () => { document.body.style.overflow = prev; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bring a just-added account's leagues into view so the next step is obvious.
  useEffect(() => {
    if (!added) return;
    const el = sheet.current?.querySelector(`[data-account="${added}"]`);
    el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }, [added, accounts.length]);

  useDismiss(sheet, () => close(), { outside: false });
  useBackClose(close);
  usePullToDismiss(sheet, { scrim, onDismiss: () => close() });

  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (busy) return;
    const handle = name.trim().replace(/^@/, "");
    if (!handle) { setError("Enter a Sleeper username to find its leagues."); input.current?.focus(); return; }
    const already = (a?: Account) => { setError(`@${a?.username ?? handle} is already connected.`); input.current?.focus(); };
    const same = accounts.find((a) => a.username.toLowerCase() === handle.toLowerCase());
    if (same) { already(same); return; }
    setBusy(true); setError("");
    try {
      const u = await findUser(handle);
      if (!u) { setError(`No Sleeper account named @${handle}. It's your Sleeper username, not your email.`); setBusy(false); input.current?.focus(); return; }
      const dup = accounts.find((a) => a.userId === u.user_id);
      if (dup) { already(dup); setBusy(false); return; }
      const { leagues } = await findLeagues(u.user_id);
      if (!leagues.length) { setError(`@${handle} isn't in any NFL leagues on Sleeper this season, so there's nothing to add.`); setBusy(false); input.current?.focus(); return; }
      const acct: Account = { username: u.username || handle, userId: u.user_id, name: u.display_name || undefined, avatar: u.avatar || undefined };
      setGroups((g) => ({ ...g, [acct.userId]: toRows(leagues) }));
      loadTeamPics(acct.userId, toRows(leagues));
      setPics((p) => ({ ...p, [acct.userId]: managerAvatar(u) }));
      onAdd(acct);
      setAdded(acct.userId);
      setName(""); setFormOpen(false);
    } catch (err) {
      setError(err instanceof SleeperError ? err.message : "We couldn't reach Sleeper. Check your connection and try again.");
      input.current?.focus();
    }
    setBusy(false);
  };

  // Your team picture in that league first, then your personal picture, then the league's own picture, then initials.
  // The active league already knows its team picture, so it never flashes the personal one.
  const mark = (r: Row, a: Account) => {
    const key = `${r.id}:${a.userId}`;
    const team = key in teamPics ? teamPics[key] : r.id === LEAGUE.id && a.userId === activeUserId ? LEAGUE.userAvatar : null;
    return <ManagerAvatar src={[team, pics[a.userId], r.avatar]} name={r.name} size={40} className="lsw-av" />;
  };

  const multi = accounts.length > 1;
  // More than SEARCH_AT leagues across accounts: a search field filters them by league name or account (search.ts)
  const [q, setQ] = useState("");
  const all = accounts.flatMap((a) => { const g = groups[a.userId]; return Array.isArray(g) ? g : []; });
  const searchable = !demo && all.length > SEARCH_AT;
  const filtering = searchable && q.trim().length > 0;
  const hitFor = (r: Row, a: Account): Match | null => {
    if (!filtering) return { score: 0, marks: [] };
    const m = matchPlayer(q, r.name);
    if (m) return m;
    const b = matchPlayer(q, accountLabel(a).replace(/^@/, "")) ?? matchPlayer(q, a.username);
    return b && b.score >= 20 ? { score: b.score, marks: [] } : null;
  };
  const firstHit = () => { for (const a of accounts) { const g = groups[a.userId]; if (Array.isArray(g)) { const r = g.find((x) => hitFor(x, a)); if (r) return { r, a }; } } return null; };
  const addedAcct = accounts.find((a) => a.userId === added);

  return (
    <div className={`ps-wrap${shown ? " in" : ""}`}>
      <div ref={scrim} className="ps-scrim" onClick={close} aria-hidden="true" />
      <section ref={sheet} className="ps lsw" role="dialog" aria-modal="true" aria-labelledby="lsw-title">
        <span className="ps-handle" aria-hidden="true" />
        <header className="fb-head">
          <span><b id="lsw-title">Your leagues</b><small>{demo ? "You're exploring the demo league." : multi ? `From ${accounts.length} Sleeper accounts` : `Sleeper leagues for @${accounts[0]?.username ?? ""}`}</small></span>
          <button ref={closeBtn} className="ps-x" onClick={close} aria-label="Close"><Icon name="x" size={18} /></button>
        </header>

        {demo ? (
          <ul className="fb-list">
            <li><span className="lsw-row on"><ManagerAvatar src={LEAGUE.userAvatar} name={LEAGUE_NAME} size={40} className="lsw-av" alt="You" /><span className="lsw-n"><b>{LEAGUE_NAME}</b><small>Sample data</small></span><Icon name="check" size={18} /></span></li>
          </ul>
        ) : (
          <div className="acc-groups">
            {searchable && (
              <label className="tp-search lsw-search">
                <Icon name="search" size={16} />
                <span className="sr-only">Search your leagues</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="League or account" autoComplete="off" spellCheck={false} enterKeyHint="go"
                  onKeyDown={(e) => { if (e.key === "Enter") { const h = firstHit(); if (h) { e.preventDefault(); const on = h.r.id === LEAGUE.id && h.a.userId === activeUserId; if (!on) onPick(h.r.id, h.a.userId); close(); } } }} />
                {q && <button type="button" className="sel-search-x" aria-label="Clear search" onClick={() => setQ("")}><Icon name="x" size={14} /></button>}
              </label>
            )}
            {filtering && !firstHit() && <p className="lsw-load">{`No league matches "${q.trim()}"`}</p>}
            {accounts.map((a) => {
              const g0 = groups[a.userId];
              const g = filtering && Array.isArray(g0) ? g0.filter((r) => hitFor(r, a)) : g0;
              if (filtering && (!Array.isArray(g) || !g.length)) return null;
              const label = accountLabel(a);
              return (
                <div key={a.userId} className={`acc-group${added === a.userId ? " just-added" : ""}`} data-account={a.userId} role="group" aria-labelledby={`acc-h-${a.userId}`}>
                  <h3 className="acc-h" id={`acc-h-${a.userId}`}>
                    <ManagerAvatar src={pics[a.userId]} name={label.replace(/^@/, "")} size={18} className="tp-av acc-av" />
                    <span className="acc-h-n">{label}</span>
                    {label !== `@${a.username}` && <span className="acc-h-u">@{a.username}</span>}
                    {added === a.userId && <span className="acc-h-tag">Added</span>}
                  </h3>
                  <ul className="fb-list">
                    {g === null || g === undefined ? <li className="lsw-load">Loading leagues…</li>
                      : "error" in g ? <li className="lsw-load acc-retry">{g.error} <button className="linkish" onClick={() => load(a.userId)}>Try again</button></li>
                      : !g.length ? <li className="lsw-load">No NFL leagues on this account this season.</li>
                      : g.map((r) => {
                        const on = r.id === LEAGUE.id && a.userId === activeUserId;
                        return (
                          <li key={r.id}>
                            <button className={`lsw-row${on ? " on" : ""}`} aria-current={on ? "true" : undefined} onClick={() => { if (!on) onPick(r.id, a.userId); close(); }}>
                              {mark(r, a)}
                              <span className="lsw-n"><b><Marked name={r.name} marks={hitFor(r, a)?.marks} /></b><small>{on ? `Current league · ${r.teams} teams` : `${r.teams} teams`}</small></span>
                              {on ? <Icon name="check" size={18} /> : <Icon name="chev" size={16} />}
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        <p className="sr-only" role="status">{addedAcct ? `Added @${addedAcct.username}. Pick one of its leagues, or stay in ${LEAGUE_NAME}.` : ""}</p>
        {addedAcct && <p className="acc-note">@{addedAcct.username} is connected. Pick one of its leagues above, or stay in {LEAGUE_NAME}.</p>}

        <div className="lsw-foot">
          {demo
            ? <button className="btn btn-primary" onClick={() => { close(); onConnect(); }}><PlatformLogo size={16} />Connect Sleeper</button>
            : formOpen ? (
              <div className="acc-add">
                <label htmlFor="acc-user" className="acc-label">Another <b>Sleeper</b> username</label>
                <form className="acc-form" onSubmit={submit} noValidate>
                  <span className="at" aria-hidden="true">@</span>
                  <input id="acc-user" ref={input} value={name} onChange={(e) => { setName(e.target.value); setError(""); }} name="username"
                    aria-invalid={!!error} aria-describedby="acc-user-help" placeholder="theirname…" autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" />
                  <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Finding leagues…" : "Find leagues"}</button>
                </form>
                <p id="acc-user-help" className={error ? "acc-error" : "acc-help"} role={error ? "alert" : undefined}>
                  {error || "No password. Read only. Your current league stays open."}
                </p>
                <button className="btn btn-sm btn-ghost acc-cancel" onClick={() => { setFormOpen(false); setError(""); setName(""); }} disabled={busy}>Cancel</button>
              </div>
            ) : (
              <button className="acc-addrow" onClick={() => { setFormOpen(true); setAdded(null); window.setTimeout(() => input.current?.focus(), 0); }}>
                <span className="acc-plus"><Icon name="plus" size={18} /></span>
                <span className="lsw-n"><b>Add another Sleeper account</b><small>Username only. Your current league stays open.</small></span>
              </button>
            )}
        </div>
      </section>
    </div>
  );
}
