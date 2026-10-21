// Sync keys and pairing for sent offers and the Waivers watchlist (api/offers.js, api/watch.js). The rules and the
// storage live in _lib/sync-auth.js; this file only routes.
//   POST /api/sync?user=<sleeper user_id>  body { action, ... }
//     mint     X-Sync-Key           -> { code: "XXXX-XXXX", expiresAt }   one live code per user, 10 minutes, works once
//     redeem   { code }             -> { key }                            5 wrong tries in 10 minutes locks for 15
//     rotate   X-Sync-Key, { next } -> { ok }                             Reset sync: every other device pairs again
//     fresh    { next }             -> { ok }                             Start fresh: no key needed, nothing old stays readable
//     forget   X-Sync-Key, { leagues } -> { ok }                          Delete your data: files, code and key go
// Answers 401 with no data when a key is missing or wrong, 503 without a Blob store. Never cached, never logs anything
// that names a user, a key or a code.
import { authorize, keyFrom, KEY_RE, limited, mintCode, recordFail, redeemCode, rotateKey, startFresh, forgetUser } from "./_lib/sync-auth.js";
import { blobFromEnv, bodyOf } from "./offers.js";

const SLEEPER_ID = /^\d{1,24}$/;
const fail = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });

export function createHandler(blob, env = process.env) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return fail(res, 405, "method not allowed"); }
    const user = String(req.query?.user ?? "");
    if (!SLEEPER_ID.test(user)) return fail(res, 400, "user must be a Sleeper id");
    const body = bodyOf(req, 4096);
    if (typeof body === "number") return fail(res, body, "body must be a JSON object");
    if (!blob.ready()) return fail(res, 503, "sync unavailable");
    const next = String(body.next ?? "").toLowerCase();
    try {
      switch (body.action) {
        case "mint": {
          const auth = await authorize(blob, req, user, env);
          if (!auth.ok) return fail(res, 401, "pair this device to sync");
          return res.status(200).json(await mintCode(blob, user, keyFrom(req), env));
        }
        case "redeem": {
          const out = await redeemCode(blob, req, user, body.code, env);
          if (out.status) {
            if (out.retryAfter) res.setHeader("Retry-After", String(out.retryAfter));
            return fail(res, out.status, out.error, out.retryAfter ? { retryAfter: out.retryAfter } : {});
          }
          return res.status(200).json({ key: out.key });
        }
        case "rotate": {
          if (!KEY_RE.test(next)) return fail(res, 400, "next must be a new key");
          const auth = await authorize(blob, req, user, env);
          if (!auth.ok) return fail(res, 401, "pair this device to sync");
          await rotateKey(blob, user, next, auth.gen, env);
          return res.status(200).json({ ok: true });
        }
        case "fresh": {
          if (!KEY_RE.test(next)) return fail(res, 400, "next must be a new key");
          // Anyone who knows the ids can start over (that's the point: a lost device shouldn't lock you out), so it
          // counts against the same limit as wrong codes
          const lock = await limited(blob, req, user, env);
          if (lock.locked) { res.setHeader("Retry-After", String(lock.retryAfter)); return fail(res, 429, "too many tries", { retryAfter: lock.retryAfter }); }
          await recordFail(blob, req, user, env);
          await startFresh(blob, user, next, env);
          return res.status(200).json({ ok: true });
        }
        case "forget": {
          const auth = await authorize(blob, req, user, env);
          if (!auth.ok) return fail(res, 401, "pair this device to sync");
          await forgetUser(blob, user, body.leagues, auth.gen);
          return res.status(200).json({ ok: true });
        }
        default:
          return fail(res, 400, "unknown action");
      }
    } catch {
      return fail(res, 502, "storage error");
    }
  };
}

export default createHandler(blobFromEnv());
