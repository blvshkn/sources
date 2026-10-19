// Jersey numbers for every active NFL skill player, trimmed from Sleeper's
// full player file (about 5 MB) down to a few KB and cached at the edge for a day.
// Response: { updated, players: { [sleeperId]: [number, "First Last", "TEAM", "POS", espnId?] } }
// The ESPN id lets /api/news ask ESPN for that player's own news feed.
const POS = new Set(["QB", "RB", "WR", "TE", "K"]);

export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.sleeper.app/v1/players/nfl");
    if (!r.ok) throw new Error(`Sleeper responded ${r.status}`);
    const all = await r.json();
    const players = {};
    for (const [id, p] of Object.entries(all)) {
      if (!p || !POS.has(p.position) || p.number == null || p.number === "") continue;
      if (!p.team && p.status !== "Active") continue;
      const row = [Number(p.number), [p.first_name, p.last_name].filter(Boolean).join(" "), p.team || "FA", p.position];
      if (p.espn_id) row.push(String(p.espn_id));
      players[id] = row;
    }
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({ updated: new Date().toISOString(), players }));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Couldn't load jersey numbers from Sleeper right now." });
  }
}
