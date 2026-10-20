// Dev-only checks for src/search.ts. Not imported by the app.
// Run: npx esbuild src/search.check.ts --bundle --platform=node | node
import { matchPlayer, matchTeam, nameWords, playersInText, rankPlayers, rankTeams, teamsInText } from "./search";

const pool = [
  { name: "James Cook", pos: "RB", team: "BUF", value: 9000 },
  { name: "Ja'Marr Chase", pos: "WR", team: "CIN", value: 9800 },
  { name: "Josh Allen", pos: "QB", team: "BUF", value: 9500 },
  { name: "Jalen Coker", pos: "WR", team: "CAR", value: 4200 },
  { name: "Amon-Ra St. Brown", pos: "WR", team: "DET", value: 9300 },
  { name: "Kenneth Walker III", pos: "RB", team: "KC", value: 6000 },
  { name: "Ray Davis", pos: "RB", team: "BUF", value: 1500 },
  { name: "Jaylen Waddle", pos: "WR", team: "MIA", value: 5000 },
  { name: "Marvin Harrison Jr.", pos: "WR", team: "ARI", value: 6500 },
  { name: "Puka Nacua", pos: "WR", team: "LAR", value: 8800 },
].sort((a, b) => b.value - a.value);

const names = (q: string) => rankPlayers(q, pool, (p) => p).map((r) => r.item.name);
let fails = 0;
const check = (label: string, ok: boolean, got: unknown) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}  -> ${JSON.stringify(got)}`); if (!ok) fails++; };
const has = (q: string, ...want: string[]) => { const got = names(q); check(`"${q}" finds ${want.join(", ")}`, want.every((w) => got.includes(w)), got); };
const first = (q: string, want: string) => { const got = names(q); check(`"${q}" ranks ${want} first`, got[0] === want, got); };
const none = (q: string, not: string) => { const got = names(q); check(`"${q}" does not find ${not}`, !got.includes(not), got); };

has("jc", "Jalen Coker", "James Cook");
has("j c", "Jalen Coker", "James Cook");
has("j co", "Jalen Coker", "James Cook");
first("j cok", "Jalen Coker");
first("jal co", "Jalen Coker");
first("ja coo", "James Cook");
first("asb", "Amon-Ra St. Brown");
has("as", "Amon-Ra St. Brown");
has("ars", "Amon-Ra St. Brown");
first("jamarr", "Ja'Marr Chase");
first("JaMarr chase", "Ja'Marr Chase");
first("coker", "Jalen Coker");
first("cok", "Jalen Coker");
first("cook j", "James Cook");
first("walker", "Kenneth Walker III");
has("kw", "Kenneth Walker III");
has("mh", "Marvin Harrison Jr.");
none("jc", "Jaylen Waddle");
const buf = names("rb buf"); check(`"rb buf" is the Bills RBs only`, buf.length === 2 && buf.includes("James Cook") && buf.includes("Ray Davis"), buf);
const marks = matchPlayer("jc", "Jalen Coker")!.marks; check(`"jc" highlights J and C`, JSON.stringify(marks) === "[[0,1],[6,7]]", marks);
const m2 = matchPlayer("jamarr", "Ja'Marr Chase")!.marks; check(`"jamarr" highlights Ja'Marr`, JSON.stringify(m2) === "[[0,7]]", m2);
check("accents fold", !!matchPlayer("jose", "José Ramírez"), matchPlayer("jose", "José Ramírez"));

// ---- Sentences: names inside what people say ----
const more = [...pool, { name: "A.J. Brown", pos: "WR", team: "PHI", value: 7000 }, { name: "Chase Brown", pos: "RB", team: "CIN", value: 6200 },
  { name: "Justin Jefferson", pos: "WR", team: "MIN", value: 9000 }, { name: "Dalvin Cook", pos: "RB", team: "FA", value: 100 }, { name: "Jordan Love", pos: "QB", team: "GB", value: 4000 },
  { name: "Mike Evans", pos: "WR", team: "TB", value: 5000 }];
const teams = [
  { id: "a", name: "Jalen My Way", manager: "Sk4zi" }, { id: "b", name: "Griddy Gang", manager: "Mike" },
  { id: "c", name: "Pat's Picks", manager: "Pat" }, { id: "d", name: "Allen Cooks, Coker Eats", manager: "Blev" },
];
const avoid = nameWords(more.map((p) => p.name));
const who = (q: string, order = more) => playersInText(q, order, (p) => p.name)[0]?.item.name;
const team = (q: string) => teamsInText(q, teams, (t) => t, avoid)[0]?.item.manager;
const said = (q: string, want: string | undefined, got: string | undefined) => check(`"${q}" -> ${want ?? "nobody"}`, got === want, got ?? null);
said("sk4zi won't move cook", "James Cook", who("sk4zi won't move cook"));
said("sk4zi won't move cook (team)", "Sk4zi", team("sk4zi won't move cook"));
said("SK4ZI won't move cook (team)", "Sk4zi", team("SK4ZI won't move cook"));
said("I don't want st brown", "Amon-Ra St. Brown", who("I don't want st brown"));
said("I don't want st. brown", "Amon-Ra St. Brown", who("I don't want st. brown"));
said("who has jamarr", "Ja'Marr Chase", who("who has jamarr"));
said("aj brown is off the table", "A.J. Brown", who("aj brown is off the table"));
said("I don't want Chase Brown", "Chase Brown", who("I don't want Chase Brown"));
said("wants chase", "Ja'Marr Chase", who("wants chase"));
said("ken walker", "Kenneth Walker III", who("would take ken walker"));
said("jefferson", "Justin Jefferson", who("what would it take to get jefferson"));
said("cook's value", "James Cook", who("what's cook's value"));
// A shared last name goes to the pool's order: Dalvin first when his roster is the relevant one
said("cook, Dalvin's roster first", "Dalvin Cook", who("won't move cook", [more.find((p) => p.name === "Dalvin Cook")!, ...more]));
said("I'd love a WR", undefined, who("I'd love a WR"));
said("Jordan Love", "Jordan Love", who("wants Jordan Love"));
said("jalen my way wants a TE (team)", "Sk4zi", team("jalen my way wants a TE"));
said("griddy won't move his RB (team)", "Mike", team("griddy won't move his RB"));
said("Mike's RB (team)", "Mike", team("Mike's RB is hurt"));
said("he wants picks (team)", undefined, team("he wants picks"));
said("wants Mike Evans (team)", undefined, team("wants Mike Evans"));
said("a brown WR", undefined, who("a WR"));
// Team lists filter by team name or manager
const tn = (q: string) => rankTeams(q, teams, (t) => t).map((r) => r.item.manager);
check(`"jmw" finds Jalen My Way`, tn("jmw")[0] === "Sk4zi", tn("jmw"));
check(`"sk4" finds Sk4zi`, tn("sk4")[0] === "Sk4zi", tn("sk4"));
check(`"griddy" finds Griddy Gang`, tn("griddy")[0] === "Mike", tn("griddy"));
check(`"mike" matches the manager line`, matchTeam("mike", teams[1])?.on === "manager", matchTeam("mike", teams[1]));
check(`"pats" finds Pat's Picks`, tn("pats")[0] === "Pat", tn("pats"));
console.log(fails ? `${fails} failed` : "all passed");
if (fails) throw new Error(`${fails} matcher checks failed`);
