/** The app's fixed background, from Zach's "Background" Figma page: a bottom lime glow and the field
 *  (yard lines in perspective). One fixed layer behind the shell. The body's night gradient is the base
 *  under it (styles.css). Sizes and order live in app-qa.css. */

export function AppBackdrop() {
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="app-glow" />
      <div className="app-field"><div className="app-turf" /></div>
    </div>
  );
}
