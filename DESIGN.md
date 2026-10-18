# Design System: Sources, Your Fantasy Insider

## 1. Visual Theme & Atmosphere
"Tactical Telemetry." Industrial brutalism on a dead CRT: a classified scouting terminal, not a consumer app. Dark substrate only. Every zone is a visible compartment with hard 1px rules. Headers are heavy, uppercase and compressed into solid blocks; data is monospaced, uppercase and tracked like a typewriter. Density is high (7 of 10). Motion is restrained (2 of 10): presses translate 1px, nothing loops.

## 2. Color Palette & Roles
- **Dead CRT** (#0B0B0B): app canvas. Never pure black
- **Panel** (#111111), **Raised** (#191919), **Pressed** (#232323): compartments and fills
- **White Phosphor** (#EAEAEA): primary text, selected chips, secondary bars
- **Muted** (#8E8E8E) and **Faint** (#5C5C5C): metadata, bench slots, rank numbers
- **Rule** (rgba(234,234,234,0.14)): every divider and compartment border
- **Hazard Red** (#FF2A2A): the only accent. Your side, active tab, primary button, swap rows, IR, losses, bracket marks
- **Terminal Green** (#4AF626): gains only (value up, points added). Never body text
- **Caution Amber** (#FFB020): questionable tags only

Position color is gone. Positions read from the mono tag, not a tint.

## 3. Typography Rules
- **Macro:** Archivo Black, uppercase, tracking -0.045em, leading 0.88, `clamp(2.6rem, 11vw, 4.75rem)` for page titles. Section titles in the same face at small sizes
- **Body:** Archivo 400 to 700 for names and sentences
- **Micro:** JetBrains Mono, uppercase, tracking 0.06em, 9 to 12px. All metadata, labels, nav, buttons, chips, projections
- **Framing:** eyebrows wrapped as `[ LABEL ]` with red brackets

## 4. Component Stylings
- **Corners:** 0 everywhere, avatars included
- **Compartments:** 1px rule border, flat panel fill, no shadows, no gradients, no blur
- **Buttons:** square, mono uppercase. Primary is hazard red with dark text; secondary is outlined
- **Chips and segments:** joined square cells; selected inverts to phosphor on canvas
- **Slot tags:** outlined mono boxes. Bench and taxi faint, IR red
- **Lineup rows:** swap rows get a red wash and a 3px red rail. Byes read BYE with no number
- **Avatars:** square mugshot frames, slightly desaturated, team logo badge
- **Tab bar (phone):** docked full width, phosphor top rule, mono labels split by rules, red top indicator on the active tab

## 5. Layout Principles
- Phone first, one column, 16px gutters, 44px targets. Desktop: sidebar, main, live wire rail
- Lists over cards; compartments only where a group needs separation
- No horizontal page scroll

## 6. Texture & Motion
- Fixed, pointer-events-none scanline overlay on `body::after`
- Press feedback: translateY(1px). No entrance animations on lists

## 7. Anti-Patterns (Banned)
- Rounded corners, glass, backdrop blur, soft or tinted shadows, gradients
- A second accent; green as decoration
- Light mode
- Emojis, team wordmarks, field views for lineups, em dashes in copy, AI cliches
