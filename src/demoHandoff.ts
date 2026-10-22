/**
 * One-time handoff from the landing into the sample league. The landing's trade idea buttons ("Open in builder",
 * "Write pitch") start the demo the same way "Or explore a sample league" does, then the app opens that exact deal.
 * The deal travels in the Ask links' trade shape (partner, give, get) and is read back once, by the demo Shell.
 * sessionStorage only, so it never outlives the tab, and it expires after a few minutes in case setup was abandoned.
 */
const KEY = "sources.handoff";
const TTL = 10 * 60 * 1000;

export interface Handoff { to: "trade" | "pitch"; partnerId: string; give: string[]; get: string[] }

export function setHandoff(h: Handoff) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...h, at: Date.now() })); } catch { /* blocked: the demo still opens */ }
}

export function clearHandoff() {
  try { sessionStorage.removeItem(KEY); } catch { /* blocked */ }
}

/** Reads the handoff without removing it. The app mounts its shell twice as the demo starts (the league loads, then
 *  the shell is keyed afresh), so the reader clears it with clearHandoff once its shell has stayed up. */
export function peekHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    const h = raw ? (JSON.parse(raw) as Handoff & { at?: number }) : null;
    if (!h || (h.to !== "trade" && h.to !== "pitch") || !Array.isArray(h.give) || !Array.isArray(h.get) || typeof h.partnerId !== "string") return null;
    if (!h.at || Date.now() - h.at > TTL) return null;
    return { to: h.to, partnerId: h.partnerId, give: h.give, get: h.get };
  } catch { return null; }
}

/** A question asked on the landing's Ask sheet, carried into the app so Ask opens already working on it (the sample
 *  league or the user's own once they connect). Same rules: this tab only, read once, gone after a few minutes. */
const ASK_KEY = "sources.askHandoff";

export function setAskHandoff(q: string) {
  try { sessionStorage.setItem(ASK_KEY, JSON.stringify({ q: q.trim().slice(0, 300), at: Date.now() })); } catch { /* blocked */ }
}

export function clearAskHandoff() {
  try { sessionStorage.removeItem(ASK_KEY); } catch { /* blocked */ }
}

export function peekAskHandoff(): string | null {
  try {
    const raw = sessionStorage.getItem(ASK_KEY);
    const h = raw ? (JSON.parse(raw) as { q?: unknown; at?: number }) : null;
    if (!h || typeof h.q !== "string" || !h.q.trim() || !h.at || Date.now() - h.at > TTL) return null;
    return h.q;
  } catch { return null; }
}
