import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UPDATED, INITIAL_MANAGER_TAGS, INITIAL_MY_TAGS, ManagerTag, MyTag, TEAMS, YOU, teamById, playerById, DEADLINES, LEAGUE_NAME, WEEK, LEAGUE, POS_ORDER, Pos, Player, isDemo, FAAB, setLeague, demoLeague, leagueKey, PLAYERS, FREE_AGENTS, SPECIAL_FREE_AGENTS } from "./data";
import { loadLeague } from "./sleeper";
import { TIER, playersInText, rankPlayers } from "./search";
import { Matchup } from "./components/Matchup";
import { HowItWorks, Legal } from "./components/About";
import {
  Answer, DEFAULT_FORMAT, FadeWeeks, Format, Price, Trade, activeTags, allNeeds, applyFormat, ask, builderTip,
  counterFor, evaluate, evaluateMulti, DealLeg, findTrades, fmt, formatLabel, lineupFor, needsFor, offerRead, sleeperDiff, waiverRecs, weakSlots, recDrop, bidDollars,
  irReport, irLabel, parseTag,
} from "./engine";
import { installIconTooltips } from "./tooltips";
import { Tooltip } from "./components/Tooltip";
import { Boot } from "./components/Boot";
import { Logo, Mark } from "./components/Logo";
import { LeagueCtx } from "./components/LeagueSwitch";
import { LeagueSwitcher } from "./components/LeagueSwitcher";
import { ManagerAvatar } from "./components/Avatar";
import { IdeaFeedback, IdeaFeedbackCtx, IdeaReason } from "./components/IdeaFeedback";
import { loadJerseyNumbers } from "./jersey";
import { Icon, IconName } from "./components/ui";
import { Briefing, FollowUp, Nudge, Threats, Wire, needCopy } from "./components/Wire";
import { InboxItem, InboxPanel, buildInbox } from "./components/Inbox";
import { useLive } from "./live";
import { useRosterNews } from "./news";
import { yourPlayers } from "./impact";
import { urgentNews } from "./components/News";
import { League } from "./components/League";
import { TradeBuilder } from "./components/Trade";
import { Roster, gameDayChecks } from "./components/Roster";
import { Waivers } from "./components/Waivers";
import { Ask } from "./components/Ask";
import { Settings, Level } from "./components/Settings";
import { PlatformName } from "./components/PlatformLogo";
import { FirstRun, FirstRunStart } from "./components/FirstRun";
import { Landing } from "./components/Landing";
import { PitchSheet } from "./components/PitchSheet";
import { Account, Session, accountsOf, activeAccount, mergeAccounts, normalizeSession } from "./accounts";

/** A player's name for any id Sources might hold: rostered, a free agent, or a kicker or defense. */
const playerName = (id: string) => PLAYERS[id]?.name ?? FREE_AGENTS.find((f) => f.id === id)?.name ?? SPECIAL_FREE_AGENTS.find((f) => f.id === id)?.name
  ?? id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

type Tab = "wire" | "league" | "trade" | "roster" | "waivers" | "ask" | "settings" | "matchup" | "how" | "legal";
const TABS: { id: Tab; label: string; short: string; icon: IconName; main: boolean; hidden?: boolean }[] = [
  { id: "wire", label: "The Wire", short: "Wire", icon: "wire", main: true },
  { id: "league", label: "League Needs", short: "League", icon: "league", main: true },
  { id: "trade", label: "Build a Deal", short: "Trade", icon: "trade", main: true },
  { id: "roster", label: "Lineup", short: "Lineup", icon: "helmet", main: true },
  { id: "waivers", label: "Waivers", short: "Waivers", icon: "waivers", main: true },
  { id: "ask", label: "Ask Sources", short: "Ask", icon: "spark", main: false },
  { id: "settings", label: "Settings", short: "Settings", icon: "gear", main: false },
  { id: "matchup", label: "Matchup", short: "Matchup", icon: "helmet", main: false, hidden: true },
  { id: "how", label: "How Sources works", short: "How it works", icon: "spark", main: false, hidden: true },
  { id: "legal", label: "Terms and legal", short: "Legal", icon: "lock", main: false, hidden: true },
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
/** True while a media query matches. Read synchronously on first render so the layout never flashes. */
const matches = (q: string) => { try { return window.matchMedia(q).matches; } catch { return false; } };
const useMedia = (q: string) => {
  const [m, setM] = useState(() => matches(q));
  useEffect(() => {
    let l: MediaQueryList; try { l = window.matchMedia(q); } catch { return; }
    const on = () => setM(l.matches);
    on(); l.addEventListener("change", on);
    return () => l.removeEventListener("change", on);
  }, [q]);
  return m;
};

const usePersist = <T,>(k: string, init: T, fix?: (saved: unknown) => T) => {
  const [v, setV] = useState<T>(() => (fix ? fix(store.get<unknown>(k, init)) : store.get(k, init)));
  useEffect(() => store.set(k, v), [k, v]);
  return [v, setV] as const;
};

export type { Session };

function Shell({ session, initialMyTags, onReconnect, onDeleteAll, onRefresh, onSwitchLeague, onAccounts, onDisconnect }: {
  session: Session;
  onSwitchLeague: (leagueId: string, userId: string) => void;
  onAccounts: (accounts: Account[]) => void;
  onDisconnect: () => void;
  initialMyTags?: Record<string, MyTag>;
  onReconnect: () => void;
  onDeleteAll: () => void;
  onRefresh: () => void;
}) {
  const demo = isDemo();
  const scope = demo ? "demo" : LEAGUE.id;
  const username = activeAccount(session)?.username ?? "";
  /** Whose picture sits on the league switcher: initials come from this when Sleeper has no picture (and in the demo). */
  const meName = activeAccount(session)?.name || username || YOU?.manager || LEAGUE_NAME;
  const accounts = session.mode === "live" ? session.accounts : [];
  const removeAccount = (userId: string) => {
    const gone = accounts.find((a) => a.userId === userId);
    if (!gone || session.mode !== "live" || userId === session.userId) return;
    const prev = accounts;
    onAccounts(accounts.filter((a) => a.userId !== userId));
    setToast(`Removed @${gone.username}. Its leagues are out of the switcher.`, () => onAccounts(prev));
  };
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
  // Ideas you said won't work, and managers who aren't trading right now
  const [hiddenIdeas, setHiddenIdeas] = usePersist<string[]>(`${scope}.hiddenIdeas`, []);
  const [pausedTeams, setPausedTeams] = usePersist<string[]>(`${scope}.pausedTeams`, []);
  // Players you said you don't want, so no idea asks you to take them
  const [passed, setPassed] = usePersist<string[]>(`${scope}.passed`, []);
  // Free agents you're watching on Waivers, with the week you marked each one for
  const [watch, setWatch] = usePersist<Record<string, number>>(`${scope}.watch`, {});
  const [feedbackFor, setFeedbackFor] = useState<Trade | null>(null);
  const [switching, setSwitching] = useState<false | "list" | "add">(false);
  const [pickedPartner, setPartnerId] = useState(() => (demo ? "mike" : TEAMS.find((t) => !t.you)!.id));
  // The partner is always another team in this league. A deep link or saved trade can carry your own
  // team's id (or one from another league); the picker would then show one team while the rosters read
  // another, so anything that isn't a valid partner falls back to the first other team everywhere at once.
  const isPartner = (id?: string) => !!id && TEAMS.some((t) => t.id === id && !t.you);
  const partnerId = isPartner(pickedPartner) ? pickedPartner : TEAMS.find((t) => !t.you)!.id;
  const [give, setGive] = useState<string[]>([]);
  // More partners in the same deal (a 3 or 4 team trade). Each has its own give and get with you.
  const [extra, setExtra] = useState<DealLeg[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [pitch, setPitch] = useState<Trade | null>(null);
  const [toast, setToastState] = useState<{ msg: string; undo?: () => void; id: number } | null>(null);
  const setToast = useCallback((msg: string | null, undo?: () => void) => setToastState(msg ? { msg, undo, id: Date.now() } : null), []);
  const [focusTeam, setFocusTeam] = useState<string | undefined>();
  // The inbox: a slide-over from the bell on phones, tablets and small laptops (inboxOpen). From 1241px it docks as the
  // right panel, which the bell opens and closes, on every page.
  const [inboxOpen, setInboxOpen] = useState(false);
  // Docked open or closed is remembered per device, not per league. Until someone picks, it's open from 1441px
  // and closed below, so a 1440 laptop starts with the full page.
  const [dockPref, setDockPref] = usePersist<boolean | null>("inboxDock", null);
  const dockOpen = dockPref ?? matches("(min-width: 1441px)");
  const dockWide = useMedia("(min-width: 1241px)");
  const [ibxFocus, setIbxFocus] = useState(0);
  const [readIds, setReadIds] = usePersist<string[]>(`${scope}.inboxRead`, []);
  const [askSeed, setAskSeed] = useState("");
  const [navKey, setNavKey] = useState(0);
  const live = useLive();

  // Every engine call below reads the league format set here.
  applyFormat(format);
  const fkey = `${format.scoring}|${format.superflex}|${format.tePremium}`;

  useEffect(() => { loadJerseyNumbers(); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); document.documentElement.dataset.tab = tab; }, [tab]);
  // Accent color follows the fantasy platform you're connected to. Chalk and graphite stay the same everywhere.
  // The top bar only gets its glass, edge and shadow once content scrolls under it
  useEffect(() => {
    const el = document.documentElement;
    const on = () => { if (window.scrollY > 4) el.dataset.scrolled = ""; else delete el.dataset.scrolled; };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    if (!inboxOpen) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setInboxOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [inboxOpen]);
  useEffect(() => { document.documentElement.dataset.platform = LEAGUE.platform ?? "sleeper"; }, []);
  // Toasts drop back out the way they came in: mark leaving, then remove once the exit has played
  const [toastOut, setToastOut] = useState(false);
  useEffect(() => {
    if (!toast) return; setToastOut(false);
    const t = window.setTimeout(() => setToastOut(true), toast.undo ? 5000 : 2800);
    const t2 = window.setTimeout(() => setToastState(null), (toast.undo ? 5000 : 2800) + 200);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [toast]);
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
    TEAMS.filter((t) => !t.you).forEach((t) => (out[t.id] = pausedTeams.includes(t.id) ? [] : findTrades(YOU, t, active, myTags, prices).filter((x) => !hiddenIdeas.includes(x.key) && !x.get.some((id) => passed.includes(id)))));
    return out;
  }, [active, myTags, prices, fkey, hiddenIdeas, pausedTeams, passed]); // eslint-disable-line react-hooks/exhaustive-deps

  const partners = useMemo(() => needs.filter((n) => !n.team.you && suggestionsByTeam[n.team.id]?.[0])
    .map((n) => {
      const t = suggestionsByTeam[n.team.id][0];
      const g = n.groups[n.need];
      const want = active.find((x) => x.teamId === n.team.id && x.kind === "wants");
      const lead = want ? `${want.text}` : g.diff < -0.5 ? `Thin at ${n.need} (${fmt(g.diff)}/wk)` : `No glaring need, but deep enough to deal`;
      const why = `${lead}. Your ${t.give.map((id) => playerById(id).name).join(" + ")} gets it done.`;
      return { n, t, why };
    })
    .sort((a, b) => Math.min(b.t.youDelta, b.t.themDelta) + (b.t.fillsWant ? 1 : 0) - Math.min(a.t.youDelta, a.t.themDelta) - (a.t.fillsWant ? 1 : 0))
    .slice(0, 3), [needs, suggestionsByTeam, active]);

  // Every free agent, ranked weakness first. Waivers lists them all (passed ones dimmed); every other surface
  // only sees the ones you haven't passed on, and only recommends a real pick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allRecs = useMemo(() => waiverRecs(YOU), [fkey]);
  const recs = useMemo(() => allRecs.filter((r) => !passed.includes(r.fa.id)), [allRecs, passed]);
  const topRec = recs.find((r) => r.pick);
  /** "Not interested": one list per league, shared by trade ideas and every waiver suggestion. */
  const passPlayer = useCallback((p: { id: string; name: string }) => {
    setPassed((c) => [...c.filter((x) => x !== p.id), p.id]);
    haptic();
    setToast(`Got it. Sources won't suggest ${p.name} again.`, () => setPassed((c) => c.filter((x) => x !== p.id)));
  }, [setPassed, setToast]);
  const unpassPlayer = useCallback((p: { id: string; name: string }) => {
    setPassed((c) => c.filter((x) => x !== p.id));
    setToast(`${p.name} is back in suggestions.`, () => setPassed((c) => [...c.filter((x) => x !== p.id), p.id]));
  }, [setPassed, setToast]);
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
    const counter = offer ? counterFor(offer, active, myTags, prices) : null;
    if (offer) list.push({
      id: "offer-dan", kind: "offer", teamId: "dan", headline: "Dan offered Ladd McConkey for your Zay Flowers.",
      // Only promise a counter when there is one to show
      why: `${offerRead(offer).line} Here's the breakdown${counter ? " and a counter that fits their tags" : ""}.`, trades: [], time: "12 min ago",
      offer, counter, deadline: DEADLINES.trade,
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
    // Waivers: the best pick that fixes a weak spot (or a real hole), never one you passed on
    const w = topRec;
    const wDrop = w && recDrop(w);
    if (w) list.push({
      id: `waiver-${w.fa.id}`, kind: "waiver", headline: w.kdef?.fix ? w.kdef.line.split(".")[0] + "." : w.fit ? `${w.fa.name} is your best add this week.` : demo ? `${w.fa.why.split(".")[0].replace(/^The /, "the ")}.` : `${w.fa.name} is your best add this week.`,
      emph: w.kdef ? (FAAB.enabled ? `Grab ${w.fa.name} for $${bidDollars(w.bid[1])} or less.` : "Put in a low priority claim.") : FAAB.enabled ? `Bid ${w.bid[0]} to ${w.bid[1]} percent.` : "Put in a claim.",
      why: `${w.kdef ? `${w.fa.name} adds ${fmt(w.gain)} to your starters` : w.fit ? w.fit.replace(/\.$/, "") : `${w.fa.name} adds ${fmt(w.gain)} to your starters`}${wDrop ? `. Drop ${wDrop.name}` : ""}. ${w.kdef ? "Kickers and defenses rarely cost more than a dollar." : "Bid based on what wins in your league."}`,
      trades: [], time: "Today", deadline: DEADLINES.waivers, go: { label: "Open waivers", tab: "waivers" }, pass: { id: w.fa.id, name: w.fa.name },
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
    waiver: topRec ? `${topRec.fa.name}: bid ${topRec.bid[0]}-${topRec.bid[1]}%${recDrop(topRec) ? `, drop ${recDrop(topRec)!.name}` : ""}` : "Nothing on the wire fixes a weak spot this week.",
    waiverPass: topRec ? { id: topRec.fa.id, name: topRec.fa.name } : undefined,
  };

  const askStarters = useMemo(() => {
    const rival = TEAMS.filter((t) => !t.you).flatMap((t) => t.roster.map(playerById)).filter((p) => !(p.status === "O" && p.longTerm))
      .sort((a, b) => (b.pts?.ppr ?? b.proj) - (a.pts?.ppr ?? a.proj))[0];
    const mgr = partners[0]?.n.team.manager ?? TEAMS.find((t) => !t.you)!.manager;
    return [`Who needs a ${youNeeds.surplus ?? "WR"} most?`, rival ? `What would it take to get ${rival.name.split(" ").slice(-1)[0]}?` : "Who should I trade with?",
      "Who should I start at flex?", "Who should I trade with?", "Best waiver add this week?", `What does ${mgr} need?`];
  }, [partners, youNeeds]);

  const trade = !extra.length && give.length && get.length ? evaluate(YOU, teamById(partnerId), give, get, active, myTags, prices) : null;
  const legs: DealLeg[] = [{ teamId: partnerId, give, get }, ...extra];
  // A multi-team deal reads once every partner has a player moving and you both send and get someone
  const multi = extra.length && legs.every((l) => l.give.length + l.get.length > 0) && legs.some((l) => l.give.length) && legs.some((l) => l.get.length)
    ? evaluateMulti(YOU, legs, active, myTags, prices) : null;
  const tip = trade && level !== "light" ? builderTip(trade, active, myTags, prices) : null;

  const go = (dest: string, teamId?: string) => {
    // "settings:nudges" opens a screen on a specific section tab
    const [t, section] = dest.split(":");
    if (!(TAB_IDS as string[]).includes(t)) return;
    if (teamId) { if (t === "league") setFocusTeam(teamId); if (t === "trade" && isPartner(teamId)) { setPartnerId(teamId); setGive([]); setGet([]); setExtra([]); } }
    // Leaving a section starts it fresh next time (views like Standings or a filter only stick through a reload)
    if (t !== tab) { try { Object.keys(localStorage).filter((k) => k.startsWith("sources.ui.")).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } }
    if (t !== tab) { const m = document.getElementById("main"); if (m) m.style.minHeight = ""; }
    if (section) { try { localStorage.setItem(`sources.ui.${t}.view`, section); } catch { /* ignore */ } }
    // Same screen, new section (say, Slot report from the inbox while on Lineup): redraw it on that section
    if (section && t === tab) setNavKey((k) => k + 1);
    setInboxOpen(false);
    if (t !== "ask") setAskSeed("");
    setTab(t as Tab);
    try { history.replaceState(null, "", `#${t}`); } catch { /* ignore */ }
    // A team deep link (League) is opened and scrolled to by the Needs list itself
  };
  // The logo goes home: the Wire, back at the top (go() alone won't scroll if you're already there)
  const goHome = () => { go("wire"); window.scrollTo({ top: 0 }); };
  const loadTrade = (t: Trade) => { if (!isPartner(t.partnerId)) return; setPartnerId(t.partnerId); setGive(t.give); setGet(t.get); setExtra([]); go("trade"); };
  const toggle = (side: "give" | "get", id: string, teamId?: string) => {
    // Up to 10 a side per team, so bigger packages and roster-clearing deals fit
    const flip = (cur: string[]) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 10 ? cur : [...cur, id]);
    // Already in the deal: take it out wherever it is, whichever team it was headed to
    const inExtra = extra.find((l) => l[side].includes(id));
    if (inExtra) { setExtra((c) => c.map((l) => (l === inExtra || l.teamId === inExtra.teamId ? { ...l, [side]: l[side].filter((x) => x !== id) } : l))); return; }
    if (!teamId || teamId === partnerId || !extra.some((l) => l.teamId === teamId)) { (side === "give" ? setGive : setGet)(flip); return; }
    if ((side === "give" ? give : get).includes(id)) { (side === "give" ? setGive : setGet)(flip); return; }
    setExtra((c) => c.map((l) => (l.teamId === teamId ? { ...l, [side]: flip(l[side]) } : l)));
  };
  const setPartner = (id: string) => {
    if (!isPartner(id)) return;
    // Picking a team that's already in a multi-team deal makes it the lead partner, keeping every leg
    const leg = extra.find((l) => l.teamId === id);
    if (leg) { setExtra((c) => c.map((l) => (l.teamId === id ? { teamId: partnerId, give, get } : l))); setPartnerId(id); setGive(leg.give); setGet(leg.get); return; }
    setPartnerId(id); setGet([]);
  };
  const addPartner = (id: string) => setExtra((c) => (c.length >= 2 || id === partnerId || c.some((l) => l.teamId === id) ? c : [...c, { teamId: id, give: [], get: [] }]));
  const removePartner = (id: string) => {
    if (id !== partnerId) { setExtra((c) => c.filter((l) => l.teamId !== id)); return; }
    const [next, ...rest] = extra;
    if (!next) return;
    setPartnerId(next.teamId); setGive(next.give); setGet(next.get); setExtra(rest);
  };
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
  /** "Won't work": hide the idea, then teach Sources the reason so similar ideas stop showing up. */
  const ideaFeedback = (t: Trade, r: IdeaReason) => {
    const them = teamById(t.partnerId);
    const before = { tags, myTags, hiddenIdeas, pausedTeams, passed };
    // "I don't want Chase Brown" typed into the note box works like the button
    if (r.kind === "note") {
      const m = r.text.match(/\b(?:i\s+)?(?:don'?t|do not)\s+want\s+(.+)$/i);
      // Same matcher as the pickers: "st brown", "jamarr", "aj brown", or the picker's own shorthand ("asb", "chase b")
      const gets = t.get.map(playerById);
      const hit = m && (playersInText(m[1], gets, (p) => p.name)[0]?.item.id
        ?? rankPlayers(m[1], gets, (p) => ({ name: p.name })).find((x) => x.match.score >= TIER.inner)?.item.id);
      if (hit) r = { kind: "pass", playerId: hit };
    }
    setHiddenIdeas((c) => [...c.filter((k) => k !== t.key), t.key]);
    let msg = "Hidden. Sources will skip ideas like this.";
    if (r.kind === "refuses") { setTags((c) => [...c, { id: `u${Date.now()}`, teamId: them.id, kind: "refuses", playerId: r.playerId, text: `Won't move ${playerById(r.playerId).name}`, weeksOld: 0 }]); msg = `Got it. ${playerById(r.playerId).name} is off the table in ideas with ${them.manager}.`; }
    if (r.kind === "notInterested") { setTags((c) => [...c, { id: `u${Date.now()}`, teamId: them.id, kind: "notInterested", playerId: r.playerId, text: `Not interested in ${playerById(r.playerId).name}`, weeksOld: 0 }]); msg = `Got it. ${them.manager} won't see ${playerById(r.playerId).name} in ideas.`; }
    if (r.kind === "keeping") { setMyTags((c) => ({ ...c, [r.playerId]: "untouchable" })); msg = `${playerById(r.playerId).name} marked untouchable. He's out of every trade idea.`; }
    if (r.kind === "pass") { const id = r.playerId; setPassed((c) => [...c.filter((x) => x !== id), id]); msg = `Got it. Sources won't suggest ${playerById(id).name} again.`; }
    if (r.kind === "paused") { setPausedTeams((c) => [...c.filter((x) => x !== them.id), them.id]); msg = `No more ideas with ${them.manager} for now. Turn it back on in Settings.`; }
    if (r.kind === "note") { const parsed = parseTag(`${them.manager} ${r.text}`); if (parsed.tag) { setTags((c) => [...c, { ...parsed.tag!, id: `u${Date.now()}` }]); msg = `Saved: ${parsed.tag.text}. Ideas now follow it.`; } }
    haptic();
    setToast(msg, () => { setTags(before.tags); setMyTags(before.myTags); setHiddenIdeas(before.hiddenIdeas); setPausedTeams(before.pausedTeams); setPassed(before.passed); });
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

  const checks = useMemo(() => gameDayChecks(yourLineup), [yourLineup]);
  // Your roster's news feeds the Wire card and, for starters with a fresh status change, the inbox
  const newsPlayers = useMemo(() => yourPlayers(), [fkey, YOU.roster.join()]);
  const rosterNews = useRosterNews(newsPlayers);
  const urgent = useMemo(() => urgentNews(newsPlayers, rosterNews.byId), [rosterNews.byId, newsPlayers]);
  const inbox = useMemo(() => buildInbox({ nudges, checks, live, go, loadTrade, keepTag, news: urgent, pass: passPlayer })
    .filter((x) => x.nudge || !dismissedIds.includes(x.id)), // eslint-disable-next-line react-hooks/exhaustive-deps
  [nudges, checks, yourLineup, live, dismissedIds, tab, urgent]);
  const unread = inbox.filter((x) => !readIds.includes(x.id)).length;
  // Every page, Trade included, uses the same frame: the panel docks wherever it docks elsewhere
  const docked = dockWide;
  const panelOpen = docked ? dockOpen : inboxOpen;
  const toggleInbox = () => {
    const opening = !panelOpen;
    // The bell rings on open and on close (icons.tsx rings any inbox control on click)
    if (docked) setDockPref(opening); else setInboxOpen(opening);
    if (opening) setIbxFocus((n) => n + 1);
  };
  const closeInbox = () => { if (docked) setDockPref(false); else setInboxOpen(false); };
  // Trade's Partner profile button: one click opens the panel (docked from 1241px like every page, a slide-over below) on the partner card
  const openProfile = () => {
    if (docked) setDockPref(true); else setInboxOpen(true);
    setIbxFocus((n) => n + 1);
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>("#inbox .pctx-partner");
      el?.scrollIntoView({ block: "nearest" }); el?.focus({ preventScroll: true });
    }, 60);
  };
  const bellLabel = `Inbox${unread ? `, ${unread} unread` : ""}`;
  const markRead = (id: string) => setReadIds((c) => (c.includes(id) ? c : [...c, id].slice(-200)));
  const dismissItem = (it: InboxItem) => {
    markRead(it.id);
    if (it.nudge) { dismiss(it.nudge); return; }
    const prev = dismissedIds;
    setDismissedIds((c) => [...c, it.id]);
    setToast("Dismissed.", () => setDismissedIds(prev));
  };

  return (
    <div className={`shell${inboxOpen ? " inbox-open" : ""}${dockOpen ? "" : " dock-off"}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="app-field" aria-hidden="true"><div className="app-turf" /></div>
      <aside className="side">
        <div className="brand">
          <button type="button" className="lockup side-logo" style={{ ["--lh" as string]: "30px" }} aria-label="Sources home" onClick={goHome}><Logo height={30} /><span className="lockup-tag">Your fantasy insider</span></button>
        </div>
        <button className="league-pill lsw-btn" onClick={() => setSwitching("list")} aria-haspopup="dialog">
          <ManagerAvatar key={LEAGUE.id} src={[LEAGUE.userAvatar, LEAGUE.userPhoto]} name={meName} size={32} className="tp-av lsw-me" />
          <span className="grow"><b>{LEAGUE_NAME}</b><span>{formatLabel(format)} · Week {WEEK}</span></span>
          <Icon name="switch" size={16} />
        </button>
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
          {TABS.filter((t) => !t.main && !t.hidden).map((t) => (
            <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
              <span className="ix-ic"><Icon name={t.icon} size={20} active={tab === t.id} /></span><span className="ix-w">{t.short}</span>
            </button>
          ))}
        </nav>
        <p className="side-foot">{demo ? <>Demo league with sample data. <button className="linkish" onClick={onReconnect}>Connect Sleeper</button></> : <>Live from <PlatformName size={12} /> as @{username}. {LEAGUE.updated}.</>}</p>
      </aside>

      <header className="topbar">
        <button type="button" className="top-logo lockup" style={{ ["--lh" as string]: "24px" }} aria-label="Sources home" onClick={goHome}><Logo height={24} /><span className="lockup-tag">Your fantasy insider</span></button>
        <div className="row" style={{ gap: 4 }}>
          {UPDATED && <Tooltip content={UPDATED}><span className="top-upd">{/refreshed\s+(.+)$/i.exec(UPDATED)?.[1] ?? UPDATED.replace(/^Projections updated\s*/i, "")}</span></Tooltip>}
          <button className="btn btn-icon btn-ghost top-bell" aria-label={bellLabel} aria-expanded={panelOpen} aria-controls="inbox" onClick={toggleInbox}>
            <Icon name="bell" size={20} />{unread > 0 && <span className="ibx-badge" aria-hidden="true">{unread}</span>}
          </button>
          <button className="btn btn-icon btn-ghost" aria-label="Settings" aria-current={tab === "settings" ? "page" : undefined} onClick={() => go("settings")}><Icon name="gear" size={20} /></button>
        </div>
      </header>

      <main className="main" id="main" tabIndex={-1}>
        <LeagueCtx.Provider value={{ name: LEAGUE_NAME, line: `${formatLabel(format)} · Week ${WEEK}`, open: () => setSwitching("list"), avatar: [LEAGUE.userAvatar, LEAGUE.userPhoto], who: meName }}>
        <IdeaFeedbackCtx.Provider value={setFeedbackFor}>
        <div className="main-inner">
          {/* Desktop's inbox bell: top right of the page, the same control as the phone top bar's. Outside the keyed
              screen below, so switching tabs never redraws it (or replays its badge). */}
          <button type="button" className="btn btn-icon btn-ghost top-bell desk-bell" aria-label={bellLabel} aria-expanded={panelOpen} aria-controls="inbox" onClick={toggleInbox}>
            <Icon name="bell" size={20} />{unread > 0 && <span className="ibx-badge" aria-hidden="true">{unread}</span>}
          </button>
          <Fragment key={`${tab}:${navKey}`}>
          {tab === "wire" && (
            <Wire you={youNeeds} partner={partners[0]?.n.team.manager ?? null} partnerId={partners[0]?.n.team.id ?? null} nudges={nudges} followUps={followUps} briefing={briefing} coach={coach} level={level}
              onOpen={loadTrade} onPitch={setPitch} onGo={go} onDismiss={dismiss} onTag={addTag} onPass={passPlayer}
              onResolve={(id, msg) => { setFollowUps((c) => c.filter((f) => f.id !== id)); setToast(msg); }}
              onCapture={() => go("league")}
              onKeepTag={keepTag} onClearTag={clearTag} />
          )}
          {tab === "matchup" && <Matchup onBack={() => go("wire")} />}
          {tab === "how" && <HowItWorks onBack={() => go("settings:about")} />}
          {tab === "legal" && <Legal onBack={() => go("settings:about")} />}
          {tab === "league" && (
            <League needs={needs} tags={tags} fade={fade} focusId={focusTeam} onFocused={() => setFocusTeam(undefined)} partners={partners} onAddTag={addTag}
              onTrade={(id) => go("trade", id)} onOpen={loadTrade} onRemoveTag={clearTag} onKeepTag={keepTag} />
          )}
          {tab === "trade" && (
            <TradeBuilder partnerId={partnerId} setPartner={setPartner} give={give} get={get} toggle={toggle}
              clear={() => { setGive([]); setGet([]); setExtra((c) => c.map((l) => ({ ...l, give: [], get: [] }))); }} trade={trade}
              extra={extra} multi={multi} addPartner={addPartner} removePartner={removePartner} onProfile={openProfile} profileOpen={panelOpen} suggestions={suggestionsByTeam[partnerId] ?? []}
              tags={active} myTags={myTags} tip={tip} coach={coach} onPitch={setPitch} onLoad={loadTrade} onAddTag={addTag} onRemoveTag={clearTag} />
          )}
          {tab === "roster" && (
            <Roster side={<Threats onGo={go} />} lineup={yourLineup} myTags={myTags} prices={prices} tags={active} level={level} onPitch={setPitch}
              setPrice={(id, p) => setPrices((c) => { const n = { ...c }; if (p) n[id] = p; else delete n[id]; return n; })}
              setTag={(id, v) => { setMyTags((cur) => { const n = { ...cur }; if (v) n[id] = v; else delete n[id]; return n; }); if (v) setToast(`${playerById(id).name} marked ${v === "amazing" ? "overpay only" : v === "available" ? "trade bait" : v}.`); }} />
          )}
          {tab === "waivers" && <Waivers recs={allRecs} onToast={setToast} watch={watch} onWatch={setWatch} passed={passed} onPass={passPlayer} onUnpass={unpassPlayer} />}
          {tab === "ask" && <Ask initial={askSeed} answer={(q) => ask(q, active, myTags, prices, passed)} onLink={onLink} starters={askStarters} />}
          {tab === "settings" && (
            <Settings username={username} demo={demo} leagueFormat={LEAGUE.format} onRefresh={onRefresh} format={format} setFormat={(f) => { setFormat(f); setToast(`League format: ${formatLabel(f)}. Every number updated.`); }}
              level={level} setLevel={setLevel} fade={fade} setFade={setFade}
              dismissed={dismissed} resetDismissed={() => { setDismissed({}); setDismissedIds([]); setToast("Nudges reset. You'll see everything again."); }}
              onDisconnect={onDisconnect}
              accounts={accounts} activeUserId={session.mode === "live" ? session.userId : ""} onRemoveAccount={removeAccount}
              onAddAccount={() => setSwitching("add")} onSwitchLeague={() => setSwitching("list")}
              onDelete={onDeleteAll}
              onGo={(t) => go(t as Tab)}
              paused={pausedTeams.map((id) => ({ id, manager: teamById(id).manager }))} onResume={(id) => { setPausedTeams((c) => c.filter((x) => x !== id)); setToast(`Trade ideas with ${teamById(id).manager} are back.`); }}
              hiddenCount={hiddenIdeas.length} onUnhide={() => { const prev = hiddenIdeas; setHiddenIdeas([]); setToast("Hidden trade ideas are back.", () => setHiddenIdeas(prev)); }}
              passed={passed.map((id) => ({ id, name: playerName(id) }))} onBringBack={(p) => unpassPlayer(p)}
              onClearPassed={() => { const prev = passed; setPassed([]); setToast(`Cleared. Sources can suggest ${prev.length === 1 ? "that player" : `those ${prev.length} players`} again.`, () => setPassed(prev)); }}
              onReplay={onReconnect} />
          )}
          </Fragment>
        </div>
        </IdeaFeedbackCtx.Provider>
        </LeagueCtx.Provider>
      </main>

      <div className="ibx-scrim" aria-hidden="true" onClick={() => setInboxOpen(false)} />
      <aside className="rail ibx" id="inbox" aria-label="Inbox"
        onKeyDown={(e) => { if (e.key === "Escape" && docked && dockOpen) { e.stopPropagation(); closeInbox(); } }}>
        <InboxPanel items={inbox} read={readIds} open={panelOpen} focusTick={ibxFocus} onRead={markRead} onReadAll={() => setReadIds((c) => [...new Set([...c, ...inbox.map((x) => x.id)])].slice(-200))}
          onDismiss={dismissItem} onClose={closeInbox}
          onAsk={(q) => { setAskSeed(q); if (tab === "ask") setNavKey((k) => k + 1); go("ask"); }} />
      </aside>

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

      {switching && <LeagueSwitcher demo={demo} accounts={accounts} activeUserId={session.mode === "live" ? session.userId : undefined} adding={switching === "add"}
        onPick={onSwitchLeague} onAdd={(a) => onAccounts(mergeAccounts(accounts, a))} onConnect={onReconnect} onClose={() => setSwitching(false)} />}
      {feedbackFor && <IdeaFeedback trade={feedbackFor} onPick={(r) => ideaFeedback(feedbackFor, r)} onClose={() => setFeedbackFor(null)} />}
      {pitch && <PitchSheet trade={pitch} onClose={() => setPitch(null)} onSent={(m, via) => {
        setToast(m);
        if (via) haptic();
        if (via) setFollowUps((c) => [{ id: `f${Date.now()}`, trade: pitch, via, when: "today" }, ...c.filter((f) => f.trade.key !== pitch.key)].slice(0, 3));
      }} />}
      {toast && (
        <div className={`toast${toastOut ? " leaving" : ""}`} role="status" key={toast.id}>
          <span>{toast.msg}</span>
          {toast.undo && <button className="toast-undo" onClick={() => { toast.undo!(); setToastState(null); }}>Undo</button>}
        </div>
      )}
    </div>
  );
}


/** Session wrapper: picks demo or live Sleeper, loads the league, runs first-run setup. */
export default function App() {
  useEffect(() => installIconTooltips(), []);
  // Older single-account sessions are rewritten into the accounts list on first read, so nobody is signed out.
  const [session, setSession] = usePersist<Session>("session", { mode: "none" }, normalizeSession);
  const [reloadTick, setReloadTick] = useState(0);
  const liveKey = session.mode === "live" ? `${session.userId}:${session.leagueId}` : session.mode;
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
    loadLeague(session.leagueId, session.userId, activeAccount(session)?.username ?? "", setStep)
      .then((d) => { if (cancelled) return; setLeague(d); setVersion((v) => v + 1); setStatus("ready"); })
      .catch((e: unknown) => { if (cancelled) return; setError(e instanceof Error ? e.message : "We couldn't load your league from Sleeper. Try again in a minute."); setStatus("error"); });
    return () => { cancelled = true; };
    // Adding or removing an account leaves the league on screen alone, so it doesn't reload it.
  }, [liveKey, reloadTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = () => setReloadTick((t) => t + 1);
  /** Back to the landing. Connected accounts are remembered and merged with the next one. */
  const toLanding = () => setSession((s) => { const accounts = accountsOf(s); return accounts.length ? { mode: "none", accounts } : { mode: "none" }; });

  // Loader holds long enough for the mark to form and the light to make a pass, then lifts off over the app.
  const [boot, setBoot] = useState<"off" | "on" | "leaving">("off");
  const bootAt = useRef(0);
  useEffect(() => {
    if (status === "loading") { bootAt.current = Date.now(); setBoot("on"); return; }
    if (boot !== "on") return;
    if (status !== "ready") { setBoot("off"); return; }
    const t1 = window.setTimeout(() => setBoot("leaving"), Math.max(0, 1300 - (Date.now() - bootAt.current)));
    const t2 = window.setTimeout(() => setBoot("off"), Math.max(0, 1300 - (Date.now() - bootAt.current)) + 340);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "loading") return <Boot step={step} />;
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
      {boot !== "off" && <Boot step={step} leaving={boot === "leaving"} />}
      {session.mode !== "none" ? (
        <Shell key={`${leagueKey()}:${version}`} session={session} initialMyTags={initialMyTags}
          onReconnect={toLanding}
          onDisconnect={() => setSession({ mode: "none" })}
          onDeleteAll={() => { store.clear(); setSession({ mode: "none" }); }}
          onRefresh={reload}
          onAccounts={(accounts) => setSession((s) => (s.mode === "live" && accounts.some((a) => a.userId === s.userId) ? { ...s, accounts } : s))}
          onSwitchLeague={(leagueId, userId) => setSession((s) => (s.mode === "live" && s.accounts.some((a) => a.userId === userId) ? { ...s, leagueId, userId } : s))} />
      ) : <Landing onLive={(st) => setStart({ kind: "live", ...st })} onDemo={() => { setLeague(demoLeague()); setStart({ kind: "demo" }); }} />}
      {session.mode === "none" && start && (
        <FirstRun start={start} onClose={() => { setStart(null); setLeague(demoLeague()); }}
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
