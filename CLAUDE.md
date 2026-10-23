# Working on Source

## Keep Vercel and GitHub spend low (Zach, Oct 23)
This applies to the app, the landing page and everything else in this repo.

- **Bundle work into one push.** Every push to main is a Vercel build. Gather a batch of changes, commit, and push once. Don't push one small fix at a time.
- **No new function calls when an existing one can carry the work.** Log, save or check inside a call that already runs (see api/_lib/ask-log.js riding on api/ask.js).
- **Cache anything shared.** GET routes everyone sees the same answer from get `s-maxage` so the CDN answers instead of a function.
- **Poll as little as possible.** Pause when the tab is hidden, back off when nothing is live, and throttle catch-up pulls on focus (offerSync.ts and watchSync.ts wait a minute between them).
- **Count Blob operations.** Each read, write, list and delete is billed. Prefer one write per event over read-then-write, and never list on every request.
- **GitHub Actions only when needed.** Workflows run on narrow `paths` filters or by hand, never on every push.
- **No new paid services or dependencies** without asking Zach first.

## Saved data
- `asks/YYYY-MM-DD/*.json` in Blob: Ask questions and answers with team, manager and league names replaced, plus format, model, tokens and cost. No user ids. Deleted after 12 months. Turn off with `ASK_LOG=off`.
- Sent offers carry `read` (Source's market values and acceptance odds when it went out) next to the outcome, for tuning the acceptance curve later.
