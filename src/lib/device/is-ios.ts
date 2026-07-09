export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent;
  const isClassicIOS = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  return isClassicIOS || isIPadOS;
}

export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export function isPhoneSizedDevice(viewportWidth: number, viewportHeight: number): boolean {
  if (!isIOSDevice()) return false;
  return Math.min(viewportWidth, viewportHeight) < 600;
}

export function isTabletDevice(viewportWidth: number, viewportHeight: number): boolean {
  if (!isIOSDevice()) return false;
  return Math.min(viewportWidth, viewportHeight) >= 600;
}

export function preferMobileShader(): boolean {
  return isIOSDevice() || isCoarsePointer();
}
