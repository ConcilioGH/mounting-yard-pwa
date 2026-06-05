import { hardResetAppStorage } from "@/lib/speed-map-storage";
import { clearStartupFailures } from "@/lib/startup-diagnostics";

async function unregisterServiceWorkers(): Promise<void> {
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
    console.warn("[Startup] service worker unregister failed", error);
  }
}

/** Clears app storage, unregisters service workers, and reloads the page. */
export async function resetLocalDataAndReload(): Promise<void> {
  clearStartupFailures();
  try {
    await hardResetAppStorage();
  } catch (error) {
    console.warn("[Startup] hardResetAppStorage failed", error);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
    }
  }
  await unregisterServiceWorkers();
  window.location.reload();
}
