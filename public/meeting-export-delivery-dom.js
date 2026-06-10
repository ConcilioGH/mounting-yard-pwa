/**
 * Plain-JS port of deliverMeetingExport() for /ipad-yard-dom.
 * Mirrors src/lib/meeting-export-delivery.ts and related meeting-export helpers.
 */
(function () {
  if (window.MeetingExportDelivery) return;

  var MANIFEST_KEY = "mounting-yard-meeting-manifest-v1";
  var DB_NAME = "mounting-yard-meeting-dir";
  var DB_VERSION = 1;
  var STORE = "handles";

  function normalizeRaceNo(value) {
    var trimmed = String(value == null ? "" : value).trim();
    var match = /^R?(\d+)$/i.exec(trimmed);
    if (match) return match[1];
    return trimmed;
  }

  function buildMeetingKey(raceNos) {
    var out = [];
    for (var i = 0; i < raceNos.length; i++) {
      var n = normalizeRaceNo(raceNos[i]);
      if (n) out.push(n);
    }
    return out.join("|");
  }

  function sanitizeMeetingSlug(input) {
    var slug = String(input == null ? "" : input)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "meeting";
  }

  function parseMeetingFolderMeta(folderPathOrName) {
    var normalized = String(folderPathOrName == null ? "" : folderPathOrName)
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
    if (!normalized) return null;
    var segments = normalized.split("/").filter(Boolean);
    var folderName = segments[segments.length - 1] || "";
    var match = folderName.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/i);
    if (!match) return null;
    var date = match[1];
    var track = sanitizeMeetingSlug(match[2]);
    var meetingsIdx = segments.indexOf("meetings");
    var meetingFolderPath =
      meetingsIdx >= 0 ? segments.slice(meetingsIdx).join("/") : "meetings/" + folderName;
    return { date: date, track: track, meetingFolderPath: meetingFolderPath };
  }

  function parseMasterCsvFileName(fileName) {
    var base = fileName.replace(/\.csv$/i, "").split(/[/\\]/).pop() || "";
    var match = base.match(/^(.+?)_(\d{4}-\d{2}-\d{2})_master$/i);
    if (!match) return null;
    var track = sanitizeMeetingSlug(match[1]);
    var date = match[2];
    if (!track || track === "meeting") return null;
    return { track: track, date: date };
  }

  function inferMeetingFolderPath(options) {
    if (options.importPath) {
      var fromPath = parseMeetingFolderMeta(options.importPath);
      if (fromPath) return fromPath.meetingFolderPath;
    }
    var track = sanitizeMeetingSlug(options.track || "");
    var date = String(options.date || "").trim();
    if (date && track && track !== "meeting") {
      return "meetings/" + date + "-" + track;
    }
    return "";
  }

  function deriveMeetingId(meta) {
    var date = String(meta.date || "").trim();
    var track = String(meta.trackSlug || "").trim();
    var path = String(meta.meetingFolderPath || "").trim();
    if (date && track) return date + "-" + track;
    if (path) {
      var folder = parseMeetingFolderMeta(path);
      if (folder) return folder.date + "-" + folder.track;
    }
    return "";
  }

  function formatMeetingLabel(trackName, date) {
    var track = String(trackName || "").trim();
    var d = String(date || "").trim();
    if (track && d) return track + " · " + d;
    return track || d || "";
  }

  function loadMeetingManifest() {
    if (typeof localStorage === "undefined") return null;
    try {
      var raw = localStorage.getItem(MANIFEST_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      var raceNos = [];
      if (Array.isArray(parsed.raceNos)) {
        for (var i = 0; i < parsed.raceNos.length; i++) {
          var n = normalizeRaceNo(String(parsed.raceNos[i]));
          if (n) raceNos.push(n);
        }
      }
      if (!raceNos.length) return null;
      var meetingKey = String(parsed.meetingKey || buildMeetingKey(raceNos));
      var trackSlug = String(parsed.trackSlug || "").trim();
      var trackName = String(parsed.trackName || parsed.meetingLabel || "").trim();
      var date = String(parsed.date || "").trim();
      var meetingFolderPath = String(parsed.meetingFolderPath || "").trim();
      var resolvedSlug = trackSlug || sanitizeMeetingSlug(trackName);
      var meetingId =
        deriveMeetingId({ date: date, trackSlug: resolvedSlug, meetingFolderPath: meetingFolderPath }) ||
        String(parsed.meetingId || "").trim() ||
        meetingKey;
      var meetingLabel = String(parsed.meetingLabel || "").trim() || formatMeetingLabel(trackName, date);
      return {
        meetingId: meetingId,
        meetingKey: meetingKey,
        trackName: trackName,
        trackSlug: resolvedSlug,
        date: date,
        meetingFolderPath: meetingFolderPath,
        meetingLabel: meetingLabel,
        raceNos: raceNos,
        importedAt: String(parsed.importedAt || ""),
      };
    } catch (e) {
      return null;
    }
  }

  function saveMeetingManifest(manifest) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
  }

  function openMeetingDirDB() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error("IndexedDB open failed"));
      };
    });
  }

  function loadMeetingDirectoryHandle(meetingKey) {
    return openMeetingDirDB()
      .then(function (db) {
        return new Promise(function (resolve) {
          var tx = db.transaction(STORE, "readonly");
          var store = tx.objectStore(STORE);
          var req = store.get(meetingKey);
          req.onsuccess = function () {
            resolve(req.result || null);
          };
          req.onerror = function () {
            resolve(null);
          };
        });
      })
      .catch(function () {
        return null;
      });
  }

  function saveMeetingDirectoryHandle(meetingKey, handle) {
    return openMeetingDirDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        var store = tx.objectStore(STORE);
        store.put(handle, meetingKey);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error || new Error("Could not save folder handle"));
        };
        tx.onabort = function () {
          reject(tx.error || new Error("Could not save folder handle"));
        };
      });
    });
  }

  function isIOSDevice() {
    if (typeof navigator === "undefined") return false;
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    return false;
  }

  function supportsDirectoryPicker() {
    if (isIOSDevice()) return false;
    return typeof window !== "undefined" && "showDirectoryPicker" in window;
  }

  function isIOSExportDevice() {
    return isIOSDevice();
  }

  function needsInPageExportFallback() {
    return isIOSExportDevice();
  }

  function pickMeetingDirectory() {
    if (!supportsDirectoryPicker()) {
      return Promise.reject(new Error("Folder picker is not supported in this browser."));
    }
    return window.showDirectoryPicker({ mode: "readwrite" });
  }

  function resolveExportDate(manifest) {
    var fromManifest = manifest && manifest.date ? String(manifest.date).trim() : "";
    if (fromManifest && /^\d{4}-\d{2}-\d{2}$/.test(fromManifest)) return fromManifest;
    return new Date().toISOString().slice(0, 10);
  }

  function resolveExportTrack(manifest, fallbackTrack) {
    var fromFolder = manifest && manifest.trackSlug ? String(manifest.trackSlug).trim() : "";
    if (fromFolder) return fromFolder;
    var track =
      (manifest && manifest.trackName ? String(manifest.trackName).trim() : "") ||
      (fallbackTrack ? String(fallbackTrack).trim() : "");
    return sanitizeMeetingSlug(track);
  }

  function buildMeetingExportFilename(kind, manifest, options) {
    options = options || {};
    var track = resolveExportTrack(manifest, options.fallbackTrack);
    var date = resolveExportDate(manifest);
    return track + "_" + date + "_" + kind + ".csv";
  }

  function downloadTextFile(filename, content, mime) {
    if (needsInPageExportFallback()) return;
    var blob = new Blob([content], { type: mime || "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function ensureDirectoryWritePermission(handle) {
    if (!handle || !("requestPermission" in handle) || typeof handle.requestPermission !== "function") {
      return Promise.resolve(true);
    }
    if ("queryPermission" in handle && typeof handle.queryPermission === "function") {
      return handle.queryPermission({ mode: "readwrite" }).then(function (current) {
        if (current === "granted") return true;
        return handle.requestPermission({ mode: "readwrite" }).then(function (permission) {
          return permission === "granted";
        });
      });
    }
    return handle.requestPermission({ mode: "readwrite" }).then(function (permission) {
      return permission === "granted";
    });
  }

  function writeViaDirectoryHandle(handle, filename, content) {
    if (!handle) return Promise.resolve(false);
    return ensureDirectoryWritePermission(handle)
      .then(function (granted) {
        if (!granted) return false;
        return handle.getFileHandle(filename, { create: true });
      })
      .then(function (fileHandle) {
        if (!fileHandle || fileHandle === false) return false;
        return fileHandle.createWritable();
      })
      .then(function (writable) {
        if (!writable || writable === false) return false;
        return writable
          .write(content)
          .then(function () {
            return writable.close();
          })
          .then(function () {
            return true;
          });
      })
      .catch(function (error) {
        console.warn("[meeting export] directory handle write failed", error);
        return false;
      });
  }

  function writeViaApi(folderPath, filename, content) {
    return fetch("/api/meeting-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath: folderPath, filename: filename, content: content }),
    })
      .then(function (res) {
        if (!res.ok) return false;
        return res.json();
      })
      .then(function (data) {
        return Boolean(data && data.ok);
      })
      .catch(function (error) {
        console.warn("[meeting export] API write failed", error);
        return false;
      });
  }

  function raceNosFromRaces(races) {
    var sorted = races.slice().sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
    var out = [];
    for (var i = 0; i < sorted.length; i++) {
      var n = normalizeRaceNo(sorted[i].id);
      if (n) out.push(n);
    }
    return out;
  }

  function applyDirectoryMetaToManifest(manifest, dirName) {
    var folderMeta = parseMeetingFolderMeta(dirName);
    if (folderMeta) {
      manifest.meetingFolderPath = folderMeta.meetingFolderPath;
      manifest.date = folderMeta.date;
      manifest.trackSlug = folderMeta.track;
      if (!manifest.trackName) manifest.trackName = folderMeta.track;
    }
    manifest.meetingLabel = formatMeetingLabel(manifest.trackName, manifest.date);
    saveMeetingManifest(manifest);
    return manifest;
  }

  function syncManifestFromRaces(races, options) {
    options = options || {};
    if (!races || !races.length) return null;
    var raceNos = raceNosFromRaces(races);
    if (!raceNos.length) return null;
    var meetingKey = buildMeetingKey(raceNos);
    var existing = loadMeetingManifest();
    var folderFromPath = options.meetingFolderPath
      ? parseMeetingFolderMeta(options.meetingFolderPath)
      : null;
    var folderFromDir = options.directoryName
      ? parseMeetingFolderMeta(options.directoryName)
      : null;
    var fromMaster = options.fileName ? parseMasterCsvFileName(options.fileName) : null;
    var trackSlug =
      (folderFromPath && folderFromPath.track) ||
      (folderFromDir && folderFromDir.track) ||
      (fromMaster && fromMaster.track) ||
      (existing && existing.trackSlug) ||
      sanitizeMeetingSlug(options.trackName || "");
    var date =
      (folderFromPath && folderFromPath.date) ||
      (folderFromDir && folderFromDir.date) ||
      (fromMaster && fromMaster.date) ||
      (options.date || "") ||
      (existing && existing.date) ||
      new Date().toISOString().slice(0, 10);
    var trackName = String(
      options.trackName || (existing && existing.trackName) || trackSlug || "",
    ).trim();
    if (!trackName && options.meetingLabel) {
      var labelOnly = String(options.meetingLabel).trim();
      if (labelOnly.indexOf("·") >= 0) {
        var labelParts = labelOnly.split("·");
        trackName = labelParts[0] ? labelParts[0].trim() : "";
        if (!options.date && labelParts[1]) date = labelParts[1].trim();
      } else {
        trackName = labelOnly;
      }
    }
    var meetingFolderPath =
      String(options.meetingFolderPath || "").trim() ||
      (folderFromPath && folderFromPath.meetingFolderPath) ||
      (folderFromDir && folderFromDir.meetingFolderPath) ||
      inferMeetingFolderPath({
        importPath: options.importPath,
        fileName: options.fileName,
        track: trackSlug,
        date: date,
      }) ||
      (existing && existing.meetingFolderPath) ||
      "";
    var meetingId =
      deriveMeetingId({ date: date, trackSlug: trackSlug, meetingFolderPath: meetingFolderPath }) ||
      meetingKey;
    var manifest = {
      meetingId: meetingId,
      meetingKey: meetingKey,
      trackName: trackName,
      trackSlug: trackSlug,
      date: date,
      meetingFolderPath: meetingFolderPath,
      meetingLabel: formatMeetingLabel(trackName, date),
      raceNos: raceNos,
      importedAt: new Date().toISOString(),
    };
    saveMeetingManifest(manifest);
    return manifest;
  }

  function readMeetingCsvFromDirectory(dir) {
    var csvFiles = [];
    function collectEntries(iterator) {
      return iterator.next().then(function (step) {
        if (step.done) return csvFiles;
        var pair = step.value;
        var name = pair[0];
        var handle = pair[1];
        if (handle.kind === "file" && /\.csv$/i.test(name)) {
          return handle.getFile().then(function (file) {
            csvFiles.push({ name: name, file: file });
            return collectEntries(iterator);
          });
        }
        return collectEntries(iterator);
      });
    }
    return collectEntries(dir.entries()).then(function () {
      if (!csvFiles.length) {
        throw new Error("No CSV file found in the selected meeting folder.");
      }
      var master = null;
      for (var i = 0; i < csvFiles.length; i++) {
        if (/_master\.csv$/i.test(csvFiles[i].name)) {
          master = csvFiles[i];
          break;
        }
      }
      if (!master) {
        csvFiles.sort(function (a, b) {
          return a.name.localeCompare(b.name);
        });
        master = csvFiles[0];
      }
      return { file: master.file, name: master.name };
    });
  }

  /**
   * Must be the first async step from the export button click so showDirectoryPicker
   * keeps the user gesture (Chrome/Edge requirement).
   */
  function prepareFolderForExport(manifest) {
    if (!manifest || !manifest.meetingKey) {
      return Promise.reject(new Error("Meeting manifest missing — load a meeting first."));
    }

    function pickAndStore() {
      if (!supportsDirectoryPicker()) {
        return Promise.resolve({ manifest: manifest, handle: null });
      }
      return pickMeetingDirectory()
        .then(function (dir) {
          return saveMeetingDirectoryHandle(manifest.meetingKey, dir).then(function () {
            var updated = applyDirectoryMetaToManifest(manifest, dir.name);
            return { manifest: updated, handle: dir };
          });
        })
        .catch(function (error) {
          if (error && error.name === "AbortError") throw error;
          throw error;
        });
    }

    return loadMeetingDirectoryHandle(manifest.meetingKey).then(function (handle) {
      if (!handle) return pickAndStore();
      return ensureDirectoryWritePermission(handle).then(function (granted) {
        if (granted) return { manifest: manifest, handle: handle };
        return pickAndStore();
      });
    });
  }

  function deliverFileExport(filename, content, options) {
    options = options || {};
    var manifest = options.manifest || loadMeetingManifest();
    var folderPath =
      manifest && manifest.meetingFolderPath ? String(manifest.meetingFolderPath).trim() : "";
    var mime = options.mime || "text/plain;charset=utf-8";

    console.log("EXPORT MANIFEST:", manifest);
    console.log("EXPORT PATH:", folderPath || "(none — fallback)");
    console.log("EXPORT FILENAME:", filename);

    function finish(method, displayPath) {
      return { method: method, filename: filename, displayPath: displayPath || filename };
    }

    function tryDirectoryWrite(handle) {
      if (!handle) return Promise.resolve(false);
      return writeViaDirectoryHandle(handle, filename, content).then(function (wrote) {
        if (!wrote) return false;
        var currentFolderPath =
          manifest && manifest.meetingFolderPath ? String(manifest.meetingFolderPath).trim() : folderPath;
        var displayPath = currentFolderPath
          ? currentFolderPath.replace(/\/+$/, "") + "/" + filename
          : handle.name + "/" + filename;
        console.log("EXPORT PATH:", displayPath);
        return finish("directory", displayPath);
      });
    }

    var handlePromise = options.directoryHandle
      ? Promise.resolve(options.directoryHandle)
      : manifest && manifest.meetingKey
        ? loadMeetingDirectoryHandle(manifest.meetingKey)
        : Promise.resolve(null);

    return handlePromise
      .then(function (handle) {
        return tryDirectoryWrite(handle);
      })
      .then(function (result) {
        if (result) return result;
        var currentFolderPath =
          manifest && manifest.meetingFolderPath ? String(manifest.meetingFolderPath).trim() : folderPath;
        if (currentFolderPath && /\.csv$/i.test(filename)) {
          return writeViaApi(currentFolderPath, filename, content).then(function (wrote) {
            if (!wrote) return false;
            var apiPath = currentFolderPath.replace(/\/+$/, "") + "/" + filename;
            console.log("EXPORT PATH:", apiPath);
            return finish("api", apiPath);
          });
        }
        return false;
      })
      .then(function (result) {
        if (result) return result;
        if (needsInPageExportFallback()) {
          console.log("EXPORT PATH:", "(in-page panel — iOS)");
          return finish("panel", filename);
        }
        if (options.folderExportOnly) {
          console.log("EXPORT PATH:", "(folder export failed)");
          return finish("failed", filename);
        }
        console.log("EXPORT PATH:", "(fallback — browser download)");
        downloadTextFile(filename, content, mime);
        return finish("fallback", filename);
      });
  }

  function buildYardPackageFilename(manifest, options) {
    options = options || {};
    var track = resolveExportTrack(manifest, options.fallbackTrack);
    var date = resolveExportDate(manifest);
    return track + "_" + date + "_yard-package.json";
  }

  function deliverYardPackageExport(content, options) {
    options = options || {};
    var manifest = options.manifest || loadMeetingManifest();
    var filename = buildYardPackageFilename(manifest, { fallbackTrack: options.fallbackTrack });
    return deliverFileExport(filename, content, {
      manifest: manifest,
      directoryHandle: options.directoryHandle,
      mime: "application/json;charset=utf-8",
    });
  }

  function deliverMeetingExport(kind, content, options) {
    options = options || {};
    var manifest = options.manifest || loadMeetingManifest();
    var filename = buildMeetingExportFilename(kind, manifest, {
      fallbackTrack: options.fallbackTrack,
    });
    return deliverFileExport(filename, content, {
      manifest: manifest,
      directoryHandle: options.directoryHandle,
      mime: "text/csv;charset=utf-8",
      folderExportOnly: options.folderExportOnly !== false,
    });
  }

  window.MeetingExportDelivery = {
    MANIFEST_KEY: MANIFEST_KEY,
    normalizeRaceNo: normalizeRaceNo,
    buildMeetingKey: buildMeetingKey,
    sanitizeMeetingSlug: sanitizeMeetingSlug,
    parseMeetingFolderMeta: parseMeetingFolderMeta,
    loadMeetingManifest: loadMeetingManifest,
    saveMeetingManifest: saveMeetingManifest,
    loadMeetingDirectoryHandle: loadMeetingDirectoryHandle,
    saveMeetingDirectoryHandle: saveMeetingDirectoryHandle,
    supportsDirectoryPicker: supportsDirectoryPicker,
    isIOSExportDevice: isIOSExportDevice,
    needsInPageExportFallback: needsInPageExportFallback,
    pickMeetingDirectory: pickMeetingDirectory,
    prepareFolderForExport: prepareFolderForExport,
    buildMeetingExportFilename: buildMeetingExportFilename,
    buildYardPackageFilename: buildYardPackageFilename,
    syncManifestFromRaces: syncManifestFromRaces,
    readMeetingCsvFromDirectory: readMeetingCsvFromDirectory,
    deliverMeetingExport: deliverMeetingExport,
    deliverYardPackageExport: deliverYardPackageExport,
    downloadTextFile: downloadTextFile,
  };
})();
