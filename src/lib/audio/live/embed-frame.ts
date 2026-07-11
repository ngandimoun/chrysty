/** True when Astra Live runs inside a cross-origin host iframe (e.g. Learn). */
export function isEmbeddedFrame(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}
