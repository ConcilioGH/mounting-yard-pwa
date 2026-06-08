/**
 * iPad Yard DOM — plain JS for /ipad-yard-dom (inline onclick on generated buttons).
 */
(function () {
  if (window.ipadYard) return;

  var cfg = window.IPAD_YARD_CONFIG || {};
  var ASSESSMENTS_KEY = cfg.assessmentsKey || "ipad-yard-assessments";
  var RACES_KEY = cfg.racesKey || "ipad-yard-races-v1";
  var MANIFEST_KEY = cfg.manifestKey || "mounting-yard-meeting-manifest-v1";
  var GEAR_TILES = cfg.gearTiles || [];
  var WET_TILE = cfg.wetTile || { code: "WET", label: "Wet Suitability" };
  var WET_BODY_TYPES = cfg.wetBodyTypes || [];
  var WET_FEET = cfg.wetFeet || [];
  var GEAR_LOCATIONS = cfg.gearLocations || [];

  function escapeAttr(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeHtml(value) {
    return escapeAttr(value);
  }

  window.ipadYard = {
    races: [],
    factorGroups: window.IPAD_YARD_FACTOR_GROUPS || [],
    gearPickerOpen: null,
    notesRunnerKey: null,
    state: {
      tapCount: 0,
      selectedRaceId: null,
      selectedRunnerNo: null,
      assessments: {},
      meetingLabel: "",
    },

    setText: function (id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value == null ? "" : String(value);
    },

    makeKey: function (raceId, runnerNo) {
      return raceId + "-" + runnerNo;
    },

    getRace: function () {
      var id = this.state.selectedRaceId;
      for (var i = 0; i < this.races.length; i++) {
        if (this.races[i].id === id) return this.races[i];
      }
      return this.races[0] || null;
    },

    getRunner: function () {
      var race = this.getRace();
      if (!race) return null;
      var no = this.state.selectedRunnerNo;
      for (var i = 0; i < race.runners.length; i++) {
        if (race.runners[i].no === no) return race.runners[i];
      }
      return race.runners[0] || null;
    },

    getCurrentAssessment: function () {
      var race = this.getRace();
      var runner = this.getRunner();
      if (!race || !runner) return null;
      return this.ensureAssessment(this.makeKey(race.id, runner.no));
    },

    ensureAssessment: function (key) {
      if (!this.state.assessments[key]) {
        this.state.assessments[key] = {
          positive: {},
          negative: {},
          gear: {},
          wet: {},
          notes: "",
        };
      }
      var a = this.state.assessments[key];
      if (!a.positive) a.positive = {};
      if (!a.negative) a.negative = {};
      if (!a.gear) a.gear = {};
      if (!a.wet) a.wet = {};
      if (a.notes == null) a.notes = "";
      return a;
    },

    nextPositive: function (v) {
      var n = v || 0;
      return n >= 3 ? 0 : n + 1;
    },

    nextNegative: function (v) {
      var n = v || 0;
      return n <= -3 ? 0 : n - 1;
    },

    marks: function (v) {
      if (!v) return "";
      if (v > 0) {
        var s = "";
        for (var i = 0; i < v; i++) s += "\u2713";
        return s;
      }
      var s2 = "";
      for (var j = 0; j < Math.abs(v); j++) s2 += "\u2212";
      return s2;
    },

    totals: function (assessment) {
      var pos = 0;
      var neg = 0;
      if (assessment && assessment.positive) {
        var pk = Object.keys(assessment.positive);
        for (var i = 0; i < pk.length; i++) {
          var pv = assessment.positive[pk[i]] || 0;
          if (pv > 0) pos += pv;
        }
      }
      if (assessment && assessment.negative) {
        var nk = Object.keys(assessment.negative);
        for (var j = 0; j < nk.length; j++) {
          var nv = assessment.negative[nk[j]] || 0;
          if (nv < 0) neg += Math.abs(nv);
        }
      }
      return { pos: pos, neg: neg, net: pos - neg };
    },

    formatNet: function (n) {
      return (n > 0 ? "+" : "") + n;
    },

    isPositiveFactor: function (factorKey) {
      if (factorKey === "Clean+") return true;
      return factorKey.indexOf("+") === factorKey.length - 1;
    },

    bump: function () {
      this.state.tapCount += 1;
    },

    persist: function () {
      try {
        localStorage.setItem(ASSESSMENTS_KEY, JSON.stringify(this.state));
      } catch (e) {
        this.setImportMsg("Could not save assessments: " + e.message);
      }
    },

    persistRaces: function () {
      try {
        localStorage.setItem(RACES_KEY, JSON.stringify(this.races));
      } catch (e) {
        this.setImportMsg("Could not save races: " + e.message);
      }
    },

    loadPersisted: function () {
      try {
        var raw = localStorage.getItem(ASSESSMENTS_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            if (parsed.assessments) this.state.assessments = parsed.assessments;
            if (parsed.selectedRaceId) this.state.selectedRaceId = parsed.selectedRaceId;
            if (parsed.selectedRunnerNo != null) this.state.selectedRunnerNo = parsed.selectedRunnerNo;
            if (parsed.tapCount != null) this.state.tapCount = parsed.tapCount;
          }
        }
      } catch (e) {
        this.setImportMsg("Load assessments failed: " + e.message);
      }
    },

    loadRaces: function () {
      try {
        var raw = localStorage.getItem(RACES_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.races = parsed;
            return;
          }
        }
      } catch (e) {
        this.setImportMsg("Load races failed: " + e.message);
      }
      this.races = window.IPAD_YARD_DEFAULT_RACES || [];
    },

    loadManifestLabel: function () {
      try {
        var raw = localStorage.getItem(MANIFEST_KEY);
        if (!raw) return;
        var manifest = JSON.parse(raw);
        var parts = [];
        if (manifest.date) parts.push(manifest.date);
        if (manifest.trackName) parts.push(manifest.trackName);
        this.state.meetingLabel = parts.join(" · ");
      } catch (e) {
        /* ignore */
      }
    },

    setImportMsg: function (msg) {
      this.setText("iy-import-msg", msg || "");
    },

    selectRace: function (raceId) {
      this.bump();
      this.gearPickerOpen = null;
      this.state.selectedRaceId = raceId;
      var race = this.getRace();
      if (race && race.runners && race.runners.length) {
        this.state.selectedRunnerNo = race.runners[0].no;
      }
      this.persist();
      this.render();
    },

    selectRunner: function (runnerNo) {
      this.bump();
      this.gearPickerOpen = null;
      this.state.selectedRunnerNo = Number(runnerNo);
      this.persist();
      this.render();
    },

    tapFactor: function (factorCode) {
      this.bump();
      this.gearPickerOpen = null;
      var race = this.getRace();
      var runner = this.getRunner();
      if (!race || !runner) return;
      var key = this.makeKey(race.id, runner.no);
      var assessment = this.ensureAssessment(key);
      if (this.isPositiveFactor(factorCode)) {
        var pv = assessment.positive[factorCode];
        assessment.positive[factorCode] = this.nextPositive(pv);
      } else {
        var nv = assessment.negative[factorCode];
        assessment.negative[factorCode] = this.nextNegative(nv);
      }
      assessment.updatedAt = new Date().toISOString();
      this.persist();
      this.render();
    },

    toggleGearPicker: function (code) {
      this.bump();
      this.gearPickerOpen = this.gearPickerOpen === code ? null : code;
      this.render();
    },

    toggleGearLoc: function (code, loc) {
      this.bump();
      var race = this.getRace();
      var runner = this.getRunner();
      if (!race || !runner) return;
      var assessment = this.ensureAssessment(this.makeKey(race.id, runner.no));
      if (!assessment.gear) assessment.gear = {};
      var prev = assessment.gear[code] || [];
      var set = {};
      var i;
      for (i = 0; i < prev.length; i++) set[prev[i]] = true;
      if (set[loc]) delete set[loc];
      else set[loc] = true;
      var nextArr = [];
      for (var k in set) {
        if (Object.prototype.hasOwnProperty.call(set, k)) nextArr.push(Number(k));
      }
      nextArr.sort(function (a, b) {
        return a - b;
      });
      if (nextArr.length === 0) delete assessment.gear[code];
      else assessment.gear[code] = nextArr;
      assessment.updatedAt = new Date().toISOString();
      this.persist();
      this.render();
    },

    toggleWetPicker: function () {
      this.bump();
      this.gearPickerOpen = this.gearPickerOpen === "WET" ? null : "WET";
      this.render();
    },

    setWetBody: function (value) {
      this.bump();
      var assessment = this.getCurrentAssessment();
      if (!assessment) return;
      if (!assessment.wet) assessment.wet = {};
      if (assessment.wet.bodyType === value) delete assessment.wet.bodyType;
      else assessment.wet.bodyType = value;
      if (!assessment.wet.bodyType && !assessment.wet.feet) assessment.wet = {};
      assessment.updatedAt = new Date().toISOString();
      this.persist();
      this.render();
    },

    setWetFeet: function (value) {
      this.bump();
      var assessment = this.getCurrentAssessment();
      if (!assessment) return;
      if (!assessment.wet) assessment.wet = {};
      if (assessment.wet.feet === value) delete assessment.wet.feet;
      else assessment.wet.feet = value;
      if (!assessment.wet.bodyType && !assessment.wet.feet) assessment.wet = {};
      assessment.updatedAt = new Date().toISOString();
      this.persist();
      this.render();
    },

    setNotes: function (value) {
      var race = this.getRace();
      var runner = this.getRunner();
      if (!race || !runner) return;
      var key = this.makeKey(race.id, runner.no);
      var assessment = this.ensureAssessment(key);
      assessment.notes = value;
      assessment.updatedAt = new Date().toISOString();
      this.persist();
    },

    gearSummary: function (gear, code) {
      var locs = gear && gear[code];
      if (!locs || !locs.length) return "";
      return locs.join(",");
    },

    wetSummary: function (wet) {
      if (!wet || (!wet.bodyType && !wet.feet)) return "";
      var body = "";
      var feet = "";
      var i;
      for (i = 0; i < WET_BODY_TYPES.length; i++) {
        if (WET_BODY_TYPES[i].value === wet.bodyType) {
          body = WET_BODY_TYPES[i].shorthand;
          break;
        }
      }
      for (i = 0; i < WET_FEET.length; i++) {
        if (WET_FEET[i].value === wet.feet) {
          feet = WET_FEET[i].shorthand;
          break;
        }
      }
      if (body && feet) return body + "/" + feet;
      return body || feet || "";
    },

    nextRunner: function () {
      this.bump();
      this.gearPickerOpen = null;
      var race = this.getRace();
      if (!race || !race.runners || !race.runners.length) return;
      var idx = 0;
      for (var i = 0; i < race.runners.length; i++) {
        if (race.runners[i].no === this.state.selectedRunnerNo) {
          idx = i;
          break;
        }
      }
      var next = race.runners[(idx + 1) % race.runners.length];
      this.state.selectedRunnerNo = next.no;
      this.persist();
      this.render();
    },

    prevRunner: function () {
      this.bump();
      this.gearPickerOpen = null;
      var race = this.getRace();
      if (!race || !race.runners || !race.runners.length) return;
      var idx = 0;
      for (var i = 0; i < race.runners.length; i++) {
        if (race.runners[i].no === this.state.selectedRunnerNo) {
          idx = i;
          break;
        }
      }
      var len = race.runners.length;
      var prev = race.runners[(idx - 1 + len) % len];
      this.state.selectedRunnerNo = prev.no;
      this.persist();
      this.render();
    },

    factorValue: function (assessment, factorCode) {
      if (!assessment) return 0;
      if (this.isPositiveFactor(factorCode)) return assessment.positive[factorCode] || 0;
      return assessment.negative[factorCode] || 0;
    },

    factorActiveClass: function (assessment, factorCode) {
      var val = this.factorValue(assessment, factorCode);
      if (!val) return "";
      return this.isPositiveFactor(factorCode) ? " iy-factor-pos-active" : " iy-factor-neg-active";
    },

    factorButton: function (factorCode, assessment) {
      var val = this.factorValue(assessment, factorCode);
      return (
        '<button type="button" class="iy-factor' +
        this.factorActiveClass(assessment, factorCode) +
        '" onclick="window.ipadYard.tapFactor(\'' +
        escapeAttr(factorCode) +
        "')\">" +
        escapeHtml(factorCode) +
        '<span class="iy-marks">' +
        escapeHtml(this.marks(val)) +
        "</span></button>"
      );
    },

    gridColsForGroup: function (group) {
      if (group.kind === "sweat") return "iy-cols-4";
      var count = group.positives.length + group.negatives.length;
      if (count <= 2) return "iy-cols-2";
      if (count === 3) return "iy-cols-3";
      return "iy-cols-4";
    },

    buildRaceTabs: function () {
      var html = "";
      for (var i = 0; i < this.races.length; i++) {
        var race = this.races[i];
        var active = race.id === this.state.selectedRaceId ? " iy-race-active" : "";
        html +=
          '<button type="button" class="iy-race-tab' +
          active +
          '" onclick="window.ipadYard.selectRace(\'' +
          escapeAttr(race.id) +
          "')\">" +
          escapeHtml(race.id) +
          "</button>";
      }
      return html;
    },

    buildRunners: function () {
      var race = this.getRace();
      if (!race) return "";
      var html = "";
      for (var i = 0; i < race.runners.length; i++) {
        var runner = race.runners[i];
        var rkey = this.makeKey(race.id, runner.no);
        var totals = this.totals(this.state.assessments[rkey]);
        var active = runner.no === this.state.selectedRunnerNo ? " iy-runner-active" : "";
        html +=
          '<button type="button" class="iy-runner-tile' +
          active +
          '" onclick="window.ipadYard.selectRunner(' +
          runner.no +
          ')">' +
          '<span class="iy-runner-row">' +
          '<span class="iy-runner-no">#' +
          runner.no +
          "</span>" +
          '<span class="iy-runner-net">' +
          escapeHtml(this.formatNet(totals.net)) +
          "</span>" +
          "</span>" +
          '<span class="iy-runner-name">' +
          escapeHtml(runner.horse) +
          "</span>" +
          "</button>";
      }
      return html;
    },

    buildGearTile: function (item, assessment) {
      var code = item.code;
      var summary = this.gearSummary(assessment.gear, code);
      var hasGear = summary.length > 0;
      var open = this.gearPickerOpen === code;
      var cls = "iy-factor";
      if (hasGear) cls += " iy-factor-gear-active";
      if (open) cls += " iy-factor-picker-open";
      return (
        '<button type="button" class="' +
        cls +
        '" onclick="window.ipadYard.toggleGearPicker(\'' +
        escapeAttr(code) +
        "')\">" +
        escapeHtml(code) +
        '<span class="iy-factor-sub">' +
        escapeHtml(item.label) +
        "</span>" +
        '<span class="iy-marks">' +
        escapeHtml(summary) +
        "</span></button>"
      );
    },

    buildGearPicker: function (code, assessment) {
      var html = '<div class="iy-picker-row iy-factor-grid iy-cols-5">';
      for (var i = 0; i < GEAR_LOCATIONS.length; i++) {
        var loc = GEAR_LOCATIONS[i];
        var locs = (assessment.gear && assessment.gear[code]) || [];
        var locActive = locs.indexOf(loc.num) >= 0 ? " iy-loc-active" : "";
        html +=
          '<button type="button" class="iy-factor iy-loc-btn' +
          locActive +
          '" onclick="window.ipadYard.toggleGearLoc(\'' +
          escapeAttr(code) +
          "'," +
          loc.num +
          ')">' +
          loc.num +
          "</button>";
      }
      html += "</div>";
      return html;
    },

    buildWetTile: function (assessment) {
      var summary = this.wetSummary(assessment.wet);
      var hasWet = summary.length > 0;
      var open = this.gearPickerOpen === "WET";
      var cls = "iy-factor";
      if (hasWet) cls += " iy-factor-gear-active";
      if (open) cls += " iy-factor-picker-open";
      return (
        '<button type="button" class="' +
        cls +
        '" onclick="window.ipadYard.toggleWetPicker()">' +
        escapeHtml(WET_TILE.code) +
        '<span class="iy-factor-sub">' +
        escapeHtml(WET_TILE.label) +
        "</span>" +
        '<span class="iy-marks">' +
        escapeHtml(summary) +
        "</span></button>"
      );
    },

    buildWetPicker: function (assessment) {
      var html = '<div class="iy-wet-label">Body type</div><div class="iy-factor-grid iy-cols-4">';
      for (var i = 0; i < WET_BODY_TYPES.length; i++) {
        var body = WET_BODY_TYPES[i];
        var bodyActive =
          assessment.wet && assessment.wet.bodyType === body.value ? " iy-loc-active" : "";
        html +=
          '<button type="button" class="iy-factor iy-loc-btn' +
          bodyActive +
          '" onclick="window.ipadYard.setWetBody(\'' +
          escapeAttr(body.value) +
          "')\">" +
          escapeHtml(body.shorthand) +
          "</button>";
      }
      html += '</div><div class="iy-wet-label">Feet</div><div class="iy-factor-grid iy-cols-4">';
      for (var j = 0; j < WET_FEET.length; j++) {
        var foot = WET_FEET[j];
        var footActive = assessment.wet && assessment.wet.feet === foot.value ? " iy-loc-active" : "";
        html +=
          '<button type="button" class="iy-factor iy-loc-btn' +
          footActive +
          '" onclick="window.ipadYard.setWetFeet(\'' +
          escapeAttr(foot.value) +
          "')\">" +
          escapeHtml(foot.shorthand) +
          "</button>";
      }
      html += "</div>";
      return html;
    },

    buildPhysical: function (assessment) {
      var html = '<div class="iy-group"><div class="iy-group-title">PHYSICAL</div>';
      html += '<div class="iy-factor-grid iy-cols-2">';
      for (var i = 0; i < GEAR_TILES.length; i++) {
        html += this.buildGearTile(GEAR_TILES[i], assessment);
      }
      html += this.buildWetTile(assessment);
      html += "</div>";
      if (this.gearPickerOpen && this.gearPickerOpen !== "WET") {
        html += this.buildGearPicker(this.gearPickerOpen, assessment);
      }
      if (this.gearPickerOpen === "WET") {
        html += this.buildWetPicker(assessment);
      }
      html += "</div>";
      return html;
    },

    buildFactors: function (assessment) {
      var html = "";
      for (var g = 0; g < this.factorGroups.length; g++) {
        var group = this.factorGroups[g];
        html += '<div class="iy-group"><div class="iy-group-title">' + escapeHtml(group.title) + "</div>";
        if (group.kind === "sweat") {
          html += '<div class="iy-factor-grid iy-cols-4">';
          html += this.factorButton(cfg.sweatPosKey || "Clean+", assessment);
          var negRow = ["BH-", "K-", "N-", "BS-"];
          for (var n = 0; n < negRow.length; n++) {
            html += this.factorButton(negRow[n], assessment);
          }
          html += "</div>";
          if (cfg.sweatLegend) {
            html += '<p class="iy-legend">' + escapeHtml(cfg.sweatLegend) + "</p>";
          }
        } else {
          html += '<div class="iy-factor-grid ' + this.gridColsForGroup(group) + '">';
          for (var p = 0; p < group.positives.length; p++) {
            html += this.factorButton(group.positives[p], assessment);
          }
          for (var q = 0; q < group.negatives.length; q++) {
            html += this.factorButton(group.negatives[q], assessment);
          }
          html += "</div>";
        }
        html += "</div>";
      }
      html += this.buildPhysical(assessment);
      return html;
    },

    syncNotesField: function (currentKey, assessment) {
      var notesEl = document.getElementById("iy-notes");
      if (!notesEl) return;
      var notes = assessment ? assessment.notes || "" : "";
      if (this.notesRunnerKey !== currentKey) {
        notesEl.value = notes;
        this.notesRunnerKey = currentKey;
      }
    },

    render: function () {
      var race = this.getRace();
      var runner = this.getRunner();
      var assessment = race && runner ? this.ensureAssessment(this.makeKey(race.id, runner.no)) : null;
      var currentKey = race && runner ? this.makeKey(race.id, runner.no) : null;

      this.setText("iy-meeting-label", this.state.meetingLabel || "");

      var raceTabs = document.getElementById("iy-race-tabs");
      if (raceTabs) raceTabs.innerHTML = this.buildRaceTabs();

      this.setText("iy-race-title", race ? race.title : "");

      var runnersEl = document.getElementById("iy-runners");
      if (runnersEl) runnersEl.innerHTML = this.buildRunners();

      var header = document.getElementById("iy-runner-header");
      if (header) {
        if (runner && race && assessment) {
          var totals = this.totals(assessment);
          header.innerHTML =
            "<strong>#" +
            runner.no +
            " " +
            escapeHtml(runner.horse) +
            "</strong><br>Br " +
            runner.br +
            " · " +
            escapeHtml(runner.trainer) +
            " · " +
            escapeHtml(runner.jockey) +
            " · " +
            escapeHtml(runner.odds) +
            '<div class="iy-net-line">+' +
            totals.pos +
            " −" +
            totals.neg +
            " · net " +
            escapeHtml(this.formatNet(totals.net)) +
            "</div>";
        } else {
          header.innerHTML = "";
        }
      }

      var factorsEl = document.getElementById("iy-factors");
      if (factorsEl) {
        factorsEl.innerHTML = assessment ? this.buildFactors(assessment) : "";
      }

      this.syncNotesField(currentKey, assessment);
    },

    csvEscape: function (value) {
      var s = value == null ? "" : String(value);
      if (s.indexOf('"') !== -1 || s.indexOf(",") !== -1 || s.indexOf("\n") !== -1) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    },

    exportCsv: function () {
      this.bump();
      var headers = [
        "assessment_key",
        "race_id",
        "race_title",
        "runner_no",
        "horse",
        "barrier",
        "trainer",
        "jockey",
        "odds",
        "positive_json",
        "negative_json",
        "gear_json",
        "wet_json",
        "notes",
        "total_positive",
        "total_negative",
        "net",
        "updated_at",
      ];
      var lines = [headers.join(",")];

      for (var r = 0; r < this.races.length; r++) {
        var race = this.races[r];
        for (var u = 0; u < race.runners.length; u++) {
          var runner = race.runners[u];
          var key = this.makeKey(race.id, runner.no);
          var a = this.state.assessments[key];
          var totals = this.totals(a);
          lines.push(
            [
              key,
              race.id,
              race.title,
              runner.no,
              runner.horse,
              runner.br,
              runner.trainer,
              runner.jockey,
              runner.odds,
              a ? JSON.stringify(a.positive || {}) : "",
              a ? JSON.stringify(a.negative || {}) : "",
              a ? JSON.stringify(a.gear || {}) : "",
              a && a.wet ? JSON.stringify(a.wet) : "",
              a ? a.notes || "" : "",
              totals.pos,
              totals.neg,
              totals.net,
              a && a.updatedAt ? a.updatedAt : "",
            ]
              .map(this.csvEscape)
              .join(","),
          );
        }
      }

      var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "ipad-yard-assessments.csv";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      this.setImportMsg("CSV exported.");
      this.persist();
    },

    parseCsvLine: function (line) {
      var out = [];
      var cur = "";
      var inQuotes = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line.charAt(i);
        if (inQuotes) {
          if (ch === '"') {
            if (line.charAt(i + 1) === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            cur += ch;
          }
        } else if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          out.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out;
    },

    importCsv: function (input) {
      var file = input && input.files && input.files[0];
      if (!file) return;
      var self = this;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var text = String(reader.result || "");
          self.applyMeetingCsv(text, file.name);
          input.value = "";
        } catch (e) {
          self.setImportMsg("Import failed: " + e.message);
        }
      };
      reader.onerror = function () {
        self.setImportMsg("Could not read file.");
      };
      reader.readAsText(file);
    },

    applyMeetingCsv: function (text, fileName) {
      var lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (l) {
        return l.trim().length > 0;
      });
      if (lines.length < 2) throw new Error("CSV has no data rows");

      var headers = this.parseCsvLine(lines[0]).map(function (h) {
        return h.trim().toLowerCase().replace(/\s+/g, "_");
      });

      function col(name) {
        var idx = headers.indexOf(name);
        return idx >= 0 ? idx : -1;
      }

      var idxRaceId = col("race_id");
      var idxRunnerNo = col("runner_no");
      if (idxRunnerNo < 0) idxRunnerNo = col("no");
      var idxHorse = col("horse");
      var idxBarrier = col("barrier");
      if (idxBarrier < 0) idxBarrier = col("br");
      var idxTrainer = col("trainer");
      var idxJockey = col("jockey");
      var idxOdds = col("odds");
      var idxTitle = col("race_title");

      if (idxRaceId < 0 || idxRunnerNo < 0 || idxHorse < 0) {
        throw new Error("CSV needs race_id, runner_no, horse columns");
      }

      var byRace = {};
      for (var i = 1; i < lines.length; i++) {
        var cells = this.parseCsvLine(lines[i]);
        var raceId = String(cells[idxRaceId] || "").trim();
        if (!raceId) continue;
        var title = idxTitle >= 0 ? String(cells[idxTitle] || "").trim() : "Race " + raceId;
        if (!byRace[raceId]) byRace[raceId] = { title: title, runners: [] };
        byRace[raceId].runners.push({
          no: Number(cells[idxRunnerNo]),
          horse: String(cells[idxHorse] || "").trim(),
          br: Number(cells[idxBarrier] >= 0 ? cells[idxBarrier] : 0),
          trainer: idxTrainer >= 0 ? String(cells[idxTrainer] || "").trim() : "",
          jockey: idxJockey >= 0 ? String(cells[idxJockey] || "").trim() : "",
          odds: idxOdds >= 0 ? String(cells[idxOdds] || "").trim() : "",
        });
      }

      var races = [];
      for (var id in byRace) {
        if (!Object.prototype.hasOwnProperty.call(byRace, id)) continue;
        var bucket = byRace[id];
        bucket.runners.sort(function (a, b) {
          return a.no - b.no;
        });
        races.push({ id: id, title: bucket.title, runners: bucket.runners });
      }
      races.sort(function (a, b) {
        return a.id.localeCompare(b.id, undefined, { numeric: true });
      });

      if (!races.length) throw new Error("No valid rows in CSV");

      this.races = races;
      this.gearPickerOpen = null;
      this.state.selectedRaceId = races[0].id;
      this.state.selectedRunnerNo = races[0].runners[0].no;
      this.state.meetingLabel = fileName || "Imported meeting";
      this.persistRaces();
      this.persist();
      this.render();
      this.setImportMsg("Imported " + races.length + " races.");
      this.bump();
    },

    init: function () {
      this.loadPersisted();
      this.loadRaces();
      this.loadManifestLabel();
      if (!this.state.selectedRaceId && this.races.length) {
        this.state.selectedRaceId = this.races[0].id;
        this.state.selectedRunnerNo = this.races[0].runners[0]
          ? this.races[0].runners[0].no
          : null;
      }
      this.render();
    },
  };

  window.ipadYard.init();
})();
