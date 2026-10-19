import { pieces } from "../search";

/** A player name with the letters the search matched in bold (search.ts marks). */
export function Marked({ name, marks }: { name: string; marks?: [number, number][] }) {
  if (!marks?.length) return <>{name}</>;
  return <>{pieces(name, marks).map((x, i) => (x.on ? <mark key={i} className="hl">{x.text}</mark> : x.text))}</>;
}
