/** Remote images through Vercel's image service (Zach): Vercel fetches the photo or logo once, resizes it to the width
 *  asked for, converts it to AVIF or WebP for the browser, and serves that copy from its edge for 30 days
 *  (vercel.json "images"). Headshots rarely change, so ESPN or Sleeper is hit about once a month per image, and a
 *  source outage doesn't blank photos that are already cached. Off Vercel (local builds) the original URL is used.
 *  Callers keep their own fallback chain, so if the service refuses a request the next source loads directly. */
const WIDTHS = [64, 128, 256, 384, 640]; // must match vercel.json images.sizes
const onVercel = typeof location !== "undefined" && /^https?:$/.test(location.protocol) && !/^(localhost|127\.|\[::1\])/.test(location.hostname);

/** The cached, resized copy of `url` for a box `css` pixels wide (doubled for sharp screens). */
export function viaEdge(url: string, css: number): string {
  if (!onVercel) return url;
  const want = Math.ceil(css * Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 2));
  const w = WIDTHS.find((x) => x >= want) ?? WIDTHS[WIDTHS.length - 1];
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
}
