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

  function saveState(state) {
    var key = storageKey(state.meetingId);
    if (!key || !window.localStorage) return;
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(key, JSON.stringify(state));
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
    return fetch(url, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }).then(function (res) {
      if (!res.ok) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            throw new Error((data && data.error) || "TAB API failed (" + res.status + ")");
          });
      }
      return res.json();
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
    var finish = buildFinishMap(race.results);
    return finish[1] && finish[2] && finish[3];
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
    return { raceNo: raceNo, runners: runners };
  }

  function findThoroughbredMeeting(manifest, jurisdiction) {
    var preferredDate = (manifest && manifest.date) || "today";
    var datesToTry = preferredDate === "today" ? ["today"] : [preferredDate, "today"];
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
                    return { imported: true, parsed: parsed, source: fb.source };
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
      if (normalizeHorseName(race.runners[i].horse) === key) return String(race.runners[i].no);
    }
    return "";
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
      if (!race || !race.runners) continue;
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

  var activePoller = null;

  function formatStatusLabel(status, importedAt, source) {
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
    if (status === "waiting") return "Waiting";
    if (status === "checking") return ("Checking" + sourceSuffix).trim();
    if (status === "late") return ("Late / retrying" + sourceSuffix).trim();
    if (status === "failed") return "Failed";
    return status || "Waiting";
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
      saveState(state);
      if (ctx.onChange) ctx.onChange(loadState(meetingId));

      return importRaceFromSources(ctx.manifest, raceNo)
        .then(function (importResult) {
          state = loadState(meetingId);
          var resultsUrl = importResult.tabResultsUrl || tabUrl;
          if (!importResult.imported) {
            state.resultsUrl = resultsUrl;
            state.races[raceNo] = {
              status: state.races[raceNo] && state.races[raceNo].status === "late" ? "late" : "checking",
              isChecking: false,
              lastCheckedAt: new Date().toISOString(),
              lastError: importResult.notReady
                ? "Official results not available yet."
                : importResult.lastError || "Official results not available yet.",
              runners: (state.races[raceNo] && state.races[raceNo].runners) || [],
            };
            saveState(state);
            if (ctx.onChange) ctx.onChange(state);
            return state;
          }
          var race = null;
          for (var i = 0; i < ctx.races.length; i++) {
            if (normalizeRaceNo(ctx.races[i].id) === raceNo) race = ctx.races[i];
          }
          var importedAt = new Date().toISOString();
          var source = importResult.source || "tab";
          var runners = [];
          for (var pi = 0; pi < importResult.parsed.runners.length; pi++) {
            var row = importResult.parsed.runners[pi];
            runners.push({
              raceNo: raceNo,
              runnerNo: matchRunnerNo(race, row.horseName),
              horse: row.horseName,
              officialSP: row.resultStatus === "scratched" || row.sp <= 0 ? "" : String(row.sp),
              finishPosition: row.finishPosition > 0 ? row.finishPosition : "",
              margin: row.margin || "",
              resultStatus: row.resultStatus || "resulted",
              importedAt: importedAt,
              source: source,
            });
          }
          state.resultsUrl = resultsUrl;
          state.races[raceNo] = {
            status: "imported",
            importedAt: importedAt,
            lastCheckedAt: importedAt,
            source: source,
            isChecking: false,
            runners: runners,
          };
          saveState(state);
          if (ctx.onChange) ctx.onChange(state);
          if (window.MeetingExportDelivery && ctx.manifest) {
            var csv = buildResultedSpCsv(state);
            window.MeetingExportDelivery.deliverMeetingExport("resulted-sp", csv, {
              manifest: ctx.manifest,
            });
          }
          return state;
        })
        .catch(function (err) {
          state = loadState(meetingId);
          state.races[raceNo] = {
            status: state.races[raceNo] && state.races[raceNo].status === "late" ? "late" : "checking",
            isChecking: false,
            lastCheckedAt: new Date().toISOString(),
            lastError: err && err.message ? err.message : String(err),
            runners: (state.races[raceNo] && state.races[raceNo].runners) || [],
          };
          saveState(state);
          if (ctx.onChange) ctx.onChange(state);
          return state;
        });
    });
  }

  function startPoller(ctx) {
    stopPoller();
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

    function pollTick(onlyRaceNo) {
      var now = new Date();
      refreshLate();
      var targets = onlyRaceNo
        ? [normalizeRaceNo(onlyRaceNo)]
        : schedule.map(function (s) {
            return s.raceNo;
          }).filter(function (raceNo) {
            return shouldPoll(raceNo, now);
          });
      for (var i = 0; i < targets.length; i++) {
        (function (raceNo) {
          if (inFlight[raceNo]) return;
          inFlight[raceNo] = true;
          importRace(ctx, raceNo, false).finally(function () {
            inFlight[raceNo] = false;
          });
        })(targets[i]);
      }
    }

    var uiTimer = setInterval(refreshLate, UI_TICK_MS);
    var pollTimer = setInterval(function () {
      pollTick();
    }, POLL_INTERVAL_MS);
    pollTick();

    activePoller = {
      stop: function () {
        clearInterval(uiTimer);
        clearInterval(pollTimer);
        activePoller = null;
      },
      checkNow: function (raceNo) {
        pollTick(raceNo);
      },
      importRaceNow: function (raceNo) {
        return importRace(ctx, normalizeRaceNo(raceNo), true);
      },
      resetRace: function (raceNo) {
        var state = loadState(ctx.meetingId);
        delete state.races[normalizeRaceNo(raceNo)];
        saveState(state);
        if (ctx.onChange) ctx.onChange(state);
      },
    };
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
    var html = '<div class="iy-resulted-sp"><div class="iy-resulted-sp-head"><strong>Resulted SP</strong>';
    html +=
      '<button type="button" class="iy-toolbar-btn iy-resulted-sp-check-all" data-action="check-all">Check now</button></div><ul class="iy-resulted-sp-list">';
    for (var i = 0; i < schedule.length; i++) {
      var entry = schedule[i];
      var raceState = state.races[entry.raceNo];
      var status = computeDisplayStatus(state, entry.raceNo, schedule, now);
      html +=
        '<li class="iy-resulted-sp-item"><span class="iy-resulted-sp-label">' +
        entry.raceLabel +
        " " +
        formatStatusLabel(status, raceState && raceState.importedAt, raceState && raceState.source) +
        '</span><span class="iy-resulted-sp-actions">' +
        '<button type="button" class="iy-resulted-sp-btn" data-action="check" data-race="' +
        entry.raceNo +
        '">Check</button>' +
        '<button type="button" class="iy-resulted-sp-btn" data-action="import" data-race="' +
        entry.raceNo +
        '">Import</button>' +
        '<button type="button" class="iy-resulted-sp-btn" data-action="reset" data-race="' +
        entry.raceNo +
        '">Reset</button></span></li>';
    }
    html += "</ul></div>";
    container.innerHTML = html;
    var buttons = container.querySelectorAll("button[data-action]");
    for (var b = 0; b < buttons.length; b++) {
      buttons[b].addEventListener("click", function (ev) {
        var btn = ev.currentTarget;
        var action = btn.getAttribute("data-action");
        if (action === "check-all") {
          if (activePoller) activePoller.checkNow();
          return;
        }
        var raceNo = btn.getAttribute("data-race");
        if (!raceNo || !activePoller) return;
        if (action === "check") activePoller.checkNow(raceNo);
        else if (action === "import") activePoller.importRaceNow(raceNo);
        else if (action === "reset") activePoller.resetRace(raceNo);
      });
    }
  }

  function getOfficialSp(meetingId, raceNo, runnerNo) {
    var state = loadState(meetingId);
    var race = state.races[normalizeRaceNo(raceNo)];
    if (!race || !race.runners) return "";
    var no = String(runnerNo);
    for (var i = 0; i < race.runners.length; i++) {
      if (String(race.runners[i].runnerNo) === no) return race.runners[i].officialSP || "";
    }
    return "";
  }

  window.ResultedSpDom = {
    loadState: loadState,
    saveState: saveState,
    getOfficialSp: getOfficialSp,
    buildResultedSpCsv: buildResultedSpCsv,
    startPoller: startPoller,
    stopPoller: stopPoller,
    renderPanel: renderPanel,
    UPDATED_EVENT: UPDATED_EVENT,
  };
})();
