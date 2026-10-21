// Keeps people from casually pulling images off the site: no dragging an image out, no right-click "Save image",
// and no iPhone long-press save sheet on pictures (the CSS half lives in image-guard.css). Text, links and inputs
// keep their normal menus. A screenshot or dev tools can still copy what's on screen; nothing in a browser stops
// that. The Share image still saves, through its own download and share buttons.
const MEDIA = "img, svg, canvas, picture, video";

const onMedia = (t: EventTarget | null) => t instanceof Element && !!t.closest(MEDIA) && !t.closest("input, textarea, [contenteditable]");

document.addEventListener("contextmenu", (e) => { if (onMedia(e.target)) e.preventDefault(); }, { capture: true });
document.addEventListener("dragstart", (e) => { if (onMedia(e.target)) e.preventDefault(); }, { capture: true });
