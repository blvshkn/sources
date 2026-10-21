import type { SleeperMatchupRow } from "./liveMath";
// League data store. The app runs on a live Sleeper league (see sleeper.ts)
// or on the built-in demo league below. Everything the UI reads lives in the
// mutable exports at the bottom of this file, swapped in by setLeague().
// Demo players are real NFL names with illustrative projections; demo teams,
// managers, trades and bids are fictional.

export type Pos = "QB" | "RB" | "WR" | "TE";
export type Status = "Q" | "O";

/** Points by scoring type. `rec` is projected receptions, used for TE premium. */
export interface Pts { ppr: number; half: number; std: number; rec: number }

export interface Player {
  id: string;
  name: string;
  pos: Pos;
  nfl: string;
  /** Rest-of-season weekly PPR value (demo players carry only this). */
  proj: number;
  /** Rest-of-season weekly points by scoring type (live). */
  pts?: Pts;
  /** This week's projection. null = bye or not projected to play. */
  wk?: Pts | null;
  status?: Status;
  /** Out long term (IR, PUP, suspended). Weekly "Out" only zeroes this week. */
  longTerm?: boolean;
  note?: string;
  rookie?: boolean;
  /** Average weekly points over the fantasy playoff weeks (live). */
  playoff?: Pts;
  /** Blended trade value on a 0-10,000 scale (top player = 10,000). See valueModel in sleeper.ts. */
  value?: number;
  /** The two legs of the blend, on the same scale: the trade market and our production model. */
  fcValue?: number;
  modelValue?: number;
  /** Can go in an IR slot under this league's rules. */
  irEligible?: boolean;
  /** Raw injury designation from Sleeper (IR, PUP, Out, Sus...). */
  injury?: string;
  /** This week's opponent and game date (YYYY-MM-DD). */
  opp?: string;
  gameDate?: string;
}

export interface Team {
  id: string;
  name: string;
  manager: string;
  record: string;
  pf: number;
  /** Points against this season (live leagues, from Sleeper). */
  pa?: number;
  you?: boolean;
  /** Active roster only: starters and bench. IR and taxi players live below. */
  roster: string[];
  /** Current starters as set in Sleeper (skill players only, in slot order). Live leagues only. */
  starters?: string[];
  /** Manager picture URL (or a bare Sleeper avatar id), when they have one. Resolved by managerAvatar in sleeper.ts. */
  avatar?: string;
  /** The manager's personal Sleeper picture: the fallback when the team picture fails to load. */
  photo?: string;
  /** Players in IR slots. They don't count against the roster limit. */
  ir?: string[];
  /** Players on the taxi squad (dynasty). */
  taxi?: string[];
  /** Kickers and defenses. Shown in the lineup; the trade engine leaves them out. */
  special?: string[];
  /** K/DEF set in the Sleeper lineup this week. Undefined when we only have a roster (demo). */
  setSpecial?: string[];
}

/** A kicker or team defense. Kept apart from skill players so trades and waivers ignore them. */
/** What your team actually did in a past week, from Sleeper matchups. */
export interface WeekHistory { starters: string[]; players: string[]; points: Record<string, number>; total: number; oppTotal?: number; oppName?: string }
export interface SpecialPlayer { id: string; name: string; pos: "K" | "DEF"; nfl: string; wk: number | null; proj: number; status?: Status; note?: string; opp?: string; gameDate?: string }

/** [name, pos, team, proj, status, note]. "D" is Doubtful: status Q with Sleeper's injury word, as a live league reads it. */
type Row = [string, Pos, string, number, (Status | "D")?, string?];

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Sample managers' pictures (public/demo). Same-origin files, so they show on the public landing too, where Sleeper images are off.
const rosters: Record<string, { name: string; manager: string; record: string; pf: number; you?: boolean; avatar?: string; rows: Row[]; ir?: Row[] }> = {
  you: {
    name: "Third & Long",
    avatar: "/demo/you.webp",
    manager: "You",
    record: "4-2",
    pf: 742.6,
    you: true,
    rows: [
      ["Josh Allen", "QB", "BUF", 23.4],
      ["James Cook", "RB", "BUF", 16.8],
      ["Chuba Hubbard", "RB", "CAR", 13.9],
      ["Zay Flowers", "WR", "BAL", 15.6],
      ["Jalen Coker", "WR", "CAR", 12.8],
      ["Deebo Samuel", "WR", "WAS", 12.1, "Q", "Ankle, limited practice"],
      ["Dalton Kincaid", "TE", "BUF", 9.4],
      ["Tyler Warren", "TE", "IND", 10.1],
      ["Jaylen Warren", "RB", "PIT", 10.2],
      ["Romeo Doubs", "WR", "NE", 9.6],
      ["Tank Bigsby", "RB", "PHI", 8.6, "D", "Hamstring, did not practice"],
      ["Rashid Shaheed", "WR", "SEA", 9.0],
      ["Mike Gesicki", "TE", "CIN", 6.3],
    ],
    ir: [["Brandon Aiyuk", "WR", "SF", 11.0, "O", "IR, Knee"]],
  },
  mike: {
    name: "Mike's Mistakes",
    avatar: "/demo/mike.webp",
    manager: "Mike",
    record: "3-3",
    pf: 701.2,
    rows: [
      ["Jared Goff", "QB", "DET", 19.2],
      ["Chase Brown", "RB", "CIN", 15.9],
      ["Kyren Williams", "RB", "LAR", 15.1],
      ["Garrett Wilson", "WR", "NYJ", 14.2],
      ["Jerry Jeudy", "WR", "CLE", 11.8],
      ["Jakobi Meyers", "WR", "JAX", 10.5],
      ["Sam LaPorta", "TE", "DET", 11.0, "O", "Back, out Week 7"],
      ["Isaiah Likely", "TE", "NYG", 6.8],
      ["Javonte Williams", "RB", "DAL", 13.0],
      ["Kalif Raymond", "WR", "CHI", 7.4],
      ["Zach Charbonnet", "RB", "SEA", 10.8],
      ["Cedric Tillman", "WR", "CLE", 7.9],
      ["Mason Taylor", "TE", "NYJ", 5.9],
    ],
  },
  jake: {
    name: "Jake from State Farm",
    avatar: "/demo/jake.webp",
    manager: "Jake",
    record: "5-1",
    pf: 811.9,
    rows: [
      ["Lamar Jackson", "QB", "BAL", 22.1],
      ["Bijan Robinson", "RB", "ATL", 21.3],
      ["Breece Hall", "RB", "NYJ", 13.2],
      ["Ja'Marr Chase", "WR", "CIN", 19.4],
      ["Nico Collins", "WR", "HOU", 14.6],
      ["Rashee Rice", "WR", "KC", 11.9],
      ["Trey McBride", "TE", "ARI", 14.8],
      ["Kenneth Walker III", "RB", "KC", 15.0],
      ["Parker Washington", "WR", "JAX", 11.0],
      ["Sam Darnold", "QB", "SEA", 14.2],
      ["Rico Dowdle", "RB", "PIT", 10.6],
      ["Khalil Shakir", "WR", "BUF", 10.9],
      ["Dalton Schultz", "TE", "HOU", 7.2],
    ],
  },
  chris: {
    name: "Chris P. Bacon",
    manager: "Chris",
    record: "3-3",
    pf: 688.4,
    rows: [
      ["Brock Purdy", "QB", "SF", 18.6],
      ["Jonathan Taylor", "RB", "IND", 18.9],
      ["D'Andre Swift", "RB", "CHI", 12.7],
      ["CeeDee Lamb", "WR", "DAL", 17.8, "Q", "Ankle, limited practice"],
      ["Malik Nabers", "WR", "NYG", 16.4, "O", "Knee, out indefinitely"],
      ["Drake London", "WR", "ATL", 15.1],
      ["George Kittle", "TE", "SF", 12.4],
      ["Christian Watson", "WR", "GB", 11.4],
      ["Rhamondre Stevenson", "RB", "NE", 9.1],
      ["Ashton Dulin", "WR", "IND", 4.2],
      ["Rachaad White", "RB", "TB", 9.6],
      ["Keon Coleman", "WR", "BUF", 8.6],
      ["Juwan Johnson", "TE", "NO", 7.8],
    ],
  },
  dan: {
    name: "Dan's Dynasty",
    manager: "Dan",
    record: "4-2",
    pf: 776.0,
    rows: [
      ["Patrick Mahomes", "QB", "KC", 18.1],
      ["Jahmyr Gibbs", "RB", "DET", 21.8],
      ["Ashton Jeanty", "RB", "LV", 16.2],
      ["Puka Nacua", "WR", "LAR", 17.5],
      ["Tee Higgins", "WR", "CIN", 12.3],
      ["Ladd McConkey", "WR", "LAC", 11.2],
      ["Travis Kelce", "TE", "KC", 10.0],
      ["Bucky Irving", "RB", "TB", 12.0, "O", "Shoulder, out 2 to 4 weeks"],
      ["Bo Nix", "QB", "DEN", 16.0],
      ["Xavier Worthy", "WR", "KC", 8.8],
      ["Kareem Hunt", "RB", "KC", 8.2],
      ["Jayden Reed", "WR", "GB", 10.1],
      ["Pat Freiermuth", "TE", "PIT", 7.0],
    ],
  },
  kev: {
    name: "Kev's Krew",
    manager: "Kev",
    record: "2-4",
    pf: 694.3,
    rows: [
      ["Joe Burrow", "QB", "CIN", 20.4],
      ["Derrick Henry", "RB", "BAL", 17.0],
      ["Saquon Barkley", "RB", "PHI", 15.4],
      ["Amon-Ra St. Brown", "WR", "DET", 18.1],
      ["Chris Olave", "WR", "NO", 14.4],
      ["DeVonta Smith", "WR", "PHI", 11.7],
      ["Mark Andrews", "TE", "BAL", 8.9],
      ["Tetairoa McMillan", "WR", "CAR", 12.6],
      ["Tony Pollard", "RB", "TEN", 9.8],
      ["Hunter Henry", "TE", "NE", 8.1],
      ["Isiah Pacheco", "RB", "KC", 10.3],
      ["Jauan Jennings", "WR", "SF", 10.7],
      ["Cade Otton", "TE", "TB", 7.4],
    ],
  },
  taylor: {
    name: "Taylor Made",
    manager: "Taylor",
    record: "5-1",
    pf: 798.7,
    rows: [
      ["Jalen Hurts", "QB", "PHI", 19.8],
      ["Christian McCaffrey", "RB", "SF", 19.6],
      ["Omarion Hampton", "RB", "LAC", 11.1],
      ["Jaxon Smith-Njigba", "WR", "SEA", 18.6],
      ["Justin Jefferson", "WR", "MIN", 16.0],
      ["George Pickens", "WR", "DAL", 13.8],
      ["Brock Bowers", "TE", "LV", 14.1],
      ["Cam Skattebo", "RB", "NYG", 12.4],
      ["Davante Adams", "WR", "LAR", 12.0],
      ["Jordan Love", "QB", "GB", 15.1],
      ["Jaylen Wright", "RB", "MIA", 8.0],
      ["Calvin Ridley", "WR", "TEN", 9.8],
      ["Theo Johnson", "TE", "NYG", 6.6],
    ],
  },
  sam: {
    name: "Sam I Am",
    manager: "Sam",
    record: "1-5",
    pf: 640.8,
    rows: [
      ["Caleb Williams", "QB", "CHI", 17.4],
      ["Quinshon Judkins", "RB", "CLE", 12.6],
      ["TreVeyon Henderson", "RB", "NE", 11.0],
      ["Emeka Egbuka", "WR", "TB", 13.2],
      ["Luther Burden", "WR", "CHI", 12.4],
      ["Jordan Addison", "WR", "MIN", 10.6],
      ["Colston Loveland", "TE", "CHI", 9.8],
      ["Drake Maye", "QB", "NE", 17.0],
      ["Matthew Golden", "WR", "GB", 10.2],
      ["Kyle Monangai", "RB", "CHI", 9.4],
      ["Woody Marks", "RB", "HOU", 9.9],
      ["Josh Downs", "WR", "IND", 10.0],
      ["Brenton Strange", "TE", "JAX", 7.1],
    ],
  },
  pat: {
    name: "Pat's Picks",
    manager: "Pat",
    record: "2-4",
    pf: 672.5,
    rows: [
      ["Trevor Lawrence", "QB", "JAX", 17.2],
      ["David Montgomery", "RB", "HOU", 12.9],
      ["Aaron Jones", "RB", "MIN", 11.6],
      ["Jaylen Waddle", "WR", "DEN", 13.0],
      ["Terry McLaurin", "WR", "WAS", 12.0],
      ["Courtland Sutton", "WR", "DEN", 11.5],
      ["Tucker Kraft", "TE", "GB", 11.3],
      ["Jacory Croskey-Merritt", "RB", "WAS", 11.5],
      ["Michael Wilson", "WR", "ARI", 11.8],
      ["Dallas Goedert", "TE", "PHI", 8.6],
      ["Alvin Kamara", "RB", "NO", 11.9],
      ["Stefon Diggs", "WR", "NE", 10.6],
      ["Evan Engram", "TE", "DEN", 6.9],
    ],
  },
  alex: {
    name: "Alex in Wonderland",
    manager: "Alex",
    record: "1-5",
    pf: 655.1,
    rows: [
      ["Dak Prescott", "QB", "DAL", 18.0],
      ["Josh Jacobs", "RB", "GB", 15.7],
      ["Bhayshul Tuten", "RB", "JAX", 13.4],
      ["A.J. Brown", "WR", "NE", 13.4],
      ["Mike Evans", "WR", "SF", 12.2],
      ["Jameson Williams", "WR", "DET", 11.0],
      ["Jake Ferguson", "TE", "DAL", 9.1],
      ["Travis Etienne", "RB", "NO", 10.0],
      ["Wan'Dale Robinson", "WR", "TEN", 10.4],
      ["Tyler Shough", "QB", "NO", 15.4],
      ["Brian Robinson Jr.", "RB", "SF", 9.3],
      ["Marvin Harrison Jr.", "WR", "ARI", 12.5],
      ["Zach Ertz", "TE", "WAS", 8.4],
    ],
  },
};

// Demo kickers and defenses, one of each per team: [K name, K team, K proj, DEF team, DEF proj]
const DEMO_SPECIAL: Record<string, [string, string, number, string, number]> = {
  you: ["Brandon Aubrey", "DAL", 9.4, "NE", 7.6], mike: ["Cameron Dicker", "LAC", 8.9, "PIT", 7.9], jake: ["Jake Bates", "DET", 8.6, "HOU", 8.4],
  chris: ["Chris Boswell", "PIT", 8.8, "DEN", 8.1], dan: ["Ka'imi Fairbairn", "HOU", 8.5, "BAL", 7.2], kev: ["Tyler Bass", "BUF", 8.1, "MIN", 7.4],
  taylor: ["Harrison Butker", "KC", 8.3, "PHI", 7.8], sam: ["Jason Myers", "SEA", 7.8, "NYJ", 6.6], pat: ["Wil Lutz", "DEN", 7.9, "GB", 7.1],
  alex: ["Jake Elliott", "PHI", 7.5, "LAR", 6.9],
};
const DEF_NAMES: Record<string, string> = {
  ARI: "Cardinals", ATL: "Falcons", BAL: "Ravens", BUF: "Bills", CAR: "Panthers", CHI: "Bears", CIN: "Bengals", CLE: "Browns", DAL: "Cowboys", DEN: "Broncos",
  DET: "Lions", GB: "Packers", HOU: "Texans", IND: "Colts", JAX: "Jaguars", KC: "Chiefs", LV: "Raiders", LAC: "Chargers", LAR: "Rams", MIA: "Dolphins",
  MIN: "Vikings", NE: "Patriots", NO: "Saints", NYG: "Giants", NYJ: "Jets", PHI: "Eagles", PIT: "Steelers", SF: "49ers", SEA: "Seahawks", TB: "Buccaneers",
  TEN: "Titans", WAS: "Commanders",
};
export const defName = (team: string) => `${DEF_NAMES[team] ?? team} D/ST`;
/** "the Rams" for LAR, or the abbreviation when we don't know the team. */
export const teamNick = (team: string) => (DEF_NAMES[team] ? `the ${DEF_NAMES[team]}` : team);
const DEMO_BYES = ["PIT", "NE"];
// Demo Week 7 slate: [away, home, date]. Thursday and Monday games plus a Sunday full of them.
const DEMO_SLATE: [string, string, string][] = [
  ["DEN", "KC", "2026-10-22"], ["BUF", "MIA", "2026-10-25"], ["CAR", "TB", "2026-10-25"], ["IND", "TEN", "2026-10-25"],
  ["CIN", "CLE", "2026-10-25"], ["NYJ", "BAL", "2026-10-25"], ["JAX", "HOU", "2026-10-25"], ["NYG", "PHI", "2026-10-25"],
  ["ATL", "NO", "2026-10-25"], ["LAR", "SEA", "2026-10-25"], ["ARI", "SF", "2026-10-25"], ["LV", "LAC", "2026-10-25"],
  ["GB", "MIN", "2026-10-25"], ["DET", "DAL", "2026-10-25"], ["WAS", "CHI", "2026-10-26"],
];
export const demoGame = (team: string): { opp: string; home: boolean; date: string } | undefined => {
  const g = DEMO_SLATE.find(([a, h]) => a === team || h === team);
  return g ? { opp: g[0] === team ? g[1] : g[0], home: g[1] === team, date: g[2] } : undefined;
};
function demoSpecials(teams: Team[]): Record<string, SpecialPlayer> {
  const out: Record<string, SpecialPlayer> = {};
  for (const t of teams) {
    const d = DEMO_SPECIAL[t.id];
    if (!d) continue;
    const gk = demoGame(d[1]), gd = demoGame(d[3]);
    const k: SpecialPlayer = { id: slug(d[0]), name: d[0], pos: "K", nfl: d[1], wk: DEMO_BYES.includes(d[1]) ? null : d[2], proj: d[2], opp: gk ? `${gk.home ? "vs" : "@"} ${gk.opp}` : undefined, gameDate: gk?.date };
    const def: SpecialPlayer = { id: d[3], name: defName(d[3]), pos: "DEF", nfl: d[3], wk: DEMO_BYES.includes(d[3]) ? null : d[4], proj: d[4], opp: gd ? `${gd.home ? "vs" : "@"} ${gd.opp}` : undefined, gameDate: gd?.date };
    out[k.id] = k; out[def.id] = def;
    t.special = [k.id, def.id];
    t.setSpecial = [k.id, def.id]; // the demo "Sleeper lineup" starts its only K and DEF
  }
  return out;
}

function demoTeams(): { teams: Team[]; players: Record<string, Player> } {
  const players: Record<string, Player> = {};
  const toId = ([name, pos, nfl, proj, tag, note]: Row, onIr = false) => {
    const pid = slug(name);
    const g = demoGame(nfl);
    const status: Status | undefined = tag === "D" ? "Q" : tag;
    players[pid] = { id: pid, name, pos, nfl, proj, status, note, longTerm: status === "O", irEligible: status === "O", injury: onIr ? "IR" : status === "O" ? "Out" : tag === "D" ? "Doubtful" : undefined, opp: g ? `${g.home ? "vs" : "@"} ${g.opp}` : undefined, gameDate: g?.date };
    return pid;
  };
  const teams = Object.entries(rosters).map(([id, t]) => {
    const ids = t.rows.map((r) => toId(r));
    return { id, name: t.name, manager: t.manager, record: t.record, pf: t.pf, you: t.you, avatar: t.avatar, roster: ids, ir: (t.ir ?? []).map((r) => toId(r, true)) };
  });
  return { teams, players };
}

// ---- Intent tags ---------------------------------------------------------

export type ManagerTagKind = "refuses" | "wants" | "notInterested";
export interface ManagerTag {
  id: string;
  teamId: string;
  kind: ManagerTagKind;
  playerId?: string;
  pos?: Pos;
  text: string;
  weeksOld: number;
  /** Set when the tag comes from why an offer was declined (declineWhy.ts) rather than a note you wrote */
  from?: "declined";
}

export const INITIAL_MANAGER_TAGS: ManagerTag[] = [
  { id: "t1", teamId: "mike", kind: "wants", pos: "TE", text: "Looking for TE help with LaPorta out", weeksOld: 0 },
  { id: "t2", teamId: "mike", kind: "refuses", playerId: "chase-brown", text: "Won't move Chase Brown", weeksOld: 3 },
  { id: "t3", teamId: "chris", kind: "wants", pos: "WR", text: "Shopping for a WR after Nabers news", weeksOld: 0 },
  { id: "t4", teamId: "jake", kind: "notInterested", playerId: "deebo-samuel", text: "Not interested in Deebo", weeksOld: 1 },
  { id: "t5", teamId: "sam", kind: "wants", pos: "QB", text: "Open to selling a QB, rebuilding", weeksOld: 2 },
];

export type MyTag = "available" | "shopping" | "untouchable" | "amazing";
export const INITIAL_MY_TAGS: Record<string, MyTag> = {
  "josh-allen": "amazing",
  "james-cook": "untouchable",
  "dalton-kincaid": "shopping",
  "tyler-warren": "available",
};

export const POS_ORDER: Pos[] = ["QB", "RB", "WR", "TE"];

/** 2025 rookie class, used for "chases rookies" tendencies and dynasty notes. */
export const ROOKIES = new Set([
  "ashton-jeanty", "tetairoa-mcmillan", "omarion-hampton", "cam-skattebo", "quinshon-judkins",
  "treveyon-henderson", "emeka-egbuka", "luther-burden", "colston-loveland", "matthew-golden",
  "kyle-monangai", "tyler-warren", "jacory-croskey-merritt", "bhayshul-tuten", "tyler-shough",
]);

// ---- Your lineup as currently set in Sleeper (read-only API) --------------
// Sources compares this to the optimal lineup and flags the difference.
const DEMO_SLEEPER_SET: Record<string, string[]> = {
  QB: ["josh-allen"], RB: ["james-cook", "chuba-hubbard"], WR: ["zay-flowers", "jalen-coker", "deebo-samuel"],
  TE: ["tyler-warren"], FLEX: ["jaylen-warren"],
};

// ---- Slot history: your weekly points by slot vs league average ----------
const DEMO_SLOT_HISTORY: SlotHistory[] = [
  { slot: "QB", you: [26.1, 18.4, 31.2, 22.0, 24.8, 19.6], avg: [19.8, 18.2, 20.4, 19.1, 18.7, 19.5] },
  { slot: "RB", you: [33.0, 28.4, 36.1, 24.9, 30.2, 27.7], avg: [27.9, 26.6, 29.4, 27.0, 28.1, 26.8] },
  { slot: "WR", you: [41.2, 38.7, 33.0, 45.6, 39.1, 36.4], avg: [40.3, 39.0, 38.2, 41.5, 39.9, 40.1] },
  { slot: "TE", you: [6.2, 4.8, 11.9, 5.1, 7.4, 3.9], avg: [10.4, 9.8, 10.9, 10.1, 9.6, 10.7] },
  { slot: "FLEX", you: [11.0, 9.2, 13.8, 8.1, 10.6, 12.4], avg: [12.1, 11.4, 12.6, 11.9, 11.2, 12.0] },
];

// ---- Waivers and FAAB ----------------------------------------------------
export interface FreeAgent { id: string; name: string; pos: Pos; nfl: string; proj: number; rostered?: number; why: string; trend: "up" | "flat"; rookie?: boolean; /** Sleeper-wide adds over the last 7 days (the trending feed's 168-hour lookback). */ adds?: number }
/** Positions the Waivers screen lists. K and DEF stay out of `Pos` so trades and lineups never see them. */
export type WaiverPos = Pos | "K" | "DEF";
/** A kicker or defense on the wire. `proj` is the season per-week average; `wk` is this week (null = bye or not projected). */
export interface SpecialFreeAgent extends Omit<FreeAgent, "pos" | "rookie"> { pos: "K" | "DEF"; wk: number | null; opp?: string; gameDate?: string; status?: Status; rookie?: undefined }
/** Anything the Waivers screen can list. */
export type WaiverFA = FreeAgent | SpecialFreeAgent;
export const isSpecialFA = (fa: WaiverFA): fa is SpecialFreeAgent => fa.pos === "K" || fa.pos === "DEF";
const DEMO_FAAB: Faab = { enabled: true, budget: 100, remaining: 64, source: "Sources" };
const DEMO_FREE_AGENTS: FreeAgent[] = [
  { id: "sean-tucker", name: "Sean Tucker", pos: "RB", nfl: "TB", proj: 13.1, rostered: 22, adds: 48210, trend: "up", why: "The Bucs backup just became the starter. Bucky Irving left Sunday with a shoulder injury." },
  { id: "jalen-tolbert", name: "Jalen Tolbert", pos: "WR", nfl: "DAL", proj: 10.4, rostered: 18, adds: 21640, trend: "up", why: "Runs every route with Lamb questionable. 9 targets last week." },
  { id: "chig-okonkwo", name: "Chig Okonkwo", pos: "TE", nfl: "TEN", proj: 9.8, rostered: 31, adds: 15380, trend: "up", why: "Top-12 TE in targets over the last three weeks. Solves a bye-week hole." },
  { id: "tyjae-spears", name: "Tyjae Spears", pos: "RB", nfl: "TEN", proj: 8.9, rostered: 40, adds: 3120, trend: "flat", why: "Steady passing-down work. Fine depth, not a priority bid." },
  { id: "dont-e-thornton", name: "Dont'e Thornton", pos: "WR", nfl: "LV", proj: 8.1, rostered: 9, adds: 9870, trend: "up", rookie: true, why: "Rookie deep threat whose snaps jumped to 81 percent. A stash with upside." },
  { id: "mason-rudolph", name: "Mason Rudolph", pos: "QB", nfl: "PIT", proj: 0, rostered: 4, adds: 410, trend: "flat", why: "On bye this week. Only matters in Superflex." },
];
/** Demo kickers and defenses on the wire: [name or DEF team, team, this week, season per week, rostered %]. */
const DEMO_SPECIAL_FA: [string, string, number, number, number][] = [
  ["SEA", "SEA", 8.0, 7.3, 44], ["TB", "TB", 7.4, 6.6, 31], ["IND", "IND", 7.0, 6.4, 22], ["CLE", "CLE", 6.6, 6.9, 38],
  ["Chase McLaughlin", "TB", 8.2, 8.0, 41], ["Evan McPherson", "CIN", 7.6, 7.7, 35], ["Cairo Santos", "CHI", 7.1, 7.4, 18],
];
function demoSpecialFreeAgents(): SpecialFreeAgent[] {
  return DEMO_SPECIAL_FA.map(([who, nfl, wk, proj, rostered]) => {
    const def = /^[A-Z]{2,3}$/.test(who);
    const g = demoGame(nfl);
    const bye = DEMO_BYES.includes(nfl);
    return {
      id: def ? who : slug(who), name: def ? defName(who) : who, pos: def ? "DEF" : "K", nfl, proj, wk: bye ? null : wk, rostered, trend: "flat",
      opp: g ? `${g.home ? "vs" : "@"} ${g.opp}` : undefined, gameDate: g?.date,
      why: bye ? `On bye this week. Projects ${proj.toFixed(1)} a week going forward.` : `Projects ${wk.toFixed(1)} this week${g ? ` ${g.home ? "vs" : "at"} ${g.opp}` : ""} and ${proj.toFixed(1)} a week going forward.`,
    };
  });
}
/** Winning bids in this league this season, as a percent of the $100 budget. */
const DEMO_FAAB_HISTORY: BidTier[] = [
  { tier: "Starter", bids: [14, 18, 21, 12, 16, 27] },
  { tier: "Flex", bids: [6, 9, 8, 11, 7] },
  { tier: "Depth", bids: [2, 3, 1, 4, 2, 3, 2] },
  { tier: "Stash", bids: [1, 0, 2, 1] },
];

// ---- Completed trades, for manager tendencies ----------------------------
/** One league transaction, newest first. Names are snapshotted so dropped players still read right. */
export interface ActivityPlayer { id: string; name: string; pos: string; nfl: string }
export interface Activity {
  id: string;
  kind: "trade" | "waiver" | "free_agent" | "commissioner";
  teamIds: string[];
  adds: (ActivityPlayer & { teamId: string })[];
  drops: (ActivityPlayer & { teamId: string })[];
  bid?: number;
  at: number;
}
export interface BoardRow { id: string; name: string; pos: string; nfl: string; age?: number; value: number; trend: number; ownerId?: string; market?: number; model?: number }
export interface PastTrade { week: string; a: string; b: string; aGot: { name: string; pos: Pos; rookie?: boolean }[]; bGot: { name: string; pos: Pos; rookie?: boolean }[] }
const DEMO_TRADES: PastTrade[] = [
  { week: "2025 Wk 4", a: "mike", b: "kev", aGot: [{ name: "Javonte Williams", pos: "RB" }], bGot: [{ name: "Hunter Henry", pos: "TE" }] },
  { week: "2025 Wk 9", a: "mike", b: "pat", aGot: [{ name: "Kyren Williams", pos: "RB" }], bGot: [{ name: "Jaylen Waddle", pos: "WR" }] },
  { week: "2026 Wk 2", a: "mike", b: "alex", aGot: [{ name: "Isaiah Likely", pos: "TE" }], bGot: [{ name: "Jake Ferguson", pos: "TE" }] },
  { week: "2025 Wk 6", a: "dan", b: "sam", aGot: [{ name: "Ashton Jeanty", pos: "RB", rookie: true }], bGot: [{ name: "Caleb Williams", pos: "QB" }, { name: "Emeka Egbuka", pos: "WR", rookie: true }] },
  { week: "2026 Wk 3", a: "dan", b: "taylor", aGot: [{ name: "Bo Nix", pos: "QB" }], bGot: [{ name: "Omarion Hampton", pos: "RB", rookie: true }] },
  { week: "2026 Wk 5", a: "dan", b: "kev", aGot: [{ name: "Xavier Worthy", pos: "WR" }], bGot: [{ name: "Tetairoa McMillan", pos: "WR", rookie: true }] },
  { week: "2025 Wk 11", a: "jake", b: "chris", aGot: [{ name: "Kenneth Walker III", pos: "RB" }], bGot: [{ name: "Christian Watson", pos: "WR" }] },
  { week: "2026 Wk 1", a: "taylor", b: "sam", aGot: [{ name: "Cam Skattebo", pos: "RB", rookie: true }], bGot: [{ name: "Jordan Addison", pos: "WR" }] },
  { week: "2026 Wk 4", a: "taylor", b: "pat", aGot: [{ name: "Davante Adams", pos: "WR" }], bGot: [{ name: "Jacory Croskey-Merritt", pos: "RB", rookie: true }] },
  { week: "2026 Wk 4", a: "chris", b: "alex", aGot: [{ name: "Rhamondre Stevenson", pos: "RB" }], bGot: [{ name: "Wan'Dale Robinson", pos: "WR" }] },
  { week: "2026 Wk 6", a: "you", b: "kev", aGot: [{ name: "Jalen Coker", pos: "WR" }], bGot: [{ name: "Tony Pollard", pos: "RB" }] },
  { week: "2025 Wk 8", a: "pat", b: "alex", aGot: [{ name: "Michael Wilson", pos: "WR" }], bGot: [{ name: "Travis Etienne", pos: "RB" }] },
];
/** Trade offers each manager received in the last calendar year. */
const DEMO_OFFERS: Record<string, number> = { mike: 7, dan: 9, jake: 11, chris: 6, kev: 5, taylor: 8, sam: 4, pat: 6, alex: 5, you: 6 };


// ---- League store --------------------------------------------------------

export type SlotKey = "QB" | "RB" | "WR" | "TE" | "FLEX" | "SF";
export interface SlotHistory { slot: SlotKey; you: number[]; avg: number[] }
export interface Faab { enabled: boolean; budget: number; remaining: number; /** Who makes the Sugg. bid numbers: the platform's own when we can read them, else Sources. */ source: "Sleeper" | "Sources"; /** Rolling waiver order, 1 is first. Priority leagues only. */ priority?: number }
export interface BidTier { tier: "Starter" | "Flex" | "Depth" | "Stash"; bids: number[]; estimated?: boolean }
export interface Slate { opp: Record<string, Record<number, string>>; proj: Record<string, Record<number, number>>; pts: Record<string, Record<number, number>> }
export interface LeagueFormat { scoring: "ppr" | "half" | "std"; superflex: boolean; tePremium: boolean }

export interface LeagueData {
  mode: "live" | "demo";
  id: string;
  name: string;
  season: string;
  week: number;
  /** Starting slots from the league settings (skill positions only). */
  slots: SlotKey[];
  format: LeagueFormat;
  /** The league's scoring_settings from Sleeper (stat key to points). Weekly points are scored with it; see scoreStats. */
  scoring?: Record<string, number>;
  rosterMax: number;
  /** IR slots per team from the league settings. */
  irSlots: number;
  /** K and DEF starting slots, in league order. */
  specialSlots?: ("K" | "DEF")[];
  specials?: Record<string, SpecialPlayer>;
  /** Your K/DEF starters as set in Sleeper. */
  sleeperSpecial?: string[];
  /** Your matchup results by week (live leagues). */
  history?: Record<number, WeekHistory>;
  /** This week's rows from Sleeper's /league/<id>/matchups/<week>, every roster (live leagues). Seeds live
   *  scoring with both teams' points before the first poll, and is all there is once the week is final. */
  weekMatchups?: SleeperMatchupRow[];
  /** Starting slot order from the league settings, K and DEF included. */
  lineupOrder?: string[];
  /** Last fantasy week of the season. */
  lastWeek?: number;
  /** Teams that make the playoffs, and the first playoff week (live leagues). */
  playoffTeams?: number;
  playoffStart?: number;
  /** Which fantasy platform the league comes from. Drives the accent color. */
  platform?: "sleeper" | "yahoo" | "espn";
  /** Season grid: each NFL team's opponent by week ("@KC" / "vKC"), weekly projections ahead and points scored behind. */
  slate?: Slate;
  /** This week's NFL game state per team from Sleeper's schedule. Teams missing are on bye. */
  games?: Record<string, GameState>;
  /** Taxi squad slots (dynasty), 0 if none. */
  taxiSlots: number;
  updated: string;
  deadlines: { waivers: string; lock: string; trade: string };
  byeTeams: string[];
  teams: Team[];
  players: Record<string, Player>;
  sleeperSet: Record<string, string[]>;
  slotHistory: SlotHistory[];
  faab: Faab;
  faabHistory: BidTier[];
  freeAgents: FreeAgent[];
  /** Best available kickers and defenses this week. Kept apart from freeAgents so trade and value code never sees them. */
  specialFreeAgents?: SpecialFreeAgent[];
  /** Winning K/DEF waiver bids this season, as a percent of budget. */
  specialBids?: number[];
  trades: PastTrade[];
  /** Recent league transactions, newest first. */
  activity?: Activity[];
  /** Offers each manager received. Sleeper doesn't expose this, so it's null for live leagues. */
  offers: Record<string, number> | null;
  /** Where market values come from, shown in the UI. */
  valueSource: string;
  /** League-wide market board: top players by trade value with owners and 30-day movement. */
  board?: BoardRow[];
  /** How many weeks the rest-of-season projections cover. */
  rosWeeks?: number;
  username?: string;
  /** The league's commissioners, from Sleeper's users list (live leagues). Empty when Sleeper doesn't say. */
  commish?: { userId: string; name: string }[];
  /** The signed-in user's picture in this league (live leagues). Shown on the league switcher. */
  userAvatar?: string;
  /** The signed-in user's personal Sleeper picture, the fallback when the team picture fails to load. */
  userPhoto?: string;
  type?: "redraft" | "keeper" | "dynasty";
  /** This week's opponent (team id), if the league has head-to-head matchups. */
  opponentId?: string;
  /** Last season's champion, when that manager is still in the league. */
  champion?: { teamId: string; season: string };
}

export type GameState = "pre_game" | "in_game" | "complete";
export let LEAGUE: LeagueData;
/** "bye", "pre_game", "in_game" or "complete" for a team this week. Unknown when we have no schedule. */
export function gameState(team: string): GameState | "bye" | "unknown" {
  const g = LEAGUE?.games;
  if (!g || !Object.keys(g).length) return DEMO_BYES.includes(team) ? "bye" : "unknown";
  return g[team] ?? "bye";
}
/** True once a team's game has kicked off this week, or when it has no game. Sleeper locks these players. */
export const lockedThisWeek = (team: string) => { const s = gameState(team); return s === "bye" || s === "in_game" || s === "complete"; };
/** This week's game states as last read, for lineup locks (locks.ts). live.ts registers its live scoring here, so
 *  advice outside React reads the same states the Lineup rows draw; before that, the league's saved schedule. */
let weekGamesSrc: (() => { games: Record<string, GameState>; past?: boolean }) | null = null;
export const setWeekGames = (f: typeof weekGamesSrc) => { weekGamesSrc = f; };
export const weekGames = (): { games: Record<string, GameState>; past?: boolean } => weekGamesSrc?.() ?? { games: LEAGUE?.games ?? {} };
export let WEEK = 7;
export let LEAGUE_NAME = "";
export let UPDATED = "";
export let DEADLINES = { waivers: "", lock: "", trade: "" };
export const PLAYERS: Record<string, Player> = {};
export const TEAMS: Team[] = [];
export let YOU: Team;
export let SLEEPER_SET: Record<string, string[]> = {};
export let SLOT_HISTORY: SlotHistory[] = [];
export let FAAB: Faab = { enabled: true, budget: 100, remaining: 100, source: "Sources" };
export let FAAB_HISTORY: BidTier[] = [];
export let FREE_AGENTS: FreeAgent[] = [];
export let SPECIAL_FREE_AGENTS: SpecialFreeAgent[] = [];
export let SPECIAL_BIDS: number[] = [];
export let COMPLETED_TRADES: PastTrade[] = [];
export let OFFERS_RECEIVED: Record<string, number> | null = null;
export let OPPONENT_ID: string | undefined;
let byeTeams = new Set<string>();
let leagueVersion = 0;

export const onBye = (nfl: string) => byeTeams.has(nfl);
export const teamById = (id: string) => TEAMS.find((t) => t.id === id)!;
export const playerById = (id: string) => PLAYERS[id];
export const leagueKey = () => `${LEAGUE.mode}:${LEAGUE.id}:${leagueVersion}`;
export const isDemo = () => LEAGUE.mode === "demo";
/** Sleeper's league tabs, as its web app names them (checked on sleeper.com): every "open Sleeper" goes to the tab
 *  for the job. Lineup changes to team, claims to players, offers to trades. The app picks these links up on phones. */
export type SleeperTab = "team" | "trades" | "players" | "league" | "matchup";
export const sleeperUrl = (tab: SleeperTab) => (LEAGUE.mode === "live" ? `https://sleeper.com/leagues/${LEAGUE.id}/${tab}` : "https://sleeper.com/");

export function setLeague(d: LeagueData) {
  LEAGUE = d;
  WEEK = d.week;
  LEAGUE_NAME = d.name;
  UPDATED = d.updated;
  DEADLINES = d.deadlines;
  Object.keys(PLAYERS).forEach((k) => delete PLAYERS[k]);
  Object.assign(PLAYERS, d.players);
  TEAMS.length = 0;
  TEAMS.push(...d.teams);
  YOU = TEAMS.find((t) => t.you) ?? TEAMS[0];
  SLEEPER_SET = d.sleeperSet;
  SLOT_HISTORY = d.slotHistory;
  FAAB = d.faab;
  FAAB_HISTORY = d.faabHistory;
  FREE_AGENTS = d.freeAgents;
  SPECIAL_FREE_AGENTS = d.specialFreeAgents ?? [];
  SPECIAL_BIDS = d.specialBids ?? [];
  COMPLETED_TRADES = d.trades;
  OFFERS_RECEIVED = d.offers;
  OPPONENT_ID = d.opponentId;
  byeTeams = new Set(d.byeTeams);
  leagueVersion++;
}

const hoursAgo = (h: number) => Date.UTC(2026, 9, 15, 16) - h * 3600e3;
const ap = (name: string, pos: string, nfl: string, teamId: string) => ({ id: slug(name), name, pos, nfl, teamId });
const DEMO_ACTIVITY: Activity[] = [
  { id: "a1", kind: "free_agent", teamIds: ["mike"], adds: [ap("Kenneth Gainwell", "RB", "TB", "mike")], drops: [ap("Will Shipley", "RB", "PHI", "mike")], at: hoursAgo(2) },
  { id: "a2", kind: "waiver", teamIds: ["chris"], adds: [ap("Jalen Tolbert", "WR", "DAL", "chris")], drops: [ap("Ashton Dulin", "WR", "IND", "chris")], bid: 18, at: hoursAgo(14) },
  { id: "a3", kind: "trade", teamIds: ["mike", "kev"], adds: [ap("Javonte Williams", "RB", "DAL", "mike"), ap("Hunter Henry", "TE", "NE", "kev")], drops: [], at: hoursAgo(30) },
  { id: "a4", kind: "free_agent", teamIds: ["sam"], adds: [ap("Kirk Cousins", "QB", "LV", "sam")], drops: [], at: hoursAgo(41) },
  { id: "a5", kind: "free_agent", teamIds: ["pat"], adds: [], drops: [ap("Tyreek Hill", "WR", "FA", "pat")], at: hoursAgo(50) },
  { id: "a6", kind: "waiver", teamIds: ["dan"], adds: [ap("Sean Tucker", "RB", "TB", "dan")], drops: [ap("Kalif Raymond", "WR", "CHI", "dan")], bid: 31, at: hoursAgo(62) },
];

/** Demo scoring: Sleeper's default full PPR settings, so the demo scores weeks the same way a live league does. */
const DEMO_SCORING: Record<string, number> = {
  pass_yd: 0.04, pass_td: 4, pass_int: -1, pass_2pt: 2, rush_yd: 0.1, rush_td: 6, rush_2pt: 2, rec: 1, rec_yd: 0.1, rec_td: 6, rec_2pt: 2,
  fum_lost: -2, fum_rec_td: 6, fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3, fgm_40_49: 4, fgm_50p: 5, fgmiss: -1, xpm: 1, xpmiss: -1,
  sack: 1, int: 2, fum_rec: 2, def_td: 6, safe: 2, blk_kick: 2, def_st_td: 6, st_td: 6,
  pts_allow_0: 10, pts_allow_1_6: 7, pts_allow_7_13: 4, pts_allow_14_20: 1, pts_allow_21_27: 0, pts_allow_28_34: -1, pts_allow_35p: -4,
};
export function demoLeague(): LeagueData {
  const { teams, players } = demoTeams();
  const specials = demoSpecials(teams);
  return {
    mode: "demo", id: "demo", name: "Demo League", season: "2026", week: 7,
    slots: ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX"],
    format: { scoring: "ppr", superflex: false, tePremium: false },
    rosterMax: 13,
    irSlots: 2,
    specialSlots: ["K", "DEF"], specials, sleeperSpecial: teams.find((t) => t.you)?.special,
    taxiSlots: 0,
    updated: "Projections updated 14 min ago",
    deadlines: { waivers: "Waivers run Wed 3:00 AM ET", lock: "Lineups lock Sun 1:00 PM ET", trade: "Trade deadline Nov 18" },
    byeTeams: DEMO_BYES,
    teams, players,
    sleeperSet: DEMO_SLEEPER_SET, slotHistory: DEMO_SLOT_HISTORY,
    faab: DEMO_FAAB, faabHistory: DEMO_FAAB_HISTORY, freeAgents: DEMO_FREE_AGENTS, specialFreeAgents: demoSpecialFreeAgents(), specialBids: [0, 1, 0, 0, 2, 1],
    trades: DEMO_TRADES, activity: DEMO_ACTIVITY, offers: DEMO_OFFERS, type: "redraft", opponentId: "jake",
    userAvatar: teams.find((t) => t.you)?.avatar,
    commish: [{ userId: "jake", name: "Jake" }],
    champion: { teamId: "jake", season: "2025" },
    valueSource: "Demo estimate from projections",
    scoring: DEMO_SCORING,
  };
}

setLeague(demoLeague());
