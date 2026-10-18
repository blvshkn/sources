import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INITIAL_MANAGER_TAGS, INITIAL_MY_TAGS, ManagerTag, MyTag, TEAMS, YOU, teamById, playerById, DEADLINES, LEAGUE_NAME, WEEK, LEAGUE, POS_ORDER, Pos, Player, isDemo, FAAB, setLeague, demoLeague, leagueKey } from "./data";
import { loadLeague } from "./sleeper";
import {
  Answer, DEFAULT_FORMAT, FadeWeeks, Format, Price, Trade, activeTags, allNeeds, applyFormat, ask, builderTip,
  counterFor, evaluate, findTrades, fmt, formatLabel, lineupFor, needsFor, offerRead, sleeperDiff, waiverRecs, weakSlots,
  irReport, irLabel,
} from "./engine";
import { loadJerseyNumbers } from "./jersey";
import { Icon, IconName } from "./components/ui";
import { Briefing, FollowUp, Nudge, Wire, needCopy } from "./components/Wire";
import { League } from "./components/League";
import { TradeBuilder } from "./components/Trade";
import { Roster } from "./components/Roster";
import { Waivers } from "./components/Waivers";
import { Ask } from "./components/Ask";
import { Settings, Level } from "./components/Settings";
import { FirstRun, FirstRunStart } from "./components/FirstRun";
import { Landing } from "./components/Landing";
import { PitchSheet } from "./components/PitchSheet";

type Tab = "wire" | "league" | "trade" | "roster" | "waivers" | "ask" | "settings";
const TABS: { id: Tab; label: string; short: string; icon: IconName; main: boolean }[] = [
  { id: "wire", label: "The Wire", short: "Wire", icon: "wire", main: true },
  { id: "league", label: "League Needs", short: "League", icon: "league", main: true },
  { id: "trade", label: "Build a Deal", short: "Trade", icon: "trade", main: true },
  { id: "roster", label: "Lineup", short: "Lineup", icon: "helmet", main: true },
  { id: "waivers", label: "Waivers", short: "Waivers", icon: "waivers", main: true },
  { id: "ask", label: "Ask Sources", short: "Ask", icon: "ask", main: false },
  { id: "settings", label: "Settings", short: "Settings", icon: "gear", main: false },
];
const TAB_IDS = TABS.map((t) => t.id);

/** Short tap on Android for meaningful commits only (save, send). iOS Safari ignores it. */
const haptic = () => { try { navigator.vibrate?.(10); } catch { /* unsupported */ } };

const store = {
  get<T>(k: string, fallback: T): T {
    try { const v = localStorage.getItem(`sources.${k}`); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
  },
  set(k: string, v: unknown) { try { localStorage.setItem(`sources.${k}`, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  clear() { try { Object.keys(localStorage).filter((k) => k.startsWith("sources.")).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } },
};
const usePersist = <T,>(k: string, init: T) => {
  const [v, setV] = useState<T>(() => store.get(k, init));
  useEffect(() => store.set(k, v), [k, v]);
  return [v, setV] as const;
};

export type Session = { mode: "none" } | { mode: "demo" } | { mode: "live"; username: string; userId: string; leagueId: string };

function Shell({ session, initialMyTags, onReconnect, onDeleteAll, onRefresh }: {
  session: Session;
  initialMyTags?: Record<string, MyTag>;
  onReconnect: () => void;
  onDeleteAll: () => void;
  onRefresh: () => void;
}) {
  const demo = isDemo();
  const scope = demo ? "demo" : LEAGUE.id;
  const username = session.mode === "live" ? session.username : "";
  const [tab, setTab] = useState<Tab>(() => {
    const h = typeof location !== "undefined" ? location.hash.slice(1) : "";
    return (TAB_IDS as string[]).includes(h) ? (h as Tab) : "wire";
  });
  // Tags, prices and history are kept per league, in this browser only.
  const [tags, setTags] = usePersist<ManagerTag[]>(`${scope}.tags`, demo ? INITIAL_MANAGER_TAGS : []);
  const [myTags, setMyTags] = usePersist<Record<string, MyTag>>(`${scope}.myTags`, demo ? { ...INITIAL_MY_TAGS, ...initialMyTags } : initialMyTags ?? {});
  const [prices, setPrices] = usePersist<Record<string, Price>>(`${scope}.prices`, demo ? { "josh-allen": { mode: "pct", amount: 25 } } : {});
  const [format, setFormat] = usePersist<Format>(`${scope}.format`, LEAGUE.format ?? DEFAULT_FORMAT);
  const [level, setLevel] = usePersist<Level>("level", "standard");
  const [fade, setFade] = usePersist<FadeWeeks>("fade", 4);
  const [dismissed, setDismissed] = usePersist<Record<string, number>>(`${scope}.dismissed`, {});
  const [dismissedIds, setDismissedIds] = usePersist<string[]>(`${scope}.dismissedIds`, []);
  const [followUps, setFollowUps] = usePersist<FollowUp[]>(`${scope}.followUps`, []);
  const [partnerId, setPartnerId] = useState(() => (demo ? "mike" : TEAMS.find((t) => !t.you)!.id));
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [pitch, setPitch] = useState<Trade | null>(null);
  const [toast, setToastState] = useState<{ msg: string; undo?: () => void; id: number } | null>(null);
  const setToast = useCallback((msg: string | null, undo?: () => void) => setToastState(msg ? { msg, undo, id: Date.now() } : null), []);
  const [focusTeam, setFocusTeam] = useState<string | undefined>();

  // Every engine call below reads the league format set here.
  applyFormat(format);
  const fkey = `${format.scoring}|${format.superflex}|${format.tePremium}`;

  useEffect(() => { loadJerseyNumbers(); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); document.documentElement.dataset.tab = tab; }, [tab]);
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

  /** The most valuable rival starter who just went out. */
  const breakingNews = (): { team: typeof YOU; p: Player; pos: Pos } | null => {
    let best: { team: typeof YOU; p: Player; pos: Pos } | null = null;
    TEAMS.filter((t) => !t.you).forEach((team) => {
      const roster = team.roster.map(playerById);
      POS_ORDER.forEach((pos) => {
        const top = roster.filter((x) => x.pos === pos).sort((a, b) => (b.pts?.ppr ?? b.proj) - (a.pts?.ppr ?? a.proj))[0];
        if (top?.status === "O" && (!best || (top.pts?.ppr ?? top.proj) > (best.p.pts?.ppr ?? best.p.proj))) best = { team, p: top, pos };
      });
    });
    return best;
  };

  const nudges: Nudge[] = useMemo(() => {
    const list: Nudge[] = [];
    // Injured reserve comes first: a mistake here blocks every other move
    const ir = irReport(YOU);
    ir.mustActivate.forEach((p) => list.push({
      id: `ir-activate-${p.id}`, kind: "ir", headline: `${p.name} is on IR but no longer qualifies`, emph: "Sleeper will block your adds and trades until he's off it.",
      why: `His status is now ${p.injury ? p.injury : "healthy"}. Activate him in Sleeper${ir.open === 0 && YOU.roster.length >= LEAGUE.rosterMax ? ", which means dropping someone to make room" : ""}.`,
      trades: [], time: "Now", go: { label: "Review IR", tab: "roster" },
    }));
    if (ir.open > 0 && ir.moveIn.length) {
      const p = ir.moveIn[0];
      list.push({
        id: `ir-move-${p.id}`, kind: "ir", headline: `${p.name} can go on IR`, emph: "and you have an open spot.",
        why: `He's listed ${irLabel(p).toLowerCase()}. Moving him frees a bench spot for a waiver add without cutting anyone.${ir.moveIn.length > 1 ? ` ${ir.moveIn.slice(1).map((x) => x.name).join(", ")} also qualif${ir.moveIn.length > 2 ? "y" : "ies"}.` : ""}`,
        trades: [], time: "Now", go: { label: "Review IR", tab: "roster" },
      });
    }
    // Lineup day
    if (diff.length) {
      const d = diff[0];
      list.push({
        id: "lineup", kind: "lineup", headline: `${d.benched.name} is in your ${d.slot} in Sleeper`, emph: `and he's ${d.benched.status === "O" ? "out" : "on bye"}.`,
        why: `Start ${d.start.name} instead for ${fmt(d.gain)} pts. Make the swap in Sleeper before kickoff.`, trades: [], time: "Now", deadline: DEADLINES.lock,
        go: { label: "Review lineup", tab: "roster" },
      });
    }
    // Offer received, with verdict and a ready counter. Sleeper's API doesn't expose
    // pending offers, so live leagues get this through "Judge an offer" in the builder.
    const offer = demo ? evaluate(YOU, teamById("dan"), ["zay-flowers"], ["ladd-mcconkey"], active, myTags, prices) : null;
    if (offer) list.push({
      id: "offer-dan", kind: "offer", teamId: "dan", headline: "Dan offered Ladd McConkey for your Zay Flowers.",
      why: `${offerRead(offer).line} Here's the read and a counter that respects their tags.`, trades: [], time: "12 min ago",
      offer, counter: counterFor(offer, active, myTags, prices), deadline: DEADLINES.trade,
    });
    // Needs: teams with a stated or measured need where you have a win-win
    const wantPos = (teamId: string) => active.find((t) => t.teamId === teamId && t.kind === "wants" && t.pos)?.pos;
    const news = breakingNews();
    needs.filter((n) => !n.team.you && suggestionsByTeam[n.team.id]?.length && n.team.id !== news?.team.id && (wantPos(n.team.id) || n.groups[n.need].diff < -1))
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
    if (news) {
      const { team, p, pos } = news;
      const nt = suggestionsByTeam[team.id]?.[0];
      const without = needsFor(team, team.roster.filter((id) => id !== p.id)).groups[pos].diff;
      const mineHurt = yourLineup.slots.map((x) => x.player).filter((x): x is Player => !!x && !!x.status);
      list.push({
        id: `news-${team.id}-${p.id}`, kind: "news", teamId: team.id,
        headline: `${team.name} just lost their ${pos}1.`, emph: `Expect them to shop for ${needCopy(pos)}.`,
        why: `${p.name} is ${p.longTerm ? "out long term" : "out this week"}${p.note ? ` (${p.note})` : ""}.`,
        impact: [
          { label: "Your lineup", text: mineHurt.length ? `You start ${mineHurt.map((x) => `${x.name} (${x.status === "O" ? "out" : "questionable"})`).join(", ")}. Check the Lineup tab.` : "No change. You don't start anyone affected." },
          { label: "Trade targets", text: `Without ${p.name.split(" ").slice(-1)[0]}, ${team.name} is ${fmt(without)} at ${pos} vs league average.` },
          { label: "Prices", text: nt ? `Your ${nt.give.map((id) => playerById(id).name).join(" + ")} projects ${fmt(nt.themDelta)} a week for them right now.` : `Your ${pos}s are worth more to them this week.` },
        ],
        trades: nt ? [nt] : [], time: demo ? "2 hr ago" : "Today", deadline: DEADLINES.trade,
      });
    }
    // Waivers
    const w = recs[0];
    if (w) list.push({
      id: "waiver", kind: "waiver", headline: demo ? `${w.fa.why.split(".")[0].replace(/^The /, "the ")}.` : `${w.fa.name} is your best add this week.`, emph: FAAB.enabled ? `Bid ${w.bid[0]} to ${w.bid[1]} percent.` : "Put in a claim.",
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
    if (level === "light") return learned.filter((n) => n.kind === "ir" || n.kind === "lineup" || n.kind === "offer" || n.kind === "need").slice(0, 2);
    if (level === "standard") return learned.filter((n) => n.kind !== "slot").slice(0, 5);
    return learned;
  }, [needs, suggestionsByTeam, active, myTags, prices, recs, diff, level, dismissed, dismissedIds, yourLineup]); // eslint-disable-line react-hooks/exhaustive-deps

  const briefing: Briefing = {
    lineup: diff.length ? `Start ${diff[0].start.name} over ${diff[0].benched.name} (${fmt(diff[0].gain)})` : "Your Sleeper lineup is already optimal.",
    trade: partners[0]?.t ?? null,
    waiver: recs[0] ? `${recs[0].fa.name}: bid ${recs[0].bid[0]}-${recs[0].bid[1]}%${recs[0].drop ? `, drop ${recs[0].drop.name}` : ""}` : "Nothing worth a claim this week.",
  };

  const askStarters = useMemo(() => {
    const rival = TEAMS.filter((t) => !t.you).flatMap((t) => t.roster.map(playerById)).filter((p) => !(p.status === "O" && p.longTerm))
      .sort((a, b) => (b.pts?.ppr ?? b.proj) - (a.pts?.ppr ?? a.proj))[0];
    const mgr = partners[0]?.n.team.manager ?? TEAMS.find((t) => !t.you)!.manager;
    return [`Who needs a ${youNeeds.surplus ?? "WR"} most?`, rival ? `What would it take to get ${rival.name.split(" ").slice(-1)[0]}?` : "Who should I trade with?",
      "Who should I start at flex?", "Who should I trade with?", "Best waiver add this week?", `What does ${mgr} need?`];
  }, [partners, youNeeds]);

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
    setToast(`Tag saved. Trade ideas for ${teamById(t.teamId).manager} now follow it.`);
  };
  const keepTag = (id: string) => { setTags((cur) => cur.map((t) => (t.id === id ? { ...t, weeksOld: 0 } : t))); setToast("Tag kept."); };
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
    setToast(count === 2 ? `Got it. You'll see fewer ${n.kind} nudges.` : "Hidden. You'll see fewer like this.",
      () => { setDismissedIds(prevIds); setDismissed(prevKinds); });
  };
  const onLink = (l: Answer["links"][number]) => { if (l.trade) loadTrade(l.trade); else go(l.tab, l.teamId); };

  const rail = (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}><h2 className="section-title">Live wire</h2><span className="sample-note">{demo ? "Demo" : `Week ${WEEK}`}</span></div>
      {nudges.map((n) => (
        <div key={n.id} className="rail-item">
          <span className="rail-time">{n.time}{n.deadline ? ` · ${n.deadline}` : ""}</span>
          <p>{n.headline.charAt(0).toUpperCase() + n.headline.slice(1)} {n.emph}</p>
          {n.trades[0] && <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => loadTrade(n.trades[0])}>Open in builder</button>}
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
        <nav className="nav nav-ix" aria-label="Main">
          <div className="nav-main" data-on={TABS.filter((t) => t.main).some((t) => t.id === tab) ? "" : undefined}
            data-i={Math.max(0, TABS.filter((t) => t.main).findIndex((t) => t.id === tab))}>
            <span className="nav-rule" aria-hidden="true" />
            {TABS.filter((t) => t.main).map((t) => (
              <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
                <span className="ix-ic"><Icon name={t.icon} size={20} active={tab === t.id} /></span><span className="ix-w">{t.short}</span>
              </button>
            ))}
          </div>
          <div className="nav-sep" />
          {TABS.filter((t) => !t.main).map((t) => (
            <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
              <span className="ix-ic"><Icon name={t.icon} size={20} active={tab === t.id} /></span><span className="ix-w">{t.short}</span>
            </button>
          ))}
        </nav>
        <p className="side-foot">{demo ? <>Demo league with sample data. <button className="linkish" onClick={onReconnect}>Connect Sleeper</button></> : <>Live from Sleeper as @{username}. {LEAGUE.updated}.</>}</p>
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

      <a className="skip-link" href="#main">Skip to content</a>
      <main className="main" id="main" tabIndex={-1}>
        <div className="main-inner" key={tab}>
          {tab === "wire" && (
            <Wire you={youNeeds} partner={partners[0]?.n.team.manager ?? null} partnerId={partners[0]?.n.team.id ?? null} nudges={nudges} followUps={followUps} briefing={briefing} coach={coach} level={level}
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
              tags={active} myTags={myTags} tip={tip} coach={coach} onPitch={setPitch} onLoad={loadTrade} onAddTag={addTag} />
          )}
          {tab === "roster" && (
            <Roster lineup={yourLineup} myTags={myTags} prices={prices} tags={active} level={level} onPitch={setPitch}
              setPrice={(id, p) => setPrices((c) => ({ ...c, [id]: p }))}
              setTag={(id, v) => { setMyTags((cur) => { const n = { ...cur }; if (v) n[id] = v; else delete n[id]; return n; }); if (v) setToast(`${playerById(id).name} marked ${v === "amazing" ? "untouchable unless amazing" : v}.`); }} />
          )}
          {tab === "waivers" && <Waivers recs={recs} onToast={setToast} />}
          {tab === "ask" && <Ask answer={(q) => ask(q, active, myTags, prices)} onLink={onLink} starters={askStarters} />}
          {tab === "settings" && (
            <Settings username={username} demo={demo} leagueFormat={LEAGUE.format} onRefresh={onRefresh} format={format} setFormat={(f) => { setFormat(f); setToast(`League format: ${formatLabel(f)}. Every number updated.`); }}
              level={level} setLevel={setLevel} fade={fade} setFade={setFade}
              dismissed={dismissed} resetDismissed={() => { setDismissed({}); setDismissedIds([]); setToast("Nudges reset. You'll see everything again."); }}
              onDisconnect={onReconnect}
              onDelete={onDeleteAll}
              onReplay={onReconnect} />
          )}
          {["wire", "league", "roster", "waivers"].includes(tab) && <section className="card card-pad rail-inline">{rail}</section>}
        </div>
      </main>

      <aside className="rail" aria-label="Live wire">{rail}</aside>

      <nav className="tabbar ix" aria-label="Main" data-on={TABS.filter((t) => t.main).some((t) => t.id === tab) ? "" : undefined}
        data-i={Math.max(0, TABS.filter((t) => t.main).findIndex((t) => t.id === tab))}>
        <span className="ix-rule" aria-hidden="true" />
        {TABS.filter((t) => t.main).map((t) => (
          <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
            <span className="ix-ic"><Icon name={t.icon} size={22} active={tab === t.id} /></span>
            <span className="ix-w">{t.short}</span>
          </button>
        ))}
      </nav>

      {pitch && <PitchSheet trade={pitch} onClose={() => setPitch(null)} onSent={(m, via) => {
        setToast(m);
        if (via) haptic();
        if (via) setFollowUps((c) => [{ id: `f${Date.now()}`, trade: pitch, via, when: "today" }, ...c.filter((f) => f.trade.key !== pitch.key)].slice(0, 3));
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


/** Session wrapper: picks demo or live Sleeper, loads the league, runs first-run setup. */
export default function App() {
  const [session, setSession] = usePersist<Session>("session", { mode: "none" });
  const [status, setStatus] = useState<"loading" | "ready" | "error">(session.mode === "live" ? "loading" : "ready");
  const [step, setStep] = useState("Loading your league");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [initialMyTags, setInitialMyTags] = useState<Record<string, MyTag> | undefined>();
  const justLoaded = useRef(false);
  const [start, setStart] = useState<FirstRunStart | null>(null);

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
    loadLeague(session.leagueId, session.userId, session.username, setStep)
      .then((d) => { if (cancelled) return; setLeague(d); setVersion((v) => v + 1); setStatus("ready"); })
      .catch((e: unknown) => { if (cancelled) return; setError(e instanceof Error ? e.message : "We couldn't load your league from Sleeper. Try again in a minute."); setStatus("error"); });
    return () => { cancelled = true; };
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = () => setSession((s) => ({ ...s }));

  if (status === "loading") {
    return (
      <div className="boot" role="status" aria-live="polite">
        <span className="brand-mark big" aria-hidden="true">“</span>
        <p className="boot-step">{step}…</p>
        <span className="boot-bar"><span /></span>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="boot">
        <span className="brand-mark big" aria-hidden="true">“</span>
        <p className="boot-step">{error}</p>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={reload}>Try again</button>
          <button className="btn" onClick={() => setSession({ mode: "demo" })}>Use the demo league</button>
          <button className="btn btn-ghost" onClick={() => setSession({ mode: "none" })}>Switch account</button>
        </div>
      </div>
    );
  }
  return (
    <>
      {session.mode !== "none" ? (
        <Shell key={`${leagueKey()}:${version}`} session={session} initialMyTags={initialMyTags}
          onReconnect={() => setSession({ mode: "none" })}
          onDeleteAll={() => { store.clear(); setSession({ mode: "none" }); }}
          onRefresh={reload} />
      ) : <Landing onLive={(st) => setStart({ kind: "live", ...st })} onDemo={() => { setLeague(demoLeague()); setStart({ kind: "demo" }); }} />}
      {session.mode === "none" && start && (
        <FirstRun start={start} onClose={() => { setStart(null); setLeague(demoLeague()); }}
          onLive={(s, myTags) => { setInitialMyTags(myTags); justLoaded.current = true; setStart(null); setSession({ mode: "live", ...s }); }}
          onDemo={(myTags) => { setInitialMyTags(myTags); setLeague(demoLeague()); setStart(null); setSession({ mode: "demo" }); }} />
      )}
    </>
  );
}
