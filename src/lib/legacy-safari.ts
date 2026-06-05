/** iPad/iPhone iOS 12.x — emergency compatibility mode. */
export function isOldIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /OS 12_/.test(navigator.userAgent);
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
