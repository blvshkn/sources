// Sync keys: what stops anyone who knows a Sleeper user id and league id from reading or changing that user's synced
// offers and watchlist. No passwords and no accounts:
//   - Each Sleeper user has one sync key, a random 256-bit secret made in the browser (64 hex characters). The first
//     device to sync for a user with no key on file claims it. Every later GET, PUT and DELETE for that user's synced
//     files must send it in X-Sync-Key; a missing or wrong key gets 401 and no data.
//   - The server keeps only SHA-256(pepper + key) at sync-auth/<user>.json, compared in constant time. The pepper is
//     SYNC_PEPPER, or else one derived from BLOB_READ_WRITE_TOKEN; keys claimed under the old fixed fallback upgrade.
//   - Another device joins with a one-time code (8 characters, shown XXXX-XXXX) that a device with the key asks for.
//     The code lives 10 minutes and works once. The key waits at sync-pair/<user>.json encrypted under the code
//     (scrypt + AES-256-GCM), so the Blob never holds it in the clear. Wrong codes are limited per IP and per user.
//   - `gen` counts fresh starts. Synced files carry the gen they were written under, and a file from an older gen reads
//     as empty, so "Start fresh" (and deleting your data) leaves nothing readable from before, in any league.
// Nothing here logs keys, hashes, codes, ids or IPs.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

export const KEY_HEADER = "x-sync-key";
export const KEY_RE = /^[0-9a-f]{64}$/;
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export const CODE_TTL = 10 * 60 * 1000;
export const LIMIT = { tries: 5, window: 10 * 60 * 1000, lock: 15 * 60 * 1000 };
const FALLBACK_PEPPER = "sources-sync-v1-fallback-pepper"; // used only when SYNC_PEPPER isn't set

// SYNC_PEPPER when set; otherwise one derived from the Blob token, a secret Vercel already holds, so there's nothing
// extra to configure and the pepper is still one only this deploy knows.
export const pepperOf = (env = process.env) => env.SYNC_PEPPER
  || (env.BLOB_READ_WRITE_TOKEN ? createHash("sha256").update(`sources-sync-pepper:${env.BLOB_READ_WRITE_TOKEN}`).digest("hex") : FALLBACK_PEPPER);
/** A key claimed under the old fixed fallback still matches once, and is re-hashed under the current pepper */
const legacyMatch = (key, hash, pepper) => pepper !== FALLBACK_PEPPER && !!key && sameHash(hashKey(key, FALLBACK_PEPPER), hash);
export const authPath = (user) => `sync-auth/${user}.json`;
export const pairPath = (user) => `sync-pair/${user}.json`;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const userLimitPath = (user) => `sync-limit/user/${user}.json`;
const ipLimitPath = (ip, pepper) => `sync-limit/ip/${sha(`ip:${pepper}:${ip}`).slice(0, 32)}.json`;

export const hashKey = (key, pepper) => sha(`key:${pepper}:${key}`);

/** Constant-time compare of two hex hashes. Unequal lengths still take a compare, then fail. */
export function sameHash(a, b) {
  const x = Buffer.from(String(a ?? ""), "utf8"), y = Buffer.from(String(b ?? ""), "utf8");
  if (x.length !== y.length || x.length === 0) { timingSafeEqual(x, x); return false; }
  return timingSafeEqual(x, y);
}

export function keyFrom(req) {
  const h = req.headers ?? {};
  const v = h[KEY_HEADER] ?? h["X-Sync-Key"] ?? (typeof h.get === "function" ? h.get(KEY_HEADER) : undefined);
  const k = String(Array.isArray(v) ? v[0] : v ?? "").trim().toLowerCase();
  return KEY_RE.test(k) ? k : "";
}

export function ipFrom(req) {
  const h = req.headers ?? {};
  const fwd = String(h["x-forwarded-for"] ?? h["x-real-ip"] ?? "").split(",")[0].trim();
  return fwd || String(req.socket?.remoteAddress ?? "unknown");
}

/** The stored record, normalized: { hash: string|null, gen: number } */
export async function readAuth(blob, user) {
  const s = await blob.read(authPath(user));
  if (!s || typeof s !== "object") return null;
  return { hash: typeof s.hash === "string" && s.hash ? s.hash : null, gen: Number.isInteger(s.gen) && s.gen >= 0 ? s.gen : 0 };
}
const writeAuth = (blob, user, hash, gen) => blob.write(authPath(user), { v: 1, hash, gen, at: Date.now() });

/**
 * Checks the request's key for this user. With no key on file, a request carrying a well-formed key claims it (the
 * first claim wins) and keeps whatever files are already there. Returns { ok: true, gen } or { ok: false }.
 */
export async function authorize(blob, req, user, env = process.env) {
  const key = keyFrom(req), pepper = pepperOf(env);
  const rec = await readAuth(blob, user);
  if (rec?.hash) {
    // Always hash and compare, even with no key, so a missing key and a wrong one take the same path
    const ok = sameHash(hashKey(key || "-", pepper), rec.hash) && !!key;
    if (ok) return { ok: true, gen: rec.gen };
    if (legacyMatch(key, rec.hash, pepper)) { await writeAuth(blob, user, hashKey(key, pepper), rec.gen ?? 0); return { ok: true, gen: rec.gen }; }
    return { ok: false };
  }
  if (!key) return { ok: false };
  const hash = hashKey(key, pepper), gen = rec?.gen ?? 0;
  await writeAuth(blob, user, hash, gen);
  // Two devices claiming at once: the last write stands, and the other gets 401 and the pair prompt
  const after = await readAuth(blob, user);
  return after?.hash && sameHash(after.hash, hash) ? { ok: true, gen: after.gen, claimed: true } : { ok: false };
}

/** A synced file's contents, or null when it was written before the user's last fresh start */
export const forGen = (stored, gen) => (stored && (Number.isInteger(stored.gen) ? stored.gen : 0) === gen ? stored : null);

// ---- pairing codes ----

export const formatCode = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;
export function normalizeCode(input) {
  const c = String(input ?? "").toUpperCase().replace(/[\s-]/g, "");
  return c.length === 8 && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : "";
}
export function newCode() {
  let c = "";
  for (let i = 0; i < 8; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return c;
}
const boxKey = (code, user, salt, pepper) => scryptSync(`pair:${pepper}:${user}:${code}`, salt, 32, { N: 16384, r: 8, p: 1 });

export function seal(secret, code, user, pepper) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", boxKey(code, user, salt, pepper), iv);
  const ct = Buffer.concat([c.update(secret, "utf8"), c.final()]);
  return { salt: salt.toString("base64"), iv: iv.toString("base64"), ct: ct.toString("base64"), tag: c.getAuthTag().toString("base64") };
}
export function open(box, code, user, pepper) {
  try {
    const d = createDecipheriv("aes-256-gcm", boxKey(code, user, Buffer.from(box.salt, "base64"), pepper), Buffer.from(box.iv, "base64"));
    d.setAuthTag(Buffer.from(box.tag, "base64"));
    const out = Buffer.concat([d.update(Buffer.from(box.ct, "base64")), d.final()]).toString("utf8");
    return KEY_RE.test(out) ? out : null;
  } catch { return null; }
}

// ---- attempt limits: 5 wrong tries in 10 minutes locks for 15, per IP and per user ----

async function readLimit(blob, path) {
  const s = await blob.read(path).catch(() => null);
  return { fails: Array.isArray(s?.fails) ? s.fails.filter(Number.isFinite) : [], lockUntil: Number(s?.lockUntil) || 0 };
}
export async function limited(blob, req, user, env = process.env, now = Date.now()) {
  const paths = [ipLimitPath(ipFrom(req), pepperOf(env)), userLimitPath(user)];
  const recs = await Promise.all(paths.map((p) => readLimit(blob, p)));
  const until = Math.max(...recs.map((r) => (r.lockUntil > now ? r.lockUntil : 0)));
  return until > 0 ? { locked: true, retryAfter: Math.ceil((until - now) / 1000) } : { locked: false };
}
export async function recordFail(blob, req, user, env = process.env, now = Date.now()) {
  const paths = [ipLimitPath(ipFrom(req), pepperOf(env)), userLimitPath(user)];
  await Promise.all(paths.map(async (p) => {
    const r = await readLimit(blob, p);
    const fails = [...r.fails.filter((t) => now - t < LIMIT.window), now];
    const lockUntil = fails.length >= LIMIT.tries ? now + LIMIT.lock : r.lockUntil;
    await blob.write(p, { fails: fails.length >= LIMIT.tries ? [] : fails, lockUntil });
  }));
}

// ---- the actions api/sync.js serves ----

/** A device with the key asks for a one-time code. One live code per user; asking again replaces it. */
export async function mintCode(blob, user, key, env = process.env, now = Date.now()) {
  const code = newCode(), expiresAt = now + CODE_TTL;
  await blob.write(pairPath(user), { v: 1, exp: expiresAt, box: seal(key, code, user, pepperOf(env)) });
  return { code: formatCode(code), expiresAt };
}

/** A new device trades a code for the key. Returns { key } or { status, error }. */
export async function redeemCode(blob, req, user, input, env = process.env, now = Date.now()) {
  const lock = await limited(blob, req, user, env, now);
  if (lock.locked) return { status: 429, error: "too many tries", retryAfter: lock.retryAfter };
  const code = normalizeCode(input);
  const rec = code ? await blob.read(pairPath(user)) : null;
  const fail = async () => { await recordFail(blob, req, user, env, now); return { status: 401, error: "that code didn't work" }; };
  if (!rec?.box) return fail();
  if (!(Number(rec.exp) > now)) { await blob.remove(pairPath(user)); return fail(); }
  const key = open(rec.box, code, user, pepperOf(env));
  if (!key) return fail();
  await blob.remove(pairPath(user)); // single use
  // A reset since the code was made means it hands out a dead key: refuse it
  const auth = await readAuth(blob, user);
  if (!auth?.hash || !(sameHash(hashKey(key, pepperOf(env)), auth.hash) || legacyMatch(key, auth.hash, pepperOf(env)))) return fail();
  return { key };
}

/** A paired device swaps the key for a new one. Other devices get 401 and pair again. Files stay. */
export async function rotateKey(blob, user, next, gen, env = process.env) {
  await writeAuth(blob, user, hashKey(next, pepperOf(env)), gen);
  await blob.remove(pairPath(user));
}

/** A device without the key replaces the synced copy: new key, and every file from before reads as empty. */
export async function startFresh(blob, user, next, env = process.env) {
  const rec = await readAuth(blob, user);
  await writeAuth(blob, user, hashKey(next, pepperOf(env)), (rec?.gen ?? 0) + 1);
  await blob.remove(pairPath(user));
}

/**
 * Delete my data: the synced files for every league the device names go, and the key is dropped. A bare counter stays
 * (no hash) with gen bumped, so files left in any league it didn't name stay unreadable to whoever claims next.
 */
export async function forgetUser(blob, user, leagues, gen) {
  const ids = [...new Set((Array.isArray(leagues) ? leagues : [leagues]).map(String).filter((l) => /^\d{1,24}$/.test(l)))].slice(0, 20);
  await Promise.all(ids.flatMap((l) => [blob.remove(`offers/${l}/${user}.json`), blob.remove(`watch/${l}/${user}.json`)]));
  await blob.remove(pairPath(user));
  await blob.write(authPath(user), { v: 1, hash: null, gen: gen + 1, at: Date.now() });
}
