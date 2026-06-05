import { isOldIOS } from "@/lib/legacy-safari";

export async function unregisterServiceWorkers(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const sw = navigator.serviceWorker as ServiceWorkerContainer;
    if (typeof sw.getRegistrations === "function") {
      const registrations = await sw.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      return;
    }
    if (typeof sw.getRegistration === "function") {
      const registration = await sw.getRegistration();
      if (registration) await registration.unregister();
    }
  } catch (error) {
    console.warn("[iOS12] service worker unregister failed", error);
  }
}

export async function clearPWACaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch (error) {
    console.warn("[iOS12] PWA cache clear failed", error);
  }
}

function addNoCacheMeta(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector('meta[data-ios12-no-cache="true"]')) return;
  const meta = document.createElement("meta");
  meta.setAttribute("data-ios12-no-cache", "true");
  meta.httpEquiv = "Cache-Control";
  meta.content = "no-cache, no-store, must-revalidate";
  document.head.appendChild(meta);
}

/** Unregister SW, wipe Cache API, skip PWA — run on old iOS at startup. */
export async function enableIOS12CompatMode(): Promise<void> {
  if (!isOldIOS()) return;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-ios12-compat", "true");
  }
  addNoCacheMeta();
  await unregisterServiceWorkers();
  await clearPWACaches();
  console.log("[iOS12] compatibility mode enabled — service workers unregistered, PWA cache cleared");
}
