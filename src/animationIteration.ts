/** React listens for every event type on its root and on each portal target, animationiteration included. In Chrome,
 *  one listener for that event anywhere in the page makes the main thread wake at every loop of every infinite CSS
 *  animation (the live dot, the flame, heat lines and ice, skeleton pulses) and run a style pass, even when the
 *  animation itself runs on the compositor. Nothing in the app handles animation loops, so that listener is never
 *  added. Imported first in main.tsx, before React mounts. If a component ever needs onAnimationIteration, remove this. */
const add = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, ...rest: [EventListenerOrEventListenerObject | null, (boolean | AddEventListenerOptions)?]) {
  if (type === "animationiteration" || type === "webkitAnimationIteration") return;
  return add.call(this, type, ...rest);
};
export {};
