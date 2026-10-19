// Dev-only checks for src/search.ts. Not imported by the app.
// Run: npx esbuild src/search.check.ts --bundle --platform=node | node
import { matchPlayer, rankPlayers } from "./search";

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
console.log(fails ? `${fails} failed` : "all passed");
if (fails) throw new Error(`${fails} matcher checks failed`);
