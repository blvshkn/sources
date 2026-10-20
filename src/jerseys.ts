// Jersey colorways for the 32 NFL teams, drawn by components/Jersey.tsx.
// Team colors and trim only: stripes, panels and signature patterns are fine, but no logos,
// logo-derived marks, wordmarks, names, league shield or maker marks ever go on a jersey.
// Hex values from teamcolorcodes.com (NFL team color codes), checked against photos of each team's
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
export type PatternId = "tiger" | "peaks" | "hook";

/** A band with an optional edge color on both sides. */
export interface Band {
  c: string;
  w: number;
  edge?: string;
}

/** A run of straight parallel stripes on the left shoulder (mirrored to the right), centered on the
    line from `a` to `b` in artboard px and stacked from the chest side outward: [color, width]. An empty
    color leaves a gap. Used for stripes that run over the shoulder rather than around the sleeve. */
export interface Bars {
  a: [number, number];
  b: [number, number];
  s: [string, number][];
}

export interface Trim {
  /** Sleeve or shoulder stripes. */
  sleeve?: StripeSet[];
  /** Straight stripes over the shoulder: yoke stripes, shoulder bands. */
  bars?: Bars[];
  /** A band that follows the raglan seam from collar to underarm. */
  raglan?: Band;
  /** A band along the side panel seam. */
  side?: Band;
  /** Signature pattern with its main and accent colors. */
  pattern?: { id: PatternId; c: string; c2?: string };
  /** Three small triangles down each side of the chest, in this color. */
  marks?: string;
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

// Each colorway was checked against current photos: NFL Shop product photos of the home and road game
// jerseys, and the uniform illustration on each team's Wikipedia page (2025 and 2026 sets).
export const JERSEYS: Record<string, TeamJersey> = {
  // AFC East
  // White, red and navy collar; white numbers trimmed red, then navy.
  BUF: { name: "Buffalo Bills", conf: "AFC", div: "East", body: "#00338D", number: W, outline: "#C60C30", collar: striped(W, [["", 9], ["#C60C30", 7], ["#0C2340", 6]], { w: 22 }), cuff: "#00338D", panel: "#00338D",
    away: { number: "#00338D", outline: "#C60C30", collar: striped("#00338D", [["", 9], ["#C60C30", 7], ["#0C2340", 6]], { w: 22 }), cuff: W } },
  // Plain aqua V and plain sleeves; white numbers trimmed orange.
  MIA: { name: "Miami Dolphins", conf: "AFC", div: "East", body: "#008E97", number: W, outline: "#FC4C02", collar: plain(), cuff: "#008E97", panel: "#008E97",
    away: { number: "#008E97", outline: "#FC4C02", collar: plain(), cuff: W } },
  // Plain V, red and white stripes over the shoulders, white numbers trimmed red.
  NE: { name: "New England Patriots", conf: "AFC", div: "East", body: "#002244", number: W, outline: "#C60C30", collar: plain(), cuff: "#002244", panel: "#002244",
    away: { number: "#002244", outline: "#C60C30", collar: plain(), cuff: W } },
  // Legacy set: a wide white V, two white stripes at the cuff, flat white numbers.
  NYJ: { name: "New York Jets", conf: "AFC", div: "East", body: "#125740", number: W, outline: W, collar: solid(W, { w: 30 }), cuff: "#125740", panel: "#125740",
    away: { number: "#125740", outline: "#125740", collar: solid("#125740", { w: 30 }), cuff: W } },
  // AFC North
  // 2026: midnight purple, black cuffs, white numbers with a thin black line. The feather collar is
  // logo-derived, so it reads as a plain black V here.
  BAL: { name: "Baltimore Ravens", conf: "AFC", div: "North", body: "#1F1460", number: W, outline: "#000000", collar: solid("#000000", { w: 24 }), cuff: "#000000", panel: "#1F1460",
    away: { number: "#1F1460", outline: "#000000", collar: solid("#1F1460", { w: 24 }), cuff: "#1F1460" } },
  // Plain V, tiger stripes on the shoulders, white numbers trimmed orange.
  CIN: { name: "Cincinnati Bengals", conf: "AFC", div: "North", body: "#000000", number: W, outline: "#FB4F14", collar: plain(), cuff: "#000000", panel: "#000000",
    away: { number: "#000000", outline: "#FB4F14", collar: plain(), cuff: W } },
  // Plain brown V (no orange), five wide sleeve stripes, flat numbers.
  CLE: { name: "Cleveland Browns", conf: "AFC", div: "North", body: "#311D00", number: W, outline: W, collar: plain(), cuff: "#311D00", panel: "#311D00",
    away: { number: "#311D00", outline: "#311D00", collar: plain(), cuff: W } },
  // Plain V, Northwestern stripes, flat white numbers at home and flat black on the road.
  PIT: { name: "Pittsburgh Steelers", conf: "AFC", div: "North", body: "#101820", number: W, outline: W, collar: plain(), cuff: "#101820", panel: "#101820",
    away: { number: "#101820", outline: "#101820", collar: plain(), cuff: W } },
  // AFC South
  // Navy V edged red and white at home, plain white V on the road.
  HOU: { name: "Houston Texans", conf: "AFC", div: "South", body: "#03202F", number: W, outline: "#A71930", collar: striped("#03202F", [["#A71930", 5], [W, 3]], { w: 22 }), cuff: "#03202F", panel: "#03202F",
    away: { number: "#03202F", outline: "#A71930", collar: plain(), cuff: W } },
  // Plain V, two stripes over each shoulder, flat numbers.
  IND: { name: "Indianapolis Colts", conf: "AFC", div: "South", body: "#002C5F", number: W, outline: W, collar: plain(), cuff: "#002C5F", panel: "#002C5F",
    away: { number: "#002C5F", outline: "#002C5F", collar: plain(), cuff: W } },
  // 2026: black V and wide black sleeve ends on both, flat numbers.
  JAX: { name: "Jacksonville Jaguars", conf: "AFC", div: "South", body: "#006778", number: W, outline: W, collar: solid("#101820", { w: 24 }), cuff: "#101820", panel: "#006778",
    away: { number: "#101820", outline: "#101820", collar: solid("#101820", { w: 24 }), cuff: "#101820" } },
  // 2026: Titans blue, plain V, white numbers trimmed red. The collar monogram is a logo.
  TEN: { name: "Tennessee Titans", conf: "AFC", div: "South", body: "#4B92DB", number: W, outline: "#C8102E", collar: plain(), cuff: "#4B92DB", panel: "#4B92DB",
    away: { number: "#4B92DB", outline: "#C8102E", collar: plain(), cuff: W } },
  // AFC West
  // Navy V at home, orange V on the road; peak sleeve caps and three small triangles down each side.
  DEN: { name: "Denver Broncos", conf: "AFC", div: "West", body: "#FB4F14", number: W, outline: "#002244", collar: solid("#002244", { w: 22 }), cuff: "#FB4F14", panel: "#FB4F14",
    away: { number: "#002244", outline: "#FB4F14", collar: solid("#FB4F14", { w: 22 }), cuff: W } },
  // Plain V, white, gold, white sleeve stripes, white numbers trimmed gold.
  KC: { name: "Kansas City Chiefs", conf: "AFC", div: "West", body: "#E31837", number: W, outline: "#FFB81C", collar: plain(), cuff: "#E31837", panel: "#E31837",
    away: { number: "#E31837", outline: "#FFB81C", collar: plain(), cuff: W } },
  // Plain black, flat silver numbers; black numbers with a thin silver line on the road.
  LV: { name: "Las Vegas Raiders", conf: "AFC", div: "West", body: "#000000", number: "#A5ACAF", outline: "#A5ACAF", collar: plain(), cuff: "#000000", panel: "#000000",
    away: { number: "#000000", outline: "#A5ACAF", collar: plain(), cuff: W } },
  // Powder blue, plain V, white numbers trimmed gold. The shoulder bolt is a logo, so the sleeves are plain.
  LAC: { name: "Los Angeles Chargers", conf: "AFC", div: "West", body: "#0080C6", number: W, outline: "#FFC20E", collar: plain(), cuff: "#0080C6", panel: "#0080C6",
    away: { number: "#0080C6", outline: "#FFC20E", collar: plain(), cuff: W } },
  // NFC East
  // White at home: plain V, royal numbers with a thin navy line, two navy-edged royal sleeve stripes.
  // The navy jersey has a white, gray, white collar and sleeve stripe, and white numbers lined navy and white.
  DAL: { name: "Dallas Cowboys", conf: "NFC", div: "East", body: W, number: "#003594", outline: "#041E42", collar: plain(), cuff: W, panel: W,
    away: { body: "#041E42", number: W, outline: "#041E42", collar: striped("#041E42", [["", 3], [W, 5], ["#869397", 7], [W, 5]], { w: 24 }), cuff: "#041E42", panel: "#041E42" } },
  // Plain V both; flat white numbers at home, flat red on the road with three red sleeve stripes.
  NYG: { name: "New York Giants", conf: "NFC", div: "East", body: "#0B2265", number: W, outline: W, collar: plain(), cuff: "#0B2265", panel: "#0B2265",
    away: { number: "#A71930", outline: "#A71930", collar: plain(), cuff: W } },
  // Wide black V and black sleeve ends; numbers with a black line and black drop shadow.
  PHI: { name: "Philadelphia Eagles", conf: "NFC", div: "East", body: "#004C54", number: W, outline: "#000000", collar: solid("#000000", { w: 28 }), cuff: "#000000", panel: "#004C54",
    away: { number: "#004C54", outline: "#000000", collar: solid("#000000", { w: 28 }), cuff: "#000000" } },
  // 2026: burgundy, plain V, gold and white stripes at the cuff, white block numbers trimmed gold.
  WAS: { name: "Washington Commanders", conf: "NFC", div: "East", body: "#5A1414", number: W, outline: "#FFB612", collar: plain(), cuff: "#5A1414", panel: "#5A1414",
    away: { number: "#5A1414", outline: "#FFB612", collar: solid("#5A1414", { w: 24 }), cuff: W } },
  // NFC North
  // Plain V, orange and white sleeve stripes, tall white numbers trimmed orange.
  CHI: { name: "Chicago Bears", conf: "NFC", div: "North", body: "#0B162A", number: W, outline: "#C83803", collar: plain(), cuff: "#0B162A", panel: "#0B162A",
    away: { number: "#0B162A", outline: "#C83803", collar: plain(), cuff: W } },
  // Plain V, silver sleeve stripes, white numbers lined silver.
  DET: { name: "Detroit Lions", conf: "NFC", div: "North", body: "#0076B6", number: W, outline: "#B0B7BC", collar: plain(), cuff: "#0076B6", panel: "#0076B6",
    away: { number: "#0076B6", outline: "#B0B7BC", collar: plain(), cuff: W } },
  // Traditional striped collar matching the sleeve stripes; flat numbers.
  GB: { name: "Green Bay Packers", conf: "NFC", div: "North", body: "#203731", number: W, outline: W, collar: striped("#FFB612", [["", 8], [W, 5]], { w: 22 }), cuff: "#203731", panel: "#203731",
    away: { number: "#203731", outline: "#203731", collar: striped("#203731", [["", 7], ["#FFB612", 6], [W, 3]], { w: 22 }), cuff: W } },
  // Plain V, white over gold at the cuff, flat numbers.
  MIN: { name: "Minnesota Vikings", conf: "NFC", div: "North", body: "#4F2683", number: W, outline: W, collar: plain(), cuff: "#4F2683", panel: "#4F2683",
    away: { number: "#4F2683", outline: "#4F2683", collar: plain(), cuff: W } },
  // NFC South
  // 2026: red, plain V, plain sleeves, white block numbers outlined black.
  ATL: { name: "Atlanta Falcons", conf: "NFC", div: "South", body: "#A71930", number: W, outline: "#000000", collar: plain(), cuff: "#A71930", panel: "#A71930",
    away: { number: "#A71930", outline: "#000000", collar: plain(), cuff: W } },
  // Wide blue V at home, black on the road; blue shoulder stripe edged silver.
  CAR: { name: "Carolina Panthers", conf: "NFC", div: "South", body: "#101820", number: W, outline: "#0085CA", collar: solid("#0085CA", { w: 26 }), cuff: "#101820", panel: "#101820",
    away: { number: "#101820", outline: "#0085CA", collar: solid("#101820", { w: 26 }), cuff: W } },
  // Gold V at home, black V on the road; gold numbers lined white.
  NO: { name: "New Orleans Saints", conf: "NFC", div: "South", body: "#101820", number: "#D3BC8D", outline: W, collar: solid("#D3BC8D", { w: 26 }), cuff: "#101820", panel: "#101820",
    away: { number: "#101820", outline: "#D3BC8D", collar: solid("#101820", { w: 26 }), cuff: W } },
  // Red with a black-edged V and pewter sleeve ends; white numbers lined orange, then pewter.
  TB: { name: "Tampa Bay Buccaneers", conf: "NFC", div: "South", body: "#D50A0A", number: W, outline: "#FF7900", collar: striped("#D50A0A", [["#0A0A08", 9]], { w: 22 }), cuff: "#34302B", panel: "#D50A0A",
    away: { number: "#D50A0A", outline: "#FF7900", collar: striped(W, [["#0A0A08", 9]], { w: 22 }), cuff: "#34302B" } },
  // NFC West
  // Plain V, flat white numbers at home; red numbers outlined black and a sleeve band on the road.
  ARI: { name: "Arizona Cardinals", conf: "NFC", div: "West", body: "#97233F", number: W, outline: W, collar: plain(), cuff: "#97233F", panel: "#97233F",
    away: { number: "#97233F", outline: "#000000", collar: plain(), cuff: W } },
  // 2026: flat sol numbers, plain V. The shoulder horn is the Rams logo, so the sleeves are plain.
  LAR: { name: "Los Angeles Rams", conf: "NFC", div: "West", body: "#003594", number: "#FFD100", outline: "#FFD100", collar: plain(), cuff: "#003594", panel: "#003594",
    away: { number: "#003594", outline: "#003594", collar: plain(), cuff: W } },
  // A solid scarlet V (a shade deeper, as the ribbed collar reads in photos), three equal sleeve stripes, flat numbers.
  SF: { name: "San Francisco 49ers", conf: "NFC", div: "West", body: "#AA0000", number: W, outline: W, collar: solid("#960000", { w: 24 }), cuff: "#AA0000", panel: "#AA0000",
    away: { number: "#AA0000", outline: "#AA0000", collar: solid(W, { w: 24 }), cuff: W } },
  // Plain V, a wolf gray shoulder band ending in action green, gray numbers trimmed green.
  SEA: { name: "Seattle Seahawks", conf: "NFC", div: "West", body: "#002244", number: "#A5ACAF", outline: "#69BE28", collar: plain(), cuff: "#002244", panel: "#002244",
    away: { number: "#002244", outline: "#69BE28", collar: plain(), cuff: W } },
};

/** Trim for one team: home, and white (or road) when it differs. A missing side is plain. */
export interface TeamTrim {
  home?: Trim;
  away?: Trim;
}

const st = (at: number, ...s: [string, number][]): StripeSet => ({ at, s });

// Trim from each team's current home and road jerseys, checked against photos (see JERSEYS). Left out on
// purpose, because each one is a logo or comes from one: the Rams shoulder horn, the Ravens feather
// collar, the Chargers shoulder bolt, the Titans underarm stars and collar monogram, the Seahawks collar
// feathers, every sleeve or shoulder logo patch, and the wordmark inside the Cardinals road stripe.
const NAVY_BUF = "#0C2340";
export const TRIMS: Record<string, TeamTrim> = {
  // AFC East
  // White, navy, red, repeated, with white at the cuff: royal takes the white's place on the road.
  BUF: {
    home: { sleeve: [st(4, [W, 8], [NAVY_BUF, 3], ["#C60C30", 6], [W, 8], [NAVY_BUF, 3], ["#C60C30", 6], [W, 8])] },
    away: { sleeve: [st(4, ["#00338D", 8], [NAVY_BUF, 3], ["#C60C30", 6], ["#00338D", 8], [NAVY_BUF, 3], ["#C60C30", 6], ["#00338D", 8])] },
  },
  // Three stripes running over each shoulder beside the raglan seam: red, white, red; red, navy, red.
  NE: {
    home: { bars: [{ a: [250, -14], b: [150, 128], s: [["#C60C30", 12], [W, 8], ["#C60C30", 12]] }] },
    away: { bars: [{ a: [250, -14], b: [150, 128], s: [["#C60C30", 12], ["#002244", 8], ["#C60C30", 12]] }] },
  },
  NYJ: { home: { sleeve: [st(6, [W, 11], ["", 8], [W, 11])] }, away: { sleeve: [st(6, ["#125740", 11], ["", 8], ["#125740", 11])] } },
  // AFC North
  // Black sleeve ends at home, purple on the road.
  BAL: { home: { sleeve: [st(0, ["#000000", 14])] }, away: { sleeve: [st(0, ["#1F1460", 14])] } },
  CIN: { home: { pattern: { id: "tiger", c: "#FB4F14" } }, away: { pattern: { id: "tiger", c: "#000000" } } },
  // Five equal stripes just above the cuff: white, orange, white, orange, white on brown; brown and orange on white.
  CLE: {
    home: { sleeve: [st(6, [W, 12], ["#FF3C00", 12], [W, 12], ["#FF3C00", 12], [W, 12])] },
    away: { sleeve: [st(6, ["#311D00", 12], ["#FF3C00", 12], ["#311D00", 12], ["#FF3C00", 12], ["#311D00", 12])] },
  },
  // Northwestern stripes: a wide gold stripe between two narrow ones, white lines on black, black on white.
  PIT: {
    home: { sleeve: [st(3, ["#FFB612", 7], [W, 3], ["#FFB612", 20], [W, 3], ["#FFB612", 7])] },
    away: { sleeve: [st(3, ["#FFB612", 7], ["#101820", 3], ["#FFB612", 20], ["#101820", 3], ["#FFB612", 7])] },
  },
  // AFC South
  // Road: a curved navy sleeve hook over a thin red line.
  HOU: { away: { pattern: { id: "hook", c: "#03202F", c2: "#A71930" } } },
  // Two stripes running over each shoulder near the collar.
  IND: {
    home: { bars: [{ a: [128, -14], b: [100, 82], s: [[W, 13], ["", 10], [W, 13]] }] },
    away: { bars: [{ a: [128, -14], b: [100, 82], s: [["#002C5F", 13], ["", 10], ["#002C5F", 13]] }] },
  },
  // Wide black sleeve ends on both.
  JAX: { home: { sleeve: [st(0, ["#101820", 18])] }, away: { sleeve: [st(0, ["#101820", 18])] } },
  // Six thin navy "strings" edged in white and red: on the Titans blue body at home, in a blue band on the road.
  TEN: {
    home: { sleeve: [st(10, ["#C8102E", 3], [W, 3], ["", 3], ...strings("#0C2340", ""), [W, 3], ["#C8102E", 3])] },
    away: { sleeve: [st(10, ["#C8102E", 3], ["#0C2340", 2], ["#4B92DB", 3], ...strings("#0C2340", "#4B92DB"), ["#0C2340", 2], ["#C8102E", 3])] },
  },
  // AFC West
  DEN: { home: { pattern: { id: "peaks", c: "#002244", c2: W }, marks: "#002244" }, away: { pattern: { id: "peaks", c: "#002244", c2: "#FB4F14" }, marks: "#FB4F14" } },
  KC: { home: { sleeve: [st(4, [W, 12], ["#FFB81C", 8], [W, 12])] }, away: { sleeve: [st(4, ["#E31837", 12], ["#FFB81C", 8], ["#E31837", 12])] } },
  // NFC East
  // Two navy-edged royal stripes on white; one white, gray, white stripe on navy.
  DAL: {
    home: { sleeve: [st(10, ["#041E42", 2], ["#003594", 6], ["#041E42", 2], ["", 4], ["#041E42", 2], ["#003594", 6], ["#041E42", 2])] },
    away: { sleeve: [st(10, [W, 4], ["#869397", 10], [W, 4])] },
  },
  NYG: { away: { sleeve: [st(6, ["#A71930", 8], ["", 5], ["#A71930", 8], ["", 5], ["#A71930", 8])] } },
  // Black sleeve ends on both.
  PHI: { home: { sleeve: [st(0, ["#000000", 16])] }, away: { sleeve: [st(0, ["#000000", 16])] } },
  // 2026: gold at the cuff with white above it at home, burgundy above it on the road.
  WAS: { home: { sleeve: [st(0, ["#FFB612", 10], [W, 10])] }, away: { sleeve: [st(0, ["#FFB612", 10], ["#5A1414", 10])] } },
  // NFC North
  CHI: {
    home: { sleeve: [st(6, ["#C83803", 6], [W, 5], ["#C83803", 6], [W, 5], ["#C83803", 6])] },
    away: { sleeve: [st(6, ["#0B162A", 6], ["", 4], ["#C83803", 6], ["", 4], ["#0B162A", 6])] },
  },
  DET: {
    home: { sleeve: [st(4, ["#B0B7BC", 11], ["", 5], ["#B0B7BC", 11])] },
    away: { sleeve: [st(4, ["#0076B6", 7], ["", 5], ["#0076B6", 7], ["", 5], ["#0076B6", 7])] },
  },
  GB: { home: { sleeve: [st(5, ["#FFB612", 9], [W, 7], ["#FFB612", 9])] }, away: { sleeve: [st(5, ["#203731", 9], ["#FFB612", 7], ["#203731", 9])] } },
  MIN: { home: { sleeve: [st(3, ["#FFC62F", 9], [W, 11])] }, away: { sleeve: [st(3, ["#FFC62F", 9], ["#4F2683", 11])] } },
  // NFC South
  CAR: { home: { raglan: { c: "#0085CA", w: 11, edge: "#BFC0BF" } }, away: { raglan: { c: "#0085CA", w: 11, edge: "#BFC0BF" } } },
  // Pewter sleeve ends on both.
  TB: { home: { sleeve: [st(0, ["#34302B", 14])] }, away: { sleeve: [st(0, ["#34302B", 14])] } },
  // NFC West
  // Road band: cardinal edged black, with a white gap where the wordmark sits on the real one.
  ARI: { away: { sleeve: [st(8, ["#000000", 2], ["#97233F", 5], ["", 12], ["#97233F", 5], ["#000000", 2])] } },
  // Three equal stripes: white on scarlet, scarlet on white.
  SF: { home: { sleeve: [st(6, [W, 12], ["", 9], [W, 12], ["", 9], [W, 12])] }, away: { sleeve: [st(6, ["#AA0000", 12], ["", 9], ["#AA0000", 12], ["", 9], ["#AA0000", 12])] } },
  // A band from the collar across the shoulder to the sleeve: wolf gray tipped action green; navy on the road.
  SEA: {
    home: { bars: [{ a: [236, 98], b: [-10, 154], s: [["#A5ACAF", 30]] }, { a: [52, 144], b: [-10, 158], s: [["#69BE28", 30]] }] },
    away: { bars: [{ a: [236, 98], b: [-10, 154], s: [["#002244", 30]] }] },
  },
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

/** Number treatment for one colorway. The fill and first outline come from the colorway. */
export interface NumberTrim {
  /** Second, outer outline. */
  outline2?: string;
  /** Drop shadow color, offset down and to the right. */
  shadow?: string;
  /** Italic slant in degrees, positive leans right. */
  slant?: number;
  /** No outline at all: the number is a single flat color. */
  plain?: boolean;
  /** No numbers on top of the shoulders (the real jersey has a logo or a pattern there). */
  noShoulder?: boolean;
}

export type NumberStyle = NumberTrim;

// Number treatment per team, from current home and road photos. The digit shapes themselves are drawn
// in numerals.ts, one original set per team.
const FLAT: NumberTrim = { plain: true };
const OFF: NumberTrim = { noShoulder: true };
export const NUMBERS: Record<string, { home?: NumberTrim; away?: NumberTrim }> = {
  BUF: { home: { outline2: NAVY_BUF }, away: { outline2: NAVY_BUF } },
  MIA: {},
  NE: { home: OFF, away: OFF },
  NYJ: { home: FLAT, away: FLAT },
  BAL: {},
  CIN: { home: OFF, away: OFF },
  CLE: { home: FLAT, away: FLAT },
  PIT: { home: FLAT, away: FLAT },
  HOU: {},
  IND: { home: { plain: true, noShoulder: true }, away: { plain: true, noShoulder: true } },
  JAX: { home: FLAT, away: FLAT },
  TEN: {},
  DEN: { home: OFF, away: OFF },
  KC: {},
  LV: { home: FLAT },
  LAC: { home: { slant: 6, noShoulder: true }, away: { slant: 6, noShoulder: true } },
  DAL: { away: { outline2: W } },
  NYG: { home: FLAT, away: FLAT },
  PHI: { home: { shadow: "#000000" }, away: { shadow: "#000000" } },
  WAS: {},
  CHI: {},
  DET: {},
  GB: { home: FLAT, away: FLAT },
  MIN: { home: FLAT, away: FLAT },
  ATL: {},
  CAR: {},
  NO: {},
  TB: { home: { outline2: "#34302B" }, away: { outline2: "#34302B" } },
  ARI: { home: FLAT, away: OFF },
  LAR: { home: { plain: true, noShoulder: true }, away: { plain: true, noShoulder: true } },
  SF: { home: FLAT, away: FLAT },
  SEA: {},
};

/** Number face and treatment for the colorway `colorway(team, away)` returns. */
export function numberStyle(team: string, away = false): NumberStyle {
  const t = NUMBERS[team];
  return { ...(t && (away ? t.away : t.home)) };
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
