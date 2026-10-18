# Design System: Sources, Your Fantasy Insider

## 1. Visual Theme & Atmosphere
"Almanac." Utilitarian minimalism that reads like a printed sports almanac or the Monday box scores: warm bone paper, charcoal ink, one friendly grotesk (Google Sans) for everything, and small mono labels in the margins. Color is scarce and always means something (a position, a gain, a loss, a change to make). Density 5 of 10. Gradients appear only where they mean something: the section you're in, your side of a matchup, a gain, a change to make. Motion is nearly invisible: presses scale to 0.98 and nothing loops.

Light (bone paper) is the home edition. Night edition swaps the paper for warm charcoal with the same hierarchy.

## 2. Color Palette & Roles
Light
- **Bone Paper** (#F7F6F3): canvas
- **Sheet** (#FFFFFF): cards and lists
- **Margin** (#F3F2EE) and **Fold** (#EAE8E2): inner blocks, segmented tracks, skeletons
- **Charcoal Ink** (#2A2B2D): primary text. Never pure black
- **Pencil** (#787774): metadata. **Faint** (#A9A7A1): bench slots, inactive tabs
- **Hairline** (#EAEAEA): every card border and divider
- **Press Black** (#111111): primary buttons and selected chips
- **Your Side** (#1F6C9F) vs **Their Side** (#A9A7A1) in matchups

Night: canvas #191817, sheet #201F1D, ink #ECEAE5, muted #9B9891, hairline rgba(236,234,229,0.08). Pastels become 14% tints of lighter versions.

Status: Gain #346538 on #EDF3EC, Loss #9F2F2D on #FDEBEC, Caution #956400 on #FBF3DB.
Positions (pastel pill, colored text): QB pale red, RB pale green, WR pale blue, TE pale yellow, K/DEF pale lavender (#5B4B8A on #F1EEF8). FLEX is outlined white, bench is outlined faint, IR is pale red.

## 3. Typography Rules
- **Display:** Google Sans 600, tracking -0.03em, leading 1.05. Page titles and section titles
- **Scores:** Google Sans 500, tabular figures, tracking -0.04em
- **Body:** Google Sans 400 to 600, leading 1.55, max 65 characters
- **Mono:** Google Sans Code for projections, stat lines, and small uppercase labels (tracking 0.06em)
- **Banned:** serifs, Inter, Roboto, all-caps headlines

## 4. Component Stylings
- **Cards:** white sheet, 1px hairline, 12px corners, no shadow
- **Buttons:** 6px corners. Primary is Press Black with white text, hover #333. Secondary is a white sheet with a hairline
- **Chips:** 6px corners, hairline, selected inverts to Press Black
- **Segmented controls:** margin-gray track, selected cell is a white sheet with a hairline
- **Tags:** pastel pills, mono, uppercase, wide tracking
- **Lineup rows:** a row that needs a change in Sleeper gets a pale yellow highlighter wash and a 2px caution rule, like a marked-up page
- **Headshots:** round on margin gray, team badge with a paper ring
- **Chrome:** paper-colored top bar, hairline edge, light blur only on fixed bars
- **Thumb index (phone nav):** a full-width paper strip. Each section is an icon over its name; Lineup uses the custom helmet. The active name gets a highlighter stroke in the section's color, and a short rule in that color slides along the top edge
- **Desktop sidebar:** same short names (Wire, League, Trade, Lineup, Waivers, Ask, Settings), same icon tint and highlighter, and a section-colored rule on the left edge that slides between items

- **Icons:** Lucide (ISC) plus Sources customs, all on a 24px grid with a 2px round stroke, in `src/components/icons.tsx`. Active tab thickens the stroke to 2.4; customs may fill. No second icon family

## 5. Layout Principles
- Phone first, one column, 16px gutters, 44px targets. Desktop: sidebar, main column, live wire rail
- Lists over cards. No horizontal page scroll

## 6. Gradients, Texture & Motion
Gradients are allowed only where they carry a role:
- **Section light:** each tab casts its own low light from the top of the page (Wire amber, League lavender, Trade blue, Lineup green, Waivers teal, Ask and Settings neutral) at 11 to 13% opacity, on a fixed pointer-events-none layer. The active tab in the tab bar carries the same color as a short underglow
- **Matchups:** scoreboards fade from your blue (left) to their gray (right). The win-chance bar fills your side with a blue gradient that deepens toward the split
- **Best opportunity:** the top pickup that starts for you, and "Likely yes" trade ideas, get a soft green wash from the top or corner
- **Lineup changes:** a pale yellow highlighter stroke that fades out to the right
- **Strength bars:** value bars deepen toward the end of their run
- **Primary buttons:** a faint top light so they read as pressable
- **Motion:** the one authored moment is the win-chance bar filling in when a matchup appears (700ms, strong ease-out, off under reduced motion). Presses scale to 0.98. No list entrance animations

## 7. Anti-Patterns (Banned)
- Shadows, decorative gradients with no role, gradient text, neon, glass cards, bright colored sections
- Pill-shaped buttons or containers (pills are for tags only)
- Emojis, team wordmarks, field views for lineups, em dashes in copy, AI cliches

## Night Field (current theme)
The app uses the trade card's palette on every device: one dark scheme, no light mode.
- Field: #111916 to #090C0B gradient, lime floodlight glow from the top right, faint yard lines every 120px.
- Surfaces: #141C19, #1A2420, #222E29. Hairline rgba(244,246,242,0.075).
- Ink #F4F6F2, muted #98A39B, faint #5E6A62.
- Floodlight lime #D8F24A is the one accent: you, primary actions, your next move. Anything on lime uses dark ink #0D1311.
- Gains mint #7BE08F, warnings #F2BE55, losses #FF8473. Turf #1F6B47 for brand moments.
- Every tab shares the lime section light. The shareable trade card and the app always match.
- Lime is rationed: your score and dot, the active tab, the one main action per screen, gains. Repeated actions in lists use the tinted lime button. Labels, links and panels stay in chalk.
- Sheets: pull down from anywhere once scrolled to the top, or tap outside, to dismiss. No confirmation step unless an action can't be undone.
