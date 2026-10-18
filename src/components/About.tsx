import { Icon } from "./ui";

const UPDATED = "October 18, 2026";

function Back({ onBack }: { onBack: () => void }) {
  return <button className="st-back doc-back" onClick={onBack}><Icon name="chev" size={16} />Settings</button>;
}

/** Plain-language explainer of what goes into the numbers. The weights stay private. */
export function HowItWorks({ onBack }: { onBack: () => void }) {
  return (
    <>
      <Back onBack={onBack} />
      <header className="page-head"><div><h1 className="page-title"><span className="page-ic" aria-hidden="true"><Icon name="spark" size={20} /></span>How Sources works</h1><p className="page-meta">What goes into the numbers, in plain terms</p></div></header>
      <article className="card doc">
        <section>
          <h2>Where the data comes from</h2>
          <ul>
            <li><b>Your league.</b> Rosters, starting lineups, scoring settings, matchups, standings and transactions come straight from your fantasy platform (Sleeper today). Sources reads them. It never changes anything in your league.</li>
            <li><b>Weekly projections.</b> Player projections come from your platform's published weekly projections, adjusted to your league's scoring.</li>
            <li><b>The trade market.</b> Trade values start from public market data for your league's format (1QB or Superflex, PPR or not, number of teams).</li>
            <li><b>Your notes.</b> Tags you log ("Mike won't move Chase Brown", "I'm keeping Allen") steer trade ideas. They stay private to you.</li>
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
            <li><b>Win chance</b> compares the two projected totals and allows for normal week-to-week swings.</li>
            <li><b>Playoff odds</b> come from thousands of simulated rest-of-season schedules using each team's current best lineup.</li>
            <li><b>Waiver bids</b> are a suggested range of your remaining budget based on how much a player adds to your starters and how your league has bid before.</li>
          </ul>
        </section>
        <section>
          <h2>AI summaries</h2>
          <p>Lines marked "AI summary" are written from the numbers above. They explain a result. They don't change it.</p>
        </section>
        <section>
          <h2>What to keep in mind</h2>
          <p>Projections are estimates. Injuries, weather, coaching decisions and plain luck move real results. Sources gives you a read, and every decision in your league is yours.</p>
        </section>
      </article>
    </>
  );
}

/** Terms of use, privacy summary and name, image and likeness notice. */
export function Legal({ onBack }: { onBack: () => void }) {
  return (
    <>
      <Back onBack={onBack} />
      <header className="page-head"><div><h1 className="page-title"><span className="page-ic" aria-hidden="true"><Icon name="lock" size={20} /></span>Terms and legal</h1><p className="page-meta">Last updated {UPDATED}</p></div></header>
      <article className="card doc">
        <section>
          <h2>Terms of use</h2>
          <ul>
            <li><b>For your own league.</b> Sources is a personal tool for managing fantasy football leagues you play in. Don't use it to scrape, resell or republish league data.</li>
            <li><b>Information, not guarantees.</b> Projections, values, odds and suggestions are estimates for entertainment and informational purposes. They are provided as is, without warranties of any kind, and results may differ.</li>
            <li><b>Not betting advice.</b> Sources isn't built for real-money betting or daily fantasy contests, and nothing in it is financial advice.</li>
            <li><b>You make the moves.</b> Sources never sends a message, trade or lineup change for you. You decide what to do in your league and you're responsible for it.</li>
            <li><b>Be decent.</b> Don't use pitches or tags to harass anyone in your league.</li>
            <li><b>Changes.</b> These terms may change as Sources grows. The date at the top shows the latest version. Using Sources after a change means you accept it.</li>
            <li><b>Limits.</b> To the extent the law allows, Sources isn't liable for losses tied to decisions made with it, including lost games, trades or prizes.</li>
          </ul>
        </section>
        <section>
          <h2>Privacy</h2>
          <ul>
            <li>No passwords, ever. Sources connects with a username or the platform's official sign-in.</li>
            <li>Your tags, prices and history are stored on your device and never shown to your league mates.</li>
            <li>Sources doesn't sell your data.</li>
            <li>You can disconnect or delete your data any time in Settings.</li>
          </ul>
        </section>
        <section>
          <h2>Names, images and likenesses</h2>
          <p>Sources doesn't own the names, images or likenesses of any player, coach or team. Player names are used only to identify them in your league. Player headshots and team logos are shown as provided by your fantasy platform and belong to their respective owners.</p>
          <p>Sources isn't affiliated with, endorsed by or sponsored by the NFL, the NFL Players Association, any NFL team, any player, Sleeper, or any data provider. All trademarks belong to their owners. Showing a player or team in Sources doesn't mean they endorse it.</p>
        </section>
        <section>
          <h2>Data sources</h2>
          <p>League data and projections come from your fantasy platform's public API. Trade market data comes from public market values. Sources follows each provider's terms and only reads data you or your league already have access to.</p>
        </section>
      </article>
    </>
  );
}
