// Connected Sleeper accounts. A live session can hold several; the active league belongs to one of them.

export type Account = { username: string; userId: string; name?: string };

/** none and demo can still remember accounts, so a trip back through the landing doesn't lose them. */
export type Session =
  | { mode: "none"; accounts?: Account[] }
  | { mode: "demo"; accounts?: Account[] }
  | { mode: "live"; accounts: Account[]; userId: string; leagueId: string };

const isAccount = (a: unknown): a is Account =>
  !!a && typeof (a as Account).userId === "string" && typeof (a as Account).username === "string";

/**
 * Reads whatever was saved under `sources.session` and returns the current shape.
 * Sessions saved before multiple accounts look like { mode: "live", username, userId, leagueId };
 * they become a live session with that one account, still on the same league.
 */
export function normalizeSession(raw: unknown): Session {
  const s = (raw ?? {}) as Record<string, unknown>;
  const kept = Array.isArray(s.accounts) ? (s.accounts as unknown[]).filter(isAccount) : [];
  if (s.mode === "live" && typeof s.leagueId === "string") {
    const legacy = typeof s.userId === "string" && typeof s.username === "string" ? [{ username: s.username, userId: s.userId }] : [];
    const accounts = mergeAccounts(kept, ...legacy);
    const userId = typeof s.userId === "string" && accounts.some((a) => a.userId === s.userId) ? s.userId : accounts[0]?.userId;
    if (userId) return { mode: "live", accounts, userId, leagueId: s.leagueId };
    return { mode: "none" };
  }
  if (s.mode === "demo") return kept.length ? { mode: "demo", accounts: kept } : { mode: "demo" };
  return kept.length ? { mode: "none", accounts: kept } : { mode: "none" };
}

export const accountsOf = (s: Session): Account[] => s.accounts ?? [];

/** The account that owns the active league. */
export const activeAccount = (s: Session): Account | undefined =>
  s.mode === "live" ? s.accounts.find((a) => a.userId === s.userId) : undefined;

/** Adds accounts to the end of the list. One already there (same Sleeper user) is updated in place. */
export function mergeAccounts(list: Account[], ...add: Account[]): Account[] {
  const out = [...list];
  add.forEach((a) => {
    const i = out.findIndex((x) => x.userId === a.userId);
    if (i >= 0) out[i] = { ...out[i], ...a, name: a.name ?? out[i].name };
    else out.push(a);
  });
  return out;
}

/** "Zach" (with @zblev underneath), or just @zblev when the display name is the username. */
export const accountLabel = (a: Account) =>
  a.name && a.name.toLowerCase() !== a.username.toLowerCase() ? a.name : `@${a.username}`;
