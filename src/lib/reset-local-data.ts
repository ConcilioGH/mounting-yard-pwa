import { clearPWACaches, unregisterServiceWorkers } from "@/lib/ios12-compat-mode";
import { hardResetAppStorage } from "@/lib/speed-map-storage";
import { clearStartupFailures } from "@/lib/startup-diagnostics";

/** Clears app storage, unregisters service workers, and reloads the page. */
export async function resetLocalDataAndReload(): Promise<void> {
  await resetAppData();
}

/** Header “Reset App Data” — full wipe + reload (iOS 12 recovery). */
export async function resetAppData(): Promise<void> {
  clearStartupFailures();
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.clear();
  } catch (error) {
    console.warn("[Startup] sessionStorage clear failed", error);
  }
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
  await clearPWACaches();
  window.location.reload();
}

export { unregisterServiceWorkers, clearPWACaches } from "@/lib/ios12-compat-mode";
