# Design System: Sources, Your Fantasy Insider

## 1. Visual Theme & Atmosphere
"Almanac." Utilitarian minimalism that reads like a printed sports almanac or the Monday box scores: warm bone paper, charcoal ink, one friendly grotesk (Google Sans) for everything, and small mono labels in the margins. Color is scarce and always means something (a position, a gain, a loss, a change to make). Density 5 of 10. Motion is nearly invisible: presses scale to 0.98 and nothing loops.

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
- **Chrome:** paper-colored top bar and docked tab bar, hairline edge, light blur only on these fixed bars

## 5. Layout Principles
- Phone first, one column, 16px gutters, 44px targets. Desktop: sidebar, main column, live wire rail
- Lists over cards. No horizontal page scroll

## 6. Texture & Motion
- One fixed, pointer-events-none warm light spot in the top corner at about 10% opacity
- Press feedback scale(0.98) with a strong ease-out. No list entrance animations

## 7. Anti-Patterns (Banned)
- Shadows, gradients on content, neon, glass cards, bright colored sections
- Pill-shaped buttons or containers (pills are for tags only)
- Emojis, team wordmarks, field views for lineups, em dashes in copy, AI cliches
