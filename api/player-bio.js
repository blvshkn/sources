// Player bios for the player sheet's header: age, height, weight, years in the league and college, trimmed from
// Sleeper's full player file (about 5 MB) to a few dozen KB and cached at the edge for a day.
// Response: { updated, players: { [sleeperId]: [age|null, heightInches|null, weightLbs|null, yearsExp|null, college] } }
// A field Sleeper doesn't have stays null (or "" for college). Nothing is filled in or guessed.
const POS = new Set(["QB", "RB", "WR", "TE", "K"]);

/** Sleeper's height is inches as a string ("74"); a few older entries read 6'2". */
function inches(h) {
  if (h == null || h === "") return null;
  const s = String(h).trim();
  const ft = /^(\d)'\s*(\d{1,2})/.exec(s);
  if (ft) return Number(ft[1]) * 12 + Number(ft[2]);
  const n = Number(s);
  return Number.isFinite(n) && n >= 60 && n <= 84 ? Math.round(n) : null;
}
const num = (v, lo, hi) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null; };
/** Age today from birth_date when Sleeper has it (its age field can lag a birthday), else its age field. */
function ageOf(p) {
  const b = typeof p.birth_date === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.birth_date) : null;
  if (b) {
    const now = new Date();
    let a = now.getUTCFullYear() - Number(b[1]);
    if (now.getUTCMonth() + 1 < Number(b[2]) || (now.getUTCMonth() + 1 === Number(b[2]) && now.getUTCDate() < Number(b[3]))) a--;
    if (a >= 18 && a <= 50) return a;
  }
  return num(p.age, 18, 50);
}

export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.sleeper.app/v1/players/nfl");
    if (!r.ok) throw new Error(`Sleeper responded ${r.status}`);
    const all = await r.json();
    const players = {};
    for (const [id, p] of Object.entries(all)) {
      if (!p || !POS.has(p.position)) continue;
      if (!p.team && p.status !== "Active") continue;
      const row = [ageOf(p), inches(p.height), num(p.weight, 140, 400), num(p.years_exp, 0, 30), typeof p.college === "string" ? p.college.trim() : ""];
      if (row.every((v) => v === null || v === "")) continue;
      players[id] = row;
    }
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({ updated: new Date().toISOString(), players }));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Couldn't load player bios from Sleeper right now." });
  }
}
