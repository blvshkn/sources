// How much Sources AI has spent today (UTC), for a quick look without the dashboard.
//   GET /api/ai-status   200 { spentToday, cap, capped }   503 the ledger can't be read   405 not GET
// Reads the same Blob ledger as api/_lib/guard.js. Returns nothing else: no keys, no counts per person.
// Cached at the edge for a minute so refreshing it doesn't cost a Blob read each time.
import { createGuard } from "./_lib/guard.js";

export function createStatusHandler(guard) {
  return async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "method not allowed" }); }
    try {
      const s = await guard.status();
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
      return res.status(200).json(s);
    } catch {
      res.setHeader("Cache-Control", "no-store");
      return res.status(503).json({ error: "status unavailable" });
    }
  };
}

export default createStatusHandler(createGuard());
