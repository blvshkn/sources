/** React 18 has no inert prop: an empty string gets dropped with a warning, so set the attribute on the node itself.
 *  Used on the landing's decorative demos so keyboard focus skips them. */
export const setInert = (el: HTMLElement | null) => { el?.setAttribute("inert", ""); };
