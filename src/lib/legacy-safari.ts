/** True on iPad/iPhone iOS 12.x and Safari 12 — use compatibility init path. */
export function isLegacySafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;

  const ios = ua.match(/(?:iPad|iPhone|iPod).*OS (\d+)_/);
  if (ios && parseInt(ios[1], 10) <= 12) return true;

  const safari = ua.match(/Version\/(\d+).+Safari/);
  if (safari && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS/.test(ua) && parseInt(safari[1], 10) <= 12) {
    return true;
  }

  return false;
}

export function shouldSkipIndexedDB(): boolean {
  return isLegacySafari();
}

export function shouldSkipServiceWorker(): boolean {
  return isLegacySafari();
}
