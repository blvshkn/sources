// Sent offers, synced across devices for one Sleeper user in one league, kept in Vercel Blob.
//   GET    /api/offers?league=<sleeper league_id>&user=<sleeper user_id>   { offers, gone, at }
//   PUT    /api/offers?league=...&user=...  body { offers, gone }          merged and saved, returns the merged set
//   DELETE /api/offers?league=...&user=...                                 removes that user's offers for the league
// Merge rules live in src/offerMerge.js (shared with the app): per offer id the newest stamp wins, cleared offers
// leave a tombstone. Only offer fields are kept; anything else in the body is dropped, so no credential is ever stored.
// Every call needs the user's sync key in X-Sync-Key (api/_lib/sync-auth.js): a missing or wrong key gets 401 and no
// data. The first device to sync for a user claims the key. Never cached.
// Without BLOB_READ_WRITE_TOKEN (no store connected yet) every call answers 503 and the app stays on this device.
// Talks to the Blob REST API with fetch (the @vercel/blob package isn't installed). Blob paths: offers/<league>/<user>.json
// The request handling (createSyncHandler) is shared with the Waivers watchlist, api/watch.js.
import { MAX_BYTES, MAX_GONE, MAX_OFFERS, cleanOffer, mergeOffers } from "../src/offerMerge.js";
import { authorize, forGen } from "./_lib/sync-auth.js";

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
    /** Pathnames under a prefix (the Blob list API), up to `limit`. Used to sweep old Sources AI ledgers. */
    async list(prefix, limit = 100) {
      const r = await fetch(`${api}/?prefix=${encodeURIComponent(prefix)}&limit=${limit}`, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`blob list ${r.status}`);
      const d = await r.json();
      return (Array.isArray(d?.blobs) ? d.blobs : []).map((b) => String(b?.pathname ?? "")).filter(Boolean);
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
export function bodyOf(req, maxBytes = MAX_BYTES) {
  if (Number(req.headers?.["content-length"] ?? 0) > maxBytes) return 413;
  let b = req.body;
  if (b == null || b === "") return 400;
  if (typeof b === "string" || b instanceof Uint8Array) {
    if (b.length > maxBytes) return 413;
    try { b = JSON.parse(typeof b === "string" ? b : new TextDecoder().decode(b)); } catch { return 400; }
  } else if (JSON.stringify(b).length > maxBytes) return 413;
  return b && typeof b === "object" && !Array.isArray(b) ? b : 400;
}

const fail = (res, status, error) => res.status(status).json({ error });

/**
 * One synced list per Sleeper user per league at <dir>/<league>/<user>.json, with GET, PUT (merge and save) and
 * DELETE. Shared by offers and the Waivers watchlist (api/watch.js), so both get the same id checks, size cap, Blob
 * calls and errors. `load(stored, league)` turns what's in the Blob into the list; `put(body, current, league)` merges
 * a request into it and returns the new list, or { status, error } to refuse the request.
 * Every method needs the user's sync key (authorize in _lib/sync-auth.js). Files carry the key's `gen`; a file from
 * before the user's last fresh start reads as empty and gets overwritten.
 */
export function createSyncHandler(blob, { dir, maxBytes = MAX_BYTES, load, put }, env = process.env) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const league = String(req.query?.league ?? ""), user = String(req.query?.user ?? "");
    if (!SLEEPER_ID.test(league) || !SLEEPER_ID.test(user)) return fail(res, 400, "league and user must be Sleeper ids");
    if (!["GET", "PUT", "DELETE"].includes(req.method)) { res.setHeader("Allow", "GET, PUT, DELETE"); return fail(res, 405, "method not allowed"); }
    if (!blob.ready()) return fail(res, 503, "sync unavailable");
    const path = `${dir}/${league}/${user}.json`;
    try {
      const auth = await authorize(blob, req, user, env);
      if (!auth.ok) return fail(res, 401, "pair this device to sync");
      const stored = async () => forGen(await blob.read(path), auth.gen);
      if (req.method === "GET") return res.status(200).json({ ...load(await stored(), league), at: Date.now() });
      if (req.method === "DELETE") { await blob.remove(path); return res.status(200).json({ ok: true }); }
      const body = bodyOf(req, maxBytes);
      if (typeof body === "number") return fail(res, body, body === 413 ? `body over ${maxBytes} bytes` : "body must be a JSON object");
      const out = await put(body, async () => load(await stored(), league), league);
      if (out && typeof out.status === "number") return fail(res, out.status, out.error);
      await blob.write(path, { ...out, gen: auth.gen });
      return res.status(200).json({ ...out, at: Date.now() });
    } catch {
      return fail(res, 502, "storage error");
    }
  };
}

export function createHandler(blob) {
  return createSyncHandler(blob, {
    dir: "offers",
    load: (s, league) => mergeOffers({ offers: (Array.isArray(s?.offers) ? s.offers : []).map((o) => cleanOffer(o, league)).filter(Boolean), gone: s?.gone && typeof s.gone === "object" ? s.gone : {} }),
    async put(body, current, league) {
      const offers = body.offers ?? [], gone = body.gone ?? {};
      if (!Array.isArray(offers) || !gone || typeof gone !== "object" || Array.isArray(gone)) return { status: 400, error: "body must be { offers, gone }" };
      if (offers.length > MAX_OFFERS || Object.keys(gone).length > MAX_GONE) return { status: 413, error: `at most ${MAX_OFFERS} offers` };
      return mergeOffers(await current(), { offers: offers.map((o) => cleanOffer(o, league)).filter(Boolean), gone });
    },
  });
}

export default createHandler(blobFromEnv());
