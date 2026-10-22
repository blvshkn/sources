import { Icon } from "./ui";

const UPDATED = "October 21, 2026";

function Back({ onBack }: { onBack: () => void }) {
  return <button className="st-back doc-back" onClick={onBack}><Icon name="chev" size={16} />Settings</button>;
}

/** Plain-language explainer of what goes into the numbers. The weights stay private. */
export function HowItWorks({ onBack }: { onBack: () => void }) {
  return (
    <>
      <Back onBack={onBack} />
      <header className="page-head"><div><h1 className="page-title"><span className="page-ic" aria-hidden="true"><Icon name="spark" size={20} /></span>How Source works</h1><p className="page-meta">What goes into the numbers, in plain terms</p></div></header>
      <article className="card doc"><HowItWorksDoc /></article>
    </>
  );
}

/** Terms of use, privacy summary and name, image and likeness notice. */
export function Legal({ onBack }: { onBack: () => void }) {
  return (
    <>
      <Back onBack={onBack} />
      <header className="page-head"><div><h1 className="page-title"><span className="page-ic" aria-hidden="true"><Icon name="lock" size={20} /></span>Terms and legal</h1><p className="page-meta">Last updated {UPDATED}</p></div></header>
      <article className="card doc"><LegalDoc /></article>
    </>
  );
}

/** The How Source works text on its own, for the page and for the sheet Settings opens it in */
export function HowItWorksDoc() {
  return (
    <>
    <section>
      <h2>Where the data comes from</h2>
      <ul>
        <li><b>Your league.</b> Rosters, starting lineups, scoring settings, matchups, standings and transactions come straight from your fantasy platform (Sleeper today). Source reads them. It never changes anything in your league.</li>
        <li><b>Weekly projections.</b> Player projections come from your platform's published weekly projections, adjusted to your league's scoring.</li>
        <li><b>The trade market.</b> Trade values start from FantasyCalc's public market values for your league's format (1QB or Superflex, PPR or not, number of teams).</li>
        <li><b>News and game info.</b> Player news comes from RotoWire, RotoBaller and ESPN feeds. Kickoff times and live scores come from Sleeper and ESPN.</li>
        <li><b>Your notes.</b> Tags you log ("Mike won't move Chase Brown", "I'm keeping Allen") steer trade ideas. They stay in your browser and private to you.</li>
      </ul>
    </section>
    <section>
      <h2>Player value</h2>
      <p>Every player gets one value on a 0 to 10,000 scale, with the top player at 10,000. It blends what the market would pay with what our model expects him to score for your team the rest of the season.</p>
      <ul>
        <li>The model counts points over a replacement player, using your league's real starting slots instead of a generic league.</li>
        <li>Bye weeks count as zero, and fantasy playoff weeks count extra.</li>
        <li>Recent adds and drops nudge a value a little, so a breakout shows up before the market fully catches on.</li>
        <li>When the model and the market disagree by a lot, the Values board flags the player as a buy-low or sell-high.</li>
      </ul>
    </section>
    <section>
      <h2>Trade ideas</h2>
      <ul>
        <li><b>Fair value.</b> Packages are compared with a discount for extra pieces, so three bench players don't add up to one star.</li>
        <li><b>Both lineups.</b> Every idea checks your starting lineup and theirs before and after. You see the weekly points each side gains.</li>
        <li><b>Would they accept?</b> Ideas that one side would obviously refuse are left out. What's left gets an acceptance chance based on value, their lineup gain, the positions they need, what you've logged about them, and how they've traded before.</li>
        <li><b>Labels.</b> Likely yes, Worth a shot and Long shot are ranges of that acceptance chance, not promises.</li>
      </ul>
    </section>
    <section>
      <h2>Lineups, matchups and waivers</h2>
      <ul>
        <li><b>Best lineup</b> fills your league's slots with the highest projected players who can play there.</li>
        <li><b>Win chance</b> follows your platform: the two projected totals, with less room for surprises as fewer points are left to play.</li>
        <li><b>Playoff odds</b> come from thousands of simulated rest-of-season schedules using each team's current best lineup.</li>
        <li><b>Sugg. bid</b> is a dollar range sized to your league budget, how fast a player is being added across Sleeper, how much he adds to your starters and how high winning bids run in your league. It never goes past what you have left.</li>
        <li><b>Crown and cup.</b> A crown marks last season's league champion. A cup marks the side that won a finished matchup.</li>
      </ul>
    </section>
    <section>
      <h2>Source AI</h2>
      <p>Two features use an AI model, Anthropic's Claude: Ask and Set optimal lineup. Everything else on this page is Source's own engine.</p>
      <ul>
        <li><b>Ask.</b> Your question, your last few questions and answers, and a compact snapshot of your league go to Anthropic's API. The snapshot holds team and manager names, rosters with projections and injury status, standings, this week's matchups, recent trades and transactions, top free agents and what each team needs. Your tags are not part of it.</li>
        <li><b>The math stays ours.</b> When the engine can work out the answer, like a trade, a start or sit, or a waiver pick, its numbers go along and the model has to use them. Trade values, acceptance chances and lineup gains always come from the engine. The AI puts them into words.</li>
        <li><b>Set optimal lineup.</b> It starts from your best lineup by projection. Source then gathers the week's signals: news, Sleeper injury and practice reports, Vegas lines from The Odds API when that feed is on, and kickoff weather from Open-Meteo at outdoor stadiums. Your roster, projections, current Sleeper lineup and those signals go to the model, which suggests changes with a short reason for each. Source checks every slot for byes, injuries and locks, and any change that fails goes back to the projection pick. Nothing changes in Sleeper until you make the move.</li>
        <li><b>Answers can be wrong.</b> A model can misread the data or miss news. Check anything important before you act on it.</li>
        <li><b>Limits.</b> Each connection can only make so many AI requests a minute. Each person also gets a set number of AI requests a day: per Sleeper account in a connected league, and a smaller number per visitor in the demo league. Source AI also has a daily cap on what it can spend across everyone, and once it's reached, Ask uses the built-in answers and Set optimal lineup uses your projections until the next day (UTC). The same happens when the AI is busy or offline, or when a request looks automated.</li>
        <li><b>AI summary.</b> Lines marked "AI summary" explain a result from the numbers. They don't change it.</li>
      </ul>
    </section>
    <section>
      <h2>What to keep in mind</h2>
      <p>Projections are estimates. Injuries, weather, coaching decisions and plain luck move real results. Source gives you a read, and every decision in your league is yours.</p>
    </section>
    </>
  );
}

/** The terms text on its own, for the page and for the sheet Settings opens it in */
export function LegalDoc({ dated = false }: { dated?: boolean }) {
  return (
    <>
      {dated && <p className="doc-updated">Last updated {UPDATED}</p>}
    <section>
      <h2>Terms of use</h2>
      <ul>
        <li><b>For your own league.</b> Source is a personal tool for managing fantasy football leagues you play in. Don't use it to scrape, resell or republish league data.</li>
        <li><b>Information, not guarantees.</b> Projections, values, odds, suggestions and AI answers are estimates for entertainment and informational purposes. They are provided as is, without warranties of any kind, and results may differ.</li>
        <li><b>Not betting advice.</b> Source isn't built for real-money betting or daily fantasy contests, and nothing in it is financial advice.</li>
        <li><b>You make the moves.</b> Source never sends a message, trade or lineup change for you. You decide what to do in your league and you're responsible for it.</li>
        <li><b>Be decent.</b> Don't use pitches or tags to harass anyone in your league.</li>
        <li><b>People only.</b> Automated access to the AI features (bots, scripts, scrapers or anything posing as a person) isn't allowed. Requests that look automated are refused.</li>
        <li><b>Changes.</b> These terms may change as Source grows. The date at the top shows the latest version. Using Source after a change means you accept it.</li>
        <li><b>Limits.</b> To the extent the law allows, Source isn't liable for losses tied to decisions made with it, including lost games, trades or prizes.</li>
      </ul>
    </section>
    <section>
      <h2>Privacy</h2>
      <ul>
        <li><b>No passwords, ever.</b> Source connects with your Sleeper username. There's nothing to sign into and no account to create.</li>
        <li><b>On your device.</b> Your tags, prices, settings and history are stored in this browser and never shown to your league mates.</li>
        <li><b>Synced across devices.</b> Offers you send (the players, your pitch, who it went to and when) and players you star on Waivers are saved in Vercel Blob storage so they follow you to devices you pair. The first device that syncs makes a random sync key and keeps it in that browser. Our servers store only a one-way hash of it, and every read or write has to bring the key. Another device joins with a one-time pairing code that expires in 10 minutes, and wrong codes are locked out after five tries. Knowing your Sleeper ids is no longer enough to read your lists. A device without the key can still start fresh, which replaces the synced copy but never reveals the old one. The demo league never syncs.</li>
        <li><b>AI.</b> When you use Ask or Set optimal lineup, what you type and a snapshot of your league are sent to Anthropic's API to write the answer (see How Source works for exactly what's in it). Anthropic handles that data under its own API terms. Source doesn't save your questions or answers on its servers.</li>
        <li><b>Hosting.</b> Source runs on Vercel, and fonts load from Google Fonts. Like any website, they see basic request details such as your IP address. Source uses your IP address only to limit how often the AI can be called and how many pairing codes can be tried. For the daily limits, your IP address (and your Sleeper user id, in a connected league) is scrambled with a one-way hash and counted per day in Vercel Blob storage, so the raw address is never stored. Each day's counts are deleted once that day ends (UTC), the next time Source AI is used. Vercel's BotID also checks AI requests to tell people from bots. There are no ads, analytics or tracking scripts.</li>
        <li><b>Deleting.</b> Delete my data in Settings clears Source from this browser, including its sync key. On the server it removes your synced offers and watchlist for every league this browser has used, any open pairing code, and the key's hash, so your other devices stop syncing. Anything synced from a league this browser never opened can't be read by anyone after that. Disconnecting signs you out but doesn't delete the synced copy.</li>
        <li>Source doesn't sell your data.</li>
      </ul>
    </section>
    <section>
      <h2>Names, images and likenesses</h2>
      <p>Source doesn't own the names, images or likenesses of any player, coach or team. Player names are used only to identify them in your league. Player headshots and team logos are shown as provided by your fantasy platform and belong to their respective owners.</p>
      <p>Source isn't affiliated with, endorsed by or sponsored by the NFL, the NFL Players Association, any NFL team, any player, Sleeper, or any data provider. All trademarks belong to their owners. Showing a player or team in Source doesn't mean they endorse it.</p>
    </section>
    <section>
      <h2>Data sources</h2>
      <p>League data, projections, injury and practice reports, player photos and live scores come from Sleeper's public, read-only API. Trade market values come from FantasyCalc. Player news comes from RotoWire, RotoBaller and ESPN, and game times and scores also come from ESPN. Vegas lines come from The Odds API. Weather data by Open-Meteo.com. AI answers are written with Anthropic's API. Vercel hosts Source and stores synced offers and watchlists. Source follows each provider's terms and only reads data you or your league already have access to.</p>
    </section>
    <section>
      <h2>Credits</h2>
      <p>Headers are set in Clash Grotesk by Indian Type Foundry, used under the Fontshare license. The AI loading animation is adapted from loader-buttons by Jaimin Kataria.</p>
    </section>
    </>
  );
}
