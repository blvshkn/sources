# Sources

**Your fantasy insider.** Sources connects to your fantasy football league, learns what every team needs, and finds trades both sides will accept. It sets your best lineup each week, tells you who to pick up and what to bid, and remembers what your league mates said so you don't have to.

> *Per sources, Mike's Mistakes needs a TE. Their starter is out and they're losing points every week at the spot. Here are two deals that help you both.*

This repo is the responsive React + TypeScript web app. It runs entirely on a sample league so anyone can try it without connecting an account. Native iOS and Android apps (React Native) are planned to share the same engine and design tokens.

## What's in it

Everything in the product spec's MVP, plus v1 previews (marked **v1 preview** in the app):

| Area | What it does |
| --- | --- |
| **First run** | Sleeper username only (no passwords), pick league, confirm team, see your top need and one trade worth a look, optionally tag untouchables. |
| **The Wire** | Per Sources nudges with a reason and one action each: league needs, offers received (verdict + ready counter), news breaks (what it changes for your lineup, targets and prices), lineup-day flags, waivers, stale-tag checks, slot patterns. Weekly briefing. "Did Mike reply?" follow-ups that turn the answer into a tag or a counteroffer. |
| **League Needs** | Every team's starting slots against the league average, contender/seller from record and points scored, the 2 or 3 best trade partners, fading intent tags, and manager tendencies from completed trades. |
| **Build a Deal** | Both full rosters side by side, live before/after starting-lineup points, refused players dimmed, wanted players highlighted, untouchables locked, live tips, roster-drop accounting, slot-by-slot math, and tags from free text or dictation. |
| **Lineup** | Optimal lineup on a field view, Sleeper lineup diff with "Apply in Sleeper", close calls, byes and injuries, roster tag suggestions, "what would it take" with a price in points a week or percent over value, and a slot report. |
| **Waivers** | Who to add, who to drop, and a bid range drawn from your league's own winning bids. |
| **Ask Sources** | Plain-English questions answered from league data. Every answer is labeled and links to the numbers. |
| **Pitch and send** | Drafts the message around the other team's need in three tones, builds a shareable trade card, and hands off to Messages, a group chat, the league app, or the share sheet. Nothing sends until you do. |
| **Settings** | League format (PPR, Half, Standard, Superflex, TE Premium), nudge level, tag fade window, connections, privacy, disconnect and delete. |

### Guardrails baked in

- Every number comes from the trade engine (`src/engine.ts`). AI-written copy only explains those numbers and is labeled.
- No fantasy app passwords, ever. Sleeper connects by username; Yahoo and ESPN use official sign-in (v1).
- Intent tags are private and stored only in the browser in this prototype.
- Nothing is sent to a league mate without the user tapping send.

## Design

Layout follows Apple's interface guidelines and the WWDC *Designing Fluid Interfaces* principles: instant press feedback, translucent bars, a pitch sheet that tracks your finger 1:1, carries your flick velocity, uses momentum projection to decide dismiss or snap back, and rubber-bands at the edge. Reduced motion, reduced transparency and increased contrast are all respected. Light and dark themes follow the system.

Visual references gathered on Mobbin from simple, modern sports apps:

- Lineup field formation: DAZN, FotMob, Premier League
- Injury status pills: NFL
- Clean data cards with bars: Copilot Money
- Before/after comparison bars: Public
- Bottom sheets: Fixtured, Noom
- Player cards: F1 Fantasy

Type: Big Shoulders Display for headlines, Figtree for text, IBM Plex Mono for numbers. The amber "Per sources" stamp is the brand's signature.

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
  data.ts          sample league, tags, waivers, trade history
  engine.ts        lineups, needs, trades, verdicts, counters, waivers, tendencies, Ask
  pitch.ts         pitch writer (tones, DM vs group chat)
  App.tsx          state, nudges, navigation
  components/      Wire, League, Trade, Roster, Waivers, Ask, Settings, FirstRun, PitchSheet, TagCapture, ui
  styles.css       design tokens and components
```

Player names are real NFL players with illustrative projections. Teams, managers, trades and bids are fictional sample data.
