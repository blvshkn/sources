# Design System: Sources, Your Fantasy Insider

## 1. Visual Theme & Atmosphere
"Press Box." A late-night broadcast booth: graphite neutrals, one warm amber light, and numbers you can read at a glance. Daily App density (5 of 10): lists are tight like a box score, but every row has room to breathe. Variance stays low inside the app (3 of 10). Familiar list patterns win over clever layouts, because people use this at 12:58 on a Sunday. Motion is Fluid CSS (4 of 10): rows rise in once, buttons press, nothing loops for show.

Dark is the home theme. Light is a daylight press box with the same hierarchy, never an inversion.

## 2. Color Palette & Roles
Dark
- **Graphite Night** (#0C0D10): app canvas
- **Booth Panel** (#15171C): cards, lists, sheets
- **Raised Panel** (#1D2027): inner blocks, projection boxes, skeletons
- **Pressed Panel** (#272A33): active and selected fills
- **Chalk Ink** (#F2F3F5): primary text and primary button fill
- **Steel Muted** (#9097A3): metadata, team abbreviations, helper copy
- **Faint Rail** (#5E6470): rank numbers, empty values, bench slot labels
- **Hairline** (rgba(255,255,255,0.07)): dividers and card rings
- **Press Box Amber** (#E3A443): the one accent. Your side of a matchup, swap rails, focus rings, "per sources" stamps
- **Opponent Slate** (#8B95A7): the other side of any comparison. A neutral, not a second accent

Light
- Canvas #F4F5F7, Panel #FFFFFF, Raised #ECEEF1, Ink #14161A, Muted #5F6672, Faint #9AA0AA, Amber #A8700F (text-safe), Slate #6B7486

Status (data, not decoration): Gain Green #3CC27E / #1E8E52, Loss Red #EF5D52 / #C9372D, Caution Orange #EE8B3A / #B9601A.
Position tints, always at 22% over the panel with the full color as text: QB #E06A86, RB #3FBFA2, WR #6E95E8, TE #E39A55, K #9C8CE0, DEF uses Opponent Slate.

## 3. Typography Rules
- **Display:** Geist 700, tracking -0.04em on page titles, -0.045em on big numerals. Hierarchy comes from weight and color before size.
- **Body:** Geist 400 to 600 at 15px, leading 1.5, max 65 characters.
- **Mono:** Geist Mono for stat lines ("22/28, 363 yd, 4 TD") and other dense numeric metadata.
- **Numbers:** tabular figures everywhere a number can change.
- **Banned:** Inter, any serif, all-caps headlines. Small caps labels only on stat strips.

## 4. Component Stylings
- **Buttons:** full pills. Primary is Chalk Ink on dark and Ink on light, never amber. Press scales to 0.97. No glows.
- **Cards:** 20px corners, no border. A 1px hairline ring plus a soft tinted drop, and a lit top edge in dark mode. Inner blocks use 12px corners.
- **Lineup rows:** slot pill, jersey, name with position and team, projection on the right. Byes read BYE with no number. Rows needing a Sleeper change get a 3px amber rail and the swap line underneath.
- **Jerseys:** team palette only, real numbers from Sleeper, no logos or wordmarks.
- **Chips and segmented controls:** pill shapes. The selected chip inverts to Ink on canvas.
- **Inputs:** label above, error below, amber focus ring.
- **Loaders:** skeleton rows the exact height of a lineup row. No spinners.
- **Empty states:** one plain sentence saying what's missing and how to fill it.

## 5. Layout Principles
- Phone first: one column, a floating glass tab bar, 16px side gutters, 44px minimum touch targets.
- Desktop: sidebar, main column, live wire rail. Content max width 1400px.
- Lists over cards. Group with hairlines and space; cards only where a group needs to lift off the canvas.
- No horizontal page scroll. Chip rows scroll inside their own track.

## 6. Motion & Interaction
- Ease: cubic-bezier(0.32, 0.72, 0, 1) for UI transitions; springs (damping 1.0, response 0.4) for sheets and drags.
- Lists rise in once on mount, 30ms apart, capped at 180ms.
- Hover tints rows on pointer devices only. Press feedback on every tappable row and button.
- Transform and opacity only. Everything collapses to a crossfade under reduced motion.

## 7. Anti-Patterns (Banned)
- No emojis, no Inter, no serif, no pure black
- No second accent color, no purple or neon glows, no gradient headline text
- No team logos or trademarked marks
- No field or formation views for setting a lineup; the list is the lineup
- No internal labels in the UI ("v1 preview", phase badges)
- No fake precision, no "John Doe" names, no AI cliches ("elevate", "seamless", "unleash")
- No em dashes in copy
- No scroll cues, bouncing chevrons or perpetual decorative loops
