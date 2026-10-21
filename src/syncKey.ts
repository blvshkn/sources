// This device's sync key for a Sleeper user, and whether the server took it. Shared by offerSync.ts, watchSync.ts and
// the "Sync your devices" row in Settings.
//   - The key is a random 256-bit secret (64 hex characters) made here the first time this device syncs, kept in
//     localStorage at `sources.syncKey.<user>`. The server only ever keeps a hash of it (api/_lib/sync-auth.js).
//   - The first device to sync for a user claims the key. Any other device gets 401 until it's paired with a code from
//     a device that has it; until then everything stays on this device and nothing is wiped.
//   - `needsPair` is what a 401 sets. Both sync hooks stop quietly, and Settings and Sent offers show the prompt.
//     Pairing, Reset sync and Start fresh clear it and wake the hooks.
// Storage can be blocked (private windows, strict settings): every read and write is wrapped, and a device that can't
// keep a key just doesn't sync.
import { useEffect, useState } from "react";

const slot = (user: string) => `sources.syncKey.${user}`;
const KEY_RE = /^[0-9a-f]{64}$/;

export function readKey(user: string): string {
  try { const k = localStorage.getItem(slot(user)) ?? ""; return KEY_RE.test(k) ? k : ""; } catch { return ""; }
}
function writeKey(user: string, key: string): boolean {
  try { localStorage.setItem(slot(user), key); return localStorage.getItem(slot(user)) === key; } catch { return false; }
}
export function clearKey(user: string) {
  try { localStorage.removeItem(slot(user)); } catch { /* storage unavailable */ }
}
export function newKey(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
/** This device's key, made now if it has none. Empty when storage won't keep one. */
export function ensureKey(user: string): string {
  const have = readKey(user);
  if (have) return have;
  const k = newKey();
  return writeKey(user, k) ? k : "";
}

// ---- who needs pairing, shared across the app ----

type Status = { needsPair: boolean; wake: number };
const status = new Map<string, Status>();
const subs = new Set<() => void>();
const get = (user: string): Status => status.get(user) ?? { needsPair: false, wake: 0 };
const emit = () => subs.forEach((f) => f());

/** A 401 from either hook: stop syncing and show the prompt */
export function markNeedsPair(user: string) {
  const s = get(user);
  if (s.needsPair) return;
  status.set(user, { ...s, needsPair: true });
  emit();
}
/** This device has the key that works now: clear the prompt and let the hooks pull again */
function wakeSync(user: string) {
  const s = get(user);
  status.set(user, { needsPair: false, wake: s.wake + 1 });
  emit();
}

export function useSyncStatus(user: string): Status & { hasKey: boolean } {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return { ...get(user), hasKey: !!readKey(user) };
}

// ---- the calls Settings makes (api/sync.js) ----

export type SyncResult = { ok: true; code?: string; expiresAt?: number } | { ok: false; status: number; retryAfter?: number };

async function call(user: string, body: Record<string, unknown>, key = readKey(user)): Promise<SyncResult & { key?: string }> {
  try {
    const r = await fetch(`/api/sync?user=${encodeURIComponent(user)}`, {
      method: "POST", cache: "no-store",
      headers: { "content-type": "application/json", ...(key ? { "X-Sync-Key": key } : {}) },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({})) as { code?: string; expiresAt?: number; key?: string; retryAfter?: number };
    if (!r.ok) { if (r.status === 401 && body.action !== "redeem") markNeedsPair(user); return { ok: false, status: r.status, retryAfter: j.retryAfter }; }
    return { ok: true, ...j };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** On a device with the key: a one-time code for another device */
export const mintCode = (user: string) => call(user, { action: "mint" }, ensureKey(user));

/** On a new device: trade the code for the key, keep it, and start syncing */
export async function redeemCode(user: string, code: string): Promise<SyncResult> {
  const r = await call(user, { action: "redeem", code });
  if (!r.ok) return r;
  if (!r.key || !KEY_RE.test(r.key) || !writeKey(user, r.key)) return { ok: false, status: 0 };
  wakeSync(user);
  return { ok: true };
}

/** Reset sync: a new key here, and every other device has to pair again. Synced files stay. */
export async function rotateKey(user: string): Promise<SyncResult> {
  const next = newKey();
  const r = await call(user, { action: "rotate", next });
  if (!r.ok) return r;
  if (!writeKey(user, next)) return { ok: false, status: 0 };
  wakeSync(user);
  return { ok: true };
}

/** Start fresh on a device without the key: this device's list becomes the synced copy, under a new key */
export async function startFresh(user: string): Promise<SyncResult> {
  const next = newKey();
  const r = await call(user, { action: "fresh", next }, "");
  if (!r.ok) return r;
  if (!writeKey(user, next)) return { ok: false, status: 0 };
  wakeSync(user);
  return { ok: true };
}

/** Every league this device keeps lists for (sources.<league id>.*), so Delete your data can clear each synced copy */
export function knownLeagues(): string[] {
  try {
    const ids = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) { const m = /^sources\.(\d{1,24})\./.exec(localStorage.key(i) ?? ""); if (m) ids.add(m[1]); }
    return [...ids].slice(0, 20);
  } catch { return []; }
}

/** Delete your data: the synced files for these leagues, the code and the key go on the server, then the key here */
export function forgetSync(user: string, leagues: string[]) {
  const key = readKey(user);
  if (key) {
    try {
      void fetch(`/api/sync?user=${encodeURIComponent(user)}`, {
        method: "POST", keepalive: true, cache: "no-store",
        headers: { "content-type": "application/json", "X-Sync-Key": key },
        body: JSON.stringify({ action: "forget", leagues }),
      }).catch(() => {});
    } catch { /* best effort */ }
  }
  clearKey(user);
}
