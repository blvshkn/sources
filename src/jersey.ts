// Jersey numbers and team colors. Numbers come from Sleeper through /api/player-numbers
// (cached a day at the edge and in this browser). Colors are team palettes only, no logos.
import { useSyncExternalStore } from "react";
import type { Player } from "./data";

type Row = [number, string, string, string];
let byId: Record<string, Row> = {};
let byName = new Map<string, number>();
let version = 0;
const listeners = new Set<() => void>();
const norm = (s: string) => s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");

function ingest(players: Record<string, Row>) {
  byId = players;
  byName = new Map();
  for (const [num, name, team] of Object.values(players)) {
    byName.set(`${norm(name)}|${team}`, num);
    if (!byName.has(norm(name))) byName.set(norm(name), num);
  }
  version++;
  listeners.forEach((l) => l());
}

const KEY = "sources.jerseys.v1";
let started = false;
export function loadJerseyNumbers() {
  if (started) return;
  started = true;
  try {
    const cached = JSON.parse(localStorage.getItem(KEY) || "null") as { at: number; players: Record<string, Row> } | null;
    if (cached?.players) ingest(cached.players);
    if (cached && Date.now() - cached.at < 12 * 3600e3) return;
  } catch { /* storage unavailable */ }
  fetch("/api/player-numbers")
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { players?: Record<string, Row> } | null) => {
      if (!d?.players) return;
      ingest(d.players);
      try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), players: d.players })); } catch { /* full or blocked */ }
    })
    .catch(() => { /* jerseys show without a number */ });
}

export function jerseyNumber(p: Pick<Player, "id" | "name" | "nfl">): number | undefined {
  const row = byId[p.id];
  if (row) return row[0];
  return byName.get(`${norm(p.name)}|${p.nfl}`) ?? byName.get(norm(p.name));
}

export function useJerseys() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => version);
}

/** [jersey, number fill, trim]. Home-jersey palettes. */
export const TEAM_COLORS: Record<string, [string, string, string]> = {
  ARI: ["#97233F", "#FFFFFF", "#000000"], ATL: ["#A71930", "#FFFFFF", "#000000"], BAL: ["#241773", "#FFFFFF", "#9E7C0C"],
  BUF: ["#00338D", "#FFFFFF", "#C60C30"], CAR: ["#101820", "#FFFFFF", "#0085CA"], CHI: ["#0B162A", "#FFFFFF", "#C83803"],
  CIN: ["#FB4F14", "#000000", "#FFFFFF"], CLE: ["#311D00", "#FF3C00", "#FFFFFF"], DAL: ["#F2F4F7", "#041E42", "#869397"],
  DEN: ["#FB4F14", "#0A2343", "#FFFFFF"], DET: ["#0076B6", "#FFFFFF", "#B0B7BC"], GB: ["#203731", "#FFFFFF", "#FFB612"],
  HOU: ["#03202F", "#FFFFFF", "#A71930"], IND: ["#002C5F", "#FFFFFF", "#A2AAAD"], JAX: ["#006778", "#FFFFFF", "#D7A22A"],
  KC: ["#E31837", "#FFFFFF", "#FFB81C"], LV: ["#111111", "#FFFFFF", "#A5ACAF"], LAC: ["#0080C6", "#FFFFFF", "#FFC20E"],
  LAR: ["#003594", "#FFFFFF", "#FFA300"], MIA: ["#008E97", "#FFFFFF", "#FC4C02"], MIN: ["#4F2683", "#FFFFFF", "#FFC62F"],
  NE: ["#002244", "#FFFFFF", "#C60C30"], NO: ["#101820", "#D3BC8D", "#D3BC8D"], NYG: ["#0B2265", "#FFFFFF", "#A71930"],
  NYJ: ["#125740", "#FFFFFF", "#000000"], PHI: ["#004C54", "#FFFFFF", "#A5ACAF"], PIT: ["#101820", "#FFB612", "#FFB612"],
  SF: ["#AA0000", "#FFFFFF", "#B3995D"], SEA: ["#002244", "#FFFFFF", "#69BE28"], TB: ["#D50A0A", "#FFFFFF", "#34302B"],
  TEN: ["#0C2340", "#FFFFFF", "#4B92DB"], WAS: ["#5A1414", "#FFB612", "#FFB612"],
};
export const teamColors = (team: string): [string, string, string] => TEAM_COLORS[team] ?? ["#3A3A3E", "#FFFFFF", "#8E8E93"];
