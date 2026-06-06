/** iPad/iPhone iOS 12.x — hard Yard fallback detection. */
export function isIOS12(): boolean {
  return typeof navigator !== "undefined" && /OS 12_/.test(navigator.userAgent);
}

/** @deprecated Use isIOS12 */
export function isOldIOS(): boolean {
  return isIOS12();
}

/** @deprecated Use isOldIOS */
export function isLegacySafari(): boolean {
  return isOldIOS();
}

export function shouldSkipIndexedDB(): boolean {
  return isOldIOS();
}

export function shouldSkipServiceWorker(): boolean {
  return isOldIOS();
}
