// Sources icon family: Lucide (https://lucide.dev, ISC), on its 24 grid with round ends and joins and no cut-outs. The
// line weight follows the drawn size (iconStroke.ts), not Lucide's 2. Where Lucide has no fitting glyph (the Lineup
// helmet, the air vent) the drawing is ours, with every outline continuous. The football ("roster") is the logo mark.
// Animated parts carry m1 to m4 classes (icon-motion.css); lines that draw in carry pathLength 1.
import { AskIcon } from "./AskIcon";
import { useIconStroke } from "./iconStroke";

export type IconName =
  | "overview" | "headset" | "hatGlasses" | "league" | "trade" | "roster" | "check" | "x" | "lock" | "copy" | "msg" | "send" | "share" | "alert"
  | "waivers" | "ask" | "gear" | "mic" | "chev" | "group" | "app" | "plug" | "trash" | "spark" | "clock" | "eye" | "helmet" | "pen"
  | "target" | "trophy" | "values" | "activity" | "tendencies" | "switch" | "plus" | "search" | "bell" | "bookmark"
  | "download" | "image" | "mail" | "star" | "airVent"
  | "userPlus" | "table" | "listOrdered" | "columns2";

const ICONS: Record<IconName, string> = {
  // Overview: Lucide layout-panel-left. The tall panel (m1) opens out from its left edge, then the two cells (m2, m3)
  // slide in after it, top first.
  overview: "<rect class=\"m1\" width=\"7\" height=\"18\" x=\"3\" y=\"3\" rx=\"1\"/><rect class=\"m2\" width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\"/><rect class=\"m3\" width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\"/>", // layout-panel-left
  // Command center (the Overview page tab): Lucide headset, both paths as drawn.
  headset: "<path d=\"M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z\"/><path d=\"M21 16v2a4 4 0 0 1-4 4h-5\"/>", // headset
  // League: Lucide landmark, paths in Lucide's order. The four columns (m1 to m4, left to right) rise from the floor
  // in turn under a still roof and base.
  // Intel (the Overview page tab): Lucide hat-glasses, paths as drawn.
  hatGlasses: "<path d=\"M14 18a2 2 0 0 0-4 0\"/><path d=\"m19 11-2.11-6.657a2 2 0 0 0-2.752-1.148l-1.276.61A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.925 1.456L5 11\"/><path d=\"M2 11h20\"/><circle cx=\"17\" cy=\"18\" r=\"3\"/><circle cx=\"7\" cy=\"18\" r=\"3\"/>", // hat-glasses
  league: "<path class=\"m2\" d=\"M10 18v-7\"/><path d=\"M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z\"/><path class=\"m3\" d=\"M14 18v-7\"/><path class=\"m4\" d=\"M18 18v-7\"/><path d=\"M3 22h18\"/><path class=\"m1\" d=\"M6 18v-7\"/>", // landmark
  trade: "<g class=\"m1\"><path d=\"m16 3 4 4-4 4\"/><path d=\"M20 7H4\"/></g><g class=\"m2\"><path d=\"m8 21-4-4 4-4\"/><path d=\"M4 17h16\"/></g>", // arrow-right-left
  // Waivers: Lucide square-text (the old Wire glyph). The three lines (m1 to m3, pathLength 1) write in, top to bottom.
  waivers: "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path class=\"m1\" pathLength=\"1\" d=\"M7 8h8\"/><path class=\"m2\" pathLength=\"1\" d=\"M7 12h10\"/><path class=\"m3\" pathLength=\"1\" d=\"M7 16h6\"/>", // square-text
  spark: "", // drawn by AskIcon (Lucide messages-square)
  app: "<rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/><path d=\"M10 4v4\"/><path d=\"M2 8h20\"/><path d=\"M6 4v4\"/>", // app-window
  clock: "<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/>", // clock
  // Bell: Lucide bell. The dome (m1) swings from its crown at (12, 2); the clapper (m2) hangs from the lip at (12, 17).
  bell: "<g class=\"m1\"><path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\"/><g class=\"m2\"><path d=\"M10.268 21a2 2 0 0 0 3.464 0\"/></g></g>", // bell
  search: "<g class=\"m1\"><path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/></g>", // search
  gear: "<g class=\"m1\"><path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></g>", // settings
  // Lineup helmet: Zach's Figma glyph (Nav / Icon, Icon=Lineup 27:2204), path for path. Was: the shell runs on into the facemask at the top and at the chin, so the
  // outline is continuous. m1 charges, m2 (the mask) snaps, m3 are speed lines hidden at rest.
  helmet: "<g class=\"m1\"><path d=\"M10 20.25H5.27C4.17 20.25 3.18 19.37 3.18 18.16V17.28C3.18 16.73 3.07 16.29 2.74 15.85C1.75 14.64 1.2 12.99 1.2 11.12C1.2 5.95 5.05 1.66 10.22 1.66C13.7273 1.66 16.9248 3.82843 18.6429 7.25555\"/><g class=\"m2\"><path d=\"M21.6 10.8H13.2L15.8 14.6H22.2L21.2 19.8H15.8L11.4 13.6M19.4 14.6L18.6 19.8\"/></g></g><path class=\"m3\" opacity=\"0\" d=\"M-1.8 8.6h-2.4M-1.2 12.2h-3.6M-1.8 15.8h-2.4\"/>",
  group: "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>", // users
  values: "<path d=\"M16 7h6v6\"/><path d=\"m22 7-8.5 8.5-5-5L2 17\"/>", // trending-up
  lock: "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>", // lock
  switch: "<path d=\"m7 15 5 5 5-5\"/><path d=\"m7 9 5-5 5 5\"/>", // chevrons-up-down
  chev: "<path class=\"m1\" d=\"m9 18 6-6-6-6\"/>", // chevron-right
  x: "<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>", // x
  columns2: "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M12 3v18\"/>", // columns-2
  check: "<path d=\"M20 6 9 17l-5-5\"/>", // check
  bookmark: "<path d=\"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z\"/>", // bookmark
  // Star (Waivers "Watching"): Lucide star, one closed outline, so the watched fill has no notch.
  star: "<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\"/>", // star
  // Air vent (ours, unused for now; Lucide's air-vent has no airflow to animate): a closed wall unit and three airflow
  // lines (m1 to m3, pathLength 1) that draw and flow down on hover (icon-air-vent.css).
  airVent: "<path d=\"M6 4H18A2 2 0 0 1 20 6V8.5A2 2 0 0 1 18 10.5H6A2 2 0 0 1 4 8.5V6A2 2 0 0 1 6 4ZM7 8H17\"/><path class=\"m1\" pathLength=\"1\" d=\"M8.6 12.75C8.6 14.63 6.85 14.63 6.85 16.5S8.6 18.38 8.6 20.25\"/><path class=\"m2\" pathLength=\"1\" d=\"M12.85 12.75C12.85 14.94 11.1 14.94 11.1 17.13S12.85 19.31 12.85 21.5\"/><path class=\"m3\" pathLength=\"1\" d=\"M17.1 12.75C17.1 14.63 15.35 14.63 15.35 16.5S17.1 18.38 17.1 20.25\"/>",
  plus: "<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>", // plus
  // Player sheet tabs: Claim, Game log, Depth chart
  userPlus: "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M19 8v6\"/><path d=\"M22 11h-6\"/>", // user-plus
  table: "<path d=\"M12 3v18\"/><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M3 9h18\"/><path d=\"M3 15h18\"/>", // table
  listOrdered: "<path d=\"M10 12h11\"/><path d=\"M10 18h11\"/><path d=\"M10 6h11\"/><path d=\"M4 10h2\"/><path d=\"M4 6h1v4\"/><path d=\"M6 18H4c0-1 2-2 2-3s-1-1.5-2-1\"/>", // list-ordered
  alert: "<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>", // triangle-alert
  eye: "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>", // eye
  send: "<path d=\"m5 12 7-7 7 7\"/><path d=\"M12 19V5\"/>", // arrow-up
  msg: "<path d=\"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z\"/><path d=\"M7 11h10\"/><path d=\"M7 15h6\"/><path d=\"M7 7h8\"/>", // message-square-text
  ask: "", // drawn by AskIcon (Lucide messages-square)
  trophy: "<path d=\"M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2\"/><path d=\"M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2\"/><path d=\"M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3\"/><path d=\"M4 22h16\"/><path d=\"M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z\"/><path d=\"M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3\"/>", // trophy
  target: "<circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"12\" r=\"6\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>", // target
  activity: "<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\"/>", // activity
  copy: "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>", // copy
  share: "<path d=\"M12 2v13\"/><path d=\"m16 6-4-4-4 4\"/><path d=\"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8\"/>", // share
  download: "<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>", // download
  image: "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>", // image
  mail: "<path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\"/><rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/>", // mail
  trash: "<path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M3 6h18\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>", // trash
  pen: "<g class=\"m1\"><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/></g><path class=\"m2\" pathLength=\"1\" d=\"M13 21h8\"/>", // pencil-line
  plug: "<path d=\"M12 22v-5\"/><path d=\"M15 8V2\"/><path d=\"M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z\"/><path d=\"M9 8V2\"/>", // plug
  mic: "<path d=\"M12 19v3\"/><path d=\"M19 10v2a7 7 0 0 1-14 0v-2\"/><rect x=\"9\" y=\"2\" width=\"6\" height=\"13\" rx=\"3\"/>", // mic
  tendencies: "<path d=\"M2 5q2.5 2 5 0t5 0 5 0 5 0\"/><path d=\"M2 12q2.5 2 5 0t5 0 5 0 5 0\"/><path d=\"M2 19q2.5 2 5 0t5 0 5 0 5 0\"/>", // waves-horizontal
  // Lineup: two generic helmets facing off in profile: dome with crown stripe, flared rear lip, open jaw, two-bar cage. The middle ticks are the "clack", hidden at rest.
  roster: "<g transform=\"translate(12 12) scale(0.235)\" style=\"stroke-width: calc(var(--ic-sw) * 1px / var(--ic-k, 1) / 0.235)\"><path d=\"M-4.35 -2.34 -4.73 -2.52 -5.11 -2.7 -5.5 -2.87 -5.88 -3.03 -6.25 -3.2 -6.63 -3.35 -7 -3.5 -7.38 -3.65 -7.75 -3.79 -8.11 -3.93 -8.48 -4.06 -8.85 -4.18 -9.21 -4.31 -9.57 -4.42 -9.93 -4.53 -10.28 -4.64 -10.64 -4.74 -10.99 -4.84 -11.34 -4.93 -11.69 -5.02 -12.04 -5.1 -12.38 -5.17 -12.73 -5.25 -13.07 -5.31 -13.41 -5.38 -13.74 -5.44 -14.08 -5.49 -14.41 -5.54 -14.74 -5.58 -15.07 -5.62 -15.4 -5.65 -15.72 -5.68 -16.04 -5.71 -16.36 -5.73 -16.68 -5.75 -16.99 -5.76 -17.31 -5.76 -17.62 -5.77 -17.93 -5.76 -18.23 -5.76 -18.54 -5.74 -18.84 -5.73 -19.14 -5.71 -19.44 -5.68 -19.73 -5.65 -20.03 -5.62 -20.32 -5.58 -20.6 -5.53 -20.89 -5.49 -21.17 -5.43 -21.46 -5.38 -21.73 -5.32 -22.01 -5.25 -22.28 -5.18 -22.56 -5.11 -22.83 -5.03 -23.09 -4.95 -23.36 -4.86 -23.62 -4.77 -23.88 -4.67 -24.13 -4.57 -24.39 -4.47 -24.64 -4.36 -24.89 -4.25 -25.14 -4.13 -25.38 -4.01 -25.62 -3.89 -25.86 -3.76 -26.1 -3.62 -26.33 -3.48 -26.56 -3.34 -26.79 -3.2 -26.83 -3.24 -26.64 -3.74 -26.45 -4.24 -26.24 -4.73 -26.03 -5.23 -25.82 -5.72 -25.6 -6.21 -25.37 -6.69 -25.14 -7.18 -24.9 -7.66 -24.66 -8.14 -24.41 -8.61 -24.16 -9.09 -23.9 -9.56 -23.63 -10.03 -23.36 -10.49 -23.08 -10.95 -22.79 -11.41 -22.5 -11.86 -22.21 -12.31 -21.91 -12.76 -21.6 -13.2 -21.29 -13.64 -20.97 -14.08 -20.65 -14.51 -20.32 -14.94 -19.99 -15.36 -19.65 -15.78 -19.3 -16.2 -18.96 -16.61 -18.6 -17.02 -18.24 -17.42 -17.88 -17.82 -17.51 -18.21 -17.13 -18.6 -16.75 -18.98 -16.37 -19.36 -15.98 -19.73 -15.59 -20.1 -15.19 -20.47 -14.79 -20.83 -14.39 -21.18 -13.98 -21.53 -13.56 -21.87 -13.14 -22.21 -12.72 -22.54 -12.3 -22.87 -11.87 -23.2 -11.43 -23.51 -11 -23.83 -10.56 -24.13 -10.11 -24.44 -9.67 -24.73 -9.22 -25.02 -8.76 -25.31 -8.31 -25.59 -7.85 -25.86 -7.39 -26.13 -6.93 -26.39 -6.46 -26.65 -5.99 -26.9 -5.52 -27.15 -5.05 -27.39 -4.58 -27.63 -4.1 -27.86 -3.62 -28.08 -3.14 -28.3 -2.66 -28.51 -2.18 -28.72 -1.7 -28.93 -1.22 -29.12 -0.73 -29.31 -0.25 -29.5 0.24 -29.68 0.72 -29.86 1.21 -30.02 1.7 -30.19 2.18 -30.35 2.67 -30.5 3.15 -30.65 3.64 -30.79 4.12 -30.93 4.61 -31.06 5.09 -31.19 5.57 -31.31 6.05 -31.43 6.53 -31.54 7.01 -31.65 7.48 -31.75 7.96 -31.85 8.43 -31.94 8.9 -32.03 9.37 -32.11 9.83 -32.19 10.29 -32.26 10.75 -32.33 11.21 -32.39 11.66 -32.45 12.11 -32.51 12.56 -32.56 13 -32.6 13.44 -32.65 13.87 -32.68 14.3 -32.72 14.73 -32.75 15.15 -32.77 15.57 -32.79 15.98 -32.81 16.39 -32.83 16.79 -32.84 17.19 -32.84 17.58 -32.85 17.96 -32.85 18.34 -32.84 18.72 -32.84 19.09 -32.83 19.45 -32.81 19.8 -32.8 20.15 -32.78 20.49 -32.76 20.83 -32.73 21.16 -32.71 21.48 -32.68 21.79 -32.64 22.1 -32.61 22.39 -32.57 22.68 -32.53 22.96 -32.49 23.24 -32.45 23.5 -32.41 23.76 -32.36 24 -32.32 24.24 -32.27 24.47 -32.22 24.68 -32.17 24.89 -32.12 25.09 -32.07 25.27 -32.02 25.45 -31.97 25.62 -31.92 25.77 -31.87 25.91 -31.82 26.04 -31.77 26.15 -31.72 26.25 -31.68 26.34 -31.64 26.41 -31.61 26.46 -31.58 26.48 -31.56 26.5 -31.54 26.54 -31.5 26.59 -31.43 26.64 -31.36 26.7 -31.26 26.77 -31.16 26.83 -31.04 26.91 -30.91 26.98 -30.77 27.06 -30.62 27.14 -30.45 27.23 -30.28 27.31 -30.09 27.4 -29.89 27.48 -29.69 27.57 -29.47 27.66 -29.25 27.75 -29.01 27.84 -28.77 27.92 -28.52 28.01 -28.26 28.1 -27.99 28.19 -27.71 28.28 -27.42 28.36 -27.13 28.45 -26.83 28.53 -26.52 28.62 -26.2 28.7 -25.87 28.78 -25.54 28.86 -25.2 28.94 -24.85 29.01 -24.5 29.09 -24.14 29.16 -23.77 29.23 -23.4 29.3 -23.02 29.36 -22.63 29.42 -22.24 29.48 -21.84 29.54 -21.44 29.59 -21.03 29.64 -20.61 29.69 -20.19 29.74 -19.77 29.78 -19.34 29.82 -18.9 29.85 -18.46 29.88 -18.02 29.91 -17.57 29.93 -17.12 29.95 -16.66 29.97 -16.2 29.98 -15.74 29.99 -15.27 30 -14.8 30 -14.33 29.99 -13.85 29.98 -13.37 29.97 -12.88 29.95 -12.4 29.93 -11.91 29.9 -11.42 29.87 -10.92 29.83 -10.43 29.79 -9.93 29.74 -9.43 29.69 -8.93 29.64 -8.43 29.57 -7.92 29.51 -7.42 29.44 -6.91 29.36 -6.41 29.28 -5.9 29.19 -5.39 29.09 -4.88\"/><path d=\"M-5.65 -14.2 -5.36 -14.42 -5.08 -14.64 -4.79 -14.86 -4.5 -15.07 -4.21 -15.28 -3.91 -15.48 -3.62 -15.69 -3.32 -15.89 -3.02 -16.08 -2.73 -16.28 -2.43 -16.46 -2.13 -16.65 -1.82 -16.83 -1.52 -17.01 -1.22 -17.19 -0.91 -17.36 -0.61 -17.53 -0.3 -17.7 0 -17.86 0.31 -18.02 0.61 -18.17 0.92 -18.33 1.23 -18.47 1.54 -18.62 1.84 -18.76 2.15 -18.9 2.46 -19.03 2.76 -19.17 3.07 -19.29 3.38 -19.42 3.68 -19.54 3.99 -19.66 4.29 -19.77 4.59 -19.88 4.9 -19.99 5.2 -20.1 5.5 -20.2 5.8 -20.3 6.1 -20.39 6.39 -20.48 6.69 -20.57 6.98 -20.66 7.27 -20.74 7.56 -20.82 7.85 -20.89 8.14 -20.97 8.42 -21.03 8.71 -21.1 8.99 -21.16 9.26 -21.23 9.54 -21.28 9.81 -21.34 10.08 -21.39 10.35 -21.44 10.62 -21.48 10.88 -21.53 11.32 -21.6 11.77 -21.66 12.22 -21.72 12.67 -21.78 13.13 -21.83 13.58 -21.87 14.04 -21.91 14.49 -21.95 14.94 -21.98 15.4 -22 15.85 -22.02 16.3 -22.04 16.76 -22.04 17.2 -22.05 17.65 -22.04 18.1 -22.03 18.54 -22.01 18.98 -21.99 19.41 -21.95 19.84 -21.92 20.27 -21.87 20.69 -21.82 21.11 -21.76 21.52 -21.69 21.93 -21.61 22.33 -21.53 22.72 -21.44 23.11 -21.34 23.49 -21.23 23.86 -21.11 24.23 -20.99 24.59 -20.85 24.94 -20.71 25.28 -20.55 25.61 -20.39 25.93 -20.22 26.25 -20.04 26.55 -19.85 26.84 -19.65 27.12 -19.44 27.39 -19.22 27.65 -18.99 27.9 -18.74 28.13 -18.49 28.36 -18.23 28.57 -17.95 28.76 -17.67 28.95 -17.37 29.12 -17.07 29.27 -16.75 29.41 -16.41 29.54 -16.07 29.65 -15.72 29.74 -15.35 29.82 -14.97 29.89 -14.58 29.93 -14.17 29.96 -13.76 29.97 -13.33 29.97 -12.88\"/><path d=\"M4.35 2.34 4.73 2.52 5.11 2.7 5.5 2.87 5.88 3.03 6.25 3.2 6.63 3.35 7 3.5 7.38 3.65 7.75 3.79 8.11 3.93 8.48 4.06 8.85 4.18 9.21 4.31 9.57 4.42 9.93 4.53 10.28 4.64 10.64 4.74 10.99 4.84 11.34 4.93 11.69 5.02 12.04 5.1 12.38 5.17 12.73 5.25 13.07 5.31 13.41 5.38 13.74 5.44 14.08 5.49 14.41 5.54 14.74 5.58 15.07 5.62 15.4 5.65 15.72 5.68 16.04 5.71 16.36 5.73 16.68 5.75 16.99 5.76 17.31 5.76 17.62 5.77 17.93 5.76 18.23 5.76 18.54 5.74 18.84 5.73 19.14 5.71 19.44 5.68 19.73 5.65 20.03 5.62 20.32 5.58 20.6 5.53 20.89 5.49 21.17 5.43 21.46 5.38 21.73 5.32 22.01 5.25 22.28 5.18 22.56 5.11 22.83 5.03 23.09 4.95 23.36 4.86 23.62 4.77 23.88 4.67 24.13 4.57 24.39 4.47 24.64 4.36 24.89 4.25 25.14 4.13 25.38 4.01 25.62 3.89 25.86 3.76 26.1 3.62 26.33 3.48 26.56 3.34 26.79 3.2 26.83 3.24 26.64 3.74 26.45 4.24 26.24 4.73 26.03 5.23 25.82 5.72 25.6 6.21 25.37 6.69 25.14 7.18 24.9 7.66 24.66 8.14 24.41 8.61 24.16 9.09 23.9 9.56 23.63 10.03 23.36 10.49 23.08 10.95 22.79 11.41 22.5 11.86 22.21 12.31 21.91 12.76 21.6 13.2 21.29 13.64 20.97 14.08 20.65 14.51 20.32 14.94 19.99 15.36 19.65 15.78 19.3 16.2 18.96 16.61 18.6 17.02 18.24 17.42 17.88 17.82 17.51 18.21 17.13 18.6 16.75 18.98 16.37 19.36 15.98 19.73 15.59 20.1 15.19 20.47 14.79 20.83 14.39 21.18 13.98 21.53 13.56 21.87 13.14 22.21 12.72 22.54 12.3 22.87 11.87 23.2 11.43 23.51 11 23.83 10.56 24.13 10.11 24.44 9.67 24.73 9.22 25.02 8.76 25.31 8.31 25.59 7.85 25.86 7.39 26.13 6.93 26.39 6.46 26.65 5.99 26.9 5.52 27.15 5.05 27.39 4.58 27.63 4.1 27.86 3.62 28.08 3.14 28.3 2.66 28.51 2.18 28.72 1.7 28.93 1.22 29.12 0.73 29.31 0.25 29.5 -0.24 29.68 -0.72 29.86 -1.21 30.02 -1.7 30.19 -2.18 30.35 -2.67 30.5 -3.15 30.65 -3.64 30.79 -4.12 30.93 -4.61 31.06 -5.09 31.19 -5.57 31.31 -6.05 31.43 -6.53 31.54 -7.01 31.65 -7.48 31.75 -7.96 31.85 -8.43 31.94 -8.9 32.03 -9.37 32.11 -9.83 32.19 -10.29 32.26 -10.75 32.33 -11.21 32.39 -11.66 32.45 -12.11 32.51 -12.56 32.56 -13 32.6 -13.44 32.65 -13.87 32.68 -14.3 32.72 -14.73 32.75 -15.15 32.77 -15.57 32.79 -15.98 32.81 -16.39 32.83 -16.79 32.84 -17.19 32.84 -17.58 32.85 -17.96 32.85 -18.34 32.84 -18.72 32.84 -19.09 32.83 -19.45 32.81 -19.8 32.8 -20.15 32.78 -20.49 32.76 -20.83 32.73 -21.16 32.71 -21.48 32.68 -21.79 32.64 -22.1 32.61 -22.39 32.57 -22.68 32.53 -22.96 32.49 -23.24 32.45 -23.5 32.41 -23.76 32.36 -24 32.32 -24.24 32.27 -24.47 32.22 -24.68 32.17 -24.89 32.12 -25.09 32.07 -25.27 32.02 -25.45 31.97 -25.62 31.92 -25.77 31.87 -25.91 31.82 -26.04 31.77 -26.15 31.72 -26.25 31.68 -26.34 31.64 -26.41 31.61 -26.46 31.58 -26.48 31.56 -26.5 31.54 -26.54 31.5 -26.59 31.43 -26.64 31.36 -26.7 31.26 -26.77 31.16 -26.83 31.04 -26.91 30.91 -26.98 30.77 -27.06 30.62 -27.14 30.45 -27.23 30.28 -27.31 30.09 -27.4 29.89 -27.48 29.69 -27.57 29.47 -27.66 29.25 -27.75 29.01 -27.84 28.77 -27.92 28.52 -28.01 28.26 -28.1 27.99 -28.19 27.71 -28.28 27.42 -28.36 27.13 -28.45 26.83 -28.53 26.52 -28.62 26.2 -28.7 25.87 -28.78 25.54 -28.86 25.2 -28.94 24.85 -29.01 24.5 -29.09 24.14 -29.16 23.77 -29.23 23.4 -29.3 23.02 -29.36 22.63 -29.42 22.24 -29.48 21.84 -29.54 21.44 -29.59 21.03 -29.64 20.61 -29.69 20.19 -29.74 19.77 -29.78 19.34 -29.82 18.9 -29.85 18.46 -29.88 18.02 -29.91 17.57 -29.93 17.12 -29.95 16.66 -29.97 16.2 -29.98 15.74 -29.99 15.27 -30 14.8 -30 14.33 -29.99 13.85 -29.98 13.37 -29.97 12.88 -29.95 12.4 -29.93 11.91 -29.9 11.42 -29.87 10.92 -29.83 10.43 -29.79 9.93 -29.74 9.43 -29.69 8.93 -29.64 8.43 -29.57 7.92 -29.51 7.42 -29.44 6.91 -29.36 6.41 -29.28 5.9 -29.19 5.39 -29.09 4.88\"/><path d=\"M5.65 14.2 5.36 14.42 5.08 14.64 4.79 14.86 4.5 15.07 4.21 15.28 3.91 15.48 3.62 15.69 3.32 15.89 3.02 16.08 2.73 16.28 2.43 16.46 2.13 16.65 1.82 16.83 1.52 17.01 1.22 17.19 0.91 17.36 0.61 17.53 0.3 17.7 -0 17.86 -0.31 18.02 -0.61 18.17 -0.92 18.33 -1.23 18.47 -1.54 18.62 -1.84 18.76 -2.15 18.9 -2.46 19.03 -2.76 19.17 -3.07 19.29 -3.38 19.42 -3.68 19.54 -3.99 19.66 -4.29 19.77 -4.59 19.88 -4.9 19.99 -5.2 20.1 -5.5 20.2 -5.8 20.3 -6.1 20.39 -6.39 20.48 -6.69 20.57 -6.98 20.66 -7.27 20.74 -7.56 20.82 -7.85 20.89 -8.14 20.97 -8.42 21.03 -8.71 21.1 -8.99 21.16 -9.26 21.23 -9.54 21.28 -9.81 21.34 -10.08 21.39 -10.35 21.44 -10.62 21.48 -10.88 21.53 -11.32 21.6 -11.77 21.66 -12.22 21.72 -12.67 21.78 -13.13 21.83 -13.58 21.87 -14.04 21.91 -14.49 21.95 -14.94 21.98 -15.4 22 -15.85 22.02 -16.3 22.04 -16.76 22.04 -17.2 22.05 -17.65 22.04 -18.1 22.03 -18.54 22.01 -18.98 21.99 -19.41 21.95 -19.84 21.92 -20.27 21.87 -20.69 21.82 -21.11 21.76 -21.52 21.69 -21.93 21.61 -22.33 21.53 -22.72 21.44 -23.11 21.34 -23.49 21.23 -23.86 21.11 -24.23 20.99 -24.59 20.85 -24.94 20.71 -25.28 20.55 -25.61 20.39 -25.93 20.22 -26.25 20.04 -26.55 19.85 -26.84 19.65 -27.12 19.44 -27.39 19.22 -27.65 18.99 -27.9 18.74 -28.13 18.49 -28.36 18.23 -28.57 17.95 -28.76 17.67 -28.95 17.37 -29.12 17.07 -29.27 16.75 -29.41 16.41 -29.54 16.07 -29.65 15.72 -29.74 15.35 -29.82 14.97 -29.89 14.58 -29.93 14.17 -29.96 13.76 -29.97 13.33 -29.97 12.88\"/></g>",
};

// Icons with a micro-animation (src/icon-motion.css). "nav" ones play when their tab becomes active and on hover inside
// the sidebar, tab bar or top bar. "any" ones are affordances that play on hover of whatever control holds them.
const MOTION: Partial<Record<IconName, "nav" | "any">> = {
  helmet: "nav", overview: "nav", league: "nav", trade: "nav", waivers: "nav", bell: "nav", ask: "nav", gear: "nav",
  search: "any", pen: "any", chev: "any", airVent: "any",
};

/** Optical centering, in 24-grid units, measured from each glyph's ink: centered by mass, with the ink box kept within
 *  about half a unit of center. Most Lucide glyphs already sit centered. The panel layout's two right cells carry more
 *  outline than its tall panel (mass 0.21 right), so it moves left 0.1. The landmark's base and roof sit low (mass 0.2
 *  down), so it lifts 0.15. The headset's mic arm weights it right and low (mass 0.73 right, 0.25 down), so it moves
 *  left 0.45 and up 0.25 with its box still inside half a unit. The hat-glasses' two lenses weigh it low (mass 0.84
 *  down), so it lifts 0.45, as far as its box allows. The square-text lines and the chevron lean left, the up
 *  arrow's head weights it high, the star's weight sits low (lifted 0.35, the same split of mass and box as the old
 *  star), and the closed helmet carries more ink low and right than the open one did. */
const OFFSET: Partial<Record<IconName, [number, number]>> = { overview: [-0.1, 0], league: [0, -0.15], waivers: [0.1, 0], headset: [-0.45, -0.25], hatGlasses: [0, -0.45], chev: [0.1, 0], send: [0, 0.5], star: [0, -0.35], helmet: [-0.05, 0.35] };
const inked = (name: IconName) => { const o = OFFSET[name]; return o ? `<g transform="translate(${o[0]} ${o[1]})">${ICONS[name]}</g>` : ICONS[name]; };

export function Icon({ name, size = 20, active = false }: { name: IconName; size?: number; active?: boolean }) {
  // Ask, and the mark on anything Sources writes, is the chat bubbles icon with its own hover beat (AskIcon)
  if (name === "spark" || name === "ask") return <AskIcon size={size} active={active} />;
  return <Glyph name={name} size={size} />;
}

/** The line follows the drawn size (iconStroke.ts): 0.75 at 13px and under, 1 at 14 to 16, 1.5 from 17 up. */
function Glyph({ name, size }: { name: IconName; size: number }) {
  const stroke = useIconStroke(size);
  return (
    <svg ref={stroke.ref} style={stroke.style} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke.strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`ic ic-${name}`} data-m={MOTION[name]}
      dangerouslySetInnerHTML={{ __html: inked(name) }} />
  );
}

const PLAY_MS = 900;
/** Replays an icon's animation once, by setting data-play for the length of the longest animation. */
function play(svg: Element) {
  if (svg.hasAttribute("data-play")) return;
  svg.setAttribute("data-play", "");
  window.setTimeout(() => svg.removeAttribute("data-play"), PLAY_MS);
}
/** Reduced motion: a small opacity tick instead of any movement. */
const tick = (el: Element) => (el as HTMLElement).animate?.([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });

/**
 * Hover plays (mouse only, never touch). Route-change plays are pure CSS on aria-current.
 * Reduced motion turns all of it off; the stylesheet does the same for the CSS side.
 */
export function iconMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const hover = window.matchMedia("(hover: hover) and (pointer: fine)");

  document.addEventListener("pointerover", (e) => {
    if (!hover.matches || e.pointerType !== "mouse") return;
    const control = (e.target as Element | null)?.closest?.("button, a, summary, label, [role='button'], [role='tab']");
    if (!control || control.getAttribute("aria-current") === "page") return;
    if (e.relatedTarget instanceof Node && control.contains(e.relatedTarget)) return;
    if (reduced.matches) { if (control.matches(".top-bell")) control.querySelectorAll("svg.ic-bell").forEach(tick); return; }
    // The inbox bell rings on hover wherever it sits (the desktop one lives on the page, not in the nav)
    const inNav = !!control.closest(".side, .tabbar, .topbar, .top-bell");
    control.querySelectorAll("svg.ic[data-m]").forEach((svg) => {
      if (inNav || svg.getAttribute("data-m") === "any") play(svg);
    });
  }, { passive: true });

  // A new inbox item swinging the bell and springing its dot is App's (data-ring, action-motion.css). Opening the
  // inbox is quiet, so clicks no longer ring it.
}
