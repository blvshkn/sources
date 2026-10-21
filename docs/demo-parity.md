# Demo parity

Every feature has to work and look complete in the demo too. Demo mode is localStorage `sources.session` =
`{"mode":"demo"}`. The finished-week variant adds `sources.fixture` = `"final-week"`. Check both, at phone and desktop
widths, before calling a feature done.

Where demo data lives:

- `src/data.ts`: the demo league (`demoLeague()`, rosters, `DEMO_*` constants). Teams, players, injuries, byes, the
  week 7 slate, K/DEF, free agents, FAAB, past trades, activity, commish (Jake), last season's champion.
- `src/live.ts`: the sample Sunday (`demo()`), and the final-week fixture.
- `src/schedule.ts`: the demo season (`demoCell`, `demoBye`, `demoFinal`). Every weekly number in the demo comes from
  it, so add new per-week demo numbers there rather than hashing your own.
- `src/demoFixtures.ts`: your own saved lists in the demo (Sent offers, Watching). Seeded once per browser by
  `seedDemo()`, only where the list is still empty. Delete my data seeds them again. The demo stays in week 7, so on
  later visits the saved times move forward together and the list keeps reading as this week.
- `src/App.tsx`: the demo's starting tags, notes and asking prices (`usePersist` defaults when `demo`).
- `public/demo/`: the three sample manager photos (you, Mike, Jake). Everyone else shows initials.

Rules for new demo data: the demo league's own teams and week only, internally consistent (a player named in a
pitch is on that roster, a bye matches `DEMO_BYES`), and never presented as real NFL stats.

Things the demo gets from the network, same as a live league: headshots and team marks (Sleeper CDN), jersey
numbers and player ids (`/api/player-numbers`), news (`/api/news` and ESPN), kickoff times (`/api/kickoffs`), and
Sources AI (`/api/ask`). When those are unreachable the demo falls back to initials, no news, slate dates, and Ask's
built-in answer. The public landing turns headshots and NFL marks off on purpose (`AvatarPhotos` false in
Landing.tsx); the app's demo keeps them on.

## Checklist

Status: OK means it shows in the demo with no extra data. Seeded means demo data was added for it.

### Overview (Wire)

| Feature | In the demo | Status |
| --- | --- | --- |
| Command center / Intel tabs, Intel without a count | Both tabs; Intel has no number | OK |
| Face-off score header, win bars, to-play chips, Live badge pulse | Sample Sunday: 2 to play vs 6, Live | OK |
| Final week result | final-week: both teams final, "Lost by 20.0", 0% / 100% | OK |
| Quick moves (lineup fix, top trade, waiver add) | Kincaid over Warren, Coker + Kincaid for Wilson, Sean Tucker | OK |
| Quick moves: Offer out | "You sent Pat an offer 5h ago", from the seeded Sent offers | Seeded |
| Where to improve, weakest spot, trade partner | TE, Mike | OK |
| Their threats, Game day, heating up / cold | Jake's top three; your starters with fire and ice | OK |
| Injury watch, Key dates | Deebo Samuel (Q, ankle) | OK |
| Full matchup sheet: padding, no header divider, swap list closes on outside tap, K/DEF rows | Opens from the card, Their threats and the inbox | OK |
| News on your players | Real news for the demo's real player names, from the network | OK (network) |
| Intel cards: offer received, lineup nudge, More intel | Dan's Zay Flowers for Ladd McConkey offer | OK |

### Inbox

| Feature | In the demo | Status |
| --- | --- | --- |
| Before lock alerts, close call, offer received, AI marker, dismiss | 10 items (8 in final-week) | OK |
| Open matchup from the inbox | Opens the matchup sheet | OK |

### Trade

| Feature | In the demo | Status |
| --- | --- | --- |
| Builder: Trading with picker, partner profile, Their offer switch | Mike by default | OK |
| Roster cards: Value / Proj toggle | Values are the demo's estimate from projections (22,519 starters value) | OK |
| Roster tags on cards (Overpay only, Untouchable, Mike wants) | Josh Allen, James Cook, Mike's TE asks | OK |
| 3 and 4 team deals, + Add player, search | Any demo team | OK |
| Ideas with the thinking trace, Won't work, Not interested | 3 ideas with Mike | OK |
| Notes on managers | 2 notes on Mike (Looking for TE help, Won't move Chase Brown) | OK |
| Sent offers: pending, versions, Mark declined, Clear | Pat (waiting) | Seeded |
| Decline reasons: Wanted more value | Taylor: ideas with him offer more value | Seeded |
| Decline reasons: Thin at | Kev, Thin at RB: ideas won't ask him for RBs | Seeded |
| Decline reasons: Won't trade | Chris, Won't trade Kittle: ideas leave Kittle out | Seeded |
| Decline reasons: Not trading now pause and Resume | Alex: ideas paused until Week 9, Resume now | Seeded |
| Pitch sheet: Save image, Open Messages with the card, tone, share image | From any idea's Write pitch | OK |
| Sent offer sync across devices | Off in the demo by design (Devices row says so) | OK |

### Lineup (Roster)

| Feature | In the demo | Status |
| --- | --- | --- |
| WRT flex chip in position colors, with tooltip | Jaylen Warren's FLEX row | OK |
| Injury marker with reason and tooltip: Q | Deebo Samuel, "Ankle, limited practice" | OK |
| Injury marker with reason and tooltip: D | Tank Bigsby (bench), "Hamstring, did not practice" | Seeded |
| OUT and IR | Brandon Aiyuk on IR, opponents' OUT players in swap lists and the matchup | OK |
| Bye only from the schedule | PIT and NE on bye (Jaylen Warren, Romeo Doubs, Patriots D/ST) | OK |
| Team logo badge on avatars | Shows on every player avatar when the Sleeper CDN loads; initials when no headshot id | OK (network) |
| Swap menu, Use optimal lineup, locked rows and lock badge | Live and final games lock | OK |
| Set optimal lineup (Sources AI) | Button and trace on the demo week | OK |
| Start / Sit, Compare, Tags, Slot report | All tabs | OK |
| Asking price (What would it take) | Josh Allen at +25% (no team meets it) and Dalton Kincaid at +5% (1 of 9 teams, with a Write pitch) | Seeded |
| Week stepper with past, current and future weeks | Weeks 1 to 18 | OK |
| Past-week points agree everywhere | One demo season (schedule.ts `demoCell`) feeds Lineup and Full matchup past weeks (weeks.ts), the game log, Compare, Start / Sit and Waivers "Last 3". Josh Allen's Week 5 is 10.7 in all of them | Fixed |
| Final-week fixture: Week 7 in the season | Week 7 is played in the game log and Compare's recent weeks, with the face-off's own final points for your team and Jake's | Fixed |

### Waivers

| Feature | In the demo | Status |
| --- | --- | --- |
| FAAB, top pickup, Sugg. bid, Not interested | $64 of $100, Sean Tucker | OK |
| K/DEF rows and must-fix | Seahawks D/ST must fix (Patriots on bye) | OK |
| Watching (star) list | Dont'e Thornton and Chig Okonkwo | Seeded |
| Week stepper, past scores, projections | Week 7 slate | OK |

### League

| Feature | In the demo | Status |
| --- | --- | --- |
| Needs, Standings with playoff odds, champion crown | Jake wears last season's crown | OK |
| Tendencies, Activity, Values (with K and DEF) | From the demo's past trades and activity | OK |
| Tag capture from league chat | Log it on League Needs | OK |

### Ask

| Feature | In the demo | Status |
| --- | --- | --- |
| Starter questions | The trade starter asks for the top idea's target ("How can I get Garrett Wilson?") | Fixed |
| 2 to 3 offer options for "how can I get X" | Best odds, Best for your lineup, Cheapest in value | OK |
| Follow-up exclusions ("I don't want to give up X") | Rebuilds every option without him | OK |
| Built-in answer when Sources AI is offline | Same options, with the offline note | OK |

### Settings

| Feature | In the demo | Status |
| --- | --- | --- |
| Refresh time beside Sleeper | "Updated 14 min ago" | OK |
| Account row with picture and league role | Demo account, your demo photo, "Member of Demo League · Commish: Jake", In use | Seeded |
| Devices, format, nudges, passed players, privacy, about | All tabs | OK |

### Shell and landing

| Feature | In the demo | Status |
| --- | --- | --- |
| Alpha tag beside the wordmark | Phone header and sidebar | OK |
| Phone header, tab bar, sidebar, background | Same as live | OK |
| Landing "Try the demo" | Opens first-run setup on the demo league, then the app | OK |

## Known gaps

- The Slot report's weekly bars (`DEMO_SLOT_HISTORY` in data.ts) are their own fixture, not summed from the demo season.

- The lineup fix nudge and the "Before lock" inbox alerts don't look at game state, so on the sample Sunday (and the
  final-week fixture) they still suggest starting a player whose game has started or ended. Same code path as a live
  league, so it isn't a demo-only fix.
