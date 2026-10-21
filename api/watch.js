// The Waivers watchlist, synced across devices for one Sleeper user in one league, kept in the same Vercel Blob store
// as sent offers and served by the same handler (createSyncHandler in offers.js: Sleeper id checks, size cap, no cache,
// 503 without a store).
//   GET    /api/watch?league=<sleeper league_id>&user=<sleeper user_id>   { watch, at }
//   PUT    /api/watch?league=...&user=...  body { watch }                  merged and saved, returns the merged set
//   DELETE /api/watch?league=...&user=...                                  removes that user's watchlist for the league
// watch maps a player id to { week, at, removed? }. Merge rules live in src/watchMerge.js (shared with the app): per
// player the newest change wins, and an un-watch leaves a tombstone. A body with more than 200 players, a week outside
// 1 to 18, or any malformed entry is refused whole. Blob paths: watch/<league>/<user>.json
import { MAX_BYTES, MAX_WATCH, looseWatch, mergeWatch, parseWatch } from "../src/watchMerge.js";
import { blobFromEnv, createSyncHandler } from "./offers.js";

export function createHandler(blob) {
  return createSyncHandler(blob, {
    dir: "watch",
    maxBytes: MAX_BYTES,
    load: (s) => ({ watch: mergeWatch(looseWatch(s?.watch)) }),
    async put(body, current) {
      const keys = Object.keys(body);
      if (keys.length !== 1 || keys[0] !== "watch") return { status: 400, error: "body must be { watch }" };
      if (body.watch && typeof body.watch === "object" && Object.keys(body.watch).length > MAX_WATCH) return { status: 413, error: `at most ${MAX_WATCH} players` };
      const incoming = parseWatch(body.watch);
      if (!incoming) return { status: 400, error: "watch maps player ids to { week: 1 to 18, at, removed? }" };
      return { watch: mergeWatch((await current()).watch, incoming) };
    },
  });
}

export default createHandler(blobFromEnv());
