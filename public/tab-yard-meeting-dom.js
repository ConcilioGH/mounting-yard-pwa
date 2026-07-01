/**
 * Load today's TAB thoroughbred meeting card into iPad Yard race format.
 */
(function () {
  if (window.TabYardMeeting) return;

  function fetchTabApiJson(path, jurisdiction) {
    var url =
      "/api/fetch-tab-api?path=" +
      encodeURIComponent(String(path || "").replace(/^\//, "")) +
      "&jurisdiction=" +
      encodeURIComponent(jurisdiction || "NSW");
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
          if (!res.ok) {
            throw new Error((data && data.error) || "TAB API failed (" + res.status + ")");
          }
          return data;
        });
    });
  }

  function sanitizeMeetingSlug(input) {
    if (window.MeetingExportDelivery && window.MeetingExportDelivery.sanitizeMeetingSlug) {
      return window.MeetingExportDelivery.sanitizeMeetingSlug(input);
    }
    var slug = String(input == null ? "" : input)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "meeting";
  }

  function titleCaseWords(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\b[a-z]/g, function (ch) {
        return ch.toUpperCase();
      });
  }

  function parseMeetingDate(meeting) {
    var raw = String((meeting && meeting.meetingDate) || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return new Date().toISOString().slice(0, 10);
  }

  function venueSlugFromMeeting(meeting) {
    return sanitizeMeetingSlug(
      (meeting && (meeting.meetingName || meeting.venueMnemonic)) || "meeting",
    );
  }

  function isRunnerScratched(runner, scratchings) {
    var pariStatus = String((runner.parimutuel && runner.parimutuel.bettingStatus) || "").toLowerCase();
    var fixedStatus = String((runner.fixedOdds && runner.fixedOdds.bettingStatus) || "").toLowerCase();
    if (pariStatus.indexOf("scratch") >= 0 || fixedStatus.indexOf("scratch") >= 0) return true;
    if (!scratchings || !scratchings.length) return false;
    for (var i = 0; i < scratchings.length; i++) {
      if (scratchings[i].runnerNumber === runner.runnerNumber) return true;
    }
    return false;
  }

  function formatOdds(runner) {
    var win =
      (runner.fixedOdds && runner.fixedOdds.returnWin) ||
      (runner.parimutuel && runner.parimutuel.returnWin);
    if (win == null || !isFinite(win) || win <= 0) return "";
    return "$" + Number(win).toFixed(2);
  }

  function buildRaceTitle(raceNo, raceName, distance) {
    var title = "Race " + raceNo;
    if (raceName) title += " — " + titleCaseWords(raceName);
    if (distance) title += " " + distance + "m";
    return title;
  }

  function convertTabRunnerToYard(runner, scratchings) {
    var barrier =
      typeof runner.barrierNumber === "number" && runner.barrierNumber > 0
        ? runner.barrierNumber
        : 0;
    return {
      no: runner.runnerNumber,
      horse: titleCaseWords(runner.runnerName),
      br: barrier,
      trainer: String(runner.trainerName || runner.trainerFullName || "").trim(),
      jockey: String(runner.riderDriverName || runner.riderDriverFullName || "").trim(),
      odds: formatOdds(runner),
      scratched: isRunnerScratched(runner, scratchings),
      w_ir: "N/A",
    };
  }

  function fetchRaceDetail(meeting, raceNo, jurisdiction) {
    var date = meeting.meetingDate || "today";
    var path =
      "racing/dates/" +
      date +
      "/meetings/" +
      (meeting.raceType || "R") +
      "/" +
      meeting.venueMnemonic +
      "/races/" +
      raceNo;
    return fetchTabApiJson(path, jurisdiction);
  }

  function loadTodayTabMeeting(venueCode, options) {
    options = options || {};
    var code = String(venueCode || "")
      .trim()
      .toUpperCase();
    if (!code) {
      return Promise.reject(new Error("Enter a TAB venue code (e.g. RKE for Randwick Kensington)."));
    }
    var jurisdiction = options.jurisdiction || "NSW";

    return fetchTabApiJson("racing/dates/today/meetings", jurisdiction).then(function (data) {
      var meetings = (data && data.meetings) || [];
      var meeting = null;
      for (var i = 0; i < meetings.length; i++) {
        if (
          meetings[i].raceType === "R" &&
          String(meetings[i].venueMnemonic || "").toUpperCase() === code
        ) {
          meeting = meetings[i];
          break;
        }
      }
      if (!meeting) {
        throw new Error(
          "No TAB thoroughbred meeting found for venue code " +
            code +
            " today. Check the code and try again.",
        );
      }

      var raceSummaries = meeting.races || [];
      if (!raceSummaries.length) {
        throw new Error("TAB meeting " + code + " has no races listed.");
      }

      raceSummaries = raceSummaries.slice().sort(function (a, b) {
        return a.raceNumber - b.raceNumber;
      });

      var fetches = raceSummaries.map(function (summary) {
        return fetchRaceDetail(meeting, summary.raceNumber, jurisdiction).then(function (detail) {
          return { summary: summary, detail: detail };
        });
      });

      return Promise.all(fetches).then(function (results) {
        var races = [];
        for (var r = 0; r < results.length; r++) {
          var summary = results[r].summary;
          var detail = results[r].detail;
          var scratchings = detail.scratchings || summary.scratchings || [];
          var runners = [];
          var list = detail.runners || [];
          for (var j = 0; j < list.length; j++) {
            if (!list[j] || !list[j].runnerNumber) continue;
            runners.push(convertTabRunnerToYard(list[j], scratchings));
          }
          runners.sort(function (a, b) {
            return a.no - b.no;
          });
          if (!runners.length) continue;
          races.push({
            id: "R" + summary.raceNumber,
            title: buildRaceTitle(
              summary.raceNumber,
              summary.raceName || detail.raceName,
              summary.raceDistance || detail.raceDistance,
            ),
            runners: runners,
          });
        }

        if (!races.length) {
          throw new Error(
            "TAB meeting card for " + code + " could not be loaded — no runners returned.",
          );
        }

        var date = parseMeetingDate(meeting);
        var trackName = titleCaseWords(meeting.meetingName || code);
        var trackSlug = venueSlugFromMeeting(meeting);
        var meetingId = date + "-" + trackSlug;
        var meetingFolderPath = "meetings/" + meetingId;

        return {
          races: races,
          meta: {
            meetingId: meetingId,
            date: date,
            venue: code,
            venueName: trackName,
            trackName: trackName,
            trackSlug: trackSlug,
            meetingFolderPath: meetingFolderPath,
            meetingLabel: trackName + " · " + date,
            venueMnemonic: meeting.venueMnemonic || code,
          },
        };
      });
    });
  }

  function csvEscape(value) {
    var text = String(value == null ? "" : value);
    if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function buildMeetingCsvFromTab(payload) {
    if (!payload || !payload.races || !payload.races.length) return "";
    var meta = payload.meta || {};
    var headers = [
      "race_id",
      "race_title",
      "runner_no",
      "horse",
      "barrier",
      "trainer",
      "jockey",
      "odds",
      "scratched",
      "w_ir",
      "date",
      "venue",
    ];
    var lines = [headers.join(",")];
    for (var r = 0; r < payload.races.length; r++) {
      var race = payload.races[r];
      for (var u = 0; u < race.runners.length; u++) {
        var runner = race.runners[u];
        lines.push(
          [
            race.id,
            race.title,
            runner.no,
            runner.horse,
            runner.br,
            runner.trainer,
            runner.jockey,
            runner.odds,
            runner.scratched ? "1" : "0",
            runner.w_ir || "N/A",
            meta.date || "",
            meta.trackName || meta.venueName || "",
          ]
            .map(csvEscape)
            .join(","),
        );
      }
    }
    return lines.join("\n");
  }

  window.TabYardMeeting = {
    loadTodayTabMeeting: loadTodayTabMeeting,
    buildMeetingCsvFromTab: buildMeetingCsvFromTab,
  };
})();
