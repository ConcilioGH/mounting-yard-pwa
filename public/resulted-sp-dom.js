/**
 * Plain-JS resulted SP poller for /ipad-yard-dom (iOS 12).
 */
(function () {
  if (window.ResultedSpDom) return;

  var STORAGE_PREFIX = "resulted-sp:";
  var UPDATED_EVENT = "mounting-yard-resulted-sp-updated";
  var START_DELAY_MS = 3 * 60 * 1000;
  var POLL_INTERVAL_MS = 2 * 60 * 1000;
  var UI_TICK_MS = 15000;

  var panelError = "";
  var activePoller = null;
  var activeCtx = null;

  function escapeJsString(value) {
    return String(value == null ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
  }

  function raceLogLabel(raceNo) {
    var normalized = normalizeRaceNo(raceNo);
    return "R" + normalized;
  }

  function errorMessage(err) {
    if (err && err.message) return err.message;
    return String(err == null ? "Unknown error" : err);
  }

  function showPanelError(err) {
    panelError = "Resulted SP error: " + errorMessage(err);
    console.warn(panelError, err);
    if (typeof document === "undefined") return;
    var el = document.getElementById("iy-resulted-sp-error");
    if (el) {
      el.textContent = panelError;
      el.style.display = "block";
    }
  }

  function clearPanelError() {
    panelError = "";
    if (typeof document === "undefined") return;
    var el = document.getElementById("iy-resulted-sp-error");
    if (el) {
      el.textContent = "";
      el.style.display = "none";
    }
  }

  function ensurePoller() {
    if (activePoller) {
      logTrace("poller ready", { meetingId: activeCtx && activeCtx.meetingId });
      return true;
    }
    var yard = window.ipadYard;
    if (yard && yard.resultedSpPoller) {
      activePoller = yard.resultedSpPoller;
      logTrace("poller ready", { meetingId: yard.activeMeetingId, source: "ipadYard.resultedSpPoller" });
      return true;
    }
    if (yard && typeof yard.refreshResultedSpPoller === "function") {
      yard.refreshResultedSpPoller();
      if (yard.resultedSpPoller) {
        activePoller = yard.resultedSpPoller;
        logTrace("poller ready", { meetingId: yard.activeMeetingId, source: "refreshResultedSpPoller" });
        return !!activePoller;
      }
    }
    showPanelError("Resulted SP poller not ready");
    return false;
  }

  function runAsyncAction(action) {
    clearPanelError();
    try {
      var result = action();
      if (result && typeof result.then === "function") {
        result.catch(function (err) {
          showPanelError(err);
        });
      }
    } catch (err) {
      showPanelError(err);
    }
  }

  function logTrace(layer, detail) {
    if (typeof console !== "undefined") {
      console.log("[resulted-sp] " + layer, detail || "");
    }
  }

  function normalizeRaceNo(value) {
    var trimmed = String(value == null ? "" : value).trim();
    var match = /^R?(\d+)$/i.exec(trimmed);
    return match ? match[1] : trimmed;
  }

  function normalizeHorseName(horse) {
    return String(horse || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "");
  }

  function isoToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function resolveMeetingDate(value) {
    var v = String(value == null ? "" : value).trim();
    if (!v || v === "today") return isoToday();
    return v;
  }

  function yardVenueLabel(manifest) {
    if (!manifest) return "unknown";
    var track = String(manifest.trackName || manifest.trackSlug || "").trim();
    return track || "unknown";
  }

  function tabVenueLabel(tabMeeting) {
    if (!tabMeeting) return "unknown";
    var code = String(tabMeeting.venue || tabMeeting.venueMnemonic || "").trim();
    var name = String(tabMeeting.venueName || tabMeeting.meetingName || "").trim();
    if (code && name && code.toUpperCase() !== name.toUpperCase()) return code + " " + name;
    return code || name || "unknown";
  }

  function yardRunnerNamesFromRace(yardRace) {
    var names = [];
    if (!yardRace || !yardRace.runners) return names;
    for (var i = 0; i < yardRace.runners.length; i++) {
      if (yardRace.runners[i].horse) names.push(normalizeHorseName(yardRace.runners[i].horse));
    }
    return names;
  }

  function tabRunnerNamesFromParsed(parsed) {
    var names = [];
    if (!parsed || !parsed.runners) return names;
    for (var i = 0; i < parsed.runners.length; i++) {
      var horse = parsed.runners[i].horseName || parsed.runners[i].horse;
      if (horse) names.push(normalizeHorseName(horse));
    }
    return names;
  }

  function countNameOverlap(yardNames, tabNames) {
    var tabSet = {};
    for (var i = 0; i < tabNames.length; i++) tabSet[tabNames[i]] = true;
    var count = 0;
    for (var j = 0; j < yardNames.length; j++) {
      if (tabSet[yardNames[j]]) count++;
    }
    return count;
  }

  function requiredOverlapCount(yardRunnerCount) {
    if (yardRunnerCount <= 0) return 0;
    var pct = Math.ceil(yardRunnerCount * 0.6);
    if (yardRunnerCount <= 6) return pct;
    return Math.max(pct, 4);
  }

  function evaluateMeetingGuard(manifest, yardRace, tabMeeting, parsed, raceNo) {
    logTrace("meeting guard start", {
      meetingId: manifest && manifest.meetingId,
      raceNo: normalizeRaceNo(raceNo),
      yardDate: manifest && manifest.date,
      tabDate: tabMeeting && tabMeeting.date,
    });

    var yardDate = resolveMeetingDate(manifest && manifest.date);
    var yardVenue = yardVenueLabel(manifest);
    var tabDate = resolveMeetingDate(tabMeeting && tabMeeting.date);
    var tabVenue = tabVenueLabel(tabMeeting);
    var yardNames = yardRunnerNamesFromRace(yardRace);
    var tabNames = tabRunnerNamesFromParsed(parsed);
    var yardRunnerCount = yardNames.length;
    var tabRunnerCount = tabNames.length;
    var runnerOverlapCount = countNameOverlap(yardNames, tabNames);
    var required = requiredOverlapCount(yardRunnerCount);
    var importedAt = new Date().toISOString();

    var meta = {
      tabDate: tabDate,
      tabVenue: tabVenue,
      importedAt: importedAt,
      raceNo: normalizeRaceNo(raceNo),
      runnerOverlapCount: runnerOverlapCount,
      yardRunnerCount: yardRunnerCount,
      tabRunnerCount: tabRunnerCount,
    };

    if (yardDate !== tabDate) {
      var dateReason =
        "Resulted SP blocked: TAB card is for " +
        tabDate +
        " " +
        tabVenue +
        ", but loaded Yard meeting is " +
        yardDate +
        " " +
        yardVenue +
        ".";
      logTrace("meeting guard blocked", { reason: dateReason, meta: meta });
      return { passed: false, reason: dateReason, meta: meta };
    }

    if (!yardRace) {
      var noRaceReason =
        "Imported TAB results but the loaded meeting has no race " +
        raceLogLabel(raceNo) +
        " to match runners against.";
      logTrace("meeting guard blocked", { reason: noRaceReason, meta: meta });
      return { passed: false, reason: noRaceReason, meta: meta };
    }

    if (runnerOverlapCount === 0 && tabRunnerCount > 0 && yardRunnerCount > 0) {
      var zeroReason =
        "Imported TAB results but no runners matched the loaded meeting card. The meeting date or race card may not match TAB.";
      logTrace("meeting guard blocked", { reason: zeroReason, meta: meta });
      return { passed: false, reason: zeroReason, meta: meta };
    }

    if (yardRunnerCount > 0 && runnerOverlapCount < required) {
      var overlapReason =
        "Resulted SP blocked: runner overlap too weak for " +
        raceLogLabel(raceNo) +
        " (" +
        runnerOverlapCount +
        "/" +
        yardRunnerCount +
        " matched, need " +
        required +
        ").";
      logTrace("meeting guard blocked", { reason: overlapReason, meta: meta });
      return { passed: false, reason: overlapReason, meta: meta };
    }

    logTrace("meeting guard passed", meta);
    return { passed: true, meta: meta };
  }

  function raceResultIsExportable(raceState) {
    return Boolean(raceState && raceState.guardPassed === true && raceState.status === "imported");
  }

  function storageKey(meetingId) {
    var id = String(meetingId || "").trim();
    if (!id) return "";
    return id.indexOf(STORAGE_PREFIX) === 0 ? id : STORAGE_PREFIX + id;
  }

  function loadState(meetingId) {
    var key = storageKey(meetingId);
    if (!key || !window.localStorage) {
      return { meetingId: meetingId, updatedAt: "", races: {} };
    }
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return { meetingId: meetingId, updatedAt: "", races: {} };
      var parsed = JSON.parse(raw);
      return {
        meetingId: meetingId,
        resultsUrl: parsed.resultsUrl || "",
        updatedAt: parsed.updatedAt || "",
        races: parsed.races && typeof parsed.races === "object" ? parsed.races : {},
      };
    } catch (e) {
      return { meetingId: meetingId, updatedAt: "", races: {} };
    }
  }

  function saveState(state, persistMeta) {
    var key = storageKey(state.meetingId);
    if (!key || !window.localStorage) return;
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(state));
    logTrace("persisted", {
      storage: "localStorage",
      key: key,
      meetingId: state.meetingId,
      raceNos: Object.keys(state.races || {}),
      meta: persistMeta || null,
    });
    try {
      window.dispatchEvent(
        new CustomEvent(UPDATED_EVENT, { detail: { meetingId: state.meetingId } }),
      );
    } catch (e) {
      /* ignore */
    }
  }

  function parseDecimalSp(raw) {
    var cleaned = String(raw || "")
      .replace(/\u00a0/g, " ")
      .replace(/[$£€]/g, "")
      .replace(/\s+/g, "")
      .trim();
    if (!cleaned) return null;
    var match = cleaned.match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;
    var n = parseFloat(match[1]);
    if (!isFinite(n) || n <= 0) return null;
    return Math.round(n * 100) / 100;
  }

  function parseFullFieldRace(html, targetRaceNo) {
    var doc;
    try {
      doc = new DOMParser().parseFromString(html, "text/html");
    } catch (e) {
      return null;
    }
    var runners = [];
    var currentRaceNo = "";
    var tables = doc.querySelectorAll("table");
    for (var ti = 0; ti < tables.length; ti++) {
      var table = tables[ti];
      var caption = table.querySelector("caption");
      if (caption && caption.textContent) {
        var raceMatch = /Race\s*(\d+)/i.exec(caption.textContent);
        if (raceMatch) currentRaceNo = normalizeRaceNo(raceMatch[1]);
      }
      var rows = table.querySelectorAll("tr");
      if (rows.length < 2) continue;
      var headerCells = [];
      var headerRow = rows[0];
      var hc = headerRow.querySelectorAll("th,td");
      for (var hi = 0; hi < hc.length; hi++) {
        headerCells.push(String(hc[hi].textContent || "").toLowerCase().replace(/\s+/g, " "));
      }
      var placeIdx = -1;
      var spIdx = -1;
      var nameIdx = -1;
      for (var h = 0; h < headerCells.length; h++) {
        if (/pos|place|fin/.test(headerCells[h])) placeIdx = h;
        if (headerCells[h].indexOf("sp") >= 0 || headerCells[h].indexOf("price") >= 0) spIdx = h;
        if (headerCells[h].indexOf("horse") >= 0 || headerCells[h] === "name") nameIdx = h;
      }
      if (placeIdx < 0 || spIdx < 0) continue;
      for (var ri = 1; ri < rows.length; ri++) {
        var cells = rows[ri].querySelectorAll("td,th");
        if (cells.length <= Math.max(placeIdx, spIdx)) continue;
        var placeRaw = String(cells[placeIdx].textContent || "").trim();
        var place = parseInt(placeRaw.replace(/\D/g, ""), 10);
        if (!isFinite(place) || place < 1 || place > 40) continue;
        var sp = parseDecimalSp(cells[spIdx].textContent || "");
        if (sp == null) continue;
        var horseName =
          nameIdx >= 0
            ? String(cells[nameIdx].textContent || "").trim()
            : String(cells[1] ? cells[1].textContent : "").trim();
        if (!horseName) continue;
        var raceNo = currentRaceNo;
        if (targetRaceNo && normalizeRaceNo(targetRaceNo) !== raceNo) continue;
        if (!raceNo) continue;
        runners.push({
          finishPosition: place,
          horseName: horseName,
          sp: sp,
          margin: "",
          resultStatus: "resulted",
        });
      }
    }
    if (!runners.length) return null;
    return { raceNo: targetRaceNo || currentRaceNo, runners: runners };
  }

  function isRaceResulted(parsed) {
    if (!parsed || !parsed.runners || parsed.runners.length < 3) return false;
    var has1 = false;
    var has2 = false;
    var has3 = false;
    for (var i = 0; i < parsed.runners.length; i++) {
      if (parsed.runners[i].finishPosition === 1) has1 = true;
      if (parsed.runners[i].finishPosition === 2) has2 = true;
      if (parsed.runners[i].finishPosition === 3) has3 = true;
    }
    return has1 && has2 && has3;
  }

  function inferTabJurisdiction(manifest) {
    var slug = String((manifest && (manifest.trackSlug || manifest.trackName)) || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    var vic = { flemington: 1, caulfield: 1, "moonee-valley": 1 };
    var qld = { "eagle-farm": 1, doomben: 1 };
    if (vic[slug]) return "VIC";
    if (qld[slug]) return "QLD";
    return "NSW";
  }

  function tabStateCodeForJurisdiction(jurisdiction) {
    if (jurisdiction === "VIC") return "V";
    if (jurisdiction === "QLD") return "Q";
    if (jurisdiction === "SA") return "S";
    if (jurisdiction === "WA") return "W";
    if (jurisdiction === "TAS") return "T";
    return "R";
  }

  function tabResultsDateSegment(manifestDate) {
    var trimmed = String(manifestDate || "").trim();
    if (!trimmed) return "today";
    var today = new Date().toISOString().slice(0, 10);
    if (trimmed === today) return "today";
    return trimmed;
  }

  function buildTabResultsMeetingUrl(ref, raceNo) {
    var date = tabResultsDateSegment(ref.date === "today" ? "" : ref.date);
    var raceType = ref.raceType || "R";
    var venue = String(ref.venueMnemonic || "")
      .trim()
      .toUpperCase();
    if (!venue) return "";
    var base =
      "https://www.tab.com.au/racing/meetings/results/" +
      encodeURIComponent(date) +
      "/" +
      raceType +
      "/" +
      venue;
    if (!raceNo) return base;
    return base + "/" + encodeURIComponent(normalizeRaceNo(raceNo));
  }

  function buildTabResultsListUrl(manifest) {
    var jurisdiction = inferTabJurisdiction(manifest);
    var state = tabStateCodeForJurisdiction(jurisdiction);
    var date = tabResultsDateSegment(manifest && manifest.date);
    return (
      "https://www.tab.com.au/racing/meetings/results/" + encodeURIComponent(date) + "/" + state
    );
  }

  function buildTabMeetingRef(meeting, manifest) {
    var raceType = String(meeting.raceType || "R")
      .trim()
      .toUpperCase();
    if (raceType !== "H" && raceType !== "G") raceType = "R";
    return {
      date: meeting.meetingDate || tabResultsDateSegment(manifest && manifest.date),
      raceType: raceType,
      venueMnemonic: meeting.venueMnemonic,
      meetingName: meeting.meetingName,
    };
  }

  function buildTabResultsUrl(manifest, meetingRef, raceNo) {
    if (meetingRef) {
      var meetingUrl = buildTabResultsMeetingUrl(meetingRef, raceNo);
      if (meetingUrl) return meetingUrl;
    }
    return buildTabResultsListUrl(manifest);
  }

  function buildRacingNswUrl(manifest) {
    if (!manifest) return "";
    var track = String(manifest.trackSlug || manifest.trackName || "meeting")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    var date = String(manifest.date || "").replace(/-/g, "");
    if (!track || !date) return "";
    return "https://racing.racingnsw.com.au/racing/Results/All/" + track + "/" + date;
  }

  function buildRacenetUrl(manifest) {
    if (!manifest) return "";
    var track = String(manifest.trackSlug || manifest.trackName || "meeting")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    var date = String(manifest.date || "").replace(/-/g, "");
    if (!track || !date) return "";
    return "https://www.racenet.com.au/horse-racing-results/" + track + "-" + date;
  }

  function fetchTabApiJson(path, jurisdiction) {
    var url =
      "/api/fetch-tab-api?path=" +
      encodeURIComponent(path.replace(/^\//, "")) +
      "&jurisdiction=" +
      encodeURIComponent(jurisdiction || "NSW");
    logTrace("fetch start", { url: url, path: path, jurisdiction: jurisdiction || "NSW" });
    return fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          logTrace("fetch response", {
            path: path,
            ok: res.ok,
            status: res.status,
            meetingCount: data && data.meetings ? data.meetings.length : undefined,
            raceStatus: data && data.raceStatus ? data.raceStatus : undefined,
            runnerCount: data && data.runners ? data.runners.length : undefined,
          });
          if (!res.ok) {
            throw new Error((data && data.error) || "TAB API failed (" + res.status + ")");
          }
          return data;
        });
    });
  }

  function normalizeTrackLabel(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  }

  function meetingMatchesManifest(meeting, manifest) {
    var target = normalizeTrackLabel((manifest && (manifest.trackName || manifest.trackSlug)) || "");
    var candidate = normalizeTrackLabel(meeting.meetingName || "");
    if (!target || !candidate) return false;
    if (candidate === target) return true;
    return candidate.indexOf(target) >= 0 || target.indexOf(candidate) >= 0;
  }

  function buildFinishMap(results) {
    var map = {};
    if (!results || !results.length) return map;
    for (var i = 0; i < results.length; i++) {
      var sel = results[i];
      if (sel && sel[0]) map[sel[0]] = i + 1;
    }
    return map;
  }

  function isTabRaceResulted(race) {
    if (!race) return false;
    var okStatus = { Paying: 1, Closed: 1, Final: 1, Results: 1, Interim: 1 };
    if (!okStatus[race.raceStatus]) return false;
    if (!race.results || race.results.length < 3) return false;
    for (var i = 0; i < 3; i++) {
      var sel = race.results[i];
      var runnerNo = sel && sel[0];
      if (!(typeof runnerNo === "number" && runnerNo > 0)) return false;
    }
    return true;
  }

  function parseTabRaceDetail(detail, raceNo) {
    if (!isTabRaceResulted(detail)) return null;
    var finishMap = buildFinishMap(detail.results);
    var runners = [];
    var list = detail.runners || [];
    for (var i = 0; i < list.length; i++) {
      var runner = list[i];
      var horseName = String(runner.runnerName || "").trim();
      if (!horseName) continue;
      var scratched =
        (runner.parimutuel && String(runner.parimutuel.bettingStatus || "").toLowerCase().indexOf("scratch") >= 0) ||
        (runner.fixedOdds && String(runner.fixedOdds.bettingStatus || "").toLowerCase().indexOf("scratch") >= 0);
      var finishPosition = finishMap[runner.runnerNumber] || 0;
      var sp = runner.parimutuel && runner.parimutuel.returnWin;
      if (scratched) {
        runners.push({
          finishPosition: 0,
          horseName: horseName,
          sp: 0,
          margin: "",
          resultStatus: "scratched",
        });
        continue;
      }
      if (sp == null || !isFinite(sp) || sp <= 0) continue;
      runners.push({
        finishPosition: finishPosition,
        horseName: horseName,
        sp: sp,
        margin: "",
        resultStatus: finishPosition > 0 ? "resulted" : "unplaced",
      });
    }
    var top3 = 0;
    for (var j = 0; j < runners.length; j++) {
      if (runners[j].finishPosition >= 1 && runners[j].finishPosition <= 3 && runners[j].sp > 0) top3++;
    }
    if (top3 < 3) return null;
    var parsed = { raceNo: raceNo, runners: runners };
    logTrace("parsed result", {
      raceNo: raceNo,
      runnerCount: runners.length,
      top3: top3,
      winners: runners
        .filter(function (r) {
          return r.finishPosition >= 1 && r.finishPosition <= 3;
        })
        .map(function (r) {
          return { horse: r.horseName, finish: r.finishPosition, sp: r.sp };
        }),
    });
    return parsed;
  }

  function findThoroughbredMeeting(manifest, jurisdiction) {
    var preferredDate = (manifest && manifest.date) || "today";
    var today = isoToday();
    var datesToTry =
      !preferredDate || preferredDate === "today"
        ? ["today"]
        : preferredDate === today
          ? [today]
          : [preferredDate, "today"];
    var seen = {};
    var chain = Promise.resolve(null);

    function pickMeeting(meetings) {
      for (var i = 0; i < meetings.length; i++) {
        if (meetings[i].raceType === "R" && meetingMatchesManifest(meetings[i], manifest)) {
          return meetings[i];
        }
      }
      return null;
    }

    for (var di = 0; di < datesToTry.length; di++) {
      (function (date) {
        chain = chain.then(function (found) {
          if (found) return found;
          if (seen[date]) return null;
          seen[date] = true;
          return fetchTabApiJson("racing/dates/" + date + "/meetings", jurisdiction).then(function (data) {
            return pickMeeting((data && data.meetings) || []);
          });
        });
      })(datesToTry[di]);
    }
    return chain;
  }

  function fetchTabRaceResults(manifest, raceNo) {
    var jurisdiction = inferTabJurisdiction(manifest);
    return findThoroughbredMeeting(manifest, jurisdiction).then(function (meeting) {
      if (!meeting) return { status: "meeting_not_found" };
      var meetingRef = buildTabMeetingRef(meeting, manifest);
      var resultsPageUrl = buildTabResultsMeetingUrl(meetingRef, raceNo);
      var raceSummary = null;
      var races = meeting.races || [];
      for (var r = 0; r < races.length; r++) {
        if (String(races[r].raceNumber) === String(raceNo)) {
          raceSummary = races[r];
          break;
        }
      }
      if (!raceSummary || !isTabRaceResulted(raceSummary)) {
        return { status: "not_ready", resultsPageUrl: resultsPageUrl };
      }
      var meetingDate = meeting.meetingDate || (manifest && manifest.date) || "today";
      var path =
        "racing/dates/" +
        meetingDate +
        "/meetings/" +
        (meeting.raceType || "R") +
        "/" +
        meeting.venueMnemonic +
        "/races/" +
        raceNo;
      return fetchTabApiJson(path, jurisdiction).then(function (detail) {
        var parsed = parseTabRaceDetail(detail, raceNo);
        if (!parsed) return { status: "not_ready", resultsPageUrl: resultsPageUrl };
        return {
          status: "imported",
          parsed: parsed,
          source: "tab",
          resultsPageUrl: resultsPageUrl,
          tabMeeting: {
            date: meeting.meetingDate || meetingDate,
            venue: meeting.venueMnemonic || "",
            venueName: meeting.meetingName || "",
            raceCount: races.length,
          },
        };
      });
    });
  }

  function importRaceFromSources(manifest, raceNo) {
    return fetchTabRaceResults(manifest, raceNo)
      .catch(function (err) {
        return { status: "error", message: err && err.message ? err.message : String(err) };
      })
      .then(function (tabResult) {
        if (tabResult.status === "imported") {
          return {
            imported: true,
            parsed: tabResult.parsed,
            source: tabResult.source || "tab",
            tabResultsUrl: tabResult.resultsPageUrl,
            tabMeeting: tabResult.tabMeeting || null,
          };
        }
        if (tabResult.status === "not_ready") {
          return { imported: false, notReady: true, tabResultsUrl: tabResult.resultsPageUrl };
        }
        var fallbacks = [
          { source: "racingnsw", url: buildRacingNswUrl(manifest) },
          { source: "racenet", url: buildRacenetUrl(manifest) },
        ];
        var chain = Promise.resolve({ imported: false, notReady: false, lastError: tabResult.message || "TAB unavailable" });
        for (var i = 0; i < fallbacks.length; i++) {
          (function (fb) {
            chain = chain.then(function (prev) {
              if (prev.imported) return prev;
              if (!fb.url) return prev;
              return fetchResultsHtml(fb.url)
                .then(function (html) {
                  var parsed = parseFullFieldRace(html, raceNo);
                  if (parsed && isRaceResulted(parsed)) {
                    return {
                      imported: true,
                      parsed: parsed,
                      source: fb.source,
                      tabMeeting: {
                        date: manifest && manifest.date,
                        venue: (manifest && manifest.trackSlug) || "",
                        venueName: (manifest && manifest.trackName) || "",
                        raceCount: null,
                      },
                    };
                  }
                  return prev;
                })
                .catch(function (err) {
                  return { imported: false, notReady: false, lastError: err && err.message ? err.message : String(err) };
                });
            });
          })(fallbacks[i]);
        }
        return chain;
      });
  }

  function parseStartTimeFromRaceTitle(title) {
    var withMeridiem = String(title).match(/\b(\d{1,2}:\d{2}\s*(?:am|pm))\b/i);
    if (withMeridiem && withMeridiem[1]) return withMeridiem[1].replace(/\s+/g, " ").trim().toLowerCase();
    var bare = String(title).match(/\b(\d{1,2}:\d{2})\b/);
    return bare ? bare[1] : null;
  }

  function parseStartTimeToDate(title, meetingDate, now) {
    var token = parseStartTimeFromRaceTitle(title);
    if (!token) return null;
    var match = token.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
    if (!match) return null;
    var hours = parseInt(match[1], 10);
    var minutes = parseInt(match[2], 10);
    var mer = match[3] ? String(match[3]).toLowerCase() : "";
    if (mer === "pm" && hours < 12) hours += 12;
    if (mer === "am" && hours === 12) hours = 0;
    if (!mer && hours >= 1 && hours <= 7) hours += 12;
    var year, month, day;
    var dateMatch = meetingDate && String(meetingDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
      year = parseInt(dateMatch[1], 10);
      month = parseInt(dateMatch[2], 10) - 1;
      day = parseInt(dateMatch[3], 10);
    } else {
      year = now.getFullYear();
      month = now.getMonth();
      day = now.getDate();
    }
    return new Date(year, month, day, hours, minutes, 0, 0);
  }

  function buildSchedule(races, meetingDate) {
    var now = new Date();
    var schedule = [];
    var sorted = races.slice().sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
    for (var i = 0; i < sorted.length; i++) {
      var race = sorted[i];
      var start = parseStartTimeToDate(race.title, meetingDate, now);
      if (!start) continue;
      var raceNo = normalizeRaceNo(race.id);
      schedule.push({
        raceNo: raceNo,
        raceLabel: /^R/i.test(String(race.id).trim()) ? String(race.id).trim().toUpperCase() : "R" + raceNo,
        startTime: start,
      });
    }
    return schedule;
  }

  function matchRunnerNo(race, horseName) {
    if (!race || !race.runners) return "";
    var key = normalizeHorseName(horseName);
    for (var i = 0; i < race.runners.length; i++) {
      if (normalizeHorseName(race.runners[i].horse) === key) {
        return String(race.runners[i].no);
      }
    }
    return "";
  }

  function findStoredRunner(state, raceNo, runnerNo, horseName) {
    var race = state.races[normalizeRaceNo(raceNo)];
    if (!race || !race.runners) return null;
    var no = String(runnerNo);
    if (no) {
      for (var i = 0; i < race.runners.length; i++) {
        if (String(race.runners[i].runnerNo) === no) return race.runners[i];
      }
    }
    var nameKey = normalizeHorseName(horseName);
    if (nameKey) {
      for (var j = 0; j < race.runners.length; j++) {
        var stored = race.runners[j];
        if (
          normalizeHorseName(stored.horse) === nameKey ||
          (stored.runnerNameKey && stored.runnerNameKey === nameKey)
        ) {
          return stored;
        }
      }
    }
    return null;
  }

  function fetchResultsHtml(url) {
    return fetch("/api/fetch-results-html?url=" + encodeURIComponent(url), {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    }).then(function (res) {
      if (!res.ok) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            throw new Error((data && data.error) || "Fetch failed (" + res.status + ")");
          });
      }
      return res.text();
    });
  }

  function buildResultedSpCsv(state) {
    var rows = [];
    var raceNos = Object.keys(state.races).sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true });
    });
    for (var ri = 0; ri < raceNos.length; ri++) {
      var raceNo = raceNos[ri];
      var race = state.races[raceNo];
      if (!raceResultIsExportable(race)) continue;
      for (var ui = 0; ui < race.runners.length; ui++) {
        var runner = race.runners[ui];
        rows.push([
          runner.raceNo,
          runner.runnerNo,
          runner.horse,
          runner.officialSP,
          runner.finishPosition,
          runner.margin || "",
          runner.resultStatus || "",
          runner.importedAt || "",
          runner.source || "",
        ]);
      }
    }
    var header =
      "race_no,runner_no,horse,official_sp,finish_position,margin,result_status,imported_at,source";
    return (
      header +
      "\n" +
      rows
        .map(function (row) {
          return row
            .map(function (cell) {
              var s = String(cell == null ? "" : cell);
              if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
              return s;
            })
            .join(",");
        })
        .join("\n")
    );
  }

  function formatStatusLabel(status, importedAt, source, lastError) {
    var sourceSuffix = source ? " · " + source : "";
    if (status === "imported" && importedAt) {
      var d = new Date(importedAt);
      if (!isNaN(d.getTime())) {
        return (
          "Imported " +
          d
            .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })
            .replace(/\s/g, " ")
            .toLowerCase() +
          sourceSuffix
        );
      }
    }
    if (status === "failed") {
      return lastError ? "Failed — " + lastError : "Failed";
    }
    if (status === "waiting") return "Waiting";
    if (status === "checking") {
      return (lastError ? "Checking — " + lastError : "Checking") + sourceSuffix;
    }
    if (status === "late") return ("Late / retrying" + sourceSuffix).trim();
    return status || "Waiting";
  }

  var RESULT_STATUS_LABELS = {
    not_checked: "Not checked",
    not_resulted: "Not resulted yet",
    imported: "Imported",
    blocked: "Blocked",
    error: "Error",
  };

  function getRaceResultsStatus(raceState) {
    if (!raceState) {
      return { code: "not_checked", label: RESULT_STATUS_LABELS.not_checked };
    }
    if (raceState.resultImportStatus && RESULT_STATUS_LABELS[raceState.resultImportStatus]) {
      return {
        code: raceState.resultImportStatus,
        label: RESULT_STATUS_LABELS[raceState.resultImportStatus],
      };
    }
    if (raceState.status === "imported" && raceState.guardPassed === true) {
      return { code: "imported", label: RESULT_STATUS_LABELS.imported };
    }
    if (raceState.status === "failed" && raceState.guardPassed === false) {
      return { code: "blocked", label: RESULT_STATUS_LABELS.blocked };
    }
    if (raceState.status === "error" || (raceState.lastError && raceState.status !== "imported" && raceState.guardPassed !== false)) {
      if (
        raceState.lastError &&
        (raceState.lastError.indexOf("Resulted SP blocked") >= 0 ||
          raceState.lastError.indexOf("runner overlap") >= 0)
      ) {
        return { code: "blocked", label: RESULT_STATUS_LABELS.blocked };
      }
      if (raceState.lastError && raceState.lastError.indexOf("not available yet") >= 0) {
        return { code: "not_resulted", label: RESULT_STATUS_LABELS.not_resulted };
      }
      if (raceState.lastError) {
        return { code: "error", label: RESULT_STATUS_LABELS.error };
      }
    }
    if (
      raceState.status === "not_resulted" ||
      (raceState.lastError && raceState.lastError.indexOf("not available yet") >= 0)
    ) {
      return { code: "not_resulted", label: RESULT_STATUS_LABELS.not_resulted };
    }
    if (!raceState.lastCheckedAt) {
      return { code: "not_checked", label: RESULT_STATUS_LABELS.not_checked };
    }
    return { code: "not_resulted", label: RESULT_STATUS_LABELS.not_resulted };
  }

  function formatImportAllSummary(summary) {
    summary = summary || {};
    return (
      "Resulted SP: imported " +
      (summary.imported || 0) +
      ", skipped " +
      (summary.skipped || 0) +
      ", blocked " +
      (summary.blocked || 0) +
      ", errors " +
      (summary.errors || 0)
    );
  }

  function applyImportResult(ctx, raceNo, importResult, tabUrl, existing, options) {
    options = options || {};
    var meetingId = ctx.meetingId;
    var state = loadState(meetingId);
    var resultsUrl = (importResult && importResult.tabResultsUrl) || tabUrl || state.resultsUrl || "";

    if (importResult && importResult.notReady) {
      state.resultsUrl = resultsUrl;
      state.races[raceNo] = {
        status: "not_resulted",
        resultImportStatus: "not_resulted",
        isChecking: false,
        lastCheckedAt: new Date().toISOString(),
        lastError: "",
        runners: (state.races[raceNo] && state.races[raceNo].runners) || [],
      };
      saveState(state, { raceNo: raceNo, phase: "not_ready" });
      return { outcome: "skipped" };
    }

    if (!importResult || !importResult.imported) {
      var errMsg = (importResult && importResult.lastError) || "Official results import failed.";
      state.resultsUrl = resultsUrl;
      state.races[raceNo] = {
        status: "error",
        resultImportStatus: "error",
        isChecking: false,
        lastCheckedAt: new Date().toISOString(),
        lastError: errMsg,
        runners: (state.races[raceNo] && state.races[raceNo].runners) || [],
      };
      saveState(state, { raceNo: raceNo, phase: "error", error: errMsg });
      if (!options.silent) showPanelError(errMsg);
      return { outcome: "error" };
    }

    var race = null;
    for (var i = 0; i < ctx.races.length; i++) {
      if (normalizeRaceNo(ctx.races[i].id) === raceNo) race = ctx.races[i];
    }
    var guard = evaluateMeetingGuard(
      ctx.manifest,
      race,
      importResult.tabMeeting,
      importResult.parsed,
      raceNo,
    );
    if (!guard.passed) {
      if (!options.silent) showPanelError(guard.reason);
      state.resultsUrl = resultsUrl;
      state.races[raceNo] = {
        status: "failed",
        resultImportStatus: "blocked",
        isChecking: false,
        lastCheckedAt: new Date().toISOString(),
        lastError: guard.reason,
        guardPassed: false,
        guardMeta: guard.meta,
        runners: (existing && existing.runners) || (state.races[raceNo] && state.races[raceNo].runners) || [],
      };
      saveState(state, { raceNo: raceNo, phase: "guard_blocked", error: guard.reason });
      return { outcome: "blocked" };
    }

    var importedAt = guard.meta.importedAt;
    var source = importResult.source || "tab";
    var runners = [];
    for (var pi = 0; pi < importResult.parsed.runners.length; pi++) {
      var row = importResult.parsed.runners[pi];
      var matchedRunnerNo = matchRunnerNo(race, row.horseName);
      runners.push({
        raceNo: raceNo,
        runnerNo: matchedRunnerNo,
        runnerNameKey: normalizeHorseName(row.horseName),
        horse: row.horseName,
        officialSP: row.resultStatus === "scratched" || row.sp <= 0 ? "" : String(row.sp),
        finishPosition: row.finishPosition > 0 ? row.finishPosition : "",
        margin: row.margin || "",
        resultStatus: row.resultStatus || "resulted",
        importedAt: importedAt,
        source: source,
      });
    }
    logTrace("matched runner", {
      raceNo: raceNo,
      matchedRunnerNos: runners.filter(function (r) {
        return r.runnerNo;
      }).length,
      totalImported: runners.length,
      yardRaceFound: !!race,
      runnerOverlapCount: guard.meta.runnerOverlapCount,
    });
    state.resultsUrl = resultsUrl;
    state.races[raceNo] = {
      status: "imported",
      resultImportStatus: "imported",
      importedAt: importedAt,
      lastCheckedAt: importedAt,
      source: source,
      isChecking: false,
      guardPassed: true,
      guardMeta: guard.meta,
      runners: runners,
    };
    saveState(state, { raceNo: raceNo, phase: "imported", runnerCount: runners.length });
    if (window.MeetingExportDelivery && ctx.manifest) {
      var csv = buildResultedSpCsv(state);
      window.MeetingExportDelivery.deliverMeetingExport("resulted-sp", csv, {
        manifest: ctx.manifest,
      });
    }
    return { outcome: "imported" };
  }

  function importAllResultedRaces(ctx) {
    var schedule = buildSchedule(ctx.races, ctx.manifest && ctx.manifest.date);
    var summary = { imported: 0, skipped: 0, blocked: 0, errors: 0 };
    clearPanelError();

    function step(index) {
      if (index >= schedule.length) {
        var msg = formatImportAllSummary(summary);
        logTrace("import all complete", summary);
        if (window.ipadYard && typeof window.ipadYard.setImportMsg === "function") {
          window.ipadYard.setImportMsg(msg);
        }
        if (ctx.onChange) ctx.onChange(loadState(ctx.meetingId));
        return Promise.resolve(summary);
      }
      var raceNo = schedule[index].raceNo;
      var state = loadState(ctx.meetingId);
      var existing = state.races[raceNo];
      if (existing && existing.status === "imported" && existing.guardPassed === true) {
        return step(index + 1);
      }
      return resolveTabResultsUrl(ctx.manifest, raceNo)
        .then(function (resolvedUrl) {
          var tabUrl = resolvedUrl || buildTabResultsListUrl(ctx.manifest);
          return importRaceFromSources(ctx.manifest, raceNo).then(function (importResult) {
            return applyImportResult(ctx, raceNo, importResult, tabUrl, existing, { silent: true, bulk: true });
          });
        })
        .then(function (result) {
          if (result.outcome === "imported") summary.imported++;
          else if (result.outcome === "skipped") summary.skipped++;
          else if (result.outcome === "blocked") summary.blocked++;
          else summary.errors++;
          if (ctx.onChange) ctx.onChange(loadState(ctx.meetingId));
          return step(index + 1);
        })
        .catch(function (err) {
          summary.errors++;
          var stateOnErr = loadState(ctx.meetingId);
          stateOnErr.races[raceNo] = {
            status: "error",
            resultImportStatus: "error",
            isChecking: false,
            lastCheckedAt: new Date().toISOString(),
            lastError: errorMessage(err),
            runners: (stateOnErr.races[raceNo] && stateOnErr.races[raceNo].runners) || [],
          };
          saveState(stateOnErr, { raceNo: raceNo, phase: "error", error: errorMessage(err) });
          if (ctx.onChange) ctx.onChange(loadState(ctx.meetingId));
          return step(index + 1);
        });
    }

    return step(0);
  }

  function clearMeetingResults(meetingId) {
    var key = storageKey(meetingId);
    if (key && window.localStorage) {
      localStorage.removeItem(key);
    }
    clearPanelError();
    if (activeCtx && activeCtx.meetingId === meetingId && activeCtx.onChange) {
      activeCtx.onChange(loadState(meetingId));
    }
    logTrace("cleared meeting results", { meetingId: meetingId, key: key });
  }

  function computeDisplayStatus(state, raceNo, schedule, now) {
    var raceState = state.races[raceNo];
    if (raceState && raceState.status === "imported" && raceState.runners && raceState.runners.length) {
      return "imported";
    }
    if (raceState && raceState.status === "failed") return "failed";
    if (raceState && raceState.isChecking) return "checking";
    var index = -1;
    for (var i = 0; i < schedule.length; i++) {
      if (schedule[i].raceNo === raceNo) index = i;
    }
    if (index < 0) return "waiting";
    var entry = schedule[index];
    if (now.getTime() < entry.startTime.getTime() + START_DELAY_MS) return "waiting";
    var next = schedule[index + 1];
    if (next && now.getTime() >= next.startTime.getTime() && raceState && raceState.status !== "imported") {
      return "late";
    }
    return raceState && raceState.status === "late" ? "late" : "checking";
  }

  function resolveTabResultsUrl(manifest, raceNo) {
    var jurisdiction = inferTabJurisdiction(manifest);
    return findThoroughbredMeeting(manifest, jurisdiction).then(function (meeting) {
      if (!meeting) return null;
      return buildTabResultsMeetingUrl(buildTabMeetingRef(meeting, manifest), raceNo);
    });
  }

  function importRace(ctx, raceNo, force) {
    var meetingId = ctx.meetingId;
    logTrace("poller ready", { meetingId: meetingId, raceNo: raceNo, force: !!force });
    var state = loadState(meetingId);
    var existing = state.races[raceNo];
    if (!force && existing && existing.status === "imported" && existing.runners && existing.runners.length) {
      return Promise.resolve(state);
    }

    return resolveTabResultsUrl(ctx.manifest, raceNo).then(function (resolvedUrl) {
      var tabUrl = resolvedUrl || buildTabResultsListUrl(ctx.manifest);
      state = loadState(meetingId);
      state.resultsUrl = tabUrl;
      state.races[raceNo] = {
        status: "checking",
        isChecking: true,
        runners: existing && existing.runners ? existing.runners : [],
      };
      saveState(state, { raceNo: raceNo, phase: "checking" });
      if (ctx.onChange) ctx.onChange(loadState(meetingId));

      return importRaceFromSources(ctx.manifest, raceNo)
        .then(function (importResult) {
          var outcome = applyImportResult(ctx, raceNo, importResult, tabUrl, existing, {
            silent: false,
          });
          if (ctx.onChange) ctx.onChange(loadState(meetingId));
          return loadState(meetingId);
        })
        .catch(function (err) {
          state = loadState(meetingId);
          state.races[raceNo] = {
            status: "error",
            resultImportStatus: "error",
            isChecking: false,
            lastCheckedAt: new Date().toISOString(),
            lastError: err && err.message ? err.message : String(err),
            runners: (state.races[raceNo] && state.races[raceNo].runners) || [],
          };
          saveState(state, { raceNo: raceNo, phase: "error", error: state.races[raceNo].lastError });
          if (ctx.onChange) ctx.onChange(state);
          return state;
        });
    });
  }

  function startPoller(ctx) {
    stopPoller();
    activeCtx = ctx;
    var schedule = buildSchedule(ctx.races, ctx.manifest && ctx.manifest.date);
    var inFlight = {};

    function refreshLate() {
      var now = new Date();
      var state = loadState(ctx.meetingId);
      var changed = false;
      for (var i = 0; i < schedule.length; i++) {
        var raceNo = schedule[i].raceNo;
        var raceState = state.races[raceNo];
        if (raceState && raceState.status === "imported") continue;
        var next = schedule[i + 1];
        if (next && now.getTime() >= next.startTime.getTime()) {
          if (!raceState || raceState.status !== "late") {
            state.races[raceNo] = {
              status: "late",
              runners: (raceState && raceState.runners) || [],
            };
            changed = true;
          }
        }
      }
      if (changed) saveState(state);
      if (ctx.onChange) ctx.onChange(loadState(ctx.meetingId));
    }

    function shouldPoll(raceNo, now) {
      var state = loadState(ctx.meetingId);
      var raceState = state.races[raceNo];
      if (raceState && raceState.status === "imported") return false;
      if (raceState && raceState.status === "failed") return false;
      var entry = null;
      for (var i = 0; i < schedule.length; i++) {
        if (schedule[i].raceNo === raceNo) entry = schedule[i];
      }
      if (!entry) return false;
      if (now.getTime() < entry.startTime.getTime() + START_DELAY_MS) return false;
      var last = raceState && raceState.lastCheckedAt ? Date.parse(raceState.lastCheckedAt) : 0;
      if (last && now.getTime() - last < POLL_INTERVAL_MS) return false;
      return true;
    }

    function pollTick(onlyRaceNo, force) {
      var now = new Date();
      refreshLate();
      var targets = onlyRaceNo
        ? [normalizeRaceNo(onlyRaceNo)]
        : schedule.map(function (s) {
            return s.raceNo;
          }).filter(function (raceNo) {
            return force || shouldPoll(raceNo, now);
          });
      for (var i = 0; i < targets.length; i++) {
        (function (raceNo) {
          if (inFlight[raceNo]) return;
          inFlight[raceNo] = true;
          importRace(ctx, raceNo, !!force)
            .catch(function (err) {
              showPanelError(err);
            })
            .finally(function () {
              inFlight[raceNo] = false;
            });
        })(targets[i]);
      }
    }

    activePoller = {
      stop: function () {
        clearInterval(uiTimer);
        clearInterval(pollTimer);
        activePoller = null;
        if (window.ipadYard) window.ipadYard.resultedSpPoller = null;
      },
      checkNow: function (raceNo) {
        pollTick(raceNo, true);
      },
      importRaceNow: function (raceNo) {
        return importRace(ctx, normalizeRaceNo(raceNo), true);
      },
      importAllResultedNow: function () {
        return importAllResultedRaces(ctx);
      },
      resetRace: function (raceNo) {
        var state = loadState(ctx.meetingId);
        delete state.races[normalizeRaceNo(raceNo)];
        saveState(state);
        if (ctx.onChange) ctx.onChange(state);
      },
    };

    if (window.ipadYard) window.ipadYard.resultedSpPoller = activePoller;

    var uiTimer = setInterval(refreshLate, UI_TICK_MS);
    var pollTimer = setInterval(function () {
      pollTick();
    }, POLL_INTERVAL_MS);
    pollTick();

    return activePoller;
  }

  function stopPoller() {
    if (activePoller) activePoller.stop();
  }

  function renderPanel(container, ctx) {
    if (!container) return;
    var schedule = buildSchedule(ctx.races, ctx.manifest && ctx.manifest.date);
    var state = loadState(ctx.meetingId);
    var now = new Date();
    var html =
      '<div class="iy-resulted-sp">' +
      '<div id="iy-resulted-sp-error" class="iy-resulted-sp-error"' +
      (panelError ? ">" + panelError.replace(/</g, "&lt;").replace(/>/g, "&gt;") : ' style="display:none">') +
      "</div>" +
      '<div class="iy-resulted-sp-head"><strong>Resulted SP</strong>' +
      '<span class="iy-resulted-sp-head-actions">' +
      '<button type="button" class="iy-toolbar-btn iy-resulted-sp-check-all" onclick="window.resultedSp.importAllResulted()">Import all resulted</button>' +
      '<button type="button" class="iy-toolbar-btn iy-resulted-sp-check-all" onclick="window.resultedSp.checkNow()">Check now</button>' +
      '<button type="button" class="iy-toolbar-btn iy-resulted-sp-clear" onclick="window.resultedSp.clearMeeting()">Clear results</button>' +
      "</span></div><ul class=\"iy-resulted-sp-list\">";
    for (var i = 0; i < schedule.length; i++) {
      var entry = schedule[i];
      var raceState = state.races[entry.raceNo];
      var rsStatus = getRaceResultsStatus(raceState);
      var raceJs = escapeJsString(entry.raceNo);
      html +=
        '<li class="iy-resulted-sp-item"><span class="iy-resulted-sp-label">' +
        entry.raceLabel +
        ' <span class="iy-rs-status iy-rs-status-' +
        rsStatus.code +
        '">' +
        rsStatus.label +
        "</span>";
      if (raceState && raceState.lastError && rsStatus.code !== "imported" && rsStatus.code !== "not_resulted") {
        html +=
          ' <span class="iy-rs-status-detail">' +
          String(raceState.lastError)
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;") +
          "</span>";
      } else if (raceState && raceState.importedAt && rsStatus.code === "imported") {
        html +=
          ' <span class="iy-rs-status-detail">' +
          formatStatusLabel("imported", raceState.importedAt, raceState.source, "") +
          "</span>";
      }
      html +=
        '</span><span class="iy-resulted-sp-actions">' +
        '<button type="button" class="iy-resulted-sp-btn" onclick="window.resultedSp.checkRace(\'' +
        raceJs +
        "')\">Check</button>" +
        '<button type="button" class="iy-resulted-sp-btn" onclick="window.resultedSp.importRace(\'' +
        raceJs +
        "')\">Import</button>" +
        '<button type="button" class="iy-resulted-sp-btn" onclick="window.resultedSp.resetRace(\'' +
        raceJs +
        "')\">Reset</button></span></li>";
    }
    html += "</ul></div>";
    container.innerHTML = html;
    logTrace("rendered", { meetingId: ctx.meetingId, raceCount: schedule.length });
  }

  function getRunnerResult(meetingId, raceNo, runnerNo, horseName) {
    var state = loadState(meetingId);
    var raceState = state.races[normalizeRaceNo(raceNo)];
    if (!raceResultIsExportable(raceState)) return null;
    var stored = findStoredRunner(state, raceNo, runnerNo, horseName);
    if (!stored) return null;
    return {
      finishPosition: stored.finishPosition === "" ? "" : stored.finishPosition,
      sp: stored.officialSP || "",
      margin: stored.margin || "",
      source: stored.source || "",
    };
  }

  function getOfficialSp(meetingId, raceNo, runnerNo, horseName) {
    var state = loadState(meetingId);
    var raceState = state.races[normalizeRaceNo(raceNo)];
    if (!raceResultIsExportable(raceState)) return "";
    var result = getRunnerResult(meetingId, raceNo, runnerNo, horseName);
    return result ? result.sp : "";
  }

  function getRaceImportState(meetingId, raceNo) {
    var state = loadState(meetingId);
    var raceState = state.races[normalizeRaceNo(raceNo)];
    if (!raceState) return null;
    var rsStatus = getRaceResultsStatus(raceState);
    return {
      status: raceState.status || "",
      resultImportStatus: rsStatus.code,
      guardPassed: raceState.guardPassed === true,
      guardMeta: raceState.guardMeta || null,
      importedAt: raceState.importedAt || "",
      lastError: raceState.lastError || "",
    };
  }

  function getRaceResultsStatusForMeeting(meetingId, raceNo) {
    var state = loadState(meetingId);
    return getRaceResultsStatus(state.races[normalizeRaceNo(raceNo)]);
  }

  window.resultedSp = {
    checkNow: function () {
      logTrace("click", { action: "checkNow" });
      if (!ensurePoller()) return;
      runAsyncAction(function () {
        activePoller.checkNow();
      });
    },
    checkRace: function (raceNo) {
      logTrace("click", { action: "checkRace", race: raceLogLabel(raceNo) });
      if (!ensurePoller()) return;
      runAsyncAction(function () {
        activePoller.checkNow(normalizeRaceNo(raceNo));
      });
    },
    importRace: function (raceNo) {
      logTrace("click", { action: "importRace", race: raceLogLabel(raceNo) });
      if (!ensurePoller()) return;
      runAsyncAction(function () {
        return activePoller.importRaceNow(normalizeRaceNo(raceNo));
      });
    },
    importAllResulted: function () {
      logTrace("click", { action: "importAllResulted" });
      if (!ensurePoller()) return;
      runAsyncAction(function () {
        return activePoller.importAllResultedNow();
      });
    },
    clearMeeting: function () {
      logTrace("click", { action: "clearMeeting" });
      if (!ensurePoller() || !activeCtx) return;
      var meetingId = activeCtx.meetingId;
      if (!meetingId) return;
      var label = (activeCtx.manifest && activeCtx.manifest.meetingLabel) || meetingId;
      var ok = window.confirm(
        "Clear all Resulted SP data for " +
          label +
          "?\n\nYard assessments on this iPad are not changed.",
      );
      if (!ok) return;
      clearMeetingResults(meetingId);
      if (activeCtx.onChange) activeCtx.onChange(loadState(meetingId));
      if (window.ipadYard && typeof window.ipadYard.renderResultedSpPanel === "function") {
        window.ipadYard.renderResultedSpPanel();
      }
      if (window.ipadYard && typeof window.ipadYard.bump === "function") {
        window.ipadYard.bump();
      }
      if (window.ipadYard && typeof window.ipadYard.setImportMsg === "function") {
        window.ipadYard.setImportMsg("Cleared Resulted SP for this meeting.");
      }
    },
    resetRace: function (raceNo) {
      logTrace("click", { action: "resetRace", race: raceLogLabel(raceNo) });
      if (!ensurePoller()) return;
      clearPanelError();
      try {
        activePoller.resetRace(normalizeRaceNo(raceNo));
      } catch (err) {
        showPanelError(err);
      }
    },
  };

  window.ResultedSpDom = {
    loadState: loadState,
    saveState: saveState,
    getOfficialSp: getOfficialSp,
    getRunnerResult: getRunnerResult,
    getRaceImportState: getRaceImportState,
    getRaceResultsStatus: getRaceResultsStatusForMeeting,
    clearMeetingResults: clearMeetingResults,
    buildResultedSpCsv: buildResultedSpCsv,
    startPoller: startPoller,
    stopPoller: stopPoller,
    renderPanel: renderPanel,
    UPDATED_EVENT: UPDATED_EVENT,
  };
})();
