import { useCallback, useEffect, useMemo, useState } from "react";
import { INITIAL_MANAGER_TAGS, INITIAL_MY_TAGS, ManagerTag, MyTag, TEAMS, YOU, teamById, playerById, DEADLINES, LEAGUE_NAME, WEEK } from "./data";
import {
  Answer, DEFAULT_FORMAT, FadeWeeks, Format, Price, Trade, activeTags, allNeeds, applyFormat, ask, builderTip,
  counterFor, evaluate, findTrades, fmt, formatLabel, lineupFor, needsFor, offerRead, sleeperDiff, waiverRecs, weakSlots,
} from "./engine";
import { Icon, IconName } from "./components/ui";
import { Briefing, FollowUp, Nudge, Wire, needCopy } from "./components/Wire";
import { League } from "./components/League";
import { TradeBuilder } from "./components/Trade";
import { Roster } from "./components/Roster";
import { Waivers } from "./components/Waivers";
import { Ask } from "./components/Ask";
import { Settings, Level } from "./components/Settings";
import { FirstRun } from "./components/FirstRun";
import { PitchSheet } from "./components/PitchSheet";

type Tab = "wire" | "league" | "trade" | "roster" | "waivers" | "ask" | "settings";
const TABS: { id: Tab; label: string; short: string; icon: IconName; main: boolean }[] = [
  { id: "wire", label: "The Wire", short: "Wire", icon: "wire", main: true },
  { id: "league", label: "League Needs", short: "League", icon: "league", main: true },
  { id: "trade", label: "Build a Deal", short: "Trade", icon: "trade", main: true },
  { id: "roster", label: "Lineup", short: "Lineup", icon: "roster", main: true },
  { id: "waivers", label: "Waivers", short: "Waivers", icon: "waivers", main: true },
  { id: "ask", label: "Ask Sources", short: "Ask", icon: "ask", main: false },
  { id: "settings", label: "Settings", short: "Settings", icon: "gear", main: false },
];
const TAB_IDS = TABS.map((t) => t.id);

const KEYS = ["tags", "myTags", "prices", "format", "level", "fade", "dismissed", "dismissedIds", "followUps", "onboarded", "username"];
/** Short tap on Android for meaningful commits only (save, send). iOS Safari ignores it. */
const haptic = () => { try { navigator.vibrate?.(10); } catch { /* unsupported */ } };

const store = {
  get<T>(k: string, fallback: T): T {
    try { const v = localStorage.getItem(`sources.${k}`); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
  },
  set(k: string, v: unknown) { try { localStorage.setItem(`sources.${k}`, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  clear() { try { KEYS.forEach((k) => localStorage.removeItem(`sources.${k}`)); } catch { /* ignore */ } },
};
const usePersist = <T,>(k: string, init: T) => {
  const [v, setV] = useState<T>(() => store.get(k, init));
  useEffect(() => store.set(k, v), [k, v]);
  return [v, setV] as const;
};

export default function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const h = typeof location !== "undefined" ? location.hash.slice(1) : "";
    return (TAB_IDS as string[]).includes(h) ? (h as Tab) : "wire";
  });
  const [onboarded, setOnboarded] = usePersist("onboarded", false);
  const [username, setUsername] = usePersist("username", "");
  const [tags, setTags] = usePersist<ManagerTag[]>("tags", INITIAL_MANAGER_TAGS);
  const [myTags, setMyTags] = usePersist<Record<string, MyTag>>("myTags", INITIAL_MY_TAGS);
  const [prices, setPrices] = usePersist<Record<string, Price>>("prices", { "josh-allen": { mode: "pct", amount: 25 } });
  const [format, setFormat] = usePersist<Format>("format", DEFAULT_FORMAT);
  const [level, setLevel] = usePersist<Level>("level", "standard");
  const [fade, setFade] = usePersist<FadeWeeks>("fade", 4);
  const [dismissed, setDismissed] = usePersist<Record<string, number>>("dismissed", {});
  const [dismissedIds, setDismissedIds] = usePersist<string[]>("dismissedIds", []);
  const [followUps, setFollowUps] = usePersist<FollowUp[]>("followUps", []);
  const [partnerId, setPartnerId] = useState("mike");
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [pitch, setPitch] = useState<Trade | null>(null);
  const [toast, setToastState] = useState<{ msg: string; undo?: () => void; id: number } | null>(null);
  const setToast = useCallback((msg: string | null, undo?: () => void) => setToastState(msg ? { msg, undo, id: Date.now() } : null), []);
  const [focusTeam, setFocusTeam] = useState<string | undefined>();

  // Every engine call below reads the league format set here.
  applyFormat(format);
  const fkey = `${format.scoring}|${format.superflex}|${format.tePremium}`;

  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToastState(null), toast.undo ? 5000 : 2800); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const onHash = () => { const h = location.hash.slice(1); if ((TAB_IDS as string[]).includes(h)) setTab(h as Tab); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const active = useMemo(() => activeTags(tags, fade), [tags, fade]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const needs = useMemo(() => allNeeds(), [fkey]);
  const youNeeds = needs.find((n) => n.team.you) ?? needsFor(YOU);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const yourLineup = useMemo(() => lineupFor(YOU.roster, true), [fkey]);

  const suggestionsByTeam = useMemo(() => {
    const out: Record<string, Trade[]> = {};
    TEAMS.filter((t) => !t.you).forEach((t) => (out[t.id] = findTrades(YOU, t, active, myTags, prices)));
    return out;
  }, [active, myTags, prices, fkey]); // eslint-disable-line react-hooks/exhaustive-deps

  const partners = useMemo(() => needs.filter((n) => !n.team.you && suggestionsByTeam[n.team.id]?.[0])
    .map((n) => {
      const t = suggestionsByTeam[n.team.id][0];
      const g = n.groups[n.need];
      const want = active.find((x) => x.teamId === n.team.id && x.kind === "wants");
      const lead = want ? `${want.text}` : g.diff < -0.5 ? `Thin at ${n.need} (${fmt(g.diff)}/wk)` : `No big hole, but deep enough to deal`;
      const why = `${lead}. Your ${t.give.map((id) => playerById(id).name).join(" + ")} gets it done.`;
      return { n, t, why };
    })
    .sort((a, b) => Math.min(b.t.youDelta, b.t.themDelta) + (b.t.fillsWant ? 1 : 0) - Math.min(a.t.youDelta, a.t.themDelta) - (a.t.fillsWant ? 1 : 0))
    .slice(0, 3), [needs, suggestionsByTeam, active]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recs = useMemo(() => waiverRecs(YOU), [fkey]);
  const diff = useMemo(() => sleeperDiff(yourLineup), [yourLineup]);
  const coach = useCallback((t: Trade) => counterFor(t, active, myTags, prices), [active, myTags, prices]);

  const nudges: Nudge[] = useMemo(() => {
    const list: Nudge[] = [];
    // Lineup day
    if (diff.length) {
      const d = diff[0];
      list.push({
        id: "lineup", kind: "lineup", headline: `${d.benched.name} is in your ${d.slot} in Sleeper`, emph: `and he's ${d.benched.status === "O" ? "out" : "on bye"}.`,
        why: `Start ${d.start.name} instead for ${fmt(d.gain)} pts. Make the swap in Sleeper before kickoff.`, trades: [], time: "Now", deadline: DEADLINES.lock,
        go: { label: "Review lineup", tab: "roster" },
      });
    }
    // Offer received, with verdict and a ready counter
    const offer = evaluate(YOU, teamById("dan"), ["zay-flowers"], ["ladd-mcconkey"], active, myTags, prices);
    list.push({
      id: "offer-dan", kind: "offer", teamId: "dan", headline: "Dan offered Ladd McConkey for your Zay Flowers.",
      why: `${offerRead(offer).line} Here's the read and a counter that respects his tags.`, trades: [], time: "12 min ago",
      offer, counter: counterFor(offer, active, myTags, prices), deadline: DEADLINES.trade,
    });
    // Needs: teams with a stated or measured need where you have a win-win
    const wantPos = (teamId: string) => active.find((t) => t.teamId === teamId && t.kind === "wants" && t.pos)?.pos;
    needs.filter((n) => !n.team.you && suggestionsByTeam[n.team.id]?.length && n.team.id !== "chris" && (wantPos(n.team.id) || n.groups[n.need].diff < -1))
      .sort((a, b) => Number(!!wantPos(b.team.id)) - Number(!!wantPos(a.team.id)) || a.groups[a.need].pct - b.groups[b.need].pct)
      .slice(0, 2).forEach((n, i) => {
        const pos = wantPos(n.team.id) ?? n.need;
        const g = n.groups[pos];
        const starterOut = n.team.roster.map(playerById).find((p) => p.pos === pos && p.status === "O");
        list.push({
          id: `need-${n.team.id}`, kind: "need", teamId: n.team.id,
          headline: `${n.team.name} needs`, emph: `${needCopy(pos)}.`,
          why: `${starterOut ? `Their starter ${starterOut.name} is out and they're` : "They're"} ${Math.abs(g.diff).toFixed(1)} pts a week ${g.diff < 0 ? "below" : "above"} the league average at ${pos}${wantPos(n.team.id) ? ", and you logged that they're shopping" : ""}. Here are ideas that would move them.`,
          trades: suggestionsByTeam[n.team.id].slice(0, 2), time: ["8 min ago", "34 min ago"][i] ?? "Today", deadline: DEADLINES.trade,
        });
      });
    // News break and what it changes for you
    const chris = needs.find((n) => n.team.id === "chris");
    const ct = suggestionsByTeam["chris"]?.[0];
    if (chris) list.push({
      id: "news-chris", kind: "news", teamId: "chris",
      headline: "Chris just lost his WR1.", emph: "He'll be shopping by Sunday.",
      why: "Malik Nabers is out indefinitely and CeeDee Lamb is questionable.",
      impact: [
        { label: "Your lineup", text: "No change. You don't start anyone affected." },
        { label: "Trade targets", text: `If Lamb sits too, Chris falls to ${fmt(needsFor(chris.team, chris.team.roster.filter((id) => id !== "ceedee-lamb")).groups.WR.diff)} at WR vs league average. He'll be buying.` },
        { label: "Prices", text: ct ? `Your WRs are worth more to him now. ${ct.give.map((id) => playerById(id).name).join(" + ")} projects ${fmt(ct.themDelta)} a week for Chris.` : "Your WRs are worth more to him this week." },
      ],
      trades: ct ? [ct] : [], time: "2 hr ago", deadline: DEADLINES.trade,
    });
    // Waivers
    const w = recs[0];
    if (w) list.push({
      id: "waiver", kind: "waiver", headline: `${w.fa.why.split(".")[0].replace(/^The /, "the ")}.`, emph: `Bid ${w.bid[0]} to ${w.bid[1]} percent.`,
      why: `${w.fa.name} adds ${fmt(w.gain)} to your starters${w.drop ? `. Drop ${w.drop.name}` : ""}. Based on what wins in your league.`,
      trades: [], time: "Today", deadline: DEADLINES.waivers, go: { label: "Open waivers", tab: "waivers" },
    });
    // Aging tags
    active.filter((t) => t.weeksOld >= 3).slice(0, 1).forEach((t) => list.push({
      id: `stale-${t.id}`, kind: "stale", teamId: t.teamId, tagId: t.id,
      headline: `${teamById(t.teamId).manager} said "${t.text.toLowerCase()}" ${t.weeksOld} weeks ago.`, emph: "Still true?",
      why: "Interest changes week to week. Keep the tag and Sources keeps respecting it. Clear it and that player comes back into trade ideas.",
      trades: [], time: "Today",
    }));
    // Patterns
    const weak = weakSlots()[0];
    if (weak) list.push({
      id: "slot", kind: "slot", headline: `your ${weak.slot} slot has come up short ${weak.misses} of ${weak.weeks} weeks.`,
      why: `That's ${fmt(weak.gap)} a week against the league average. It's flagged as a need, so trade ideas lean toward fixing it.`,
      trades: [], time: "This week", go: { label: "See slot report", tab: "roster" },
    });

    const learned = list.filter((n) => (dismissed[n.kind] ?? 0) < 2 && !dismissedIds.includes(n.id));
    if (level === "light") return learned.filter((n) => n.kind === "lineup" || n.kind === "offer" || n.kind === "need").slice(0, 2);
    if (level === "standard") return learned.filter((n) => n.kind !== "slot").slice(0, 5);
    return learned;
  }, [needs, suggestionsByTeam, active, myTags, prices, recs, diff, level, dismissed, dismissedIds]);

  const briefing: Briefing = {
    lineup: diff.length ? `Start ${diff[0].start.name} over ${diff[0].benched.name} (${fmt(diff[0].gain)})` : "Your Sleeper lineup is already optimal.",
    trade: partners[0]?.t ?? null,
    waiver: recs[0] ? `${recs[0].fa.name}: bid ${recs[0].bid[0]}–${recs[0].bid[1]}%${recs[0].drop ? `, drop ${recs[0].drop.name}` : ""}` : "Nothing worth a claim this week.",
  };

  const trade = give.length && get.length ? evaluate(YOU, teamById(partnerId), give, get, active, myTags, prices) : null;
  const tip = trade && level !== "light" ? builderTip(trade, active, myTags, prices) : null;

  const go = (t: string, teamId?: string) => {
    if (!(TAB_IDS as string[]).includes(t)) return;
    if (teamId) { setFocusTeam(teamId); if (t === "trade") { setPartnerId(teamId); setGive([]); setGet([]); } }
    setTab(t as Tab);
    try { history.replaceState(null, "", `#${t}`); } catch { /* ignore */ }
    if (t === "league" && teamId) window.setTimeout(() => document.getElementById(`team-${teamId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };
  const loadTrade = (t: Trade) => { setPartnerId(t.partnerId); setGive(t.give); setGet(t.get); go("trade"); };
  const toggle = (side: "give" | "get", id: string) => {
    const set = side === "give" ? setGive : setGet;
    set((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id]));
  };
  const setPartner = (id: string) => { setPartnerId(id); setGet([]); };
  const addTag = (t: Omit<ManagerTag, "id">) => {
    setTags((cur) => [...cur.filter((x) => !(x.teamId === t.teamId && x.text === t.text)), { ...t, id: `u${Date.now()}` }]);
    haptic();
    setToast(`Saved for ${teamById(t.teamId).manager}: "${t.text}". Suggestions now respect it.`);
  };
  const keepTag = (id: string) => { setTags((cur) => cur.map((t) => (t.id === id ? { ...t, weeksOld: 0 } : t))); setToast("Kept. The tag is fresh again."); };
  const clearTag = (id: string) => {
    const prev = tags;
    setTags((cur) => cur.filter((t) => t.id !== id));
    setToast("Tag cleared. That player is back in trade ideas.", () => setTags(prev));
  };
  const dismiss = (n: Nudge) => {
    const prevIds = dismissedIds;
    const prevKinds = dismissed;
    const count = (dismissed[n.kind] ?? 0) + 1;
    setDismissedIds((c) => [...c, n.id]);
    setDismissed((c) => ({ ...c, [n.kind]: (c[n.kind] ?? 0) + 1 }));
    setToast(count === 2 ? `Got it. You'll see fewer ${n.kind} nudges.` : "Hidden. Sources is learning what you care about.",
      () => { setDismissedIds(prevIds); setDismissed(prevKinds); });
  };
  const onLink = (l: Answer["links"][number]) => { if (l.trade) loadTrade(l.trade); else go(l.tab, l.teamId); };
  const resetAll = () => {
    store.clear();
    setTags(INITIAL_MANAGER_TAGS); setMyTags(INITIAL_MY_TAGS); setPrices({ "josh-allen": { mode: "pct", amount: 25 } });
    setFormat(DEFAULT_FORMAT); setLevel("standard"); setFade(4); setDismissed({}); setDismissedIds([]); setFollowUps([]);
    setUsername(""); setOnboarded(false); go("wire");
  };

  const rail = (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}><h2 className="section-title">Live wire</h2><span className="sample-note">Sample</span></div>
      {nudges.map((n) => (
        <div key={n.id} className="rail-item">
          <span className="rail-time">{n.time}{n.deadline ? ` · ${n.deadline}` : ""}</span>
          <p>{["need", "news", "waiver", "lineup", "slot"].includes(n.kind) ? "Per sources, " : ""}{n.headline} {n.emph}</p>
          {n.trades[0] && <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => loadTrade(n.trades[0])}>Open deal</button>}
          {!n.trades[0] && n.go && <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => go(n.go!.tab)}>{n.go.label}</button>}
        </div>
      ))}
      <button className="rail-ask" onClick={() => go("ask")}><Icon name="ask" size={18} /><span>Ask your league anything</span></button>
    </>
  );

  return (
    <div className={`shell${tab === "trade" ? " wide" : ""}`}>
      <aside className="side">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">“</span>
          <div><div className="brand-name">Sources</div><div className="brand-line">Your fantasy insider</div></div>
        </div>
        <div className="league-pill"><b>{LEAGUE_NAME}</b><span>{formatLabel(format)} · Week {WEEK}</span></div>
        <nav className="nav" aria-label="Main">
          {TABS.filter((t) => t.main).map((t) => (
            <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}><Icon name={t.icon} />{t.label}</button>
          ))}
          <div className="nav-sep" />
          {TABS.filter((t) => !t.main).map((t) => (
            <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}><Icon name={t.icon} />{t.label}</button>
          ))}
        </nav>
        <p className="side-foot">Prototype with sample data. Values are illustrative weekly projections. {username && <>Connected as @{username}.</>}</p>
      </aside>

      <header className="topbar">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark" aria-hidden="true" style={{ width: 30, height: 30, fontSize: 26 }}>“</span>
          <div className="brand-name" style={{ fontSize: 22 }}>Sources</div>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn-icon btn-ghost" aria-label="Ask Sources" aria-current={tab === "ask" ? "page" : undefined} onClick={() => go("ask")}><Icon name="ask" size={20} /></button>
          <button className="btn btn-icon btn-ghost" aria-label="Settings" aria-current={tab === "settings" ? "page" : undefined} onClick={() => go("settings")}><Icon name="gear" size={20} /></button>
        </div>
      </header>

      <main className="main">
        <div className="main-inner" key={tab}>
          {tab === "wire" && (
            <Wire you={youNeeds} nudges={nudges} followUps={followUps} briefing={briefing} coach={coach} level={level}
              onOpen={loadTrade} onPitch={setPitch} onGo={go} onDismiss={dismiss} onTag={addTag}
              onResolve={(id, msg) => { setFollowUps((c) => c.filter((f) => f.id !== id)); setToast(msg); }}
              onCapture={() => go("league")}
              onKeepTag={keepTag} onClearTag={clearTag} />
          )}
          {tab === "league" && (
            <League needs={needs} tags={tags} fade={fade} focusId={focusTeam} partners={partners} onAddTag={addTag}
              onTrade={(id) => go("trade", id)} onOpen={loadTrade} onRemoveTag={clearTag} onKeepTag={keepTag} />
          )}
          {tab === "trade" && (
            <TradeBuilder partnerId={partnerId} setPartner={setPartner} give={give} get={get} toggle={toggle}
              clear={() => { setGive([]); setGet([]); }} trade={trade} suggestions={suggestionsByTeam[partnerId] ?? []}
              tags={active} myTags={myTags} tip={tip} onPitch={setPitch} onLoad={loadTrade} onAddTag={addTag} />
          )}
          {tab === "roster" && (
            <Roster lineup={yourLineup} myTags={myTags} prices={prices} tags={active} level={level} onPitch={setPitch}
              setPrice={(id, p) => setPrices((c) => ({ ...c, [id]: p }))}
              setTag={(id, v) => { setMyTags((cur) => { const n = { ...cur }; if (v) n[id] = v; else delete n[id]; return n; }); if (v) setToast(`${playerById(id).name} marked ${v === "amazing" ? "untouchable unless amazing" : v}.`); }} />
          )}
          {tab === "waivers" && <Waivers recs={recs} onToast={setToast} />}
          {tab === "ask" && <Ask answer={(q) => ask(q, active, myTags, prices)} onLink={onLink} />}
          {tab === "settings" && (
            <Settings username={username || "you"} format={format} setFormat={(f) => { setFormat(f); setToast(`League format: ${formatLabel(f)}. Every number updated.`); }}
              level={level} setLevel={setLevel} fade={fade} setFade={setFade}
              dismissed={dismissed} resetDismissed={() => { setDismissed({}); setDismissedIds([]); setToast("Nudges reset."); }}
              onDisconnect={() => { setOnboarded(false); setUsername(""); setToast("Sleeper disconnected."); }}
              onDelete={() => { resetAll(); setToast("Your account and data were deleted from this device."); }}
              onReplay={() => setOnboarded(false)} />
          )}
          {["wire", "league", "roster", "waivers"].includes(tab) && <section className="card card-pad rail-inline">{rail}</section>}
        </div>
      </main>

      <aside className="rail" aria-label="Live wire">{rail}</aside>

      <nav className="tabbar" aria-label="Main">
        {TABS.filter((t) => t.main).map((t) => (
          <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
            <Icon name={t.icon} size={22} />{t.short}
          </button>
        ))}
      </nav>

      {pitch && <PitchSheet trade={pitch} onClose={() => setPitch(null)} onSent={(m, via) => {
        setToast(m);
        if (via) haptic();
        if (via) setFollowUps((c) => [{ id: `f${Date.now()}`, trade: pitch, via, when: "today" }, ...c.filter((f) => f.trade.key !== pitch.key)].slice(0, 3));
      }} />}
      {!onboarded && <FirstRun you={youNeeds} opener={partners[0]?.t ?? null} onDone={({ username: u, myTags: mt }) => {
        setUsername(u); setMyTags((c) => ({ ...c, ...mt })); setOnboarded(true); go("wire");
        setToast(`Connected to ${LEAGUE_NAME}. Per sources, here's your first look.`);
      }} />}
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.msg}</span>
          {toast.undo && <button className="toast-undo" onClick={() => { toast.undo!(); setToastState(null); }}>Undo</button>}
        </div>
      )}
    </div>
  );
}
