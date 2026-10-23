/** A section's nudge into your own league (Zach, Oct 23): one line, then Add your leagues. It sits in the open
 *  space a section leaves, like under Sunday moments. */
export function SectionCta({ line, onAdd }: { line: string; onAdd: () => void }) {
  return (
    <div className="ld2-secta">
      <p>{line}</p>
      <button type="button" className="btn btn-primary" onClick={onAdd} aria-haspopup="dialog">Add your leagues</button>
    </div>
  );
}
