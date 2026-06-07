(function () {
  "use strict";

  var STARTUP_MS = 3000;

  function isOldIOS() {
    return typeof navigator !== "undefined" && /OS 12_/.test(navigator.userAgent);
  }

  function unregisterServiceWorkers() {
    if (!("serviceWorker" in navigator)) return Promise.resolve();
    var sw = navigator.serviceWorker;
    if (sw.getRegistrations) {
      return sw.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      });
    }
    if (sw.getRegistration) {
      return sw.getRegistration().then(function (reg) {
        if (reg) return reg.unregister();
      });
    }
    return Promise.resolve();
  }

  function clearPWACaches() {
    if (typeof caches === "undefined") return Promise.resolve();
    return caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) { return caches.delete(key); }));
    });
  }

  function enableIOS12CompatModeEarly() {
    if (!isOldIOS()) return;
    if (document.documentElement) {
      document.documentElement.setAttribute("data-ios12-compat", "true");
    }
    if (document.head && !document.querySelector('meta[data-ios12-no-cache="true"]')) {
      var meta = document.createElement("meta");
      meta.setAttribute("data-ios12-no-cache", "true");
      meta.httpEquiv = "Cache-Control";
      meta.content = "no-cache, no-store, must-revalidate";
      document.head.appendChild(meta);
    }
    Promise.all([unregisterServiceWorkers(), clearPWACaches()]).catch(function (err) {
      console.warn("[ios12-bootstrap] compat mode failed", err);
    });
  }

  enableIOS12CompatModeEarly();

  function polyfillStructuredClone() {
    if (typeof globalThis.structuredClone === "function") return;
    globalThis.structuredClone = function (value) {
      return JSON.parse(JSON.stringify(value));
    };
  }

  function polyfillObjectFromEntries() {
    if (typeof Object.fromEntries === "function") return;
    Object.fromEntries = function (entries) {
      var out = {};
      for (var i = 0; i < entries.length; i++) {
        out[entries[i][0]] = entries[i][1];
      }
      return out;
    };
  }

  function polyfillArrayAt() {
    if (typeof Array.prototype.at === "function") return;
    Array.prototype.at = function (index) {
      var len = this.length;
      var relative = index >= 0 ? index : len + index;
      if (relative < 0 || relative >= len) return undefined;
      return this[relative];
    };
  }

  try {
    polyfillStructuredClone();
    polyfillObjectFromEntries();
    polyfillArrayAt();
  } catch (e) {
    console.warn("[ios12-bootstrap] polyfill install failed", e);
  }

  function resetAppDataAndReload() {
    try {
      if (window.sessionStorage) window.sessionStorage.clear();
    } catch (err) {
      console.warn(err);
    }
    try {
      if (window.localStorage) window.localStorage.clear();
    } catch (err) {
      console.warn(err);
    }
    unregisterServiceWorkers().then(clearPWACaches).finally(function () {
      window.location.reload();
    });
  }

  function showFailure(message) {
    if (document.getElementById("ios12-startup-failure")) return;
    var panel = document.createElement("div");
    panel.id = "ios12-startup-failure";
    panel.setAttribute("role", "alert");
    panel.style.cssText =
      "position:fixed;inset:16px;top:calc(3.5rem + env(safe-area-inset-top));z-index:9999;" +
      "padding:16px;border-radius:12px;border:2px solid #ef4444;background:#450a0a;color:#fecaca;" +
      "font:16px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;overflow:auto;" +
      "pointer-events:none;";
    panel.innerHTML =
      "<p style='margin:0 0 8px;font-weight:700'>iOS 12 compatibility mode</p>" +
      "<p style='margin:0 0 12px'>App failed to initialise on this device. Tap Reset App Data or open Yard.</p>" +
      "<pre style='margin:0 0 12px;white-space:pre-wrap;word-break:break-word;font-size:13px'>" +
      String(message) +
      "</pre>" +
      "<p style='margin:0 0 12px'><a href='/yard' style='color:#fde68a;font-weight:700;pointer-events:auto;'>Open Yard page</a></p>" +
      "<button type='button' id='ios12-reset-btn' style='padding:12px 20px;border:0;border-radius:10px;" +
      "background:#dc2626;color:#fff;font-weight:700;font-size:16px;pointer-events:auto;'>Reset App Data</button>";
    document.body.appendChild(panel);
    var btn = document.getElementById("ios12-reset-btn");
    if (btn) {
      btn.addEventListener("click", resetAppDataAndReload);
    }
  }

  window.setTimeout(function () {
    if (document.body && document.body.getAttribute("data-app-ready") === "true") return;
    showFailure("JavaScript did not finish loading within " + STARTUP_MS + "ms.");
  }, STARTUP_MS);

  function clearFailureIfAppReady() {
    if (document.body && document.body.getAttribute("data-app-ready") === "true") {
      var panel = document.getElementById("ios12-startup-failure");
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      return;
    }
    window.setTimeout(clearFailureIfAppReady, 250);
  }
  clearFailureIfAppReady();
})();
