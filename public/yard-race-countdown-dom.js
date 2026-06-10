/**
 * Plain-JS port of src/lib/yard-race-countdown.ts for /ipad-yard-dom (iOS 12).
 */
(function () {
  if (window.YardRaceCountdown) return;

  var RACE1_COUNTDOWN_MINUTES = 20;
  var SUBSEQUENT_COUNTDOWN_AFTER_PREV_START_MINUTES = 5;

  function normalizeRaceNoFromId(id) {
    var trimmed = String(id == null ? "" : id).trim();
    var match = /^R?(\d+)$/i.exec(trimmed);
    if (match) return match[1];
    return trimmed;
  }

  function raceLabelFromId(id) {
    var no = normalizeRaceNoFromId(id);
    return /^R/i.test(String(id).trim()) ? String(id).trim().toUpperCase() : "R" + no;
  }

  function parseStartTimeFromRaceTitle(title) {
    var withMeridiem = String(title).match(/\b(\d{1,2}:\d{2}\s*(?:am|pm))\b/i);
    if (withMeridiem && withMeridiem[1]) {
      return withMeridiem[1].replace(/\s+/g, " ").trim().toLowerCase();
    }
    var bare = String(title).match(/\b(\d{1,2}:\d{2})\b/);
    return bare ? bare[1] : null;
  }

  function parseClockTo24Hour(hours, minutes, meridiem) {
    var mer = meridiem ? String(meridiem).toLowerCase() : undefined;
    if (mer === "pm" && hours < 12) return hours + 12;
    if (mer === "am" && hours === 12) return 0;
    if (mer === "am" || mer === "pm") return hours;
    if (hours >= 1 && hours <= 7) return hours + 12;
    return hours;
  }

  function parseStartTimeToDate(title, meetingDate, now) {
    var token = parseStartTimeFromRaceTitle(title);
    if (!token) return null;

    var match = token.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
    if (!match) return null;

    var hours = parseInt(match[1], 10);
    var minutes = parseInt(match[2], 10);
    var meridiem = match[3];
    if (!isFinite(hours) || !isFinite(minutes)) return null;

    var hour24 = parseClockTo24Hour(hours, minutes, meridiem);

    var year;
    var month;
    var day;

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

    return new Date(year, month, day, hour24, minutes, 0, 0);
  }

  function buildRaceSchedule(races, meetingDate, now) {
    var schedule = [];
    var sorted = races.slice().sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });

    for (var i = 0; i < sorted.length; i++) {
      var race = sorted[i];
      var startTime = parseStartTimeToDate(race.title, meetingDate, now);
      if (!startTime) continue;
      schedule.push({
        raceNo: normalizeRaceNoFromId(race.id),
        raceLabel: raceLabelFromId(race.id),
        title: race.title,
        startTime: startTime,
      });
    }

    return schedule;
  }

  function countdownStartForRace(index, schedule) {
    if (index === 0) {
      return new Date(schedule[0].startTime.getTime() - RACE1_COUNTDOWN_MINUTES * 60 * 1000);
    }
    var previousStart = schedule[index - 1].startTime;
    return new Date(
      previousStart.getTime() + SUBSEQUENT_COUNTDOWN_AFTER_PREV_START_MINUTES * 60 * 1000,
    );
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function formatCountdownSeconds(totalSeconds) {
    var seconds = Math.max(0, Math.ceil(totalSeconds));
    var mm = Math.floor(seconds / 60);
    var ss = seconds % 60;
    return pad2(mm) + ":" + pad2(ss);
  }

  function formatRaceStartTimeLabel(date) {
    return date
      .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })
      .replace(/\s/g, " ")
      .toLowerCase();
  }

  function getNextRaceCountdown(races, now, meetingDate) {
    now = now || new Date();
    races = races || [];
    var schedule = buildRaceSchedule(races, meetingDate, now);
    if (!schedule.length) return null;

    var last = schedule[schedule.length - 1];
    if (now.getTime() >= last.startTime.getTime()) {
      return {
        status: "complete",
        raceNo: last.raceNo,
        raceLabel: last.raceLabel,
        raceStartTime: last.startTime,
        countdownStartTime: countdownStartForRace(schedule.length - 1, schedule),
        secondsRemaining: 0,
        secondsUntilCountdownStarts: 0,
        displayStartTime: formatRaceStartTimeLabel(last.startTime),
      };
    }

    for (var i = 0; i < schedule.length; i++) {
      var race = schedule[i];
      var countdownStart = countdownStartForRace(i, schedule);
      var raceStart = race.startTime;

      if (now.getTime() < countdownStart.getTime()) {
        var secondsUntilCountdownStarts = (countdownStart.getTime() - now.getTime()) / 1000;
        return {
          status: i === 0 ? "not_started" : "between_races",
          raceNo: race.raceNo,
          raceLabel: race.raceLabel,
          raceStartTime: raceStart,
          countdownStartTime: countdownStart,
          secondsRemaining: 0,
          secondsUntilCountdownStarts: secondsUntilCountdownStarts,
          displayStartTime: formatRaceStartTimeLabel(raceStart),
        };
      }

      if (now.getTime() >= countdownStart.getTime() && now.getTime() < raceStart.getTime()) {
        var secondsRemaining = (raceStart.getTime() - now.getTime()) / 1000;
        return {
          status: "counting_down",
          raceNo: race.raceNo,
          raceLabel: race.raceLabel,
          raceStartTime: raceStart,
          countdownStartTime: countdownStart,
          secondsRemaining: secondsRemaining,
          secondsUntilCountdownStarts: 0,
          displayStartTime: formatRaceStartTimeLabel(raceStart),
        };
      }
    }

    return null;
  }

  window.YardRaceCountdown = {
    getNextRaceCountdown: getNextRaceCountdown,
    formatCountdownSeconds: formatCountdownSeconds,
    formatRaceStartTimeLabel: formatRaceStartTimeLabel,
    parseStartTimeFromRaceTitle: parseStartTimeFromRaceTitle,
  };
})();
