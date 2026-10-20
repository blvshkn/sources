// Jersey colorways for the 32 NFL teams, drawn by components/Jersey.tsx.
// Team colors and trim only: stripes, panels and signature patterns are fine, but no logos,
// logo-derived marks, wordmarks, names, league shield or maker marks ever go on a jersey.
// Hex values from teamcolorcodes.com (NFL team color codes), checked against each team's
// current uniform. Names are for labels outside the jersey (review sheets, pickers) only.

export interface Colorway {
  /** Jersey body */
  body: string;
  /** Number fill */
  number: string;
  /** Number outline */
  outline: string;
  /** Outer collar stripe */
  collar1: string;
  /** Inner collar stripe */
  collar2: string;
  /** Sleeve cuff band */
  cuff: string;
  /** Side panel fill, under the arms down to the hem. Same as body unless the team has a panel accent. */
  panel: string;
}

/** A run of sleeve stripes, parallel to the cuff. */
export interface StripeSet {
  /** Gap from the top edge of the cuff to the first stripe, in artboard px (600 wide). */
  at: number;
  /** Stripes working up from the cuff: [color, width]. An empty color leaves a gap. */
  s: [string, number][];
}

/** Signature patterns, each drawn as a simplified vector take on the team's look. */
export type PatternId = "tiger" | "feather" | "peaks" | "horn";

export interface Trim {
  /** Sleeve stripes near the cuff, or shoulder stripes when `at` is large. */
  sleeve?: StripeSet[];
  /** A band that follows the raglan seam from collar to underarm. */
  raglan?: { c: string; w: number; edge?: string };
  /** Piping along the side panel seam. */
  sidePipe?: string;
  /** Signature pattern with its main and accent colors. */
  pattern?: { id: PatternId; c: string; c2?: string };
}

export type Conference = "AFC" | "NFC";
export type Division = "East" | "North" | "South" | "West";

export interface TeamJersey extends Colorway {
  name: string;
  conf: Conference;
  div: Division;
  /** White (or road) colorway. Missing fields come from the home colorway, see `colorway()`. */
  away?: Partial<Colorway>;
  /** Home trim. */
  trim?: Trim;
  /** White (or road) trim. Plain when missing, since home colors rarely work on white. */
  awayTrim?: Trim;
}

const st = (at: number, ...s: [string, number][]): StripeSet => ({ at, s });

const W = "#FFFFFF";

export const JERSEYS: Record<string, TeamJersey> = {
  // AFC East
  BUF: { name: "Buffalo Bills", conf: "AFC", div: "East", body: "#00338D", number: W, outline: "#C60C30", collar1: W, collar2: "#C60C30", cuff: "#C60C30", panel: "#00338D" },
  MIA: { name: "Miami Dolphins", conf: "AFC", div: "East", body: "#008E97", number: W, outline: "#FC4C02", collar1: "#FC4C02", collar2: W, cuff: "#FC4C02", panel: "#008E97" },
  NE: { name: "New England Patriots", conf: "AFC", div: "East", body: "#002244", number: W, outline: "#C60C30", collar1: "#C60C30", collar2: "#B0B7BC", cuff: "#C60C30", panel: "#002244" },
  NYJ: { name: "New York Jets", conf: "AFC", div: "East", body: "#125740", number: W, outline: "#000000", collar1: W, collar2: "#125740", cuff: W, panel: "#125740",
    away: { number: "#125740", outline: "#125740", collar1: "#125740", collar2: W, cuff: "#125740" } },
  // AFC North
  BAL: { name: "Baltimore Ravens", conf: "AFC", div: "North", body: "#241773", number: W, outline: "#000000", collar1: "#000000", collar2: "#9E7C0C", cuff: "#000000", panel: "#241773" },
  CIN: { name: "Cincinnati Bengals", conf: "AFC", div: "North", body: "#000000", number: "#FB4F14", outline: W, collar1: "#FB4F14", collar2: W, cuff: "#FB4F14", panel: "#000000",
    away: { number: "#FB4F14", outline: "#000000", collar1: "#FB4F14", collar2: "#000000", cuff: "#FB4F14" } },
  CLE: { name: "Cleveland Browns", conf: "AFC", div: "North", body: "#311D00", number: W, outline: "#FF3C00", collar1: "#FF3C00", collar2: W, cuff: "#FF3C00", panel: "#311D00",
    away: { number: "#FF3C00", outline: "#311D00", collar1: "#311D00", collar2: "#FF3C00", cuff: "#FF3C00" } },
  PIT: { name: "Pittsburgh Steelers", conf: "AFC", div: "North", body: "#101820", number: "#FFB612", outline: W, collar1: "#FFB612", collar2: W, cuff: "#FFB612", panel: "#101820" },
  // AFC South
  HOU: { name: "Houston Texans", conf: "AFC", div: "South", body: "#03202F", number: W, outline: "#A71930", collar1: "#A71930", collar2: W, cuff: "#A71930", panel: "#03202F" },
  IND: { name: "Indianapolis Colts", conf: "AFC", div: "South", body: "#002C5F", number: W, outline: "#A2AAAD", collar1: W, collar2: "#002C5F", cuff: W, panel: "#002C5F",
    away: { number: "#002C5F", outline: "#002C5F", collar1: "#002C5F", collar2: W, cuff: "#002C5F" } },
  JAX: { name: "Jacksonville Jaguars", conf: "AFC", div: "South", body: "#006778", number: W, outline: "#D7A22A", collar1: "#D7A22A", collar2: "#101820", cuff: "#101820", panel: "#006778" },
  TEN: { name: "Tennessee Titans", conf: "AFC", div: "South", body: "#0C2340", number: W, outline: "#4B92DB", collar1: "#4B92DB", collar2: "#C8102E", cuff: "#4B92DB", panel: "#0C2340" },
  // AFC West
  DEN: { name: "Denver Broncos", conf: "AFC", div: "West", body: "#FB4F14", number: "#002244", outline: W, collar1: "#002244", collar2: W, cuff: "#002244", panel: "#FB4F14" },
  KC: { name: "Kansas City Chiefs", conf: "AFC", div: "West", body: "#E31837", number: W, outline: "#FFB81C", collar1: W, collar2: "#FFB81C", cuff: "#FFB81C", panel: "#E31837" },
  LV: { name: "Las Vegas Raiders", conf: "AFC", div: "West", body: "#000000", number: W, outline: "#A5ACAF", collar1: "#A5ACAF", collar2: W, cuff: "#A5ACAF", panel: "#000000",
    away: { number: "#000000", outline: "#A5ACAF", collar1: "#000000", collar2: "#A5ACAF", cuff: "#000000" } },
  LAC: { name: "Los Angeles Chargers", conf: "AFC", div: "West", body: "#0080C6", number: W, outline: "#FFC20E", collar1: "#FFC20E", collar2: W, cuff: "#FFC20E", panel: "#0080C6" },
  // NFC East
  DAL: { name: "Dallas Cowboys", conf: "NFC", div: "East", body: W, number: "#041E42", outline: "#869397", collar1: "#041E42", collar2: "#869397", cuff: "#041E42", panel: W,
    // Dallas is white at home, so its other look is the navy jersey.
    away: { body: "#041E42", number: W, outline: "#869397", collar1: "#869397", collar2: W, cuff: "#869397", panel: "#041E42" } },
  NYG: { name: "New York Giants", conf: "NFC", div: "East", body: "#0B2265", number: W, outline: "#A71930", collar1: "#A71930", collar2: W, cuff: "#A71930", panel: "#0B2265" },
  PHI: { name: "Philadelphia Eagles", conf: "NFC", div: "East", body: "#004C54", number: W, outline: "#000000", collar1: "#A5ACAF", collar2: "#000000", cuff: "#A5ACAF", panel: "#004C54" },
  WAS: { name: "Washington Commanders", conf: "NFC", div: "East", body: "#5A1414", number: "#FFB612", outline: W, collar1: "#FFB612", collar2: W, cuff: "#FFB612", panel: "#5A1414" },
  // NFC North
  CHI: { name: "Chicago Bears", conf: "NFC", div: "North", body: "#0B162A", number: W, outline: "#C83803", collar1: "#C83803", collar2: W, cuff: "#C83803", panel: "#0B162A" },
  DET: { name: "Detroit Lions", conf: "NFC", div: "North", body: "#0076B6", number: W, outline: "#B0B7BC", collar1: W, collar2: "#B0B7BC", cuff: W, panel: "#0076B6",
    away: { number: "#0076B6", outline: "#B0B7BC", collar1: "#0076B6", collar2: "#B0B7BC", cuff: "#0076B6" } },
  GB: { name: "Green Bay Packers", conf: "NFC", div: "North", body: "#203731", number: W, outline: "#FFB612", collar1: "#FFB612", collar2: W, cuff: "#FFB612", panel: "#203731" },
  MIN: { name: "Minnesota Vikings", conf: "NFC", div: "North", body: "#4F2683", number: W, outline: "#FFC62F", collar1: "#FFC62F", collar2: W, cuff: "#FFC62F", panel: "#4F2683" },
  // NFC South
  ATL: { name: "Atlanta Falcons", conf: "NFC", div: "South", body: "#000000", number: W, outline: "#A71930", collar1: "#A71930", collar2: "#A5ACAF", cuff: "#A71930", panel: "#000000" },
  CAR: { name: "Carolina Panthers", conf: "NFC", div: "South", body: "#101820", number: W, outline: "#0085CA", collar1: "#0085CA", collar2: "#BFC0BF", cuff: "#0085CA", panel: "#101820" },
  NO: { name: "New Orleans Saints", conf: "NFC", div: "South", body: "#101820", number: "#D3BC8D", outline: W, collar1: "#D3BC8D", collar2: W, cuff: "#D3BC8D", panel: "#101820" },
  TB: { name: "Tampa Bay Buccaneers", conf: "NFC", div: "South", body: "#D50A0A", number: W, outline: "#34302B", collar1: "#34302B", collar2: "#FF7900", cuff: "#34302B", panel: "#D50A0A" },
  // NFC West
  ARI: { name: "Arizona Cardinals", conf: "NFC", div: "West", body: "#97233F", number: W, outline: "#000000", collar1: "#000000", collar2: W, cuff: "#000000", panel: "#97233F" },
  LAR: { name: "Los Angeles Rams", conf: "NFC", div: "West", body: "#003594", number: "#FFD100", outline: W, collar1: "#FFA300", collar2: W, cuff: "#FFA300", panel: "#003594" },
  SF: { name: "San Francisco 49ers", conf: "NFC", div: "West", body: "#AA0000", number: W, outline: "#B3995D", collar1: "#B3995D", collar2: W, cuff: "#B3995D", panel: "#AA0000" },
  SEA: { name: "Seattle Seahawks", conf: "NFC", div: "West", body: "#002244", number: W, outline: "#69BE28", collar1: "#69BE28", collar2: "#A5ACAF", cuff: "#69BE28", panel: "#002244" },
};

/** Review order: AFC East, North, South, West, then NFC. */
export const DIVISIONS: { conf: Conference; div: Division; teams: string[] }[] = (["AFC", "NFC"] as const).flatMap((conf) =>
  (["East", "North", "South", "West"] as const).map((div) => ({
    conf,
    div,
    teams: Object.keys(JERSEYS).filter((t) => JERSEYS[t].conf === conf && JERSEYS[t].div === div),
  })),
);

const FALLBACK: Colorway = { body: "#3A3A3E", number: W, outline: "#8E8E93", collar1: "#8E8E93", collar2: W, cuff: "#8E8E93", panel: "#3A3A3E" };

const isWhite = (hex: string) => hex.toUpperCase() === W;

/** Home colorway, or the white one when `away`. A white jersey takes the home body color for its
    number and trim unless the team spells out its own away colors. */
export function colorway(team: string, away = false): Colorway {
  const t = JERSEYS[team];
  if (!t) return FALLBACK;
  const { name: _n, conf: _c, div: _d, away: a, ...home } = t;
  if (!away) return home;
  const lit = isWhite(home.body);
  const derived: Colorway = lit
    ? home
    : {
        body: W,
        number: home.body,
        outline: isWhite(home.outline) ? home.number : home.outline,
        collar1: isWhite(home.collar1) ? home.body : home.collar1,
        collar2: isWhite(home.collar2) ? home.body : home.collar2,
        cuff: isWhite(home.cuff) ? home.body : home.cuff,
        panel: W,
      };
  return { ...derived, ...a };
}
