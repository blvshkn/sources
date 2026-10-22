// Ours: types for the vendored loader.js ("loader-buttons" v0.1.0, Apache-2.0 per its package.json),
// trimmed from the package's types/index.d.ts to what Source uses.
export interface LoaderInstance {
  readonly animating: boolean;
  play(): LoaderInstance;
  pause(): LoaderInstance;
  reset(): LoaderInstance;
  destroy(): void;
}
export interface LoaderOptions {
  design: string;
  size?: number;
  speed?: number;
  paused?: boolean;
}
export function mountLoader(element: HTMLElement, options: LoaderOptions): LoaderInstance;
