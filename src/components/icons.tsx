// Sources icon set: Lucide (ISC, lucide-icons/lucide @1ef60af) plus our own icons drawn on
// the same 24px grid with a 2px round stroke so they sit in one family.
// Add a Lucide icon by copying its <path>s from lucide.dev; add a custom one under CUSTOM.

export type IconName =
  | "wire" | "league" | "trade" | "roster" | "check" | "x" | "lock" | "copy" | "msg" | "send" | "share" | "alert"
  | "waivers" | "ask" | "gear" | "mic" | "chev" | "group" | "app" | "plug" | "trash" | "spark" | "clock" | "eye" | "helmet" | "pen";

type Glyph = (active: boolean) => any;

const LUCIDE: Record<string, any> = {
  pen: <><path d="M13 21h8" /><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></>,
  wire: <><path d="M15 18h-5" /><path d="M18 14h-8" /><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2" /><rect width="8" height="4" x="10" y="6" rx="1" /></>,
  league: <><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></>,
  trade: <><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  lock: <><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  copy: <><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
  msg: <><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" /></>,
  send: <><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></>,
  share: <><path d="M12 2v13" /><path d="m16 6-4-4-4 4" /><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /></>,
  alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  waivers: <><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" /></>,
  ask: <><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" /><path d="M7 11h10" /><path d="M7 15h6" /><path d="M7 7h8" /></>,
  gear: <><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></>,
  mic: <><path d="M12 19v3" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><rect x="9" y="2" width="6" height="13" rx="3" /></>,
  chev: <><path d="m9 18 6-6-6-6" /></>,
  group: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></>,
  app: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 4v4" /><path d="M2 8h20" /><path d="M6 4v4" /></>,
  plug: <><path d="M12 22v-5" /><path d="M15 8V2" /><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z" /><path d="M9 8V2" /></>,
  trash: <><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  spark: <><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" /><path d="M20 2v4" /><path d="M22 4h-4" /><circle cx="4" cy="20" r="2" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  eye: <><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></>,
};

/** Custom icons, same grid and stroke as Lucide. `active` fills the main shape. */
const CUSTOM: Record<string, Glyph> = {
  // Football helmet in profile: open shell with a neck notch, one top bar and an angled cage. Outline only, no fill.
  helmet: () => <>
    <path d="M 19.46 9.36C 18.14 4.74 14.4 1.66 10.22 1.66 5.05 1.66 1.2 5.95 1.2 11.12c 0 1.87 0.55 3.52 1.54 4.73 0.33 0.44 0.44 0.88 0.44 1.43v 0.88c 0 1.21 0.99 2.09 2.09 2.09h 4.73" />
    <path d="M13.2 10.8h8.4M13.2 10.8l2.6 3.8h6.4l-1 5.2h-5.4M11.4 13.6l4.4 6.2M19.4 14.6l-.8 5.2" />
  </>,
  // Football: a pointed oval on the diagonal with a seam and laces.
  roster: (a) => <g strokeWidth={a ? 2.4 : 2}>
    <path d="M5.2 18.8c-2.5-2.5-1.9-8.1 1.9-11.9s9.4-4.4 11.9-1.9 1.9 8.1-1.9 11.9-9.4 4.4-11.9 1.9Z" />
    <path d="m9.5 14.5 5-5M10.6 11.4l2 2M12.4 9.6l2 2" />
  </g>,
};

/** One icon family: Lucide plus Sources customs. The active tab thickens Lucide's stroke and fills customs. */
export function Icon({ name, size = 20, active = false }: { name: IconName; size?: number; active?: boolean }) {
  const custom = CUSTOM[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active && !custom ? 2.4 : name === "helmet" ? 1.8 : 2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ic">
      {custom ? custom(active) : LUCIDE[name]}
    </svg>
  );
}
