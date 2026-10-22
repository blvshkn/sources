import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { MyTag, LEAGUE, setLeague, demoLeague, leagueKey } from "./data";
import { loadLeague } from "./sleeper";
import { installIconTooltips } from "./tooltips";
import { Boot } from "./components/Boot";
import { IDLE, tracer, type TraceState } from "./think";
import { Mark } from "./components/Logo";
import type { FirstRunStart } from "./components/FirstRun";
import { Landing } from "./components/Landing";
import { clearAskHandoff, clearHandoff } from "./demoHandoff";
import { FirstRun, preloadFirstRun, warmFirstRun } from "./components/lazy";
import { Account, Session, accountsOf, activeAccount, mergeAccounts, normalizeSession } from "./accounts";
import { enterApp } from "./sectionEnter";
import { store, usePersist } from "./persist";

export type { Session };

// The signed-in app (the shell, every section, its sheets and its stylesheets) is its own chunk, so the landing
// never downloads or parses it. The loading screen covers the moment it takes to arrive.
const loadShell = () => import("./Shell");
const Shell = lazy(() => loadShell().then((m) => ({ default: m.Shell })));
const PullRefresh = lazy(() => loadShell().then((m) => ({ default: m.PullRefresh })));
/** Start fetching the app chunk now (a saved session, or someone heading into the app). Safe to call often. */
let shellAsked = false;
const prefetchShell = () => { if (shellAsked) return; shellAsked = true; loadShell().catch(() => { shellAsked = false; }); };
// A saved session opens straight into the app: ask for its chunk while React is still starting up
if (store.get<{ mode?: string }>("session", { mode: "none" }).mode !== "none") prefetchShell();

/** Session wrapper: picks demo or live Sleeper, loads the league, runs first-run setup. */
export default function App() {
  useEffect(() => installIconTooltips(), []);
  // Older single-account sessions are rewritten into the accounts list on first read, so nobody is signed out.
  const [session, setSession] = usePersist<Session>("session", { mode: "none" }, normalizeSession);
  // First-run setup loads in its own chunk; on the landing, fetch it once the page is idle (components/lazy.tsx).
  // Anyone signed in, or on their way in, gets the app chunk fetched too.
  const [start, setStart] = useState<FirstRunStart | null>(null);
  useEffect(() => { if (session.mode === "none") preloadFirstRun(); }, [session.mode]);
  // A hover over a control, a tap or a focus on the landing warms first-run setup, stylesheets included
  useEffect(() => {
    if (session.mode !== "none") return;
    const onOver = (e: Event) => { if ((e.target as Element | null)?.closest?.("button, input, a, summary")) warm(); };
    const warm = () => { off(); warmFirstRun(); };
    const off = () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerdown", warm);
      document.removeEventListener("focusin", warm);
    };
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("pointerdown", warm, { passive: true });
    document.addEventListener("focusin", warm);
    return off;
  }, [session.mode]);
  useEffect(() => { if (session.mode !== "none" || start) prefetchShell(); }, [session.mode, start]);
  const [reloadTick, setReloadTick] = useState(0);
  const liveKey = session.mode === "live" ? `${session.userId}:${session.leagueId}` : session.mode;
  const [status, setStatus] = useState<"loading" | "ready" | "error">(session.mode === "live" ? "loading" : "ready");
  const [step, setStep] = useState("Loading your league");
  // The league load's real steps (each Sleeper and FantasyCalc fetch), shown under the logo while it loads
  const [bootTrace, setBootTrace] = useState<TraceState>(IDLE);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [initialMyTags, setInitialMyTags] = useState<Record<string, MyTag> | undefined>();
  const justLoaded = useRef(false);

  useEffect(() => {
    if (session.mode !== "live") {
      setLeague(demoLeague());
      setVersion((v) => v + 1);
      setStatus("ready");
      return;
    }
    // First run already loaded this league; don't fetch it twice.
    if (justLoaded.current && LEAGUE.mode === "live" && LEAGUE.id === session.leagueId) {
      justLoaded.current = false;
      setVersion((v) => v + 1);
      setStatus("ready");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    const tr = tracer(setBootTrace, () => !cancelled);
    loadLeague(session.leagueId, session.userId, activeAccount(session)?.username ?? "", setStep, tr)
      .then(async (d) => { await tr.finish(); if (cancelled) return; setLeague(d); setVersion((v) => v + 1); setStatus("ready"); })
      .catch((e: unknown) => { if (cancelled) return; tr.fail(); setError(e instanceof Error ? e.message : "We couldn't load your league from Sleeper. Try again in a minute."); setStatus("error"); });
    return () => { cancelled = true; };
    // Adding or removing an account leaves the league on screen alone, so it doesn't reload it.
  }, [liveKey, reloadTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = () => setReloadTick((t) => t + 1);
  /** Pull to refresh's sync: the same league load as reload, without the loading screen. It resolves with a function
   *  that puts the new data on screen; PullRefresh calls it once its mark has lifted away. */
  const quietSync = (): Promise<() => void> => {
    const show = (d: Parameters<typeof setLeague>[0]) => () => { setLeague(d); setVersion((v) => v + 1); };
    if (session.mode !== "live") return Promise.resolve(show(demoLeague()));
    return loadLeague(session.leagueId, session.userId, activeAccount(session)?.username ?? "").then(show);
  };
  /** Back to the landing. Connected accounts are remembered and merged with the next one. */
  const toLanding = () => setSession((s) => { const accounts = accountsOf(s); return accounts.length ? { mode: "none", accounts } : { mode: "none" }; });

  // Loader holds long enough for the mark to form and the light to make a pass, then lifts off over the app.
  const [boot, setBoot] = useState<"off" | "on" | "leaving">("off");
  const bootAt = useRef(0);
  useEffect(() => {
    if (status === "loading") { bootAt.current = Date.now(); setBoot("on"); return; }
    if (boot !== "on") return;
    if (status !== "ready") { setBoot("off"); return; }
    // The app comes in under the lifting loader: the cards rise into place while it fades (sectionEnter.enterApp)
    const t1 = window.setTimeout(() => { setBoot("leaving"); enterApp(); }, Math.max(0, 1300 - (Date.now() - bootAt.current)));
    const t2 = window.setTimeout(() => setBoot("off"), Math.max(0, 1300 - (Date.now() - bootAt.current)) + 260);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "loading") return <Boot step={step} trace={bootTrace} />;
  if (status === "error") {
    return (
      <div className="boot">
        <Mark size={64} />
        <p className="boot-step">{error}</p>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={reload}>Try again</button>
          <button className="btn" onClick={() => setSession((s) => ({ mode: "demo", accounts: accountsOf(s) }))}>Use the demo league</button>
          <button className="btn btn-ghost" onClick={toLanding}>Switch account</button>
        </div>
      </div>
    );
  }
  // The welcome page shows the demo league. After disconnecting, the live league is still loaded on this
  // first render, so swap in the demo before drawing it (otherwise it looks up demo teams that aren't there).
  if (session.mode === "none" && LEAGUE.mode !== "demo") setLeague(demoLeague());
  return (
    <>
      {boot !== "off" && <Boot step={step} trace={bootTrace} leaving={boot === "leaving"} />}
      {session.mode !== "none" && boot === "off" && <Suspense fallback={null}><PullRefresh onSync={quietSync} /></Suspense>}
      {session.mode !== "none" ? (
        <Suspense fallback={boot === "off" ? <Boot step={step} trace={bootTrace} /> : null}>
        <Shell key={`${leagueKey()}:${version}`} session={session} initialMyTags={initialMyTags}
          onReconnect={toLanding}
          onDisconnect={() => setSession({ mode: "none" })}
          onDeleteAll={() => { store.clear(); setSession({ mode: "none" }); }}
          onRefresh={reload}
          onAccounts={(accounts) => setSession((s) => (s.mode === "live" && accounts.some((a) => a.userId === s.userId) ? { ...s, accounts } : s))}
          onSwitchLeague={(leagueId, userId) => setSession((s) => (s.mode === "live" && s.accounts.some((a) => a.userId === userId) ? { ...s, leagueId, userId } : s))} />
        </Suspense>
      ) : <Landing onLive={(st) => setStart({ kind: "live", ...st })} onDemo={() => { setLeague(demoLeague()); setStart({ kind: "demo" }); }} />}
      {session.mode === "none" && start && (
        <FirstRun start={start} onClose={() => { clearHandoff(); clearAskHandoff(); setStart(null); setLeague(demoLeague()); }}
          onLive={(s, myTags) => {
            setInitialMyTags(myTags); justLoaded.current = true;
            const added: Account = { username: s.username, userId: s.userId, name: start.kind === "live" ? start.user.name : undefined };
            setStart(null);
            setSession((prev) => ({ mode: "live", accounts: mergeAccounts(accountsOf(prev), added), userId: s.userId, leagueId: s.leagueId }));
          }}
          onDemo={(myTags) => { setInitialMyTags(myTags); setLeague(demoLeague()); setStart(null); setSession({ mode: "demo" }); }} />
      )}
    </>
  );
}
