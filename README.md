# Sources

**Live:** https://sources-orpin.vercel.app

**Your fantasy insider.** Sources connects to your fantasy football league, learns what every team needs, and finds trades both sides will accept. It sets your best lineup each week, tells you who to pick up and what to bid, and remembers what your league mates said so you don't have to.

> *Per sources, Mike's Mistakes needs a TE. Their starter is out and they're losing points every week at the spot. Here are two deals that help you both.*

This repo is the responsive React + TypeScript web app. Enter your Sleeper username and it runs on your real league: rosters, records, scoring, starting slots, the current week, byes, injuries, Sleeper's weekly projections, your league's own FAAB bids, completed trades and past weekly scores. No password, no server: Sleeper's public read-only API is called straight from your browser. A built-in demo league is there for anyone without Sleeper. Native iOS and Android apps (React Native) are planned to share the same engine and design tokens.

## What's in it

Everything in the product spec's MVP, plus v1 previews (marked **v1 preview** in the app):

| Area | What it does |
| --- | --- |
| **First run** | Sleeper username only (no passwords), pick from your real leagues, confirm your team, see your top need and one trade worth a look, optionally tag untouchables. Or try the demo league. |
| **The Wire** | Per Sources nudges with a reason and one action each: league needs, offers received (verdict + ready counter), news breaks (what it changes for your lineup, targets and prices), lineup-day flags, waivers, stale-tag checks, slot patterns. Weekly briefing. "Did Mike reply?" follow-ups that turn the answer into a tag or a counteroffer. |
| **League Needs** | Every team's starting slots against the league average, contender/seller from record and points scored, the 2 or 3 best trade partners, fading intent tags, and manager tendencies from completed trades. |
| **Build a Deal** | Both full rosters side by side, live before/after starting-lineup points, refused players dimmed, wanted players highlighted, untouchables locked, live tips, roster-drop accounting, slot-by-slot math, and tags from free text or dictation. |
| **Lineup** | Optimal lineup drawn as an offensive formation on a football field (line of scrimmage, first-down line, hash marks), Sleeper lineup diff with "Apply in Sleeper", close calls, byes and injuries, roster tag suggestions, "what would it take" with a price in points a week or percent over value, and a slot report. |
| **Waivers** | Who to add, who to drop, and a bid range drawn from your league's own winning bids. |
| **Ask Sources** | Plain-English questions answered from league data. Every answer is labeled and links to the numbers. |
| **Pitch and send** | Drafts the message around the other team's need in three tones, builds a shareable trade card, and hands off to Messages, a group chat, the league app, or the share sheet. Nothing sends until you do. |
| **Settings** | League format (PPR, Half, Standard, Superflex, TE Premium), nudge level, tag fade window, connections, privacy, disconnect and delete. |

### Guardrails baked in

- Every number comes from the trade engine (`src/engine.ts`). AI-written copy only explains those numbers and is labeled.
- No fantasy app passwords, ever. Sleeper connects by username; Yahoo and ESPN use official sign-in (v1).
- Intent tags are private and stored only in your browser, separately for each league.
- Nothing is sent to a league mate without the user tapping send.

## Design

The visual language follows Apple Sports: a near-black canvas (with a matching light mode), borderless rounded cards, big tabular numerals, pill-shaped controls and SF Pro type on Apple devices (Geist elsewhere). One brand accent, amber, plus a "you vs them" color pair for comparisons. Icons are Phosphor.

Motion follows Apple's WWDC *Designing Fluid Interfaces* principles: instant press feedback, a pitch sheet on a real spring that you can grab mid-motion, momentum projection, rubber-banding, and reduced-motion, reduced-transparency and high-contrast fallbacks.

References gathered on Mobbin:

- Apple Sports: scoreboard header, two-color team stat bars (used for trade comparisons), centered card titles, pill segmented controls
- Public and Slopes: the floating glass tab bar
- Grammarly and Better Stack: the split landing hero with a sign-up field
- American football broadcasts: the lineup drawn on a gridiron with the blue line of scrimmage and yellow first-down line

## Run it

```bash
npm install
npm run dev        # local dev server
npm run typecheck  # strict TypeScript
npm run build      # type check + production build to dist/
```

`npm run build:artifact` produces a single self-contained HTML file in `dist-artifact/` for quick sharing.

## Deploy

The repo deploys on Vercel with the settings in `vercel.json` (Vite, `npm run build`, output `dist`). Every push to `main` ships a new deployment.

## Project layout

```
src/
  sleeper.ts       Sleeper API client: user, leagues, rosters, projections, transactions, matchups
  data.ts          league store (live or demo) and the demo league
  engine.ts        lineups, needs, trades, verdicts, counters, waivers, tendencies, Ask
  pitch.ts         pitch writer (tones, DM vs group chat)
  App.tsx          state, nudges, navigation
  components/      Wire, League, Trade, Roster, Waivers, Ask, Settings, FirstRun, PitchSheet, TagCapture, ui
  styles.css       design tokens and components
```

In the demo league, player names are real NFL players with illustrative projections; teams, managers, trades and bids are fictional. Live leagues use Sleeper's data as is. Sleeper doesn't expose pending trade offers, so "offer received" verdicts in a live league come from the builder's "Judging an offer someone sent me" switch.

## NOTICE

The AI working loader (Braille Flipwave) is vendored from the npm package `loader-buttons` v0.1.0 by Jaimin Kataria (https://github.com/Appllama/25-unique-loaders), licensed Apache-2.0 per its package.json. The files live in `src/vendor/loader-buttons/`. They are unchanged except for colors in `designs/25-braille-flipwave.js`. `designs/index.js` and `loader.d.ts` are ours.
