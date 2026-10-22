# Demo parity

Every feature has to work and look complete in the demo too. Demo mode is localStorage `sources.session` =
`{"mode":"demo"}`. The finished-week variant adds `sources.fixture` = `"final-week"`. Check both, at phone and desktop
widths, before calling a feature done.

Where demo data lives:

- `src/data.ts`: the demo league (`demoLeague()`, rosters, `DEMO_*` constants). Teams, players, injuries, byes, the
  week 7 slate, K/DEF, free agents, FAAB, past trades, activity, commish (Jake), last season's champion.
- `src/live.ts`: the sample Sunday (`demo()`, game by game in `DEMO_SUNDAY`: about 3:50 PM Eastern, Thursday and three
  1:00 games final, three 1:00 games in the fourth quarter, the rest still to come; both teams in a game always share
  one state and clock), and the final-week fixture. Free agents in a started game score there too, for Waivers.
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
| Face-off score header, win bars, to-play chips, Live badge pulse | Sample Sunday: 2 to play vs 5, Live | OK |
| Final week result | final-week: both teams final, "Lost by 20.0", 0% / 100% | OK |
| Quick moves (lineup fix, top trade, waiver add) | Shaheed over Warren (Kincaid is locked, BUF is live), Coker + Kincaid for Wilson, Seahawks D/ST | OK |
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
| FAAB, top pickup, Sugg. bid, Not interested | $64 of $100, Seahawks D/ST this week (Sean Tucker's TB game is final, so he's locked) | OK |
| K/DEF rows and must-fix | Seahawks D/ST must fix (Patriots on bye) | OK |
| Watching (star) list | Dont'e Thornton and Chig Okonkwo | Seeded |
| Week stepper, past scores, projections | Week 7 slate; past weeks are the game log's numbers | OK |
| Locks: Played / Playing rows, tap to say why, no claim or K/DEF stream over a started game | Okonkwo, Spears, Tucker final; Browns D/ST and McPherson playing | OK |

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

### October 21 pass

| Change | In the demo | Status |
| --- | --- | --- |
| Full-width Compare button with the columns icon (phones) | Lineup swap card, Full matchup | OK |
| Taller compare chart with a tap-a-week readout above it | Compare sheet | OK |
| Swap card opens without nudging the player row | Lineup | OK |
| Top nav matches the bottom tab bar when scrolled | All pages | OK |
| Trade roster switch: solid track and tab over a fade from the nav | Trade | OK |
| Practice weighed by day (final practice counts, early-week DNPs are routine) | Demo notes now name the day: Deebo "limited Saturday" (Monday game), Bigsby "missed Friday practice", Lamb "sat Wednesday, full Friday"; Sources AI and Ask read the same rule | Seeded |
| Start/sit close calls go to the healthy player | Lineup > Compare, e.g. Deebo Samuel vs Jalen Coker | OK |
| Full matchup groups split by space; only tappable cards outlined | Full matchup | OK |
| Empty Top pickup card hidden | Waivers (the demo always has a pick, so the card shows) | OK |
| Loading chips wrap as a group | Live sign-in only: the demo has nothing to fetch, so it skips the loading screen | Live only |
| Alpha tag centered on its caps | Phone header and sidebar | OK |
| 16px corners on every card | All pages and sheets | OK |

## Known gaps

- The Slot report's weekly bars (`DEMO_SLOT_HISTORY` in data.ts) are their own fixture, not summed from the demo season.


## Oct 22
- Waivers, tablet and desktop: when nobody beats your starters, the Top pickup card shows "Your lineup is covered" with the best stash, the watch list and a look ahead to next week. The demo shows it only when its engine finds no pick.
- Player header figures: Rostered, Started and Claims 7d (live: Sleeper's research and trending feeds). The demo's Started is a demo figure derived from its Rostered, labeled as demo in the tip.
- Overview, Quick moves: every row shows. Covered rows (lineup optimal, no two-way trade, nobody on the wire) read with a green check and open their page; an Ask row starts Ask with a league question. The demo has a move in every row, so it shows the Ask row on top of them.
- Lineup what-if note: tighter padding; the buttons fill the width under the text, and sit right of it (up to 400) only on a very wide card.
- Skeletons pulse as a wave, row by row. Player header position badge uses the sheet slot chip. Revisiting a section fades the page in quickly instead of replaying the entrance.
- Lineup, Start / Sit compare: each pick has a "Search your roster" field in place of the Change menu (focus shows the roster, typing narrows it, one tap or Enter picks). Picks lie on their side, headshot left, on cards 560px and wider, and stack one above the other with VS between on phones. The compare rows are thin rounded bars out from the middle with the values beside them. Same in the demo. The demo league has no playoff, last 3 or trade value figures, so its compare shows only the week and rest-of-season rows (unchanged from before).

### Action motion (Oct 22)

Motion plays when you act, when something actually changes, or on first arrival. How to see each one in the demo:

| Effect | In the demo | Status |
| --- | --- | --- |
| Watch star: lift, slam, small squash, button dips; on is the star filled lime, off empties it | Waivers, any row's star, or Watch in a player sheet | OK |
| Spring check: pops and draws itself when newly reached | Lineup, Start / Sit: tap Use optimal lineup and "Lineup set" pops. Overview, On your radar: tap Not right now on the waiver row until the wire is covered, and the Waivers row's check pops. Coming back to either page shows it settled | OK |
| Swipe toast: springs up, flick it sideways past 80px to dismiss, Undo and auto-dismiss unchanged | Any toast, for example Watch on a waiver row | OK |
| Bell: swings once and its lime dot springs in when a new inbox item arrives; opening the inbox clears the dot quietly | Seeded: about 20 seconds after your first tap or keypress, once per visit, Mike offers Jerry Jeudy for your Dalton Kincaid (his TE, Sam LaPorta, is out). Inbox only; the Overview cards don't change | Seeded |
| Shiny text: slow sheen on the thinking label and on AI summary while the answer is still writing | Ask, any starter question (the built-in answer when Sources AI is unreachable) | OK |
| Decrypted text: the Start / Sit verdict resolves left to right when it changes | Lineup, Compare: change the week or a pick. Not on first open | OK |
| Highlight: one pill slides between rows on a desktop pointer | League, Standings and Values | OK |
| Auto height: text disclosures grow and shrink to their real height | Lineup, price check "teams can't get there"; landing FAQ | OK |
| Hover inside cards: faint fill, chevron nudges 3px, avatars 1.05x, presses sink to 0.985 | Rows on every page (hover on desktop only) | OK |
- Game day motion (gameDayMotion.tsx, game-day.css). The demo league otherwise stands still at its sample Sunday (about 3:50 PM Eastern), so a demo-only ticker in live.ts moves it on once, a few seconds after the app opens, the way the next minutes of a real Sunday would: at about 6s a 4:05 game with one of your players kicks off (his Lineup row gets the 16-bit stone lock, "Locked at kickoff", a small thud); at about 11s one of your live starters scores a touchdown past his projection (the pixel flame, corner glow and embers on Lineup and the full matchup, the scores morph their digits on the face-off and the rows); at about 16s the game that just kicked off reaches the end of the first quarter with your player there still on zero (the pixel snowflake, sleet and blue corner glow); at about 21s a questionable player with a Monday game is ruled out (his status pill morphs to Out and hugs the new word). Each happens once and nothing repeats. A live league never runs the ticker.
- Final whistle in the demo: set localStorage `sources.fixture` to "last-game". The demo opens on Monday night's closing minutes with every other game final; about 6s in the last game ends, so the face-off's Live line gives way to the result, the winner's bar fills, the loser's side steps back and the 16-bit trophy spins out beside the winner's name with its sparkles. "final-week" still opens already final, with the trophy settled.
- Already hot, cold, locked or final when a row mounts: shown settled (first flame frame, soft corner glow, closed lock, trophy in place), in the demo and live alike.
- The demo's kickoff lands on a bench player (none of your demo starters play in the 4:05 or 4:25 windows), so the full matchup shows its stone locks settled on starters that were already playing; the drop-in itself shows on Lineup.
- Lineup, Slot report: each starting slot is its own small chart. Every week is a thin rounded bar that grows up from the league average line (green, beat it) or down from it (red, came up short), on one shared scale, with the week and both scores on hover or long press. Each slot shows its gap a week, You, League and Beat avg, and opens the same week-by-week sheet as before. The slot trade ideas target sits on a soft red fill with a Trade target tag. Summary tiles replace the divided row, and the table is folded into the slots. The demo draws the same charts from DEMO_SLOT_HISTORY.
- Pull to refresh (phones, PullRefresh.tsx): in the demo the sync reloads the demo league in place (nothing is fetched), so the mark traces one full pass, locks and lifts. Watching, skipped and passed lists are saved, so they come through the refresh. A live league runs the same league load as Settings, Refresh, without the loading screen.
- Swipe row, pinned list and the Watching filter star (Waivers) use the demo free agents as they are; no demo data was added for them.

### New moments (Oct 22)

Six approved moments from the motion picks doc (new-moments.css). Each plays once, when the thing happens; already
decided, seen or settled shows still. How to see each one in the demo:

| Effect | In the demo | Status |
| --- | --- | --- |
| Offer accepted: pill morphs Waiting to Accepted and hugs the word, thin green edge, 16-bit confetti from the pill | Plays when a waiting offer turns accepted while Trade's Sent tab is open. The demo never syncs or reads Sleeper's trades, so nothing turns accepted on its own there; the settled look (green edge, Accepted pill) shows on any accepted offer | OK, live only for the change |
| Offer declined: pill morphs to red Declined, the deal dims to 0.62 and steps down 2px, no confetti | Trade, Sent: Mark declined on Pat's waiting offer | OK |
| Waiver results: won stamps a 16-bit check, bid goes green, "Claimed for $12. He's yours." morphs in; outbid strikes the bid red, "Outbid by $4. He went to Jake for $35." | Seeded, demo data: `DEMO_CLAIMS` in data.ts, your claims from Wednesday's run (won Romeo Doubs for $12, lost Parker Washington to Jake, $31 against $35). Matching waiver rows were added to `DEMO_ACTIVITY` so the league feed agrees. Plays the first time Waivers shows them each visit. A live league reads its own claims from Sleeper's transactions (sleeper.ts `claimResults`, latest run in the last 6 days) | Seeded |
| Lineup swap: slot labels stay, the two players glide past each other (FLIP) | Lineup, tap Rashid Shaheed on the bench and start him over Deebo Samuel | OK |
| Heating up: ember smokes (three frames twice) and rests as a wisp; on fire after heating, the smoke catches into the flame with a small pop and flickers once | The ticker's touchdown at about 11s takes a live starter past his projection; if he was heating up first, the smoke catches. Rows already heating show the wisp, settled | OK |
| New since you looked: a new top trade idea, or your offer going through, slides in on On your radar with a faint ink tint and keeps a dot until you open it; new inbox items slide in the same way | Needs a sync to bring something new, which the demo never does; the inbox's seeded Mike offer (about 20s after your first tap) slides into the inbox | OK |
| Sync error and recovery: icon nudges once, line morphs to "Couldn't reach Sleeper. Your last sync is still here." with Retry; success morphs to "Synced just now" with a check | Live only: the demo never reads Sleeper, so it never fails. The sidebar footer and Settings keep the plain "Updated" line | Live only |

### Trade finder (Oct 22)

Trade, Ideas, All teams (`TradeFinder.tsx`, engine in `tradeFinder.ts`, sims in `playoffSim.ts`). With Mike is the old
per-partner Ideas view, unchanged.

| Feature | In the demo | Status |
| --- | --- | --- |
| Three tiers: Both sides win, Fair, Long shots | All three populated: 2 Both (Mike, capped at 2 per partner), 5 Fair (Mike, Pat, Taylor), 3 Long shots (Kev, Dan, Chris) | OK |
| Long shot reason line | "They'd lose a starter at WR/RB" on the demo's top three | OK |
| Show N similar | Most cards fold 1 to 9 near copies | OK |
| Playoff odds before and after, make playoffs and win it all | Demo records, points for and projections; same sim as Standings | OK |
| Whole season / Regular season / Playoffs | Demo only: the demo league has no `playoffStart`, `lastWeek` or `playoffTeams`, so it uses the defaults (weeks 15 to 17, 6 teams; Week 7 leaves 8 regular season weeks). Demo players have no playoff-week projection, so the Playoffs number averages the demo season's own projections for weeks 15 to 17 (`demoCell` in schedule.ts), scaled to the league's scoring. Live leagues use Sleeper's `playoff` average per player | Demo data |
| Filters: Fair offers only, Buy, Sell, Improve | Any demo player or position | OK |
| On your radar, Top trade from the finder | The demo has two-way ideas with Mike, so Top trade shows one of those. To see the finder fill it, pause Mike (Trade, Ideas, With Mike, Won't work, "Mike isn't trading right now"): Top trade becomes Pat's Terry McLaurin, a Fair idea | OK |
| "Checked N swaps ... in the demo league" | Status line names the demo | OK |
