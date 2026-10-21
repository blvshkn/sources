// Sources icon family, drawn to match the logo: 24px grid, one thin even line (1.6px), flat cut ends,
// round joins, softened corners, parallel lanes and seam curves where a shape allows. Dots are tiny filled
// circles because flat ends hide zero length strokes. The football ("roster") is the logo mark itself.

import { AskIcon } from "./AskIcon";

export type IconName =
  | "wire" | "league" | "trade" | "roster" | "check" | "x" | "lock" | "copy" | "msg" | "send" | "share" | "alert"
  | "waivers" | "ask" | "gear" | "mic" | "chev" | "group" | "app" | "plug" | "trash" | "spark" | "clock" | "eye" | "helmet" | "pen"
  | "target" | "trophy" | "values" | "activity" | "tendencies" | "switch" | "plus" | "search" | "bell" | "bookmark"
  | "download" | "image" | "mail" | "star" | "airVent";

const ICONS: Record<IconName, string> = {
  wire: "<path d=\"M20 17.5C20 19.433 18.433 21 16.5 21H7.5C5.567 21 4 19.433 4 17.5V14.75M20 13.5V6.5C20 4.567 18.433 3 16.5 3H7.5C5.567 3 4 4.567 4 6.5V9.25\"/><path class=\"m1\" pathLength=\"1\" d=\"M8 8.5h8\"/><path class=\"m2\" pathLength=\"1\" d=\"M8 12h8\"/><path class=\"m3\" pathLength=\"1\" d=\"M8 15.5h4.5\"/>",
  league: "<path class=\"m1\" d=\"M10.5 6C10.5 4.61929 9.38071 3.5 8 3.5H6C4.61929 3.5 3.5 4.61929 3.5 6V8M10.5 8C10.5 9.38071 9.38071 10.5 8 10.5H6\"/><rect class=\"m2\" x=\"13.5\" y=\"3.5\" width=\"7\" height=\"7\" rx=\"2.5\"/><rect class=\"m4\" x=\"3.5\" y=\"13.5\" width=\"7\" height=\"7\" rx=\"2.5\"/><rect class=\"m3\" x=\"13.5\" y=\"13.5\" width=\"7\" height=\"7\" rx=\"2.5\"/>",
  trade: "<path class=\"m1\" d=\"M4 8.5H8M15.5 11.5L18.5 8.5L15.5 5.5M18.5 8.5H10.5\"/><path class=\"m2\" d=\"M20 15.5H14.5M8.5 18.5L5.5 15.5L8.5 12.5M5.5 15.5H11.5\"/>",
  waivers: "<circle class=\"m2\" cx=\"12\" cy=\"12\" r=\"8.5\"/><path class=\"m1\" d=\"M12 8V16M8 12H10M16 12H14\"/>",
  spark: "", // drawn by AskIcon
  app: "<rect x=\"3\" y=\"4.5\" width=\"18\" height=\"15\" rx=\"3.5\"/><path d=\"M3 9.5h18M7 13.5h6\"/>",
  clock: "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/>",
  // Bell: the dome (m1) swings from its hanger at (12, 3.6); the clapper (m2) hangs from the lip at (12, 17.1) and swings
  // against it. Drawn centred in the 24 box: dome top 3.6 to clapper bottom 20.4.
  bell: "<g class=\"m1\"><path d=\"M6.5 7.20208C6.7972 6.52039 7.22133 5.89339 7.75736 5.35736C8.88258 4.23214 10.4087 3.6 12 3.6C13.5913 3.6 15.1174 4.23214 16.2426 5.35736C17.3679 6.48258 18 8.0087 18 9.6V15.1L19.5 17.1H4.5L6 15.1V11.5\"/><g class=\"m2\"><path d=\"M10 19.1C10.1755 19.483 10.4573 19.8075 10.8118 20.035C11.1663 20.2625 11.5787 20.3835 12 20.3835C12.4213 20.3835 12.8337 20.2625 13.1882 20.035C13.5427 19.8075 13.8245 19.483 14 19.1\"/></g></g>",
  search: "<g class=\"m1\"><circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"M16 16L20 20\"/></g>",
  gear: "<g class=\"m1\"><path d=\"M10.2 3.5L9.6 5.9L7.8 6.9L5.5 6.1L3.7 9.2L5.5 10.8V13.2L3.7 14.8L4.6 16.35L5.5 17.9L6.65 17.5L7.8 17.1M9.9 19.3L10.2 20.5H13.8L14.4 18.1L16.2 17.1L18.5 17.9L20.3 14.8L18.5 13.2V10.8L20.3 9.2L18.5 6.1L16.2 6.9L14.4 5.9L13.8 3.5H12.9\"/><path d=\"M14.8 12C14.8 12.7629 14.4949 13.4546 14 13.9596C13.4918 14.4782 12.7835 14.8 12 14.8C11.2165 14.8 10.5082 14.4782 10 13.9596C9.50513 13.4546 9.2 12.7629 9.2 12C9.2 11.2371 9.50513 10.5454 10 10.0404C10.5082 9.52179 11.2165 9.2 12 9.2\"/></g>",
  helmet: "<g class=\"m1\"><path d=\"M10 20.25H5.27C4.17 20.25 3.18 19.37 3.18 18.16V17.28C3.18 16.73 3.07 16.29 2.74 15.85C1.75 14.64 1.2 12.99 1.2 11.12C1.2 5.95 5.05 1.66 10.22 1.66C13.7273 1.66 16.9248 3.82843 18.6429 7.25555\"/><g class=\"m2\"><path d=\"M21.6 10.8H13.2L15.8 14.6H22.2L21.2 19.8H15.8L11.4 13.6M19.4 14.6L18.6 19.8\"/></g></g><path class=\"m3\" opacity=\"0\" d=\"M-1.8 8.6h-2.4M-1.2 12.2h-3.6M-1.8 15.8h-2.4\"/>",
  group: "<circle cx=\"9\" cy=\"8\" r=\"3.5\"/><path d=\"M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6\"/><path d=\"M15.5 4.8a3.5 3.5 0 0 1 0 6.4M17.5 14.4c2.4.6 4 2.6 4 5.6\"/>",
  values: "<path d=\"M3 17l6-6 4 4 7.5-7.5\"/><path d=\"M15 7.5h5.5V13\"/>",
  lock: "<rect x=\"4\" y=\"10.5\" width=\"16\" height=\"10.5\" rx=\"3.5\"/><path d=\"M8 10.5V7.5a4 4 0 0 1 8 0v3\"/>",
  switch: "<path d=\"M7.5 9.5 12 5l4.5 4.5M7.5 14.5 12 19l4.5-4.5\"/>",
  chev: "<path class=\"m1\" d=\"M9.5 6l6 6-6 6\"/>",
  x: "<path d=\"M6 6L18 18M18 6L6 18\"/>",
  check: "<path d=\"M5 12.5l4.5 4.5L19 7.5\"/>",
  bookmark: "<path d=\"M6.5 6A2.5 2.5 0 0 1 9 3.5h6A2.5 2.5 0 0 1 17.5 6v14.5L12 16.8l-5.5 3.7z\"/>",
  // Star (Waivers "Watching"): the Nav / Icon line (1.25, round ends) set on its own group, points softly rounded, the
  // left arm's upper edge open at one break. Lifted 0.3 so its mass sits on center (a star's weight is low). Watched
  // fills it; st-gap closes the break only then, so the filled star has no notch.
  star: "<g stroke-width=\"1.25\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M7.26 8.84L9.12 8.74Q9.57 8.71 9.74 8.29L11.51 3.71Q12 2.45 12.49 3.71L14.26 8.29Q14.43 8.71 14.88 8.74L19.78 9.01Q21.13 9.08 20.08 9.94L16.27 13.04Q15.93 13.33 16.04 13.76L17.3 18.51Q17.64 19.82 16.51 19.08L12.38 16.42Q12 16.18 11.62 16.42L7.49 19.08Q6.36 19.82 6.7 18.51L7.96 13.76Q8.07 13.33 7.73 13.04L3.92 9.94Q2.87 9.08 4.22 9.01L5.3 8.95\"/><path class=\"st-gap\" stroke-opacity=\"0\" d=\"M5.3 8.95L7.26 8.84\"/></g>",
  // Air vent (unused for now): a wall unit open at one break on its top edge, a lip inside its bottom, three airflow
  // lines (m1 to m3, pathLength 1) that draw and flow down on hover (icon-air-vent.css). Sits 0.5 low to pull its mass
  // toward center; a vent is top-heavy, so mass 10.9 and ink box 12.75 split the difference.
  airVent: "<g stroke-width=\"1.25\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M13.75 4H6A2 2 0 0 0 4 6V8.5A2 2 0 0 0 6 10.5H18A2 2 0 0 0 20 8.5V6A2 2 0 0 0 18 4H16.5M7 8H17\"/><path class=\"m1\" pathLength=\"1\" d=\"M8.6 12.75C8.6 14.63 6.85 14.63 6.85 16.5S8.6 18.38 8.6 20.25\"/><path class=\"m2\" pathLength=\"1\" d=\"M12.85 12.75C12.85 14.94 11.1 14.94 11.1 17.13S12.85 19.31 12.85 21.5\"/><path class=\"m3\" pathLength=\"1\" d=\"M17.1 12.75C17.1 14.63 15.35 14.63 15.35 16.5S17.1 18.38 17.1 20.25\"/></g>",
  plus: "<path d=\"M12 5v14M5 12h14\"/>",
  alert: "<path d=\"M10.3 4.2a2 2 0 0 1 3.4 0l7.4 12.9a2 2 0 0 1-1.7 3H4.6a2 2 0 0 1-1.7-3z\"/><path d=\"M12 9.5v4\"/><circle cx=\"12\" cy=\"16.8\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/>",
  eye: "<path d=\"M2.5 12c2.2-4.3 5.5-6.5 9.5-6.5s7.3 2.2 9.5 6.5c-2.2 4.3-5.5 6.5-9.5 6.5S4.7 16.3 2.5 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
  send: "<path d=\"M12 19V5M18.5 11.5L12 5L5.5 11.5\"/>",
  msg: "<path d=\"M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v7a3.5 3.5 0 0 1-3.5 3.5H10l-4.5 4v-4h0A2 2 0 0 1 4 15z\"/><path d=\"M8 8.5h8M8 12h5\"/>",
  ask: "", // drawn by AskIcon
  trophy: "<path d=\"M7 3.5h10v5.5a5 5 0 0 1-10 0z\"/><path d=\"M7 5.5H4.5v1a3.5 3.5 0 0 0 3 3.5M17 5.5h2.5v1a3.5 3.5 0 0 1-3 3.5M12 14v3.5M8 20.5h8M9.5 17.5h5v3h-5z\"/>",
  target: "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><circle cx=\"12\" cy=\"12\" r=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"1.5\"/>",
  activity: "<path d=\"M3 12h4l2.5-6 5 12 2.5-6h4\"/>",
  copy: "<rect x=\"8.5\" y=\"8.5\" width=\"12\" height=\"12\" rx=\"3\"/><path d=\"M15.5 5.5A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 5.5 15.5\"/>",
  share: "<path d=\"M12 3.5v11M8 7.5l4-4 4 4\"/><path d=\"M5 12v5.5A3 3 0 0 0 8 20.5h8a3 3 0 0 0 3-3V12\"/>",
  download: "<path d=\"M12 3.5v11M8 10.5l4 4 4-4\"/><path d=\"M5 15v2.5A3 3 0 0 0 8 20.5h8a3 3 0 0 0 3-3V15\"/>",
  image: "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"3.5\"/><path d=\"M3.5 16l5-5 4.5 4.5 2.5-2.5 5 5\"/><circle cx=\"15.5\" cy=\"9\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/>",
  mail: "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"3.5\"/><path d=\"M3.5 7.5l8.5 6 8.5-6\"/>",
  trash: "<path d=\"M4 6.5h16M9.5 6.5V4.5h5v2M6 6.5l1 13a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5l1-13M10 10.5v6M14 10.5v6\"/>",
  pen: "<path class=\"m1\" d=\"M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z\"/><path class=\"m2\" pathLength=\"1\" d=\"M13 20.5h7\"/>",
  plug: "<path d=\"M9 3v4.5M15 3v4.5M6.5 7.5h11v4a5.5 5.5 0 0 1-11 0zM12 17v4\"/>",
  mic: "<path d=\"M15 6.5C15 4.84315 13.6569 3.5 12 3.5C10.3431 3.5 9 4.84315 9 6.5V11.5C9 13.1569 10.3431 14.5 12 14.5C13.6569 14.5 15 13.1569 15 11.5V6.5Z\"/><path d=\"M18.5 11.5C18.5 13.2239 17.8152 14.8772 16.5962 16.0962C15.3772 17.3152 13.7239 18 12 18C10.2761 18 8.62279 17.3152 7.40381 16.0962C6.18482 14.8772 5.5 13.2239 5.5 11.5M12 18V20.5\"/>",
  tendencies: "<path d=\"M3.5 9c2.8-3 5.7-3 8.5 0s5.7 3 8.5 0\"/><path d=\"M3.5 15c2.8-3 5.7-3 8.5 0s5.7 3 8.5 0\"/>",
  // Lineup: two generic helmets facing off in profile: dome with crown stripe, flared rear lip, open jaw, two-bar cage. The middle ticks are the "clack", hidden at rest.
  roster: "<g transform=\"translate(12 12) scale(0.235)\" stroke-width=\"7.23\"><path d=\"M-4.35 -2.34 -4.73 -2.52 -5.11 -2.7 -5.5 -2.87 -5.88 -3.03 -6.25 -3.2 -6.63 -3.35 -7 -3.5 -7.38 -3.65 -7.75 -3.79 -8.11 -3.93 -8.48 -4.06 -8.85 -4.18 -9.21 -4.31 -9.57 -4.42 -9.93 -4.53 -10.28 -4.64 -10.64 -4.74 -10.99 -4.84 -11.34 -4.93 -11.69 -5.02 -12.04 -5.1 -12.38 -5.17 -12.73 -5.25 -13.07 -5.31 -13.41 -5.38 -13.74 -5.44 -14.08 -5.49 -14.41 -5.54 -14.74 -5.58 -15.07 -5.62 -15.4 -5.65 -15.72 -5.68 -16.04 -5.71 -16.36 -5.73 -16.68 -5.75 -16.99 -5.76 -17.31 -5.76 -17.62 -5.77 -17.93 -5.76 -18.23 -5.76 -18.54 -5.74 -18.84 -5.73 -19.14 -5.71 -19.44 -5.68 -19.73 -5.65 -20.03 -5.62 -20.32 -5.58 -20.6 -5.53 -20.89 -5.49 -21.17 -5.43 -21.46 -5.38 -21.73 -5.32 -22.01 -5.25 -22.28 -5.18 -22.56 -5.11 -22.83 -5.03 -23.09 -4.95 -23.36 -4.86 -23.62 -4.77 -23.88 -4.67 -24.13 -4.57 -24.39 -4.47 -24.64 -4.36 -24.89 -4.25 -25.14 -4.13 -25.38 -4.01 -25.62 -3.89 -25.86 -3.76 -26.1 -3.62 -26.33 -3.48 -26.56 -3.34 -26.79 -3.2 -26.83 -3.24 -26.64 -3.74 -26.45 -4.24 -26.24 -4.73 -26.03 -5.23 -25.82 -5.72 -25.6 -6.21 -25.37 -6.69 -25.14 -7.18 -24.9 -7.66 -24.66 -8.14 -24.41 -8.61 -24.16 -9.09 -23.9 -9.56 -23.63 -10.03 -23.36 -10.49 -23.08 -10.95 -22.79 -11.41 -22.5 -11.86 -22.21 -12.31 -21.91 -12.76 -21.6 -13.2 -21.29 -13.64 -20.97 -14.08 -20.65 -14.51 -20.32 -14.94 -19.99 -15.36 -19.65 -15.78 -19.3 -16.2 -18.96 -16.61 -18.6 -17.02 -18.24 -17.42 -17.88 -17.82 -17.51 -18.21 -17.13 -18.6 -16.75 -18.98 -16.37 -19.36 -15.98 -19.73 -15.59 -20.1 -15.19 -20.47 -14.79 -20.83 -14.39 -21.18 -13.98 -21.53 -13.56 -21.87 -13.14 -22.21 -12.72 -22.54 -12.3 -22.87 -11.87 -23.2 -11.43 -23.51 -11 -23.83 -10.56 -24.13 -10.11 -24.44 -9.67 -24.73 -9.22 -25.02 -8.76 -25.31 -8.31 -25.59 -7.85 -25.86 -7.39 -26.13 -6.93 -26.39 -6.46 -26.65 -5.99 -26.9 -5.52 -27.15 -5.05 -27.39 -4.58 -27.63 -4.1 -27.86 -3.62 -28.08 -3.14 -28.3 -2.66 -28.51 -2.18 -28.72 -1.7 -28.93 -1.22 -29.12 -0.73 -29.31 -0.25 -29.5 0.24 -29.68 0.72 -29.86 1.21 -30.02 1.7 -30.19 2.18 -30.35 2.67 -30.5 3.15 -30.65 3.64 -30.79 4.12 -30.93 4.61 -31.06 5.09 -31.19 5.57 -31.31 6.05 -31.43 6.53 -31.54 7.01 -31.65 7.48 -31.75 7.96 -31.85 8.43 -31.94 8.9 -32.03 9.37 -32.11 9.83 -32.19 10.29 -32.26 10.75 -32.33 11.21 -32.39 11.66 -32.45 12.11 -32.51 12.56 -32.56 13 -32.6 13.44 -32.65 13.87 -32.68 14.3 -32.72 14.73 -32.75 15.15 -32.77 15.57 -32.79 15.98 -32.81 16.39 -32.83 16.79 -32.84 17.19 -32.84 17.58 -32.85 17.96 -32.85 18.34 -32.84 18.72 -32.84 19.09 -32.83 19.45 -32.81 19.8 -32.8 20.15 -32.78 20.49 -32.76 20.83 -32.73 21.16 -32.71 21.48 -32.68 21.79 -32.64 22.1 -32.61 22.39 -32.57 22.68 -32.53 22.96 -32.49 23.24 -32.45 23.5 -32.41 23.76 -32.36 24 -32.32 24.24 -32.27 24.47 -32.22 24.68 -32.17 24.89 -32.12 25.09 -32.07 25.27 -32.02 25.45 -31.97 25.62 -31.92 25.77 -31.87 25.91 -31.82 26.04 -31.77 26.15 -31.72 26.25 -31.68 26.34 -31.64 26.41 -31.61 26.46 -31.58 26.48 -31.56 26.5 -31.54 26.54 -31.5 26.59 -31.43 26.64 -31.36 26.7 -31.26 26.77 -31.16 26.83 -31.04 26.91 -30.91 26.98 -30.77 27.06 -30.62 27.14 -30.45 27.23 -30.28 27.31 -30.09 27.4 -29.89 27.48 -29.69 27.57 -29.47 27.66 -29.25 27.75 -29.01 27.84 -28.77 27.92 -28.52 28.01 -28.26 28.1 -27.99 28.19 -27.71 28.28 -27.42 28.36 -27.13 28.45 -26.83 28.53 -26.52 28.62 -26.2 28.7 -25.87 28.78 -25.54 28.86 -25.2 28.94 -24.85 29.01 -24.5 29.09 -24.14 29.16 -23.77 29.23 -23.4 29.3 -23.02 29.36 -22.63 29.42 -22.24 29.48 -21.84 29.54 -21.44 29.59 -21.03 29.64 -20.61 29.69 -20.19 29.74 -19.77 29.78 -19.34 29.82 -18.9 29.85 -18.46 29.88 -18.02 29.91 -17.57 29.93 -17.12 29.95 -16.66 29.97 -16.2 29.98 -15.74 29.99 -15.27 30 -14.8 30 -14.33 29.99 -13.85 29.98 -13.37 29.97 -12.88 29.95 -12.4 29.93 -11.91 29.9 -11.42 29.87 -10.92 29.83 -10.43 29.79 -9.93 29.74 -9.43 29.69 -8.93 29.64 -8.43 29.57 -7.92 29.51 -7.42 29.44 -6.91 29.36 -6.41 29.28 -5.9 29.19 -5.39 29.09 -4.88\"/><path d=\"M-5.65 -14.2 -5.36 -14.42 -5.08 -14.64 -4.79 -14.86 -4.5 -15.07 -4.21 -15.28 -3.91 -15.48 -3.62 -15.69 -3.32 -15.89 -3.02 -16.08 -2.73 -16.28 -2.43 -16.46 -2.13 -16.65 -1.82 -16.83 -1.52 -17.01 -1.22 -17.19 -0.91 -17.36 -0.61 -17.53 -0.3 -17.7 0 -17.86 0.31 -18.02 0.61 -18.17 0.92 -18.33 1.23 -18.47 1.54 -18.62 1.84 -18.76 2.15 -18.9 2.46 -19.03 2.76 -19.17 3.07 -19.29 3.38 -19.42 3.68 -19.54 3.99 -19.66 4.29 -19.77 4.59 -19.88 4.9 -19.99 5.2 -20.1 5.5 -20.2 5.8 -20.3 6.1 -20.39 6.39 -20.48 6.69 -20.57 6.98 -20.66 7.27 -20.74 7.56 -20.82 7.85 -20.89 8.14 -20.97 8.42 -21.03 8.71 -21.1 8.99 -21.16 9.26 -21.23 9.54 -21.28 9.81 -21.34 10.08 -21.39 10.35 -21.44 10.62 -21.48 10.88 -21.53 11.32 -21.6 11.77 -21.66 12.22 -21.72 12.67 -21.78 13.13 -21.83 13.58 -21.87 14.04 -21.91 14.49 -21.95 14.94 -21.98 15.4 -22 15.85 -22.02 16.3 -22.04 16.76 -22.04 17.2 -22.05 17.65 -22.04 18.1 -22.03 18.54 -22.01 18.98 -21.99 19.41 -21.95 19.84 -21.92 20.27 -21.87 20.69 -21.82 21.11 -21.76 21.52 -21.69 21.93 -21.61 22.33 -21.53 22.72 -21.44 23.11 -21.34 23.49 -21.23 23.86 -21.11 24.23 -20.99 24.59 -20.85 24.94 -20.71 25.28 -20.55 25.61 -20.39 25.93 -20.22 26.25 -20.04 26.55 -19.85 26.84 -19.65 27.12 -19.44 27.39 -19.22 27.65 -18.99 27.9 -18.74 28.13 -18.49 28.36 -18.23 28.57 -17.95 28.76 -17.67 28.95 -17.37 29.12 -17.07 29.27 -16.75 29.41 -16.41 29.54 -16.07 29.65 -15.72 29.74 -15.35 29.82 -14.97 29.89 -14.58 29.93 -14.17 29.96 -13.76 29.97 -13.33 29.97 -12.88\"/><path d=\"M4.35 2.34 4.73 2.52 5.11 2.7 5.5 2.87 5.88 3.03 6.25 3.2 6.63 3.35 7 3.5 7.38 3.65 7.75 3.79 8.11 3.93 8.48 4.06 8.85 4.18 9.21 4.31 9.57 4.42 9.93 4.53 10.28 4.64 10.64 4.74 10.99 4.84 11.34 4.93 11.69 5.02 12.04 5.1 12.38 5.17 12.73 5.25 13.07 5.31 13.41 5.38 13.74 5.44 14.08 5.49 14.41 5.54 14.74 5.58 15.07 5.62 15.4 5.65 15.72 5.68 16.04 5.71 16.36 5.73 16.68 5.75 16.99 5.76 17.31 5.76 17.62 5.77 17.93 5.76 18.23 5.76 18.54 5.74 18.84 5.73 19.14 5.71 19.44 5.68 19.73 5.65 20.03 5.62 20.32 5.58 20.6 5.53 20.89 5.49 21.17 5.43 21.46 5.38 21.73 5.32 22.01 5.25 22.28 5.18 22.56 5.11 22.83 5.03 23.09 4.95 23.36 4.86 23.62 4.77 23.88 4.67 24.13 4.57 24.39 4.47 24.64 4.36 24.89 4.25 25.14 4.13 25.38 4.01 25.62 3.89 25.86 3.76 26.1 3.62 26.33 3.48 26.56 3.34 26.79 3.2 26.83 3.24 26.64 3.74 26.45 4.24 26.24 4.73 26.03 5.23 25.82 5.72 25.6 6.21 25.37 6.69 25.14 7.18 24.9 7.66 24.66 8.14 24.41 8.61 24.16 9.09 23.9 9.56 23.63 10.03 23.36 10.49 23.08 10.95 22.79 11.41 22.5 11.86 22.21 12.31 21.91 12.76 21.6 13.2 21.29 13.64 20.97 14.08 20.65 14.51 20.32 14.94 19.99 15.36 19.65 15.78 19.3 16.2 18.96 16.61 18.6 17.02 18.24 17.42 17.88 17.82 17.51 18.21 17.13 18.6 16.75 18.98 16.37 19.36 15.98 19.73 15.59 20.1 15.19 20.47 14.79 20.83 14.39 21.18 13.98 21.53 13.56 21.87 13.14 22.21 12.72 22.54 12.3 22.87 11.87 23.2 11.43 23.51 11 23.83 10.56 24.13 10.11 24.44 9.67 24.73 9.22 25.02 8.76 25.31 8.31 25.59 7.85 25.86 7.39 26.13 6.93 26.39 6.46 26.65 5.99 26.9 5.52 27.15 5.05 27.39 4.58 27.63 4.1 27.86 3.62 28.08 3.14 28.3 2.66 28.51 2.18 28.72 1.7 28.93 1.22 29.12 0.73 29.31 0.25 29.5 -0.24 29.68 -0.72 29.86 -1.21 30.02 -1.7 30.19 -2.18 30.35 -2.67 30.5 -3.15 30.65 -3.64 30.79 -4.12 30.93 -4.61 31.06 -5.09 31.19 -5.57 31.31 -6.05 31.43 -6.53 31.54 -7.01 31.65 -7.48 31.75 -7.96 31.85 -8.43 31.94 -8.9 32.03 -9.37 32.11 -9.83 32.19 -10.29 32.26 -10.75 32.33 -11.21 32.39 -11.66 32.45 -12.11 32.51 -12.56 32.56 -13 32.6 -13.44 32.65 -13.87 32.68 -14.3 32.72 -14.73 32.75 -15.15 32.77 -15.57 32.79 -15.98 32.81 -16.39 32.83 -16.79 32.84 -17.19 32.84 -17.58 32.85 -17.96 32.85 -18.34 32.84 -18.72 32.84 -19.09 32.83 -19.45 32.81 -19.8 32.8 -20.15 32.78 -20.49 32.76 -20.83 32.73 -21.16 32.71 -21.48 32.68 -21.79 32.64 -22.1 32.61 -22.39 32.57 -22.68 32.53 -22.96 32.49 -23.24 32.45 -23.5 32.41 -23.76 32.36 -24 32.32 -24.24 32.27 -24.47 32.22 -24.68 32.17 -24.89 32.12 -25.09 32.07 -25.27 32.02 -25.45 31.97 -25.62 31.92 -25.77 31.87 -25.91 31.82 -26.04 31.77 -26.15 31.72 -26.25 31.68 -26.34 31.64 -26.41 31.61 -26.46 31.58 -26.48 31.56 -26.5 31.54 -26.54 31.5 -26.59 31.43 -26.64 31.36 -26.7 31.26 -26.77 31.16 -26.83 31.04 -26.91 30.91 -26.98 30.77 -27.06 30.62 -27.14 30.45 -27.23 30.28 -27.31 30.09 -27.4 29.89 -27.48 29.69 -27.57 29.47 -27.66 29.25 -27.75 29.01 -27.84 28.77 -27.92 28.52 -28.01 28.26 -28.1 27.99 -28.19 27.71 -28.28 27.42 -28.36 27.13 -28.45 26.83 -28.53 26.52 -28.62 26.2 -28.7 25.87 -28.78 25.54 -28.86 25.2 -28.94 24.85 -29.01 24.5 -29.09 24.14 -29.16 23.77 -29.23 23.4 -29.3 23.02 -29.36 22.63 -29.42 22.24 -29.48 21.84 -29.54 21.44 -29.59 21.03 -29.64 20.61 -29.69 20.19 -29.74 19.77 -29.78 19.34 -29.82 18.9 -29.85 18.46 -29.88 18.02 -29.91 17.57 -29.93 17.12 -29.95 16.66 -29.97 16.2 -29.98 15.74 -29.99 15.27 -30 14.8 -30 14.33 -29.99 13.85 -29.98 13.37 -29.97 12.88 -29.95 12.4 -29.93 11.91 -29.9 11.42 -29.87 10.92 -29.83 10.43 -29.79 9.93 -29.74 9.43 -29.69 8.93 -29.64 8.43 -29.57 7.92 -29.51 7.42 -29.44 6.91 -29.36 6.41 -29.28 5.9 -29.19 5.39 -29.09 4.88\"/><path d=\"M5.65 14.2 5.36 14.42 5.08 14.64 4.79 14.86 4.5 15.07 4.21 15.28 3.91 15.48 3.62 15.69 3.32 15.89 3.02 16.08 2.73 16.28 2.43 16.46 2.13 16.65 1.82 16.83 1.52 17.01 1.22 17.19 0.91 17.36 0.61 17.53 0.3 17.7 -0 17.86 -0.31 18.02 -0.61 18.17 -0.92 18.33 -1.23 18.47 -1.54 18.62 -1.84 18.76 -2.15 18.9 -2.46 19.03 -2.76 19.17 -3.07 19.29 -3.38 19.42 -3.68 19.54 -3.99 19.66 -4.29 19.77 -4.59 19.88 -4.9 19.99 -5.2 20.1 -5.5 20.2 -5.8 20.3 -6.1 20.39 -6.39 20.48 -6.69 20.57 -6.98 20.66 -7.27 20.74 -7.56 20.82 -7.85 20.89 -8.14 20.97 -8.42 21.03 -8.71 21.1 -8.99 21.16 -9.26 21.23 -9.54 21.28 -9.81 21.34 -10.08 21.39 -10.35 21.44 -10.62 21.48 -10.88 21.53 -11.32 21.6 -11.77 21.66 -12.22 21.72 -12.67 21.78 -13.13 21.83 -13.58 21.87 -14.04 21.91 -14.49 21.95 -14.94 21.98 -15.4 22 -15.85 22.02 -16.3 22.04 -16.76 22.04 -17.2 22.05 -17.65 22.04 -18.1 22.03 -18.54 22.01 -18.98 21.99 -19.41 21.95 -19.84 21.92 -20.27 21.87 -20.69 21.82 -21.11 21.76 -21.52 21.69 -21.93 21.61 -22.33 21.53 -22.72 21.44 -23.11 21.34 -23.49 21.23 -23.86 21.11 -24.23 20.99 -24.59 20.85 -24.94 20.71 -25.28 20.55 -25.61 20.39 -25.93 20.22 -26.25 20.04 -26.55 19.85 -26.84 19.65 -27.12 19.44 -27.39 19.22 -27.65 18.99 -27.9 18.74 -28.13 18.49 -28.36 18.23 -28.57 17.95 -28.76 17.67 -28.95 17.37 -29.12 17.07 -29.27 16.75 -29.41 16.41 -29.54 16.07 -29.65 15.72 -29.74 15.35 -29.82 14.97 -29.89 14.58 -29.93 14.17 -29.96 13.76 -29.97 13.33 -29.97 12.88\"/></g>",
};

// Icons with a micro-animation (src/icon-motion.css). "nav" ones play when their tab becomes active and on hover inside
// the sidebar, tab bar or top bar. "any" ones are affordances that play on hover of whatever control holds them.
const MOTION: Partial<Record<IconName, "nav" | "any">> = {
  helmet: "nav", wire: "nav", league: "nav", trade: "nav", waivers: "nav", bell: "nav", ask: "nav", gear: "nav",
  search: "any", pen: "any", chev: "any", airVent: "any",
};

/** One icon. The active tab thickens the line a little. The helmet keeps its original drawing and round ends. */
/** The nav icons and the extra icon-button icons (Figma "Nav / Icon", "Icon / Extra"): a 1.25 line with round ends, the same whether or not the tab is active
 *  (the active tab shows in color, not weight). */
const NAV_ICONS = new Set<IconName>(["wire", "league", "trade", "waivers", "gear", "bell",
  // and Figma's "Icon / Extra" set: close, search, the chevrons, send, mic and check
  "x", "search", "chev", "send", "mic", "check"]);

/** Optical centering, in 24-grid units, measured from each glyph's ink: centered by mass, with the ink box kept within
 *  half a unit of center. The bell's clapper weights it low, so it rises half a unit and its mass still sits a hair
 *  low; the check, the chevron, the send arrow and the open League tile are drawn off their box. */
const OFFSET: Partial<Record<IconName, [number, number]>> = { bell: [-0.35, -0.5], check: [0, -0.75], chev: [-0.3, 0], send: [0, 0.5], wire: [0, 0.3], league: [-0.25, 0], helmet: [-0.05, 0.35] };
const inked = (name: IconName) => { const o = OFFSET[name]; return o ? `<g transform="translate(${o[0]} ${o[1]})">${ICONS[name]}</g>` : ICONS[name]; };

export function Icon({ name, size = 20, active = false }: { name: IconName; size?: number; active?: boolean }) {
  // Ask, and the mark on anything Sources writes, is the chat bubbles icon with its own hover beat (AskIcon)
  if (name === "spark" || name === "ask") return <AskIcon size={size} active={active} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "helmet" || NAV_ICONS.has(name) ? 1.25 : 1.6}
      strokeLinecap={name === "helmet" || NAV_ICONS.has(name) ? "round" : "butt"} strokeLinejoin="round" aria-hidden="true" className={`ic ic-${name}`} data-m={MOTION[name]}
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
/** The bell's ring on a click: restarts even mid hover-ring, and swings harder (data-strong). */
const ringTimers = new WeakMap<Element, number>();
function ring(svg: Element) {
  window.clearTimeout(ringTimers.get(svg));
  svg.removeAttribute("data-play"); svg.removeAttribute("data-strong");
  void (svg as SVGElement).getBoundingClientRect();
  svg.setAttribute("data-play", ""); svg.setAttribute("data-strong", "");
  ringTimers.set(svg, window.setTimeout(() => { svg.removeAttribute("data-play"); svg.removeAttribute("data-strong"); }, PLAY_MS));
}
/** Reduced motion: a small opacity tick instead of any movement. */
const tick = (el: Element) => (el as HTMLElement).animate?.([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });

/**
 * Hover plays (mouse only, never touch), the inbox bell and the badge bump. Route-change plays are pure CSS on aria-current.
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

  // Opening or closing the inbox rings its bell harder than a hover, and the unread badge pulses once. A click, so a
  // panel that starts open on desktop stays still on load.
  document.addEventListener("click", (e) => {
    const control = (e.target as Element | null)?.closest?.("[aria-controls='inbox']");
    if (!control) return;
    const badge = control.querySelector(".ibx-badge");
    if (reduced.matches) { control.querySelectorAll("svg.ic-bell").forEach(tick); if (badge) tick(badge); return; }
    control.querySelectorAll("svg.ic-bell").forEach(ring);
    badge?.animate?.([{ scale: "1" }, { scale: "1.28", offset: 0.4 }, { scale: "1" }], { duration: 360, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
  }, { passive: true });

  // Badge bump when the unread count rises. Until the person first interacts, counts are only recorded, so the
  // badge filling in as league data loads never animates.
  const seen = new WeakMap<Element, number>();
  let armed = false;
  const arm = () => { armed = true; };
  document.addEventListener("pointerdown", arm, { once: true, passive: true });
  document.addEventListener("keydown", arm, { once: true, passive: true });
  const check = () => {
    document.querySelectorAll(".ibx-badge").forEach((b) => {
      const n = parseInt(b.textContent || "0", 10) || 0;
      const prev = seen.get(b) ?? (armed ? 0 : n);
      seen.set(b, n);
      if (n <= prev || reduced.matches) return;
      b.animate?.([{ scale: "1" }, { scale: "1.3", offset: 0.35 }, { scale: "0.94", offset: 0.7 }, { scale: "1" }], { duration: 420, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
      const bell = b.parentElement?.querySelector("svg.ic-bell");
      if (bell) play(bell);
    });
  };
  new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true });
}
