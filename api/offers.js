// Sent offers, synced across devices for one Sleeper user in one league, kept in Vercel Blob.
//   GET    /api/offers?league=<sleeper league_id>&user=<sleeper user_id>   { offers, gone, at }
//   PUT    /api/offers?league=...&user=...  body { offers, gone }          merged and saved, returns the merged set
//   DELETE /api/offers?league=...&user=...                                 removes that user's offers for the league
// Merge rules live in src/offerMerge.js (shared with the app): per offer id the newest stamp wins, cleared offers
// leave a tombstone. Only offer fields are kept; anything else in the body is dropped, so no credential is ever stored.
// Keyed by Sleeper ids only: anyone who knows them can read the list. Never cached.
// Without BLOB_READ_WRITE_TOKEN (no store connected yet) every call answers 503 and the app stays on this device.
// Talks to the Blob REST API with fetch (the @vercel/blob package isn't installed). Blob paths: offers/<league>/<user>.json
import { MAX_BYTES, MAX_GONE, MAX_OFFERS, cleanOffer, mergeOffers } from "../src/offerMerge.js";

const SLEEPER_ID = /^\d{1,24}$/;

/** The Blob store, from the token Vercel adds when a store is connected to the project. */
export function blobFromEnv(env = process.env) {
  const token = () => env.BLOB_READ_WRITE_TOKEN || "";
  const access = env.OFFERS_BLOB_ACCESS === "public" ? "public" : "private";
  const api = (env.VERCEL_BLOB_API_URL || "https://vercel.com/api/blob").replace(/\/$/, "");
  // The token reads vercel_blob_rw_<storeId>_<secret>
  const store = () => (env.BLOB_STORE_ID || token().split("_")[3] || "").replace(/^store_/, "").toLowerCase();
  const fileUrl = (path) => `https://${store()}.${access}.blob.vercel-storage.com/${path}`;
  const headers = () => ({ authorization: `Bearer ${token()}`, "x-api-version": "11" });
  return {
    ready: () => !!token() && !!store(),
    async read(path) {
      const r = await fetch(`${fileUrl(path)}?cache=0`, { headers: { authorization: `Bearer ${token()}` }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`blob read ${r.status}`);
      return r.json();
    },
    async write(path, data) {
      const r = await fetch(`${api}/?pathname=${encodeURIComponent(path)}`, {
        method: "PUT",
        headers: { ...headers(), "x-vercel-blob-access": access, "x-content-type": "application/json", "x-add-random-suffix": "0", "x-allow-overwrite": "1", "x-cache-control-max-age": "60" },
        body: JSON.stringify(data), signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error(`blob write ${r.status}`);
    },
    async remove(path) {
      const r = await fetch(`${api}/delete`, {
        method: "POST", headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ urls: [fileUrl(path)] }), signal: AbortSignal.timeout(5000),
      });
      if (!r.ok && r.status !== 404) throw new Error(`blob delete ${r.status}`);
    },
  };
}

/** The request body as an object, or a status code when it's too big or not JSON. */
function bodyOf(req) {
  if (Number(req.headers?.["content-length"] ?? 0) > MAX_BYTES) return 413;
  let b = req.body;
  if (b == null || b === "") return 400;
  if (typeof b === "string" || b instanceof Uint8Array) {
    if (b.length > MAX_BYTES) return 413;
    try { b = JSON.parse(typeof b === "string" ? b : new TextDecoder().decode(b)); } catch { return 400; }
  } else if (JSON.stringify(b).length > MAX_BYTES) return 413;
  return b && typeof b === "object" && !Array.isArray(b) ? b : 400;
}

const fail = (res, status, error) => res.status(status).json({ error });

export function createHandler(blob) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const league = String(req.query?.league ?? ""), user = String(req.query?.user ?? "");
    if (!SLEEPER_ID.test(league) || !SLEEPER_ID.test(user)) return fail(res, 400, "league and user must be Sleeper ids");
    if (!["GET", "PUT", "DELETE"].includes(req.method)) { res.setHeader("Allow", "GET, PUT, DELETE"); return fail(res, 405, "method not allowed"); }
    if (!blob.ready()) return fail(res, 503, "sync unavailable");
    const path = `offers/${league}/${user}.json`;
    const stored = async () => {
      const s = await blob.read(path);
      return { offers: (Array.isArray(s?.offers) ? s.offers : []).map((o) => cleanOffer(o, league)).filter(Boolean), gone: s?.gone && typeof s.gone === "object" ? s.gone : {} };
    };
    try {
      if (req.method === "GET") return res.status(200).json({ ...mergeOffers(await stored()), at: Date.now() });
      if (req.method === "DELETE") { await blob.remove(path); return res.status(200).json({ ok: true }); }
      const body = bodyOf(req);
      if (typeof body === "number") return fail(res, body, body === 413 ? `body over ${MAX_BYTES} bytes` : "body must be a JSON object");
      const offers = body.offers ?? [], gone = body.gone ?? {};
      if (!Array.isArray(offers) || !gone || typeof gone !== "object" || Array.isArray(gone)) return fail(res, 400, "body must be { offers, gone }");
      if (offers.length > MAX_OFFERS || Object.keys(gone).length > MAX_GONE) return fail(res, 413, `at most ${MAX_OFFERS} offers`);
      const incoming = { offers: offers.map((o) => cleanOffer(o, league)).filter(Boolean), gone };
      const merged = mergeOffers(await stored(), incoming);
      await blob.write(path, merged);
      return res.status(200).json({ ...merged, at: Date.now() });
    } catch {
      return fail(res, 502, "storage error");
    }
  };
}

export default createHandler(blobFromEnv());
