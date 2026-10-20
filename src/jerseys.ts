// Jersey colorways for the 32 NFL teams, drawn by components/Jersey.tsx.
// Team colors and trim only: stripes, panels and signature patterns are fine, but no logos,
// logo-derived marks, wordmarks, names, league shield or maker marks ever go on a jersey.
// Hex values from teamcolorcodes.com (NFL team color codes), checked against each team's
// current uniform. Names are for labels outside the jersey (review sheets, pickers) only.

/** The V-neck band. `w` is the band width and `depth` the y of the V point, both in artboard px
    (600 x 690); defaults are 26 and 110. Stripes run parallel to the band edge, listed from the outer
    edge inward as [color, width]; an empty color shows the band color. `notch` cuts a short slit up
    into the point of the V. */
export type Collar =
  | { style: "plain"; w?: number; depth?: number }
  | { style: "solid"; c: string; w?: number; depth?: number; notch?: boolean }
  | { style: "striped"; c: string; s: [string, number][]; w?: number; depth?: number; notch?: boolean };

export interface Colorway {
  /** Jersey body */
  body: string;
  /** Number fill */
  number: string;
  /** Number outline */
  outline: string;
  /** V-neck collar */
  collar: Collar;
  /** Sleeve cuff band. Same as body on most current jerseys, where the stripes do the work. A wider
      contrast cuff is a stripe set at 0 in the cuff color. */
  cuff: string;
  /** Side panel fill, under the arms down to the hem. Same as body unless the team has a panel accent. */
  panel: string;
}

/** A run of sleeve stripes, parallel to the cuff. */
export interface StripeSet {
  /** Gap from the top edge of the cuff to the first stripe, in artboard px (600 wide). Large values
      put the run high on the capped sleeve, which is how shoulder stripes read from the front. */
  at: number;
  /** Stripes working up from the cuff: [color, width]. An empty color leaves a gap. */
  s: [string, number][];
}

/** Signature patterns, each drawn as our own simplified vector take on the team's look. */
export type PatternId = "tiger" | "feather" | "peaks" | "curl";

/** A band with an optional edge color on both sides. */
export interface Band {
  c: string;
  w: number;
  edge?: string;
}

export interface Trim {
  /** Sleeve or shoulder stripes. */
  sleeve?: StripeSet[];
  /** A band that follows the raglan seam from collar to underarm. */
  raglan?: Band;
  /** A band along the side panel seam. */
  side?: Band;
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
}

const W = "#FFFFFF";

type CollarOpts = { w?: number; depth?: number; notch?: boolean };
/** Body-colored V band, seams only. */
export const plain = (o: { w?: number; depth?: number } = {}): Collar => ({ style: "plain", ...o });
/** One solid color around the V. */
export const solid = (c: string, o: CollarOpts = {}): Collar => ({ style: "solid", c, ...o });
/** A band of `c` with stripes parallel to its edge, outer edge first. */
export const striped = (c: string, s: [string, number][], o: CollarOpts = {}): Collar => ({ style: "striped", c, s, ...o });
/** Two thin pinstripes of `pin` on a `c` band: the earlier collar, kept where photos could not be checked. */
const pinned = (c: string, pin: string): Collar => striped(c, [["", 9], [pin, 2], ["", 7], [pin, 2]], { w: 28 });

export const JERSEYS: Record<string, TeamJersey> = {
  // AFC East
  BUF: { name: "Buffalo Bills", conf: "AFC", div: "East", body: "#00338D", number: W, outline: "#C60C30", collar: pinned("#C60C30", W), cuff: "#00338D", panel: "#00338D",
    away: { number: "#00338D", outline: "#C60C30", collar: pinned("#C60C30", "#00338D"), cuff: W } },
  MIA: { name: "Miami Dolphins", conf: "AFC", div: "East", body: "#008E97", number: W, outline: "#FC4C02", collar: pinned(W, "#FC4C02"), cuff: "#008E97", panel: "#008E97",
    away: { number: "#008E97", outline: "#FC4C02", collar: pinned("#008E97", "#FC4C02"), cuff: W } },
  NE: { name: "New England Patriots", conf: "AFC", div: "East", body: "#002244", number: W, outline: "#C60C30", collar: pinned("#B0B7BC", "#C60C30"), cuff: "#002244", panel: "#002244",
    away: { number: "#002244", outline: "#C60C30", collar: pinned("#B0B7BC", "#C60C30"), cuff: W } },
  // 2024 legacy set: collar in the contrast color, flat one-color numbers.
  NYJ: { name: "New York Jets", conf: "AFC", div: "East", body: "#125740", number: W, outline: W, collar: solid(W, { w: 22 }), cuff: "#125740", panel: "#125740",
    away: { number: "#125740", outline: "#125740", collar: solid("#125740", { w: 22 }), cuff: W } },
  // AFC North
  // 2026: midnight purple, gold accents gone, no number drop shadow. The feather collar is logo-derived,
  // so it reads as a plain black V here.
  BAL: { name: "Baltimore Ravens", conf: "AFC", div: "North", body: "#1F1460", number: W, outline: "#000000", collar: solid("#000000", { w: 22 }), cuff: "#1F1460", panel: "#1F1460",
    away: { number: "#1F1460", outline: "#000000", collar: solid("#1F1460", { w: 22 }), cuff: W } },
  CIN: { name: "Cincinnati Bengals", conf: "AFC", div: "North", body: "#000000", number: "#FB4F14", outline: W, collar: pinned(W, "#FB4F14"), cuff: "#000000", panel: "#000000",
    away: { number: "#FB4F14", outline: "#000000", collar: pinned("#000000", "#FB4F14"), cuff: W } },
  // 2020 set: seal brown, single-color numbers with no outline, five sleeve stripes, a plain orange V.
  CLE: { name: "Cleveland Browns", conf: "AFC", div: "North", body: "#311D00", number: W, outline: W, collar: solid("#FF3C00", { w: 20 }), cuff: "#311D00", panel: "#311D00",
    away: { number: "#311D00", outline: "#311D00", collar: solid("#311D00", { w: 20 }), cuff: W } },
  PIT: { name: "Pittsburgh Steelers", conf: "AFC", div: "North", body: "#101820", number: "#FFB612", outline: "#FFB612", collar: pinned(W, "#FFB612"), cuff: "#101820", panel: "#101820",
    away: { number: "#101820", outline: "#FFB612", collar: pinned("#101820", "#FFB612"), cuff: W } },
  // AFC South
  HOU: { name: "Houston Texans", conf: "AFC", div: "South", body: "#03202F", number: W, outline: "#A71930", collar: pinned(W, "#A71930"), cuff: "#03202F", panel: "#03202F",
    away: { number: "#03202F", outline: "#A71930", collar: pinned("#03202F", "#A71930"), cuff: W } },
  IND: { name: "Indianapolis Colts", conf: "AFC", div: "South", body: "#002C5F", number: W, outline: W, collar: solid(W, { w: 20 }), cuff: "#002C5F", panel: "#002C5F",
    away: { number: "#002C5F", outline: "#002C5F", collar: solid("#002C5F", { w: 20 }), cuff: W } },
  // Black sleeve trims on both jerseys.
  JAX: { name: "Jacksonville Jaguars", conf: "AFC", div: "South", body: "#006778", number: W, outline: "#D7A22A", collar: solid("#101820", { w: 22 }), cuff: "#101820", panel: "#006778",
    away: { number: "#006778", outline: "#D7A22A", collar: solid("#101820", { w: 22 }), cuff: "#101820" } },
  // 2026: Titans blue, white numbers trimmed red. The collar monogram is a logo, so the V is plain navy.
  TEN: { name: "Tennessee Titans", conf: "AFC", div: "South", body: "#4B92DB", number: W, outline: "#C8102E", collar: solid("#0C2340", { w: 22 }), cuff: "#4B92DB", panel: "#4B92DB",
    away: { number: "#4B92DB", outline: "#C8102E", collar: solid("#0C2340", { w: 22 }), cuff: W } },
  // AFC West
  DEN: { name: "Denver Broncos", conf: "AFC", div: "West", body: "#FB4F14", number: "#002244", outline: W, collar: solid("#002244", { w: 22 }), cuff: "#002244", panel: "#FB4F14",
    away: { number: "#002244", outline: "#FB4F14", collar: solid("#002244", { w: 22 }), cuff: "#002244" } },
  KC: { name: "Kansas City Chiefs", conf: "AFC", div: "West", body: "#E31837", number: W, outline: "#FFB81C", collar: pinned("#FFB81C", W), cuff: "#E31837", panel: "#E31837",
    away: { number: "#E31837", outline: "#FFB81C", collar: pinned("#FFB81C", "#E31837"), cuff: W } },
  LV: { name: "Las Vegas Raiders", conf: "AFC", div: "West", body: "#000000", number: W, outline: "#A5ACAF", collar: pinned(W, "#A5ACAF"), cuff: "#000000", panel: "#000000",
    away: { number: "#000000", outline: "#A5ACAF", collar: pinned("#A5ACAF", "#000000"), cuff: W } },
  LAC: { name: "Los Angeles Chargers", conf: "AFC", div: "West", body: "#0080C6", number: W, outline: "#FFC20E", collar: pinned(W, "#FFC20E"), cuff: "#0080C6", panel: "#0080C6",
    away: { number: "#0080C6", outline: "#FFC20E", collar: pinned("#0080C6", "#FFC20E"), cuff: W } },
  // NFC East
  // White at home: royal numbers trimmed navy, two navy-edged royal sleeve stripes, navy V. The navy
  // jersey carries the same white, gray, white stripe on its sleeves and around the V.
  DAL: { name: "Dallas Cowboys", conf: "NFC", div: "East", body: W, number: "#003594", outline: "#041E42", collar: solid("#041E42", { w: 20 }), cuff: W, panel: W,
    away: { body: "#041E42", number: W, outline: "#869397", collar: striped("#041E42", [["", 3], [W, 5], ["#869397", 7], [W, 5]], { w: 24 }), cuff: "#041E42", panel: "#041E42" } },
  // Thin striped V on both; plain sleeves at home; road numbers red trimmed blue.
  NYG: { name: "New York Giants", conf: "NFC", div: "East", body: "#0B2265", number: W, outline: "#A71930", collar: striped("#0B2265", [["#A71930", 4], [W, 4], ["#A71930", 4]], { w: 20 }), cuff: "#0B2265", panel: "#0B2265",
    away: { number: "#A71930", outline: "#0B2265", collar: striped(W, [["#0B2265", 4], ["#A71930", 4], ["#0B2265", 4]], { w: 20 }), cuff: W } },
  PHI: { name: "Philadelphia Eagles", conf: "NFC", div: "East", body: "#004C54", number: W, outline: "#000000", collar: pinned("#000000", "#A5ACAF"), cuff: "#004C54", panel: "#004C54",
    away: { number: "#004C54", outline: "#000000", collar: pinned("#000000", "#A5ACAF"), cuff: W } },
  // 2026: burgundy with white block numbers trimmed gold.
  WAS: { name: "Washington Commanders", conf: "NFC", div: "East", body: "#5A1414", number: W, outline: "#FFB612", collar: pinned(W, "#FFB612"), cuff: "#5A1414", panel: "#5A1414",
    away: { number: "#5A1414", outline: "#FFB612", collar: pinned("#FFB612", "#5A1414"), cuff: W } },
  // NFC North
  CHI: { name: "Chicago Bears", conf: "NFC", div: "North", body: "#0B162A", number: W, outline: "#C83803", collar: pinned(W, "#C83803"), cuff: "#0B162A", panel: "#0B162A",
    away: { number: "#0B162A", outline: "#C83803", collar: pinned("#0B162A", "#C83803"), cuff: W } },
  DET: { name: "Detroit Lions", conf: "NFC", div: "North", body: "#0076B6", number: W, outline: "#B0B7BC", collar: pinned("#B0B7BC", W), cuff: "#0076B6", panel: "#0076B6",
    away: { number: "#0076B6", outline: "#B0B7BC", collar: pinned("#B0B7BC", "#0076B6"), cuff: W } },
  // Traditional striped collar kept through the Nike era, matching the sleeve stripes.
  GB: { name: "Green Bay Packers", conf: "NFC", div: "North", body: "#203731", number: W, outline: "#FFB612", collar: striped("#203731", [["#FFB612", 6], [W, 5], ["#FFB612", 6]], { w: 22 }), cuff: "#203731", panel: "#203731",
    away: { number: "#203731", outline: "#FFB612", collar: striped(W, [["#203731", 6], ["#FFB612", 5], ["#203731", 6]], { w: 22 }), cuff: W } },
  MIN: { name: "Minnesota Vikings", conf: "NFC", div: "North", body: "#4F2683", number: W, outline: "#FFC62F", collar: pinned(W, "#FFC62F"), cuff: "#4F2683", panel: "#4F2683",
    away: { number: "#4F2683", outline: "#FFC62F", collar: pinned("#4F2683", "#FFC62F"), cuff: W } },
  // NFC South
  // 2026: red at home again, white block numbers outlined black; white road numbers in red trimmed black.
  ATL: { name: "Atlanta Falcons", conf: "NFC", div: "South", body: "#A71930", number: W, outline: "#000000", collar: solid("#000000", { w: 22 }), cuff: "#A71930", panel: "#A71930",
    away: { number: "#A71930", outline: "#000000", collar: solid("#A71930", { w: 22 }), cuff: W } },
  CAR: { name: "Carolina Panthers", conf: "NFC", div: "South", body: "#101820", number: W, outline: "#0085CA", collar: pinned("#BFC0BF", "#0085CA"), cuff: "#101820", panel: "#101820",
    away: { number: "#0085CA", outline: "#101820", collar: pinned("#BFC0BF", "#0085CA"), cuff: W } },
  NO: { name: "New Orleans Saints", conf: "NFC", div: "South", body: "#101820", number: "#D3BC8D", outline: W, collar: pinned(W, "#D3BC8D"), cuff: "#101820", panel: "#101820",
    away: { number: "#D3BC8D", outline: "#101820", collar: pinned("#101820", "#D3BC8D"), cuff: W } },
  TB: { name: "Tampa Bay Buccaneers", conf: "NFC", div: "South", body: "#D50A0A", number: W, outline: "#34302B", collar: pinned("#FF7900", "#34302B"), cuff: "#D50A0A", panel: "#D50A0A",
    away: { number: "#D50A0A", outline: "#34302B", collar: pinned("#FF7900", "#34302B"), cuff: W } },
  // NFC West
  ARI: { name: "Arizona Cardinals", conf: "NFC", div: "West", body: "#97233F", number: W, outline: "#000000", collar: pinned(W, "#000000"), cuff: "#97233F", panel: "#97233F",
    away: { number: "#97233F", outline: "#000000", collar: pinned("#97233F", "#000000"), cuff: W } },
  LAR: { name: "Los Angeles Rams", conf: "NFC", div: "West", body: "#003594", number: "#FFD100", outline: W, collar: pinned(W, "#FFA300"), cuff: "#003594", panel: "#003594",
    away: { number: "#003594", outline: "#FFD100", collar: pinned("#003594", "#FFA300"), cuff: W } },
  // Solid V, three equal sleeve stripes (restored 2022).
  SF: { name: "San Francisco 49ers", conf: "NFC", div: "West", body: "#AA0000", number: W, outline: "#B3995D", collar: solid(W, { w: 20 }), cuff: "#AA0000", panel: "#AA0000",
    away: { number: "#AA0000", outline: "#B3995D", collar: solid("#AA0000", { w: 20 }), cuff: W } },
  SEA: { name: "Seattle Seahawks", conf: "NFC", div: "West", body: "#002244", number: W, outline: "#69BE28", collar: pinned("#A5ACAF", "#69BE28"), cuff: "#002244", panel: "#002244",
    away: { number: "#002244", outline: "#69BE28", collar: pinned("#002244", "#69BE28"), cuff: W } },
};

/** Trim for one team: home, and white (or road) when it differs. A missing side is plain. */
export interface TeamTrim {
  home?: Trim;
  away?: Trim;
}

const st = (at: number, ...s: [string, number][]): StripeSet => ({ at, s });
/** Shoulder stripes: a run set high on the capped sleeve, under the shoulder numbers. */
const shoulder = (...s: [string, number][]): StripeSet => st(44, ...s);

// Trim from each team's current home and road jerseys (2025 and 2026 seasons). Left out on purpose,
// because each one is a logo or comes from one: the Rams shoulder horn, the Ravens feather collar,
// the Chargers shoulder bolt, the Texans road sleeve horns, the Titans underarm stars and collar
// monogram, every sleeve or shoulder logo patch, and the wordmark inside the Cardinals road stripe.
export const TRIMS: Record<string, TeamTrim> = {
  // AFC East
  BUF: { home: { sleeve: [st(14, [W, 4], ["#C60C30", 10], [W, 4])] }, away: { sleeve: [st(14, ["#00338D", 4], ["#C60C30", 10], ["#00338D", 4])] } },
  MIA: { home: { sleeve: [st(14, ["#FC4C02", 3], [W, 10], ["#FC4C02", 3])] }, away: { sleeve: [st(14, ["#FC4C02", 3], ["#008E97", 10], ["#FC4C02", 3])] } },
  NE: { home: { sleeve: [st(12, [W, 4], ["#C60C30", 12], [W, 4])] }, away: { sleeve: [st(12, ["#002244", 4], ["#C60C30", 12], ["#002244", 4])] } },
  NYJ: { home: { sleeve: [shoulder([W, 7], ["", 6], [W, 7])] }, away: { sleeve: [shoulder(["#125740", 7], ["", 6], ["#125740", 7])] } },
  // AFC North
  CIN: { home: { pattern: { id: "tiger", c: "#FB4F14" } }, away: { pattern: { id: "tiger", c: "#000000" } } },
  // Five stripes just above the cuff: white, orange, white, orange, white on brown; brown and orange on white.
  CLE: {
    home: { sleeve: [st(8, [W, 4], ["#FF3C00", 6], [W, 4], ["#FF3C00", 6], [W, 4])] },
    away: { sleeve: [st(8, ["#311D00", 4], ["#FF3C00", 6], ["#311D00", 4], ["#FF3C00", 6], ["#311D00", 4])] },
  },
  // Northwestern stripes cut off at the bottom of the wide gold stripe, so the wide gold sits on the cuff:
  // white fills the gaps on black, black outlines the gold on white.
  PIT: {
    home: { sleeve: [st(0, ["#FFB612", 10], [W, 3], ["#FFB612", 4], [W, 3])] },
    away: { sleeve: [st(0, ["#FFB612", 10], ["#101820", 3], ["#FFB612", 4], ["#101820", 3])] },
  },
  // AFC South
  IND: { home: { sleeve: [shoulder([W, 8], ["", 7], [W, 8])] }, away: { sleeve: [shoulder(["#002C5F", 8], ["", 7], ["#002C5F", 8])] } },
  JAX: { home: { sleeve: [st(8, ["#101820", 16], ["#D7A22A", 3])] }, away: { sleeve: [st(8, ["#101820", 16], ["#D7A22A", 3])] } },
  // Six thin navy "strings" edged in white and red: on the Titans blue body at home, in a blue band on the road.
  TEN: {
    home: { sleeve: [st(10, ["#C8102E", 3], [W, 3], ["", 3], ...strings("#0C2340", ""), [W, 3], ["#C8102E", 3])] },
    away: { sleeve: [st(10, ["#C8102E", 3], ["#0C2340", 2], ["#4B92DB", 3], ...strings("#0C2340", "#4B92DB"), ["#0C2340", 2], ["#C8102E", 3])] },
  },
  // AFC West
  DEN: { home: { pattern: { id: "peaks", c: "#002244", c2: W } }, away: { pattern: { id: "peaks", c: "#002244", c2: "#FB4F14" } } },
  KC: { home: { sleeve: [st(14, [W, 6], ["", 5], [W, 6])] }, away: { sleeve: [st(14, ["#E31837", 6], ["", 5], ["#E31837", 6])] } },
  // NFC East
  // Two navy-edged royal stripes on white; one white, gray, white stripe on navy.
  DAL: {
    home: { sleeve: [st(10, ["#041E42", 2], ["#003594", 6], ["#041E42", 2], ["", 4], ["#041E42", 2], ["#003594", 6], ["#041E42", 2])] },
    away: { sleeve: [st(12, [W, 5], ["#869397", 7], [W, 5])] },
  },
  NYG: { away: { sleeve: [st(14, ["#0B2265", 4], ["#A71930", 6], ["#0B2265", 4])] } },
  PHI: {
    home: { sleeve: [st(12, ["#A5ACAF", 3], ["#000000", 10], ["#A5ACAF", 3])], side: { c: "#000000", w: 10, edge: "#A5ACAF" } },
    away: { sleeve: [st(12, ["#000000", 3], ["#004C54", 10], ["#000000", 3])], side: { c: "#004C54", w: 10, edge: "#000000" } },
  },
  // 2026: two sleeve stripes, gold and white at home, gold and burgundy on the road.
  WAS: { home: { sleeve: [st(12, ["#FFB612", 7], ["", 5], [W, 7])] }, away: { sleeve: [st(12, ["#FFB612", 7], ["", 5], ["#5A1414", 7])] } },
  // NFC North
  CHI: { home: { sleeve: [st(12, ["#C83803", 5], [W, 5], ["#C83803", 5])] }, away: { sleeve: [st(12, ["#0B162A", 5], ["#C83803", 5], ["#0B162A", 5])] } },
  DET: { home: { sleeve: [shoulder([W, 4], ["#B0B7BC", 7], [W, 4])] }, away: { sleeve: [shoulder(["#0076B6", 4], ["#B0B7BC", 7], ["#0076B6", 4])] } },
  GB: { home: { sleeve: [st(12, ["#FFB612", 5], [W, 5], ["#FFB612", 5])] }, away: { sleeve: [st(12, ["#203731", 5], ["#FFB612", 5], ["#203731", 5])] } },
  MIN: { home: { pattern: { id: "curl", c: "#FFC62F", c2: W } }, away: { pattern: { id: "curl", c: "#4F2683", c2: "#FFC62F" } } },
  // NFC South
  CAR: { home: { raglan: { c: "#0085CA", w: 11, edge: "#BFC0BF" } }, away: { raglan: { c: "#0085CA", w: 11, edge: "#BFC0BF" } } },
  // NFC West
  ARI: { away: { sleeve: [st(12, ["#97233F", 4], ["", 12], ["#97233F", 4])] } },
  // The horn is the Rams logo, so a thin sol pin pair above the cuff stands in for it.
  LAR: { home: { sleeve: [st(12, [W, 2], ["", 4], ["#FFD100", 3])] }, away: { sleeve: [st(12, ["#003594", 2], ["", 4], ["#FFD100", 3])] } },
  // Three equal stripes, restored in 2022: white on red, red on white.
  SF: { home: { sleeve: [st(10, [W, 6], ["", 5], [W, 6], ["", 5], [W, 6])] }, away: { sleeve: [st(10, ["#AA0000", 6], ["", 5], ["#AA0000", 6], ["", 5], ["#AA0000", 6])] } },
  SEA: { home: { pattern: { id: "feather", c: "#A5ACAF", c2: "#69BE28" } }, away: { pattern: { id: "feather", c: "#002244", c2: "#69BE28" } } },
};

/** Six thin string lines on a band color, for the Titans sleeve. */
function strings(line: string, band: string): [string, number][] {
  return Array.from({ length: 6 }, () => [[line, 2], [band, 3]] as [string, number][]).flat();
}

/** Trim for the colorway `colorway(team, away)` returns. */
export function trimFor(team: string, away = false): Trim | undefined {
  const t = TRIMS[team];
  return t && (away ? t.away : t.home);
}

/** Free Google Fonts stand-ins for each team's number face. The real faces are custom, so these are
    the closest open fonts by shape, never copies. */
export type NumFont =
  | "teko" // tall condensed, squared
  | "oswald" // classic block with rounded bowls
  | "bigShoulders" // squared full block
  | "saira" // modern squared with soft corners
  | "barlow" // modern rounded condensed
  | "chakra" // chamfered, angular cuts
  | "squada" // squared with clipped corners
  | "jost"; // geometric, round bowls

/** Number treatment for one colorway. The fill and first outline come from the colorway. */
export interface NumberTrim {
  font?: NumFont;
  /** Second, outer outline. */
  outline2?: string;
  /** Drop shadow color, offset down and to the right. */
  shadow?: string;
  /** Italic slant in degrees, positive leans right. */
  slant?: number;
  /** No outline at all: the number is a single flat color. */
  plain?: boolean;
}

export interface NumberStyle extends NumberTrim {
  font: NumFont;
}

// Number face per team, from current home and road jerseys. Teams on the same face share one stand-in.
export const NUMBERS: Record<string, { font: NumFont; home?: NumberTrim; away?: NumberTrim }> = {
  BUF: { font: "bigShoulders" },
  MIA: { font: "oswald" },
  NE: { font: "oswald" },
  NYJ: { font: "oswald", home: { plain: true }, away: { plain: true } },
  BAL: { font: "saira" },
  CIN: { font: "teko" },
  CLE: { font: "bigShoulders", home: { plain: true }, away: { plain: true } },
  PIT: { font: "jost", home: { plain: true } },
  HOU: { font: "chakra" },
  IND: { font: "bigShoulders", home: { plain: true }, away: { plain: true } },
  JAX: { font: "oswald" },
  TEN: { font: "oswald" },
  DEN: { font: "saira" },
  KC: { font: "bigShoulders" },
  LV: { font: "bigShoulders" },
  LAC: { font: "saira" },
  DAL: { font: "bigShoulders" },
  NYG: { font: "bigShoulders" },
  PHI: { font: "squada" },
  WAS: { font: "bigShoulders" },
  CHI: { font: "oswald" },
  DET: { font: "barlow" },
  GB: { font: "oswald" },
  MIN: { font: "chakra" },
  ATL: { font: "bigShoulders" },
  CAR: { font: "chakra" },
  NO: { font: "bigShoulders" },
  TB: { font: "bigShoulders" },
  ARI: { font: "saira" },
  LAR: { font: "barlow" },
  SF: { font: "bigShoulders" },
  SEA: { font: "squada" },
};

/** Number face and treatment for the colorway `colorway(team, away)` returns. */
export function numberStyle(team: string, away = false): NumberStyle {
  const t = NUMBERS[team];
  if (!t) return { font: "teko" };
  return { font: t.font, ...(away ? t.away : t.home) };
}

/** Review order: AFC East, North, South, West, then NFC. */
export const DIVISIONS: { conf: Conference; div: Division; teams: string[] }[] = (["AFC", "NFC"] as const).flatMap((conf) =>
  (["East", "North", "South", "West"] as const).map((div) => ({
    conf,
    div,
    teams: Object.keys(JERSEYS).filter((t) => JERSEYS[t].conf === conf && JERSEYS[t].div === div),
  })),
);

const FALLBACK: Colorway = { body: "#3A3A3E", number: W, outline: "#8E8E93", collar: solid("#8E8E93"), cuff: "#3A3A3E", panel: "#3A3A3E" };

const isWhite = (hex: string) => hex.toUpperCase() === W;

/** A collar for the white jersey: white in the home collar becomes the home body color. */
function flipCollar(c: Collar, body: string): Collar {
  const swap = (x: string) => (x && isWhite(x) ? body : x);
  if (c.style === "plain") return c;
  if (c.style === "solid") return { ...c, c: swap(c.c) };
  return { ...c, c: swap(c.c), s: c.s.map(([x, w]) => [swap(x), w] as [string, number]) };
}

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
        collar: flipCollar(home.collar, home.body),
        cuff: isWhite(home.cuff) ? home.body : home.cuff,
        panel: W,
      };
  return { ...derived, ...a };
}
