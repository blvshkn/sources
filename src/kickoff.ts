// Kickoff times by NFL team and week, so game lines read "v ATL · Sun 1:00 PM" before the game.
// Source order matches the game clocks (live.ts): our /api/kickoffs route, then ESPN's scoreboard straight from the
// browser. Each week is kept in memory, with a light localStorage copy so a reload draws times right away.
// A time only shows when ESPN's opponent matches ours and the game hasn't kicked off; otherwise the line falls back
// to the day-only text ("v ATL · Sun"). Nothing here makes up a time.
import { useEffect, useSyncExternalStore } from "react";
import { DEADLINES, LEAGUE, WEEK, gameState } from "./data";
import { liveGamesNow } from "./live";
import { gameIn } from "./weekMatch";

interface WeekKick { at: number; teams: Record<string, string>; opp: Record<string, string> }

const ESPN_FIX: Record<string, string> = { WSH: "WAS", LA: "LAR", JAC: "JAX" };
const FRESH_MS = 60 * 60 * 1000; // matches the route's edge cache
const LS = "sources.kick.";
const mem = new Map<string, WeekKick>();
const inflight = new Set<string>();
const subs = new Set<() => void>();
let ver = 0;
const bump = () => { ver++; subs.forEach((f) => f()); };

const season = () => String(LEAGUE?.season ?? new Date().getFullYear()).replace(/\D/g, "").slice(0, 4);
const keyOf = (week: number) => `${season()}.${week}`;

function readLs(key: string): WeekKick | null {
  try {
    const d = JSON.parse(localStorage.getItem(LS + key) ?? "null") as WeekKick | null;
    return d && typeof d.at === "number" && d.teams && typeof d.teams === "object" ? { at: d.at, teams: d.teams, opp: d.opp ?? {} } : null;
  } catch { return null; }
}
function writeLs(key: string, d: WeekKick) {
  try {
    localStorage.setItem(LS + key, JSON.stringify(d));
    // Keep it light: only this season's weeks
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith(LS) && !k.startsWith(`${LS}${season()}.`)) localStorage.removeItem(k); }
  } catch { /* storage full or blocked: memory still has it */ }
}

type EEvent = { date?: string; competitions?: { date?: string; competitors?: { team?: { abbreviation?: string } }[] }[] };
function fromEspn(events: EEvent[] | undefined): Pick<WeekKick, "teams" | "opp"> {
  const teams: Record<string, string> = {}, opp: Record<string, string> = {};
  for (const e of events ?? []) for (const c of e.competitions ?? []) {
    const at = c.date ?? e.date;
    if (!at || Number.isNaN(Date.parse(at))) continue;
    const both = (c.competitors ?? []).map((t) => t.team?.abbreviation).filter((a): a is string => !!a).map((a) => ESPN_FIX[a] ?? a);
    for (const a of both) { teams[a] = new Date(at).toISOString(); const o = both.find((b) => b !== a); if (o) opp[a] = o; }
  }
  return { teams, opp };
}

async function fetchWeek(week: number): Promise<Pick<WeekKick, "teams" | "opp"> | null> {
  const s = season();
  try {
    const r = await fetch(`/api/kickoffs?season=${s}&week=${week}`);
    if (r.ok) { const d = await r.json() as Partial<WeekKick>; if (d.teams && Object.keys(d.teams).length) return { teams: d.teams, opp: d.opp ?? {} }; }
  } catch { /* fall through */ }
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${s}`);
    if (r.ok) { const d = fromEspn((await r.json() as { events?: EEvent[] }).events); if (Object.keys(d.teams).length) return d; }
  } catch { /* fall through */ }
  return null;
}

/** Load a week's kickoffs once per session (and again after an hour). Safe to call on every render. */
export function loadKickoffs(week: number) {
  if (!LEAGUE || !(week >= 1 && week <= 18)) return;
  const key = keyOf(week);
  let hit = mem.get(key);
  if (!hit) { const ls = readLs(key); if (ls) { mem.set(key, ls); hit = ls; bump(); } }
  if ((hit && Date.now() - hit.at < FRESH_MS) || inflight.has(key)) return;
  inflight.add(key);
  fetchWeek(week).then((d) => {
    if (!d) return;
    const next = { at: Date.now(), ...d };
    mem.set(key, next); writeLs(key, next); bump();
  }).finally(() => inflight.delete(key));
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** Re-render when kickoff times arrive, and load the weeks given (this week is always loaded). */
export function useKickoffs(...weeks: (number | null | undefined)[]): number {
  const v = useSyncExternalStore(subscribe, () => ver);
  const list = [WEEK, ...weeks.filter((w): w is number => typeof w === "number")];
  const sig = [...new Set(list)].join(",");
  useEffect(() => { sig.split(",").forEach((w) => loadKickoffs(Number(w))); }, [sig]);
  return v;
}

// ---- Formatting -------------------------------------------------------------

const fmtShort = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
const fmtZone = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
/** "Sun 1:00 PM" in the viewer's time zone; with `zone`, "Sun 1:00 PM EDT". Minutes always show, so times line up. */
export function fmtKick(iso: string, zone = false): string {
  const parts = (zone ? fmtZone : fmtShort).formatToParts(new Date(iso));
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  // A no-break space keeps "1:00 PM" together
  return [p("weekday"), `${p("hour")}:${p("minute")} ${p("dayPeriod")}`, zone ? p("timeZoneName") : ""].filter(Boolean).join(" ");
}

const oppTeam = (opp: string | undefined) => /([A-Z]{2,3})\s*$/.exec(opp ?? "")?.[1];
const started = (team: string, week: number, iso: string) => {
  if (Date.now() >= Date.parse(iso)) return true;
  if (week !== WEEK) return false;
  const live = liveGamesNow()[team], s = gameState(team);
  return live === "in_game" || live === "complete" || s === "in_game" || s === "complete";
};

/** A team's kickoff that week as ISO, only when it's still ahead and ESPN pairs it with the same opponent. */
export function kickoffOf(team: string | undefined, week: number = WEEK, opp?: string): string | undefined {
  if (!team) return undefined;
  const w = mem.get(keyOf(week)), iso = w?.teams[team];
  if (!iso) return undefined;
  const o = oppTeam(opp);
  if (o && w.opp[team] && w.opp[team] !== o) return undefined;
  return started(team, week, iso) ? undefined : iso;
}

// Lines read opponent first, then when: "v ATL · Sun 1:00 PM". The team goes right before the opponent with no
// dot between them ("RB · NO v PIT · Sun 1:00 PM"), so callers write `${nfl} ${line}`.

/** An opponent with the kickoff after it when it's known and still ahead: "@ HOU · Sun 1:00 PM", else the opponent as given. */
export function oppAt(team: string | undefined, opp: string, week: number = WEEK): string {
  const iso = kickoffOf(team, week, opp);
  return iso ? `${opp} · ${fmtKick(iso)}` : opp;
}

/** This week's opponent as shown: "v ATL", "vs ATL" or "@ SEA" (Sleeper's live opponents come without home/away). */
export const oppText = (opp: string | undefined) => (!opp ? "" : /^(vs|v|@)\s/.test(opp) ? opp : `v ${opp}`);

/** When this week's game is: "Sun 1:00 PM" before kickoff when the time is known, else the day from the game date
 *  ("Sun", read at noon so no time zone moves it), else empty. */
export function kickWhen(x: { nfl?: string; opp?: string; gameDate?: string }): string {
  const iso = x.opp ? kickoffOf(x.nfl, WEEK, x.opp) : undefined;
  if (iso) return fmtKick(iso);
  // The date at noon, so no time zone moves it
  return x.gameDate ? new Date(`${x.gameDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }) : "";
}

/** The kickoff for a team's game in any week ("Sun 1:00 PM"), empty when unknown or already started. */
export const kickWhenIn = (team: string, opp: string, week: number): string => { const iso = kickoffOf(team, week, opp); return iso ? fmtKick(iso) : ""; };

/** This week's game line: "v ATL · Sun 1:00 PM", "v ATL · Sun" without a time, just "v ATL" without a date.
 *  Empty with no opponent. */
export const kickLine = (x: { nfl?: string; opp?: string; gameDate?: string }): string =>
  !x.opp ? "" : [oppText(x.opp), kickWhen(x)].filter(Boolean).join(" · ");

/** gameIn with the kickoff after it: "@ HOU · Sun 1:00 PM". Null on a bye, opponent only when no time is known. */
export function gameInAt(p: Parameters<typeof gameIn>[0], week: number): string | null {
  const g = gameIn(p, week);
  return g ? oppAt(p.nfl, g, week) : g;
}

/** "Lineups lock Thu 8:15 PM EDT" from this week's next kickoff when known, else the league's deadline text. */
export function lockLine(): string {
  const w = mem.get(keyOf(WEEK));
  const next = Object.entries(w?.teams ?? {}).filter(([t, iso]) => !started(t, WEEK, iso)).map(([, iso]) => iso).sort()[0];
  return next ? `Lineups lock ${fmtKick(next, true)}` : DEADLINES.lock;
}
