/** The app's fixed background, from Zach's "Background" Figma page: a bottom lime glow and the field
 *  (yard lines in perspective). One fixed layer behind the shell. The body's night gradient is the base
 *  under it (styles.css). Sizes and order live in app-qa.css. */

export function AppBackdrop() {
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="app-glow" />
      <picture className="app-lines"><source media="(min-width: 861px)" srcSet="/field-lines.png" /><img src="/field-lines-phone.png" width={860} height={944} alt="" decoding="async" /></picture>
    </div>
  );
}
