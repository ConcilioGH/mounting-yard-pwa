/**
 * iPad Yard DOM — plain JS for /ipad-yard-dom (inline onclick on generated buttons).
 */
(function () {
  if (window.ipadYard) return;

  var cfg = window.IPAD_YARD_CONFIG || {};
  var ASSESSMENTS_KEY = cfg.assessmentsKey || "ipad-yard-assessments";
  var MEETING_STORE_KEY = cfg.meetingStoreKey || "ipad-yard-meeting-store-v2";
  var RACES_KEY = cfg.racesKey || "ipad-yard-races-v1";
  var DOWNLOADED_MEETING_KEY = cfg.downloadedMeetingKey || "ipad-yard-downloaded-meeting-v1";
  var LIBRARY_CACHE_KEY = "ipad-yard-library-cache-v3";
  var MANIFEST_KEY = cfg.manifestKey || "mounting-yard-meeting-manifest-v1";
  var LAST_MEETING_CSV_KEY = "mounting-yard-last-meeting-csv-v1";
  var LAST_MEETING_CSV_META_KEY = "mounting-yard-last-meeting-csv-meta-v1";
  var MEETING_IMPORTED_EVENT = "mounting-yard-meeting-imported";
  var BACKUP_REMINDER_KEY = "ipad-yard-backup-reminder-v1";
  var LAST_BACKUP_KEY = "ipad-yard-last-backup-v1";
  var BACKUP_ASSESSMENT_SAVE_THRESHOLD = 20;
  var MEETING_BACKUP_KIND = "ipad-yard-meeting-backup";
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
    view: "assess",
    libraryMeetings: [],
    libraryLoading: false,
    meetingLoadingPath: null,
    downloadedMeetingActive: false,
    countdownTimerId: null,
    resultedSpPoller: null,
    backupReminderDismissedFor: "",
    activeMeetingId: "",
    activeMeetingKey: "",
    state: {
      tapCount: 0,
      selectedRaceId: null,
      selectedRunnerNo: null,
      assessments: {},
      meetingLabel: "",
      loadedMeetingPath: "",
      meetingCardSource: "",
      tabVenueCode: "",
      meetingDate: "",
      meetingVenue: "",
      hideScratched: false,
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

    countAssessmentFactors: function (assessment) {
      if (!assessment) return 0;
      var count = 0;
      var i;
      if (assessment.positive) {
        var pk = Object.keys(assessment.positive);
        for (i = 0; i < pk.length; i++) {
          if ((assessment.positive[pk[i]] || 0) > 0) count++;
        }
      }
      if (assessment.negative) {
        var nk = Object.keys(assessment.negative);
        for (i = 0; i < nk.length; i++) {
          if ((assessment.negative[nk[i]] || 0) < 0) count++;
        }
      }
      if (assessment.gear) {
        var gk = Object.keys(assessment.gear);
        for (i = 0; i < gk.length; i++) {
          var locs = assessment.gear[gk[i]];
          if (locs && locs.length) count++;
        }
      }
      if (assessment.wet && (assessment.wet.bodyType || assessment.wet.feet)) count++;
      return count;
    },

    scoreIntensityClass: function (net) {
      if (net > 0) {
        var level = net >= 5 ? 5 : net;
        return "iy-score-p" + level;
      }
      if (net < 0) {
        var abs = Math.abs(net);
        var nlevel = abs >= 5 ? 5 : abs;
        return "iy-score-n" + nlevel;
      }
      return "iy-runner-zero";
    },

    isRunnerReviewed: function (assessment) {
      if (!assessment) return false;
      if (assessment.reviewed) return true;
      if (assessment.updatedAt) return true;
      if (this.countAssessmentFactors(assessment) > 0) return true;
      if (assessment.notes && String(assessment.notes).trim()) return true;
      return false;
    },

    isRunnerScratched: function (runner) {
      return !!(runner && runner.scratched);
    },

    getRaceActiveRunners: function (race) {
      if (!race || !race.runners) return [];
      var out = [];
      for (var i = 0; i < race.runners.length; i++) {
        if (!this.isRunnerScratched(race.runners[i])) out.push(race.runners[i]);
      }
      return out;
    },

    getVisibleRunners: function (race) {
      if (!race || !race.runners) return [];
      if (!this.state.hideScratched) return race.runners;
      return this.getRaceActiveRunners(race);
    },

    defaultHideScratchedForSource: function (source) {
      return source === "tab";
    },

    getRaceCompleteness: function (race) {
      var active = this.getRaceActiveRunners(race);
      var assessed = 0;
      for (var i = 0; i < active.length; i++) {
        var runner = active[i];
        var key = this.makeKey(race.id, runner.no);
        if (this.isRunnerReviewed(this.state.assessments[key])) assessed++;
      }
      return { assessed: assessed, total: active.length };
    },

    countMeetingAssessments: function () {
      var count = 0;
      if (!this.races) return 0;
      for (var r = 0; r < this.races.length; r++) {
        var race = this.races[r];
        var active = this.getRaceActiveRunners(race);
        for (var i = 0; i < active.length; i++) {
          var key = this.makeKey(race.id, active[i].no);
          if (this.isRunnerReviewed(this.state.assessments[key])) count++;
        }
      }
      return count;
    },

    countResultedRaces: function () {
      if (!this.races || !this.races.length || !this.activeMeetingId) return 0;
      var count = 0;
      for (var i = 0; i < this.races.length; i++) {
        var status = this.getRaceResultsStatusLabel(this.races[i].id);
        if (status && status.code === "imported") count++;
      }
      return count;
    },

    readLastBackupAt: function (meetingId) {
      meetingId = String(meetingId || this.activeMeetingId || "").trim();
      if (!meetingId) return "";
      try {
        var raw = localStorage.getItem(LAST_BACKUP_KEY);
        if (!raw) return "";
        var parsed = JSON.parse(raw);
        return parsed && parsed[meetingId] ? String(parsed[meetingId]) : "";
      } catch (e) {
        return "";
      }
    },

    recordLastBackupAt: function (meetingId) {
      meetingId = String(meetingId || this.activeMeetingId || "").trim();
      if (!meetingId) return;
      try {
        var map = {};
        var raw = localStorage.getItem(LAST_BACKUP_KEY);
        if (raw) map = JSON.parse(raw) || {};
        map[meetingId] = new Date().toISOString();
        localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify(map));
      } catch (e) {
        /* ignore */
      }
    },

    formatBackupTime: function (iso) {
      if (!iso) return "Never";
      try {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return "Never";
        return d.toLocaleString();
      } catch (e) {
        return "Never";
      }
    },

    isBackupRecommended: function () {
      var meetingId = String(this.activeMeetingId || "").trim();
      if (!meetingId || !this.races || !this.races.length) return false;
      if (this.backupReminderDismissedFor === meetingId) return false;
      var state = this.readBackupReminderState();
      if (state.meetingId !== meetingId) return false;
      if (state.savesSinceBackup >= BACKUP_ASSESSMENT_SAVE_THRESHOLD) return true;
      if (state.resultImportPending) return true;
      return false;
    },

    getMeetingHealthSummary: function () {
      var ctx = this.getMeetingExportContext();
      return {
        meetingId: ctx.meetingId || this.activeMeetingId || "—",
        cardSource: ctx.meetingCardSource || "—",
        assessmentCount: this.countMeetingAssessments(),
        resultedRacesCount: this.countResultedRaces(),
        lastBackupAt: this.readLastBackupAt(ctx.meetingId || this.activeMeetingId),
        backupRecommended: this.isBackupRecommended(),
      };
    },

    updateMeetingHealthPanel: function () {
      if (typeof document === "undefined") return;
      var panel = document.getElementById("iy-meeting-health");
      if (!panel) return;
      var hasRaces = this.races && this.races.length > 0;
      if (!hasRaces) {
        panel.classList.add("iy-hidden");
        return;
      }
      panel.classList.remove("iy-hidden");
      var health = this.getMeetingHealthSummary();
      this.setText("iy-health-meeting-id", health.meetingId);
      this.setText("iy-health-card-source", health.cardSource);
      this.setText("iy-health-assessment-count", String(health.assessmentCount));
      this.setText("iy-health-resulted-count", String(health.resultedRacesCount));
      this.setText("iy-health-last-backup", this.formatBackupTime(health.lastBackupAt));
      var backupEl = document.getElementById("iy-health-backup-recommended");
      if (backupEl) {
        backupEl.textContent = health.backupRecommended ? "Yes" : "No";
        if (health.backupRecommended) backupEl.classList.add("iy-health-warn");
        else backupEl.classList.remove("iy-health-warn");
      }

      var toggle = document.getElementById("iy-hide-scratched-toggle");
      if (toggle && toggle.checked !== !!this.state.hideScratched) {
        toggle.checked = !!this.state.hideScratched;
      }
    },

    toggleHideScratched: function () {
      this.bump();
      var toggle = document.getElementById("iy-hide-scratched-toggle");
      this.state.hideScratched = !!(toggle && toggle.checked);
      this.normalizeSelection();
      this.persist();
      this.render();
    },

    setHideScratchedDefaultForSource: function (source) {
      this.state.hideScratched = this.defaultHideScratchedForSource(source);
    },

    markRunnerReviewed: function (key) {
      var assessment = this.ensureAssessment(key);
      assessment.reviewed = true;
    },

    runnerTileMeta: function (assessment) {
      if (!this.isRunnerReviewed(assessment)) {
        return {
          scoreClass: "iy-runner-plain",
          netLine: "",
          factorLabel: "unassessed",
        };
      }
      var factorCount = this.countAssessmentFactors(assessment);
      var totals = this.totals(assessment);
      if (totals.net === 0) {
        return {
          scoreClass: "iy-runner-zero",
          netLine: "0",
          factorLabel: factorCount === 0 ? "neutral" : factorCount === 1 ? "1 factor" : factorCount + " factors",
        };
      }
      return {
        scoreClass: this.scoreIntensityClass(totals.net),
        netLine: "net " + this.formatNet(totals.net),
        factorLabel: factorCount === 1 ? "1 factor" : factorCount + " factors",
      };
    },

    isPositiveFactor: function (factorKey) {
      if (factorKey === "Clean+") return true;
      return factorKey.indexOf("+") === factorKey.length - 1;
    },

    bump: function () {
      this.state.tapCount += 1;
    },

    readMeetingStore: function () {
      try {
        var raw = localStorage.getItem(MEETING_STORE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.version === 2 && parsed.meetings) return parsed;
        }
      } catch (e) {
        /* ignore */
      }
      return { version: 2, activeMeetingId: "", meetings: {} };
    },

    writeMeetingStore: function (store) {
      try {
        localStorage.setItem(MEETING_STORE_KEY, JSON.stringify(store));
      } catch (e) {
        this.setImportMsg("Could not save meeting data: " + e.message);
      }
    },

    meetingKeyFromManifest: function (manifest) {
      if (!manifest || !manifest.meetingKey) return "";
      return String(manifest.meetingKey);
    },

    resolveMeetingId: function (hints) {
      hints = hints || {};
      var delivery = window.MeetingExportDelivery;
      if (hints.meetingId) return String(hints.meetingId);
      if (hints.manifest) {
        if (hints.manifest.meetingId) return String(hints.manifest.meetingId);
        if (hints.manifest.date && hints.manifest.trackSlug) {
          return hints.manifest.date + "-" + hints.manifest.trackSlug;
        }
      }
      if (!hints.skipManifest && delivery) {
        var manifest = delivery.loadMeetingManifest();
        if (manifest) {
          if (manifest.meetingId) return String(manifest.meetingId);
          if (manifest.date && manifest.trackSlug) {
            return manifest.date + "-" + manifest.trackSlug;
          }
        }
      }
      var path = hints.meetingPath || hints.loadedMeetingPath || this.state.loadedMeetingPath || "";
      var meta = this.parseMeetingPathMeta(path);
      if (meta.date && meta.track) {
        var slug = delivery ? delivery.sanitizeMeetingSlug(meta.track) : meta.track;
        return meta.date + "-" + slug;
      }
      if (hints.date && (hints.trackName || hints.track)) {
        var trackInput = hints.trackName || hints.track;
        var trackSlug = delivery ? delivery.sanitizeMeetingSlug(trackInput) : trackInput;
        return hints.date + "-" + trackSlug;
      }
      if (hints.manifest && hints.manifest.meetingKey) return "key:" + hints.manifest.meetingKey;
      return "";
    },

    resetSessionState: function () {
      this.state.assessments = {};
      this.state.selectedRaceId = null;
      this.state.selectedRunnerNo = null;
      this.gearPickerOpen = null;
      this.notesRunnerKey = null;
    },

    raceIdExists: function (raceId) {
      if (!raceId) return false;
      for (var i = 0; i < this.races.length; i++) {
        if (this.races[i].id === raceId) return true;
      }
      return false;
    },

    normalizeSelection: function () {
      if (!this.races.length) {
        this.state.selectedRaceId = null;
        this.state.selectedRunnerNo = null;
        return;
      }
      if (!this.raceIdExists(this.state.selectedRaceId)) {
        this.state.selectedRaceId = this.races[0].id;
      }
      var race = this.getRace();
      if (!race || !race.runners || !race.runners.length) return;
      var visible = this.getVisibleRunners(race);
      if (!visible.length) {
        this.state.selectedRunnerNo = race.runners[0].no;
        return;
      }
      var found = false;
      for (var i = 0; i < visible.length; i++) {
        if (visible[i].no === this.state.selectedRunnerNo) {
          found = true;
          break;
        }
      }
      if (!found) this.state.selectedRunnerNo = visible[0].no;
    },

    saveActiveMeetingToStore: function () {
      var meetingId = this.activeMeetingId;
      if (!meetingId) return;
      var store = this.readMeetingStore();
      store.activeMeetingId = meetingId;
      store.activeMeetingKey = this.activeMeetingKey || "";
      store.meetings[meetingId] = {
        meetingId: meetingId,
        meetingKey: this.activeMeetingKey || "",
        assessments: this.state.assessments || {},
        selectedRaceId: this.state.selectedRaceId,
        selectedRunnerNo: this.state.selectedRunnerNo,
        meetingLabel: this.state.meetingLabel || "",
        loadedMeetingPath: this.state.loadedMeetingPath || "",
        meetingCardSource: this.state.meetingCardSource || "",
        tabVenueCode: this.state.tabVenueCode || "",
        meetingDate: this.state.meetingDate || "",
        meetingVenue: this.state.meetingVenue || "",
        hideScratched: !!this.state.hideScratched,
        races: this.races || [],
        tapCount: this.state.tapCount || 0,
      };
      this.writeMeetingStore(store);
    },

    activateMeetingSession: function (manifest, options) {
      options = options || {};
      manifest = manifest || {};
      var newMeetingId = this.resolveMeetingId({
        manifest: manifest,
        meetingPath: options.meetingPath || this.state.loadedMeetingPath,
        date: options.date || "",
        trackName: options.trackName || "",
      });
      var newMeetingKey = this.meetingKeyFromManifest(manifest);

      if (this.activeMeetingId) {
        this.saveActiveMeetingToStore();
      }

      var isDifferentMeeting =
        (Boolean(newMeetingId) &&
          Boolean(this.activeMeetingId) &&
          newMeetingId !== this.activeMeetingId) ||
        (Boolean(newMeetingKey) &&
          Boolean(this.activeMeetingKey) &&
          newMeetingKey !== this.activeMeetingKey);

      this.resetSessionState();

      var store = this.readMeetingStore();
      var saved = newMeetingId ? store.meetings[newMeetingId] : null;
      var savedMatchesKey =
        saved &&
        newMeetingKey &&
        String(saved.meetingKey || "") === newMeetingKey &&
        String(saved.meetingId || newMeetingId) === newMeetingId;

      if (options.assessments) {
        this.state.assessments = options.assessments;
      } else if (savedMatchesKey && saved.assessments) {
        this.state.assessments = saved.assessments;
      } else if (!isDifferentMeeting && saved && saved.assessments) {
        this.state.assessments = saved.assessments;
      } else {
        this.state.assessments = {};
      }

      if (options.selectedRaceId) {
        this.state.selectedRaceId = options.selectedRaceId;
      } else if (savedMatchesKey && saved.selectedRaceId) {
        this.state.selectedRaceId = saved.selectedRaceId;
        this.state.selectedRunnerNo = saved.selectedRunnerNo;
      } else if (this.races[0]) {
        this.state.selectedRaceId = this.races[0].id;
        this.state.selectedRunnerNo = this.races[0].runners[0] ? this.races[0].runners[0].no : null;
      }

      if (options.selectedRunnerNo != null) {
        this.state.selectedRunnerNo = options.selectedRunnerNo;
      }

      if (!options.keepMeetingMeta && savedMatchesKey && saved) {
        if (saved.meetingLabel) this.state.meetingLabel = saved.meetingLabel;
        if (saved.loadedMeetingPath) this.state.loadedMeetingPath = saved.loadedMeetingPath;
      }

      if (!options.keepRaces && savedMatchesKey && saved && saved.races && saved.races.length) {
        this.races = saved.races;
      }

      if (options.hideScratched != null) {
        this.state.hideScratched = !!options.hideScratched;
      } else if (savedMatchesKey && saved && saved.hideScratched != null) {
        this.state.hideScratched = !!saved.hideScratched;
      } else if (!isDifferentMeeting && saved && saved.hideScratched != null) {
        this.state.hideScratched = !!saved.hideScratched;
      } else if (this.state.meetingCardSource) {
        this.setHideScratchedDefaultForSource(this.state.meetingCardSource);
      } else {
        this.state.hideScratched = false;
      }

      this.activeMeetingId = newMeetingId;
      this.activeMeetingKey = newMeetingKey;
      this.normalizeSelection();
      this.saveActiveMeetingToStore();
      this.updateCountdownDisplay();
      this.refreshResultedSpPoller(manifest);
    },

    refreshResultedSpPoller: function (manifest) {
      var rsp = window.ResultedSpDom;
      if (!rsp || !this.activeMeetingId || !this.races || !this.races.length) {
        return;
      }
      var self = this;
      if (this.resultedSpPoller && this.resultedSpPoller.stop) {
        this.resultedSpPoller.stop();
      }
      var activeManifest = manifest || this.syncMeetingManifest() || {};
      this.resultedSpPoller = rsp.startPoller({
        meetingId: this.activeMeetingId,
        manifest: activeManifest,
        races: this.races,
        onChange: function () {
          self.renderResultedSpPanel();
          self.updateMeetingHealthPanel();
          self.bump();
          if (window.ResultedSpDom && typeof console !== "undefined") {
            console.log("[resulted-sp] rendered", { meetingId: self.activeMeetingId });
          }
        },
      });
      this.renderResultedSpPanel();
    },

    renderResultedSpPanel: function () {
      if (typeof document === "undefined") return;
      var rsp = window.ResultedSpDom;
      var el = document.getElementById("iy-resulted-sp-panel");
      if (!rsp || !el || !this.activeMeetingId || !this.races || !this.races.length) {
        if (el) el.innerHTML = "";
        return;
      }
      rsp.renderPanel(el, {
        meetingId: this.activeMeetingId,
        manifest: this.syncMeetingManifest() || {},
        races: this.races,
      });
    },

    migrateLegacyStorage: function () {
      var store = this.readMeetingStore();
      if (store.meetings && Object.keys(store.meetings).length > 0) return;

      var legacyAssessments = null;
      var legacyRaces = null;
      try {
        var raw = localStorage.getItem(ASSESSMENTS_KEY);
        if (raw) legacyAssessments = JSON.parse(raw);
      } catch (e) {
        /* ignore */
      }
      try {
        var rawRaces = localStorage.getItem(RACES_KEY);
        if (rawRaces) legacyRaces = JSON.parse(rawRaces);
      } catch (e) {
        /* ignore */
      }
      if (!legacyAssessments && !legacyRaces) return;

      var meetingId = this.resolveMeetingId({ skipManifest: false });
      if (!meetingId) meetingId = "legacy-session";

      store.activeMeetingId = meetingId;
      var legacyKey = "";
      var delivery = window.MeetingExportDelivery;
      if (delivery) {
        var manifest = delivery.loadMeetingManifest();
        legacyKey = manifest ? this.meetingKeyFromManifest(manifest) : "";
      }
      store.activeMeetingKey = legacyKey;
      store.meetings[meetingId] = {
        meetingId: meetingId,
        meetingKey: legacyKey,
        assessments: (legacyAssessments && legacyAssessments.assessments) || {},
        selectedRaceId: legacyAssessments && legacyAssessments.selectedRaceId,
        selectedRunnerNo: legacyAssessments && legacyAssessments.selectedRunnerNo,
        meetingLabel: (legacyAssessments && legacyAssessments.meetingLabel) || "",
        loadedMeetingPath: (legacyAssessments && legacyAssessments.loadedMeetingPath) || "",
        races: Array.isArray(legacyRaces) ? legacyRaces : [],
        tapCount: (legacyAssessments && legacyAssessments.tapCount) || 0,
      };
      this.writeMeetingStore(store);
    },

    persist: function () {
      this.saveActiveMeetingToStore();
      this.noteAssessmentPersistForBackupReminder();
    },

    readBackupReminderState: function () {
      try {
        if (typeof sessionStorage === "undefined") {
          return { meetingId: "", savesSinceBackup: 0, resultImportPending: false };
        }
        var raw = sessionStorage.getItem(BACKUP_REMINDER_KEY);
        if (!raw) return { meetingId: "", savesSinceBackup: 0, resultImportPending: false };
        var parsed = JSON.parse(raw);
        return {
          meetingId: String(parsed.meetingId || ""),
          savesSinceBackup: Number(parsed.savesSinceBackup) || 0,
          resultImportPending: !!parsed.resultImportPending,
        };
      } catch (e) {
        return { meetingId: "", savesSinceBackup: 0, resultImportPending: false };
      }
    },

    writeBackupReminderState: function (state) {
      try {
        if (typeof sessionStorage === "undefined") return;
        sessionStorage.setItem(BACKUP_REMINDER_KEY, JSON.stringify(state || {}));
      } catch (e) {
        /* ignore */
      }
    },

    resetBackupReminder: function (meetingId) {
      meetingId = String(meetingId || this.activeMeetingId || "").trim();
      this.backupReminderDismissedFor = "";
      this.writeBackupReminderState({
        meetingId: meetingId,
        savesSinceBackup: 0,
        resultImportPending: false,
      });
      this.hideBackupReminderBanner();
      this.updateMeetingHealthPanel();
    },

    noteAssessmentPersistForBackupReminder: function () {
      var meetingId = String(this.activeMeetingId || "").trim();
      if (!meetingId || !this.races || !this.races.length) return;
      if (this.backupReminderDismissedFor === meetingId) return;
      var state = this.readBackupReminderState();
      if (state.meetingId !== meetingId) {
        state = { meetingId: meetingId, savesSinceBackup: 0, resultImportPending: false };
      }
      state.savesSinceBackup += 1;
      this.writeBackupReminderState(state);
      if (state.savesSinceBackup >= BACKUP_ASSESSMENT_SAVE_THRESHOLD) {
        this.showBackupReminderBanner();
      }
      this.updateMeetingHealthPanel();
    },

    noteResultImportForBackupReminder: function (meetingId) {
      meetingId = String(meetingId || this.activeMeetingId || "").trim();
      if (!meetingId) return;
      if (this.backupReminderDismissedFor === meetingId) return;
      if (!window.ResultedSpDom || !window.ResultedSpDom.loadState) return;
      var rsp = window.ResultedSpDom.loadState(meetingId);
      var races = rsp && rsp.races ? rsp.races : {};
      var hasImported = false;
      for (var raceNo in races) {
        if (!Object.prototype.hasOwnProperty.call(races, raceNo)) continue;
        var raceState = races[raceNo];
        if (raceState && raceState.guardPassed === true && raceState.status === "imported") {
          hasImported = true;
          break;
        }
      }
      if (!hasImported) return;
      var state = this.readBackupReminderState();
      if (state.meetingId !== meetingId) {
        state = { meetingId: meetingId, savesSinceBackup: 0, resultImportPending: false };
      }
      state.resultImportPending = true;
      this.writeBackupReminderState(state);
      this.showBackupReminderBanner();
      this.updateMeetingHealthPanel();
    },

    showBackupReminderBanner: function () {
      var banner = document.getElementById("iy-backup-reminder-banner");
      if (banner) banner.classList.remove("iy-hidden");
    },

    hideBackupReminderBanner: function () {
      var banner = document.getElementById("iy-backup-reminder-banner");
      if (banner) banner.classList.add("iy-hidden");
    },

    dismissBackupReminder: function () {
      this.bump();
      var meetingId = String(this.activeMeetingId || "").trim();
      if (meetingId) this.backupReminderDismissedFor = meetingId;
      this.hideBackupReminderBanner();
      this.updateMeetingHealthPanel();
    },

    isValidMeetingBackupPackage: function (pkg) {
      if (!pkg || typeof pkg !== "object") return false;
      if (pkg.kind !== MEETING_BACKUP_KIND) return false;
      if (Number(pkg.version) !== 1) return false;
      if (!String(pkg.meetingId || "").trim()) return false;
      if (!Array.isArray(pkg.races) || !pkg.races.length) return false;
      if (!pkg.state || typeof pkg.state !== "object") return false;
      if (!pkg.state.assessments || typeof pkg.state.assessments !== "object") return false;
      return true;
    },

    buildMeetingBackupPackage: function () {
      if (!this.races || !this.races.length) {
        throw new Error("Load a meeting first.");
      }
      var base = this.buildDownloadedMeetingPackage();
      var meetingId = String(base.meetingId || "").trim();
      if (!meetingId) {
        throw new Error("Meeting ID missing — reload the meeting and try again.");
      }
      var delivery = window.MeetingExportDelivery;
      var manifest = base.manifest || (delivery ? delivery.loadMeetingManifest() : null);
      if (manifest && manifest.meetingId && String(manifest.meetingId) !== meetingId) {
        throw new Error("Manifest meetingId does not match active meeting.");
      }
      var resultedSp = null;
      if (window.ResultedSpDom && window.ResultedSpDom.loadState) {
        resultedSp = window.ResultedSpDom.loadState(meetingId);
      }
      return {
        kind: MEETING_BACKUP_KIND,
        version: 1,
        backupAt: new Date().toISOString(),
        meetingId: meetingId,
        manifest: manifest,
        meetingPath: base.meetingPath || "",
        meetingName: base.meetingName || "",
        track: base.track || "",
        date: base.date || "",
        races: base.races,
        state: base.state,
        resultedSp: resultedSp,
        metadata: {
          meetingCardSource: this.state.meetingCardSource || "",
          tabVenueCode: this.state.tabVenueCode || "",
          meetingDate: this.state.meetingDate || "",
          meetingVenue: this.state.meetingVenue || "",
          build: cfg.build || "",
        },
      };
    },

    buildMeetingBackupFilename: function (pkg) {
      pkg = pkg || {};
      var meetingId = String(pkg.meetingId || "meeting").trim();
      var stamp = String(pkg.backupAt || new Date().toISOString())
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      return meetingId + "-backup-" + stamp + ".json";
    },

    showMeetingBackupExportPanel: function (jsonText, filename) {
      this.meetingBackupExportText = jsonText;
      this.meetingBackupExportFilename = filename;
      var overlay = document.getElementById("iy-meeting-backup-export-overlay");
      var textarea = document.getElementById("iy-meeting-backup-export-text");
      var filenameEl = document.getElementById("iy-meeting-backup-export-filename");
      var downloadBtn = document.getElementById("iy-meeting-backup-download-btn");
      if (filenameEl) filenameEl.textContent = filename;
      if (textarea) textarea.value = jsonText;
      if (overlay) overlay.classList.remove("iy-hidden");
      if (downloadBtn) {
        if (this.supportsFileDownload()) downloadBtn.classList.remove("iy-hidden");
        else downloadBtn.classList.add("iy-hidden");
      }
    },

    closeMeetingBackupExportPanel: function () {
      var overlay = document.getElementById("iy-meeting-backup-export-overlay");
      if (overlay) overlay.classList.add("iy-hidden");
    },

    selectAllMeetingBackupExport: function () {
      this.bump();
      var textarea = document.getElementById("iy-meeting-backup-export-text");
      if (!textarea) return;
      textarea.focus();
      textarea.select();
      try {
        textarea.setSelectionRange(0, textarea.value.length);
      } catch (e) {
        /* ignore */
      }
    },

    downloadMeetingBackupExport: function () {
      if (!this.supportsFileDownload() || !this.meetingBackupExportText) return;
      this.bump();
      try {
        var blob = new Blob([this.meetingBackupExportText], {
          type: "application/json;charset=utf-8",
        });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = this.meetingBackupExportFilename || "meeting-backup.json";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        this.setImportMsg("Download failed: " + e.message);
      }
    },

    exportMeetingBackup: function () {
      this.bump();
      var self = this;
      try {
        var pkg = self.buildMeetingBackupPackage();
        var jsonText = JSON.stringify(pkg, null, 2);
        var filename = self.buildMeetingBackupFilename(pkg);
        self.recordLastBackupAt(pkg.meetingId);
        self.resetBackupReminder(pkg.meetingId);
        if (self.supportsFileDownload()) {
          self.meetingBackupExportText = jsonText;
          self.meetingBackupExportFilename = filename;
          self.downloadMeetingBackupExport();
          self.setImportMsg("Meeting backup saved — " + filename);
          return;
        }
        self.showMeetingBackupExportPanel(jsonText, filename);
        self.setImportMsg("Meeting backup ready — copy JSON below.");
      } catch (e) {
        self.setImportMsg("Backup failed: " + (e && e.message ? e.message : String(e)));
      }
    },

    showMeetingBackupImportPanel: function () {
      var overlay = document.getElementById("iy-meeting-backup-import-overlay");
      var textarea = document.getElementById("iy-meeting-backup-import-text");
      if (textarea) textarea.value = "";
      if (overlay) overlay.classList.remove("iy-hidden");
    },

    closeMeetingBackupImportPanel: function () {
      var overlay = document.getElementById("iy-meeting-backup-import-overlay");
      if (overlay) overlay.classList.add("iy-hidden");
    },

    importMeetingBackupFromPanel: function () {
      var textarea = document.getElementById("iy-meeting-backup-import-text");
      if (!textarea || !String(textarea.value || "").trim()) {
        this.setImportMsg("Paste meeting backup JSON first.");
        return;
      }
      try {
        var pkg = JSON.parse(textarea.value);
        this.restoreMeetingBackup(pkg);
        this.closeMeetingBackupImportPanel();
      } catch (e) {
        this.setImportMsg("Restore failed: " + (e && e.message ? e.message : String(e)));
      }
    },

    importMeetingBackupFile: function (input) {
      var file = input && input.files && input.files[0];
      if (!file) return;
      var self = this;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var pkg = JSON.parse(String(reader.result || ""));
          self.restoreMeetingBackup(pkg);
          input.value = "";
          self.closeMeetingBackupImportPanel();
        } catch (e) {
          self.setImportMsg("Restore failed: " + e.message);
        }
      };
      reader.onerror = function () {
        self.setImportMsg("Could not read backup file.");
      };
      reader.readAsText(file);
    },

    applyMeetingBackupPackage: function (pkg) {
      var meetingId = String(pkg.meetingId || "").trim();
      if (!meetingId) throw new Error("Backup has no meetingId.");
      if (pkg.manifest && pkg.manifest.meetingId && String(pkg.manifest.meetingId) !== meetingId) {
        throw new Error("Backup manifest meetingId does not match backup meetingId.");
      }

      this.races = pkg.races;
      var st = pkg.state || {};
      this.state.meetingLabel = st.meetingLabel || pkg.meetingName || "";
      this.state.loadedMeetingPath = st.loadedMeetingPath || pkg.meetingPath || "";
      this.setMeetingCardMeta({
        source: st.meetingCardSource || (pkg.metadata && pkg.metadata.meetingCardSource) || "",
        tabVenueCode: st.tabVenueCode || (pkg.metadata && pkg.metadata.tabVenueCode) || "",
        meetingDate: st.meetingDate || pkg.date || (pkg.metadata && pkg.metadata.meetingDate) || "",
        meetingVenue: st.meetingVenue || pkg.track || (pkg.metadata && pkg.metadata.meetingVenue) || "",
      });
      if (st.hideScratched != null) {
        this.state.hideScratched = !!st.hideScratched;
      } else if (this.state.meetingCardSource) {
        this.setHideScratchedDefaultForSource(this.state.meetingCardSource);
      }

      var delivery = window.MeetingExportDelivery;
      if (pkg.manifest && delivery) {
        delivery.saveMeetingManifest(pkg.manifest);
      } else {
        this.syncMeetingManifest({
          meetingPath: this.state.loadedMeetingPath,
          trackName: pkg.track || this.state.meetingVenue,
          date: pkg.date || this.state.meetingDate,
        });
      }

      var manifest = pkg.manifest || this.syncMeetingManifest() || {};
      if (manifest.meetingId && String(manifest.meetingId) !== meetingId) {
        throw new Error("Cannot restore: manifest meetingId does not match backup.");
      }

      var assessments = st.assessments || {};
      var selectedRaceId =
        st.selectedRaceId || (pkg.races[0] && pkg.races[0].id) || null;
      var selectedRunnerNo =
        st.selectedRunnerNo != null
          ? st.selectedRunnerNo
          : pkg.races[0] && pkg.races[0].runners && pkg.races[0].runners[0]
            ? pkg.races[0].runners[0].no
            : null;

      this.activateMeetingSession(manifest, {
        assessments: assessments,
        keepRaces: true,
        keepMeetingMeta: true,
        selectedRaceId: selectedRaceId,
        selectedRunnerNo: selectedRunnerNo,
        meetingPath: this.state.loadedMeetingPath,
        date: pkg.date || manifest.date || "",
        trackName: pkg.track || manifest.trackName || "",
      });
      this.activeMeetingId = meetingId;

      if (pkg.resultedSp && window.ResultedSpDom && window.ResultedSpDom.saveState) {
        var rsp = pkg.resultedSp;
        rsp.meetingId = meetingId;
        window.ResultedSpDom.saveState(rsp);
      }

      this.persistRaces();
      this.persist();
      this.refreshResultedSpPoller(manifest);
      this.updateMeetingMetaDisplay();
      this.showAssess();
      this.render();
    },

    restoreMeetingBackup: function (pkg, options) {
      options = options || {};
      if (!this.isValidMeetingBackupPackage(pkg)) {
        throw new Error("Invalid meeting backup JSON.");
      }
      var backupMeetingId = String(pkg.meetingId).trim();
      var activeId = String(this.activeMeetingId || "").trim();
      if (!options.skipConfirm) {
        var msg =
          "Restore backup for " +
          backupMeetingId +
          "?\n\nLocal assessments and Resulted SP for this meeting will be replaced.";
        if (activeId && activeId !== backupMeetingId) {
          msg =
            "Active meeting is " +
            activeId +
            " but backup is for " +
            backupMeetingId +
            ".\n\nRestore will load " +
            backupMeetingId +
            " and replace its local data.";
        }
        if (!window.confirm(msg)) return false;
      }
      this.applyMeetingBackupPackage(pkg);
      this.resetBackupReminder(backupMeetingId);
      this.setImportMsg("Restored meeting backup for " + backupMeetingId + ".");
      return true;
    },

    clearMeetingLocalData: function (meetingId, options) {
      options = options || {};
      meetingId = String(meetingId || this.activeMeetingId || "").trim();
      if (!meetingId) return;
      if (
        !options.skipConfirm &&
        !window.confirm("Clear all local iPad data for " + meetingId + "?")
      ) {
        return;
      }
      try {
        var store = this.readMeetingStore();
        delete store.meetings[meetingId];
        if (store.activeMeetingId === meetingId) {
          store.activeMeetingId = "";
          store.activeMeetingKey = "";
        }
        this.writeMeetingStore(store);
      } catch (e) {
        /* ignore */
      }
      if (window.ResultedSpDom && window.ResultedSpDom.clearMeetingResults) {
        window.ResultedSpDom.clearMeetingResults(meetingId);
      }
      try {
        var delivery = window.MeetingExportDelivery;
        if (delivery) {
          var manifest = delivery.loadMeetingManifest();
          if (manifest && String(manifest.meetingId) === meetingId) {
            localStorage.removeItem(MANIFEST_KEY);
          }
        }
        if (this.activeMeetingId === meetingId) {
          localStorage.removeItem(RACES_KEY);
        }
      } catch (e) {
        /* ignore */
      }
      if (this.activeMeetingId === meetingId) {
        this.activeMeetingId = "";
        this.activeMeetingKey = "";
        this.races = [];
        this.resetSessionState();
        this.state.meetingLabel = "";
        this.state.loadedMeetingPath = "";
        this.setMeetingCardMeta({
          source: "",
          tabVenueCode: "",
          meetingDate: "",
          meetingVenue: "",
        });
        this.state.selectedRaceId = null;
        this.state.selectedRunnerNo = null;
        if (this.resultedSpPoller && this.resultedSpPoller.stop) {
          this.resultedSpPoller.stop();
        }
        this.renderResultedSpPanel();
        this.updateMeetingMetaDisplay();
      }
    },

    persistRaces: function () {
      this.saveActiveMeetingToStore();
      try {
        localStorage.setItem(RACES_KEY, JSON.stringify(this.races));
      } catch (e) {
        this.setImportMsg("Could not save races: " + e.message);
      }
    },

    loadPersisted: function () {
      try {
        var store = this.readMeetingStore();
        this.activeMeetingId = store.activeMeetingId || "";
        this.activeMeetingKey = store.activeMeetingKey || "";
        if (this.activeMeetingId && store.meetings[this.activeMeetingId]) {
          var saved = store.meetings[this.activeMeetingId];
          if (saved.meetingKey) this.activeMeetingKey = saved.meetingKey;
          if (
            saved.meetingKey &&
            this.activeMeetingKey &&
            saved.meetingKey === this.activeMeetingKey
          ) {
            this.state.assessments = saved.assessments || {};
          } else {
            this.state.assessments = {};
          }
          this.state.selectedRaceId = saved.selectedRaceId || null;
          this.state.selectedRunnerNo = saved.selectedRunnerNo;
          this.state.meetingLabel = saved.meetingLabel || "";
          this.state.loadedMeetingPath = saved.loadedMeetingPath || "";
          this.state.meetingCardSource = saved.meetingCardSource || "";
          this.state.tabVenueCode = saved.tabVenueCode || "";
          this.state.meetingDate = saved.meetingDate || "";
          this.state.meetingVenue = saved.meetingVenue || "";
          this.state.hideScratched = saved.hideScratched != null ? !!saved.hideScratched : false;
          if (saved.tapCount != null) this.state.tapCount = saved.tapCount;
          if (saved.races && saved.races.length) this.races = saved.races;
        }
      } catch (e) {
        this.setImportMsg("Load assessments failed: " + e.message);
      }
    },

    loadRaces: function () {
      if (this.races && this.races.length) return;
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
      var delivery = window.MeetingExportDelivery;
      if (!delivery) return;
      var manifest = delivery.loadMeetingManifest();
      if (!manifest) return;
      var track = manifest.trackName || manifest.trackSlug || "";
      var date = manifest.date || "";
      if (track && date) this.state.meetingLabel = track + " · " + date;
      else this.state.meetingLabel = track || date || this.state.meetingLabel;
    },

    setMeetingCardMeta: function (meta) {
      meta = meta || {};
      if (meta.source != null) this.state.meetingCardSource = String(meta.source || "");
      if (meta.tabVenueCode != null) this.state.tabVenueCode = String(meta.tabVenueCode || "");
      if (meta.meetingDate != null) this.state.meetingDate = String(meta.meetingDate || "");
      if (meta.meetingVenue != null) this.state.meetingVenue = String(meta.meetingVenue || "");
    },

    getMeetingExportContext: function () {
      var delivery = window.MeetingExportDelivery;
      var manifest = this.syncMeetingManifest();
      if (!manifest && delivery) manifest = delivery.loadMeetingManifest();
      return {
        meetingId: this.activeMeetingId || (manifest && manifest.meetingId) || "",
        date: this.state.meetingDate || (manifest && manifest.date) || "",
        venue:
          this.state.meetingVenue ||
          (manifest && manifest.trackName) ||
          (manifest && manifest.trackSlug) ||
          "",
        meetingCardSource: this.state.meetingCardSource || "",
        tabVenueCode: this.state.tabVenueCode || "",
      };
    },

    normalizeRaceNoForExport: function (raceId) {
      return String(raceId || "").replace(/^R/i, "");
    },

    getResultedSpGuardPassed: function (raceNo) {
      if (!window.ResultedSpDom || !this.activeMeetingId) return "";
      if (!window.ResultedSpDom.getRaceImportState) return "";
      var st = window.ResultedSpDom.getRaceImportState(this.activeMeetingId, raceNo);
      if (!st) return "";
      if (st.guardPassed === true) return "true";
      if (st.guardPassed === false) return "false";
      return "";
    },

    getResultExportDiagnostics: function (raceNo) {
      var empty = {
        resultImportStatus: "",
        resultImportedAt: "",
        resultRunnerOverlapCount: "",
        resultYardRunnerCount: "",
        resultTabRunnerCount: "",
        resultedSpGuardPassed: "",
      };
      if (!window.ResultedSpDom || !this.activeMeetingId || !window.ResultedSpDom.getRaceImportState) {
        return empty;
      }
      var st = window.ResultedSpDom.getRaceImportState(this.activeMeetingId, raceNo);
      if (!st) return empty;
      var meta = st.guardMeta || {};
      return {
        resultImportStatus: st.resultImportStatus || st.status || "",
        resultImportedAt: st.importedAt || (meta && meta.importedAt) || "",
        resultRunnerOverlapCount:
          meta.runnerOverlapCount != null ? String(meta.runnerOverlapCount) : "",
        resultYardRunnerCount: meta.yardRunnerCount != null ? String(meta.yardRunnerCount) : "",
        resultTabRunnerCount: meta.tabRunnerCount != null ? String(meta.tabRunnerCount) : "",
        resultedSpGuardPassed: this.getResultedSpGuardPassed(raceNo),
      };
    },

    getRaceResultsStatusLabel: function (raceId) {
      if (!window.ResultedSpDom || !this.activeMeetingId || !window.ResultedSpDom.getRaceResultsStatus) {
        return null;
      }
      return window.ResultedSpDom.getRaceResultsStatus(
        this.activeMeetingId,
        this.normalizeRaceNoForExport(raceId),
      );
    },

    allRunnersWirUnavailable: function () {
      if (!this.races || !this.races.length) return false;
      var total = 0;
      var naCount = 0;
      for (var r = 0; r < this.races.length; r++) {
        var runners = this.races[r].runners || [];
        for (var u = 0; u < runners.length; u++) {
          total++;
          var wir = runners[u].w_ir;
          if (wir == null || wir === "" || String(wir).toUpperCase() === "N/A") naCount++;
        }
      }
      return total > 0 && naCount === total;
    },

    updateMeetingMetaDisplay: function () {
      var bar = document.getElementById("iy-meeting-card-bar");
      var badge = document.getElementById("iy-meeting-card-badge");
      var metaEl = document.getElementById("iy-meeting-card-meta");
      var wirWarn = document.getElementById("iy-wir-warning");
      var hasRaces = this.races && this.races.length > 0;
      var source = this.state.meetingCardSource || "";

      if (bar) {
        if (hasRaces && source) bar.classList.remove("iy-hidden");
        else bar.classList.add("iy-hidden");
      }

      if (badge) {
        if (!hasRaces || !source) {
          badge.textContent = "";
          badge.className = "iy-meeting-card-badge";
        } else if (source === "tab") {
          badge.textContent = "LIVE TAB CARD";
          badge.className = "iy-meeting-card-badge iy-meeting-card-badge-tab";
        } else {
          badge.textContent = "CSV CARD";
          badge.className = "iy-meeting-card-badge iy-meeting-card-badge-csv";
        }
      }

      var ctx = this.getMeetingExportContext();
      var date = ctx.date || "";
      var venue = ctx.venue || "";
      var venueCode = ctx.tabVenueCode || "";

      if (metaEl) {
        if (!hasRaces) {
          metaEl.textContent = "";
        } else {
          var parts = [];
          if (venueCode) parts.push(venueCode);
          if (venue) parts.push(venue);
          if (date) parts.push(date);
          metaEl.textContent = parts.join(" · ");
        }
      }

      if (wirWarn) {
        if (source === "tab" && hasRaces && this.allRunnersWirUnavailable()) {
          wirWarn.classList.remove("iy-hidden");
        } else {
          wirWarn.classList.add("iy-hidden");
        }
      }
    },

    getMeetingDate: function () {
      var delivery = window.MeetingExportDelivery;
      if (delivery) {
        var manifest = delivery.loadMeetingManifest();
        if (manifest && manifest.date) return manifest.date;
      }
      var meta = this.parseMeetingPathMeta(this.state.loadedMeetingPath);
      if (meta.date) return meta.date;
      return undefined;
    },

    updateCountdownDisplay: function () {
      var yrc = window.YardRaceCountdown;
      var wrap = document.getElementById("iy-next-race-countdown");
      if (!wrap || !yrc) return;

      var countdown = yrc.getNextRaceCountdown(this.races, new Date(), this.getMeetingDate());
      if (!countdown) {
        wrap.className = "iy-next-race-countdown iy-hidden";
        return;
      }

      wrap.className = "iy-next-race-countdown";
      var raceEl = document.getElementById("iy-countdown-race");
      var timeEl = document.getElementById("iy-countdown-time");

      if (countdown.status === "complete") {
        if (raceEl) raceEl.textContent = "";
        if (timeEl) {
          timeEl.textContent = "Meeting complete";
          timeEl.className = "iy-countdown-complete";
        }
        return;
      }

      if (raceEl) {
        raceEl.textContent = countdown.raceLabel + " \u00b7 " + countdown.displayStartTime;
      }

      var showCountdown = countdown.status === "counting_down";
      var mainSeconds = showCountdown
        ? countdown.secondsRemaining
        : countdown.secondsUntilCountdownStarts;
      var formatted = yrc.formatCountdownSeconds(mainSeconds);

      if (timeEl) {
        timeEl.textContent = showCountdown ? formatted : "Starts in " + formatted;
        var tone = "iy-countdown-normal";
        if (showCountdown) {
          if (countdown.secondsRemaining < 60) tone = "iy-countdown-red";
          else if (countdown.secondsRemaining < 300) tone = "iy-countdown-amber";
        }
        timeEl.className = "iy-countdown-time " + tone;
      }
    },

    startCountdownTimer: function () {
      var self = this;
      if (this.countdownTimerId != null) {
        window.clearInterval(this.countdownTimerId);
      }
      this.updateCountdownDisplay();
      this.countdownTimerId = window.setInterval(function () {
        self.updateCountdownDisplay();
      }, 1000);
    },

    meetingFolderFromPath: function (path) {
      if (!path) return "";
      var normalized = String(path).replace(/\\/g, "/").replace(/\/+$/, "");
      if (/\/[^/]+\.csv$/i.test(normalized)) {
        var parts = normalized.split("/");
        parts.pop();
        return parts.join("/");
      }
      return normalized;
    },

    syncMeetingManifest: function (options) {
      options = options || {};
      var delivery = window.MeetingExportDelivery;
      if (!delivery || !this.races || !this.races.length) return null;
      var rawPath = options.meetingPath || this.state.loadedMeetingPath || "";
      var folderPath = this.meetingFolderFromPath(rawPath);
      var meta = this.parseMeetingPathMeta(folderPath || rawPath);
      return delivery.syncManifestFromRaces(this.races, {
        meetingFolderPath: folderPath || rawPath,
        meetingLabel: options.meetingLabel || this.state.meetingLabel || "",
        trackName: options.trackName || meta.track || "",
        date: options.date || meta.date || "",
        fileName: options.fileName || rawPath,
        directoryName: options.directoryName || "",
      });
    },

    cacheDesktopMeetingCsv: function (text, options) {
      options = options || {};
      try {
        localStorage.setItem(LAST_MEETING_CSV_KEY, text);
        localStorage.setItem(
          LAST_MEETING_CSV_META_KEY,
          JSON.stringify({
            fileName: options.fileName || "",
            importPath: options.importPath || options.meetingPath || "",
            meetingFolderPath: options.meetingFolderPath || "",
            directoryName: options.directoryName || "",
            trackName: options.trackName || "",
            date: options.date || "",
          }),
        );
      } catch (e) {
        /* ignore */
      }
    },

    notifyDesktopMeetingImported: function () {
      if (typeof window === "undefined" || !window.dispatchEvent) return;
      try {
        window.dispatchEvent(new CustomEvent(MEETING_IMPORTED_EVENT));
      } catch (e) {
        /* ignore */
      }
    },

    wetBodyLabel: function (value) {
      for (var i = 0; i < WET_BODY_TYPES.length; i++) {
        if (WET_BODY_TYPES[i].value === value) return WET_BODY_TYPES[i].label;
      }
      return "";
    },

    wetFeetLabel: function (value) {
      for (var i = 0; i < WET_FEET.length; i++) {
        if (WET_FEET[i].value === value) return WET_FEET[i].label;
      }
      return "";
    },

    setImportMsg: function (msg) {
      this.setText("iy-import-msg", msg || "");
    },

    setLibraryMsg: function (msg) {
      this.setText("iy-library-msg", msg || "");
    },

    isOnline: function () {
      return typeof navigator === "undefined" || navigator.onLine !== false;
    },

    isLaptopDevServer: function () {
      if (typeof location === "undefined") return false;
      var host = location.hostname || "";
      if (host === "localhost" || host === "127.0.0.1") return true;
      if (/^192\.168\./.test(host)) return true;
      if (/^10\./.test(host)) return true;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
      return false;
    },

    parseMeetingPathMeta: function (meetingPath) {
      if (!meetingPath) return { date: "", track: "", meetingName: "" };
      var parts = String(meetingPath).replace(/\\/g, "/").split("/").filter(Boolean);
      var folder = "";
      if (parts.length >= 2 && parts[0] === "meetings") {
        folder = parts[1];
      } else if (parts.length >= 1) {
        folder = parts[parts.length - 2] || parts[0];
      }
      var file = parts[parts.length - 1] || "";
      var date = "";
      var track = "";
      var folderMatch = folder.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
      if (folderMatch) {
        date = folderMatch[1];
        track = folderMatch[2].replace(/-/g, " ");
      }
      var fileMatch = file.match(/^(.+?)_(\d{4}-\d{2}-\d{2})_master\.csv$/i);
      if (fileMatch && !track) {
        track = fileMatch[1].replace(/-/g, " ");
        date = date || fileMatch[2];
      }
      var meetingName = date && track ? date + " · " + track : folder || file;
      return { date: date, track: track, meetingName: meetingName };
    },

    updateDownloadedBadge: function () {
      var el = document.getElementById("iy-downloaded-badge");
      if (!el) return;
      if (this.downloadedMeetingActive && this.hasDownloadedMeeting()) {
        el.classList.remove("iy-hidden");
      } else {
        el.classList.add("iy-hidden");
      }
    },

    closeToolbarMenus: function () {
      var packageMenu = document.getElementById("iy-package-menu");
      var moreMenu = document.getElementById("iy-more-menu");
      if (packageMenu) packageMenu.classList.remove("iy-open");
      if (moreMenu) moreMenu.classList.remove("iy-open");
    },

    togglePackageMenu: function () {
      this.bump();
      var menu = document.getElementById("iy-package-menu");
      var moreMenu = document.getElementById("iy-more-menu");
      if (!menu) return;
      if (moreMenu) moreMenu.classList.remove("iy-open");
      if (menu.classList.contains("iy-open")) menu.classList.remove("iy-open");
      else menu.classList.add("iy-open");
    },

    toggleMoreMenu: function () {
      this.bump();
      var menu = document.getElementById("iy-more-menu");
      var packageMenu = document.getElementById("iy-package-menu");
      if (!menu) return;
      if (packageMenu) packageMenu.classList.remove("iy-open");
      if (menu.classList.contains("iy-open")) menu.classList.remove("iy-open");
      else menu.classList.add("iy-open");
    },

    updateMeetingToolbar: function () {
      var downloadBtn = document.getElementById("iy-btn-download-meeting");
      var importFolderBtn = document.getElementById("iy-btn-import-folder");
      var saveToLaptopBtn = document.getElementById("iy-btn-save-to-laptop");
      var hasRaces = this.races && this.races.length > 0;
      var onLaptop = this.isLaptopDevServer();
      var delivery = window.MeetingExportDelivery;
      var supportsFolder = delivery && delivery.supportsDirectoryPicker();
      if (downloadBtn) {
        if (hasRaces && onLaptop) downloadBtn.classList.remove("iy-hidden");
        else downloadBtn.classList.add("iy-hidden");
      }
      if (importFolderBtn) {
        if (supportsFolder) importFolderBtn.classList.remove("iy-hidden");
        else importFolderBtn.classList.add("iy-hidden");
      }
      if (saveToLaptopBtn) {
        if (this.canSaveToLaptop()) saveToLaptopBtn.classList.remove("iy-hidden");
        else saveToLaptopBtn.classList.add("iy-hidden");
      }
      this.updateCountdownDisplay();
      this.updateMeetingMetaDisplay();
    },

    canSaveToLaptop: function () {
      if (!this.isOnline()) return false;
      var delivery = window.MeetingExportDelivery;
      var manifest = this.syncMeetingManifest();
      if (!manifest && delivery) manifest = delivery.loadMeetingManifest();
      var folderPath =
        manifest && manifest.meetingFolderPath ? String(manifest.meetingFolderPath).trim() : "";
      return Boolean(folderPath);
    },

    buildDownloadedMeetingPackage: function () {
      var delivery = window.MeetingExportDelivery;
      var manifest = delivery ? delivery.loadMeetingManifest() : null;
      var meta = this.parseMeetingPathMeta(this.state.loadedMeetingPath);
      var meetingId =
        this.activeMeetingId ||
        this.resolveMeetingId({
          manifest: manifest,
          meetingPath: this.state.loadedMeetingPath,
          date: meta.date,
          trackName: meta.track,
        });
      return {
        version: 1,
        downloadedAt: new Date().toISOString(),
        meetingId: meetingId,
        manifest: manifest,
        meetingPath: this.state.loadedMeetingPath || "",
        meetingName: this.state.meetingLabel || meta.meetingName,
        track: meta.track,
        date: meta.date,
        races: this.races,
        state: {
          selectedRaceId: this.state.selectedRaceId,
          selectedRunnerNo: this.state.selectedRunnerNo,
          assessments: this.state.assessments,
          meetingLabel: this.state.meetingLabel,
          loadedMeetingPath: this.state.loadedMeetingPath,
          meetingCardSource: this.state.meetingCardSource,
          tabVenueCode: this.state.tabVenueCode,
          meetingDate: this.state.meetingDate,
          meetingVenue: this.state.meetingVenue,
          hideScratched: !!this.state.hideScratched,
        },
      };
    },

    saveDownloadedMeetingPackage: function (pkg) {
      localStorage.setItem(DOWNLOADED_MEETING_KEY, JSON.stringify(pkg));
      this.downloadedMeetingActive = true;
      this.persistRaces();
      this.persist();
      this.updateDownloadedBadge();
      this.updateMeetingToolbar();
    },

    readDownloadedMeetingPackage: function () {
      try {
        var raw = localStorage.getItem(DOWNLOADED_MEETING_KEY);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.races) || !parsed.races.length) return null;
        return parsed;
      } catch (e) {
        return null;
      }
    },

    hasDownloadedMeeting: function () {
      return !!this.readDownloadedMeetingPackage();
    },

    applyDownloadedMeetingPackage: function (pkg, options) {
      options = options || {};
      if (!pkg || !pkg.races || !pkg.races.length) {
        throw new Error("Invalid meeting package");
      }
      this.races = pkg.races;
      this.state.meetingLabel = pkg.meetingName || (pkg.state && pkg.state.meetingLabel) || "";
      this.state.loadedMeetingPath = pkg.meetingPath || (pkg.state && pkg.state.loadedMeetingPath) || "";
      this.setMeetingCardMeta({
        source: (pkg.state && pkg.state.meetingCardSource) || "downloaded",
        tabVenueCode: (pkg.state && pkg.state.tabVenueCode) || "",
        meetingDate: pkg.date || (pkg.state && pkg.state.meetingDate) || "",
        meetingVenue: pkg.track || (pkg.state && pkg.state.meetingVenue) || "",
      });
      this.syncMeetingManifest({
        meetingPath: this.state.loadedMeetingPath,
        trackName: pkg.track || this.state.meetingLabel,
        date: pkg.date || "",
      });
      var delivery = window.MeetingExportDelivery;
      var manifest = (pkg.manifest && pkg.manifest.raceNos && pkg.manifest) || (delivery ? delivery.loadMeetingManifest() : null);
      var meetingId =
        pkg.meetingId ||
        this.resolveMeetingId({
          manifest: manifest,
          meetingPath: this.state.loadedMeetingPath,
          date: pkg.date || "",
          trackName: pkg.track || "",
        });
      var newMeetingKey = manifest ? this.meetingKeyFromManifest(manifest) : "";
      var pkgAssessments = (pkg.state && pkg.state.assessments) || {};
      var mergedAssessments = {};
      var key;
      if (meetingId && newMeetingKey) {
        var store = this.readMeetingStore();
        var saved = store.meetings[meetingId] ? store.meetings[meetingId] : null;
        if (saved && saved.meetingKey === newMeetingKey && saved.assessments) {
          for (key in saved.assessments) {
            if (Object.prototype.hasOwnProperty.call(saved.assessments, key)) {
              mergedAssessments[key] = saved.assessments[key];
            }
          }
        }
        for (key in pkgAssessments) {
          if (Object.prototype.hasOwnProperty.call(pkgAssessments, key)) {
            mergedAssessments[key] = pkgAssessments[key];
          }
        }
      } else {
        for (key in pkgAssessments) {
          if (Object.prototype.hasOwnProperty.call(pkgAssessments, key)) {
            mergedAssessments[key] = pkgAssessments[key];
          }
        }
      }
      var selectedRaceId =
        (pkg.state && pkg.state.selectedRaceId) || (pkg.races[0] && pkg.races[0].id) || null;
      var selectedRunnerNo =
        pkg.state && pkg.state.selectedRunnerNo != null
          ? pkg.state.selectedRunnerNo
          : pkg.races[0] && pkg.races[0].runners && pkg.races[0].runners[0]
            ? pkg.races[0].runners[0].no
            : null;
      if (manifest) {
        this.activateMeetingSession(manifest, {
          assessments: mergedAssessments,
          keepRaces: true,
          keepMeetingMeta: true,
          selectedRaceId: selectedRaceId,
          selectedRunnerNo: selectedRunnerNo,
          meetingPath: this.state.loadedMeetingPath,
          date: pkg.date || "",
          trackName: pkg.track || "",
        });
      } else {
        this.resetSessionState();
        this.state.assessments = mergedAssessments;
        this.state.selectedRaceId = selectedRaceId;
        this.state.selectedRunnerNo = selectedRunnerNo;
        this.normalizeSelection();
      }
      this.downloadedMeetingActive = true;
      var savedPkg = this.buildDownloadedMeetingPackage();
      this.saveDownloadedMeetingPackage(savedPkg);
      if (!options.silent) this.showAssess();
      else this.render();
      this.updateDownloadedBadge();
      this.updateMeetingToolbar();
      this.updateMeetingMetaDisplay();
    },

    showDownloadPanel: function (pkg) {
      var overlay = document.getElementById("iy-download-overlay");
      var textarea = document.getElementById("iy-download-package-text");
      var msg = document.getElementById("iy-download-msg");
      if (msg) {
        msg.textContent =
          "Meeting downloaded to iPad. You can now use this meeting offline.";
      }
      if (textarea) textarea.value = JSON.stringify(pkg);
      if (overlay) overlay.classList.remove("iy-hidden");
    },

    closeDownloadPanel: function () {
      var overlay = document.getElementById("iy-download-overlay");
      if (overlay) overlay.classList.add("iy-hidden");
    },

    selectAllDownloadPackage: function () {
      this.bump();
      var textarea = document.getElementById("iy-download-package-text");
      if (!textarea) return;
      textarea.focus();
      textarea.select();
      try {
        textarea.setSelectionRange(0, textarea.value.length);
      } catch (e) {
        /* ignore */
      }
    },

    showPackageImportPanel: function () {
      var overlay = document.getElementById("iy-package-overlay");
      var textarea = document.getElementById("iy-package-text");
      if (textarea) textarea.value = "";
      if (overlay) overlay.classList.remove("iy-hidden");
    },

    closePackagePanel: function () {
      var overlay = document.getElementById("iy-package-overlay");
      if (overlay) overlay.classList.add("iy-hidden");
    },

    importMeetingPackage: function () {
      this.bump();
      var textarea = document.getElementById("iy-package-text");
      if (!textarea || !textarea.value.trim()) {
        this.setImportMsg("Paste a meeting package first.");
        return;
      }
      try {
        var pkg = JSON.parse(textarea.value.replace(/^\uFEFF/, "").trim());
        this.applyDownloadedMeetingPackage(pkg);
        this.closePackagePanel();
        this.setImportMsg("Downloaded meeting loaded — ready for offline use.");
      } catch (e) {
        this.setImportMsg("Import failed: " + e.message);
      }
    },

    downloadMeetingToIpad: function () {
      this.bump();
      if (!this.races || !this.races.length) {
        this.setImportMsg("Load a meeting first.");
        return;
      }
      try {
        var pkg = this.buildDownloadedMeetingPackage();
        this.saveDownloadedMeetingPackage(pkg);
        this.setImportMsg("Meeting downloaded to iPad. You can now use this meeting offline.");
        if (this.isLaptopDevServer()) {
          this.showDownloadPanel(pkg);
        }
      } catch (e) {
        this.setImportMsg("Download failed: " + e.message);
      }
    },

    useDownloadedMeeting: function () {
      this.bump();
      var pkg = this.readDownloadedMeetingPackage();
      if (pkg) {
        try {
          this.applyDownloadedMeetingPackage(pkg);
          this.setImportMsg("Using downloaded meeting — offline ready.");
        } catch (e) {
          this.setImportMsg("Could not load downloaded meeting: " + e.message);
        }
        return;
      }
      this.showPackageImportPanel();
      this.setImportMsg("Paste meeting package from laptop download.");
    },

    clearDownloadedMeeting: function () {
      this.bump();
      try {
        localStorage.removeItem(DOWNLOADED_MEETING_KEY);
      } catch (e) {
        /* ignore */
      }
      this.downloadedMeetingActive = false;
      this.updateDownloadedBadge();
      this.setImportMsg("Downloaded meeting cleared. Current session data kept on iPad.");
    },

    clearCurrentMeeting: function () {
      this.bump();
      if (!window.confirm("Clear meeting?\nThis cannot be undone.")) {
        return;
      }
      var meetingId = this.activeMeetingId;
      try {
        if (meetingId) {
          var store = this.readMeetingStore();
          delete store.meetings[meetingId];
          if (store.activeMeetingId === meetingId) {
            store.activeMeetingId = "";
            store.activeMeetingKey = "";
          }
          this.writeMeetingStore(store);
        }
        var pkg = this.readDownloadedMeetingPackage();
        if (pkg) {
          var pkgMeetingId =
            pkg.meetingId ||
            this.resolveMeetingId({
              manifest: pkg.manifest,
              meetingPath: pkg.meetingPath || "",
              date: pkg.date || "",
              trackName: pkg.track || "",
            });
          if (!meetingId || !pkgMeetingId || pkgMeetingId === meetingId) {
            localStorage.removeItem(DOWNLOADED_MEETING_KEY);
          }
        }
        localStorage.removeItem(RACES_KEY);
      } catch (e) {
        /* ignore */
      }
      this.activeMeetingId = "";
      this.activeMeetingKey = "";
      this.races = [];
      this.meetingLoadingPath = null;
      this.downloadedMeetingActive = false;
      this.resetSessionState();
      this.state.meetingLabel = "";
      this.state.loadedMeetingPath = "";
      this.setMeetingCardMeta({
        source: "",
        tabVenueCode: "",
        meetingDate: "",
        meetingVenue: "",
      });
      this.state.selectedRaceId = null;
      this.state.selectedRunnerNo = null;
      this.updateDownloadedBadge();
      this.updateMeetingToolbar();
      this.setText("iy-meeting-label", "");
      this.updateMeetingMetaDisplay();
      this.setImportMsg("");
      this.setLibraryMsg("Choose a meeting to start.");
      this.showLibrary();
    },

    updateNetworkStatus: function () {
      var online = this.isOnline();
      var el = document.getElementById("iy-network-status");
      if (!el) return;
      el.textContent = online ? "Online" : "Offline";
      el.className = "iy-network-status " + (online ? "iy-network-online" : "iy-network-offline");
    },

    initNetworkListeners: function () {
      var self = this;
      self.updateNetworkStatus();
      window.addEventListener("online", function () {
        self.updateNetworkStatus();
        self.updateMeetingToolbar();
        self.setImportMsg("Back online.");
        if (self.view === "library" && !self.libraryMeetings.length) {
          self.fetchLibrary();
        }
      });
      window.addEventListener("offline", function () {
        self.updateNetworkStatus();
        self.updateMeetingToolbar();
        self.setImportMsg("Offline — yard data saved locally on this iPad.");
      });
    },

    loadCachedLibrary: function () {
      try {
        var raw = localStorage.getItem(LIBRARY_CACHE_KEY);
        if (!raw) return false;
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.libraryMeetings = parsed;
          return true;
        }
      } catch (e) {
        /* ignore */
      }
      return false;
    },

    cacheLibraryMeetings: function (meetings) {
      try {
        localStorage.setItem(LIBRARY_CACHE_KEY, JSON.stringify(meetings));
      } catch (e) {
        /* ignore */
      }
    },

    hasStoredRaces: function () {
      if (this.races && this.races.length) return true;
      try {
        var store = this.readMeetingStore();
        if (store.activeMeetingId && store.meetings[store.activeMeetingId]) {
          var saved = store.meetings[store.activeMeetingId];
          if (saved.races && saved.races.length) return true;
        }
        var raw = localStorage.getItem(RACES_KEY);
        if (!raw) return false;
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0;
      } catch (e) {
        return false;
      }
    },

    showLibrary: function () {
      this.bump();
      this.closeToolbarMenus();
      this.view = "library";
      this.updateViewVisibility();
      if (!this.libraryMeetings.length) {
        this.loadCachedLibrary();
      }
      this.renderLibrary();
      if (this.isOnline()) {
        this.fetchLibrary();
      } else if (!this.libraryMeetings.length && this.loadCachedLibrary()) {
        this.setLibraryMsg("Offline — showing cached meeting list.");
        this.renderLibrary();
      } else if (!this.libraryMeetings.length) {
        this.setLibraryMsg("Offline — connect to load meetings.");
      }
    },

    showAssess: function () {
      this.closeToolbarMenus();
      this.view = "assess";
      this.updateViewVisibility();
      this.updateMeetingToolbar();
      this.render();
    },

    updateViewVisibility: function () {
      var library = document.getElementById("iy-library-view");
      var assess = document.getElementById("iy-assess-view");
      var raceTabs = document.getElementById("iy-race-tabs");
      var fixedNav = document.getElementById("iy-fixed-nav");
      var isLibrary = this.view === "library";
      if (library) {
        if (isLibrary) library.classList.remove("iy-hidden");
        else library.classList.add("iy-hidden");
      }
      if (assess) {
        if (isLibrary) assess.classList.add("iy-hidden");
        else assess.classList.remove("iy-hidden");
      }
      if (raceTabs) {
        if (isLibrary) raceTabs.classList.add("iy-hidden");
        else raceTabs.classList.remove("iy-hidden");
      }
      if (fixedNav) {
        if (isLibrary) fixedNav.classList.add("iy-hidden");
        else fixedNav.classList.remove("iy-hidden");
      }
    },

    fetchLibrary: function (options) {
      options = options || {};
      var bypassCache = Boolean(options.bypassCache);
      var self = this;
      if (self.libraryLoading) return;
      if (!self.isOnline()) {
        if (!bypassCache && self.loadCachedLibrary()) {
          self.setLibraryMsg("Offline — showing cached meeting list.");
          self.renderLibrary();
        } else {
          self.setLibraryMsg("Offline — connect to refresh meetings from server.");
          self.renderLibrary();
        }
        return;
      }
      if (bypassCache) {
        self.libraryMeetings = [];
        self.renderLibrary();
      }
      self.libraryLoading = true;
      self.setLibraryMsg(bypassCache ? "Refreshing from server…" : "Loading meetings…");
      var xhr = new XMLHttpRequest();
      xhr.open(
        "GET",
        "/api/meeting-library?_=" + encodeURIComponent(String(Date.now())),
      );
      xhr.setRequestHeader("Cache-Control", "no-cache");
      xhr.setRequestHeader("Pragma", "no-cache");
      xhr.onload = function () {
        self.libraryLoading = false;
        try {
          if (xhr.status < 200 || xhr.status >= 300) {
            throw new Error("Server returned " + xhr.status);
          }
          var data = JSON.parse(xhr.responseText || "{}");
          if (!data.ok || !data.meetings) {
            throw new Error(data.error || "Invalid library response");
          }
          if (data.scan) {
            console.log("[meeting-library] source:", data.scan.source || "unknown");
            if (data.scan.generatedAt) {
              console.log("[meeting-library] manifest generatedAt:", data.scan.generatedAt);
            }
            console.log("[meeting-library] folders scanned:", data.scan.foldersScanned);
            console.log("[meeting-library] master CSV files found:", data.scan.masterCsvFiles);
            console.log("[meeting-library] folders excluded:", data.scan.foldersExcluded);
            console.log("[meeting-library] meetings returned:", data.scan.meetingsReturned);
            if (data.scan.folderReports) {
              console.log("[meeting-library] folder reports:", data.scan.folderReports);
              var tareeReport = null;
              for (var fr = 0; fr < data.scan.folderReports.length; fr++) {
                if (/taree/i.test(data.scan.folderReports[fr].folder)) {
                  tareeReport = data.scan.folderReports[fr];
                  break;
                }
              }
              if (tareeReport) {
                console.log("[meeting-library] Taree folder report:", tareeReport);
              }
            }
            console.log(
              "[meeting-library] API meetings:",
              (data.meetings || []).map(function (m) {
                return m.relativePath;
              }),
            );
          }
          self.libraryMeetings = data.meetings;
          self.cacheLibraryMeetings(data.meetings);
          if (bypassCache) {
            self.setLibraryMsg(
              "Meeting Library refreshed from server." +
                (data.meetings.length
                  ? " " + data.meetings.length + " meetings available."
                  : " No master CSVs found in meetings/."),
            );
          } else {
            self.setLibraryMsg(
              data.meetings.length
                ? data.meetings.length + " meetings available"
                : "No master CSVs found in meetings/",
            );
          }
          self.renderLibrary();
        } catch (e) {
          if (!bypassCache && self.loadCachedLibrary()) {
            self.setLibraryMsg("Could not load library — showing cached meeting list.");
          } else {
            self.libraryMeetings = [];
            self.setLibraryMsg("Could not load library: " + e.message);
          }
          self.renderLibrary();
        }
      };
      xhr.onerror = function () {
        self.libraryLoading = false;
        if (!bypassCache && self.loadCachedLibrary()) {
          self.setLibraryMsg("Could not reach server — showing cached meeting list.");
        } else {
          self.libraryMeetings = [];
          self.setLibraryMsg("Network error — could not refresh from server.");
        }
        self.renderLibrary();
      };
      xhr.send();
    },

    buildMeetingList: function () {
      if (!this.libraryMeetings.length) {
        return (
          '<div class="iy-library-empty">' +
          "No meetings listed yet. Add a folder under <code>meetings/YYYY-MM-DD-track/</code> " +
          "with <code>{track}_YYYY-MM-DD_master.csv</code>, push to GitHub, wait for deploy, then tap <strong>Refresh</strong>. " +
          "On laptop dev you can also run <strong>npm run build-meeting-csv</strong>." +
          "</div>"
        );
      }
      var html = "";
      for (var i = 0; i < this.libraryMeetings.length; i++) {
        var meeting = this.libraryMeetings[i];
        var active =
          meeting.relativePath === this.state.loadedMeetingPath ? " iy-meeting-active" : "";
        var loading =
          this.meetingLoadingPath === meeting.relativePath ? " iy-meeting-loading" : "";
        html +=
          '<button type="button" class="iy-meeting-card' +
          active +
          loading +
          '" onclick="window.ipadYard.loadMeeting(\'' +
          escapeAttr(meeting.relativePath) +
          "', '" +
          escapeAttr(meeting.label) +
          "')\">" +
          '<div class="iy-meeting-card-title">' +
          escapeHtml(meeting.label) +
          "</div>" +
          '<div class="iy-meeting-card-sub">' +
          escapeHtml(meeting.fileName) +
          "</div></button>";
      }
      return html;
    },

    renderLibrary: function () {
      var list = document.getElementById("iy-meeting-list");
      if (list) list.innerHTML = this.buildMeetingList();
    },

    loadMeeting: function (relativePath, label) {
      var self = this;
      if (self.meetingLoadingPath) return;
      if (!self.isOnline()) {
        self.setLibraryMsg("Offline — connect to laptop to load a meeting.");
        return;
      }
      var meetingMeta = null;
      for (var m = 0; m < self.libraryMeetings.length; m++) {
        if (self.libraryMeetings[m].relativePath === relativePath) {
          meetingMeta = self.libraryMeetings[m];
          break;
        }
      }
      self.meetingLoadingPath = relativePath;
      self.setLibraryMsg("Loading " + (label || "meeting") + "…");
      self.renderLibrary();
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "/api/meeting-library?path=" + encodeURIComponent(relativePath));
      xhr.onload = function () {
        self.meetingLoadingPath = null;
        try {
          if (xhr.status < 200 || xhr.status >= 300) {
            throw new Error("Server returned " + xhr.status);
          }
          self.applyMeetingCsv(xhr.responseText, label || "Meeting", {
            meetingPath: relativePath,
            meetingLabel: label || (meetingMeta && meetingMeta.label) || "",
            trackName: meetingMeta && meetingMeta.trackLabel ? meetingMeta.trackLabel : "",
            date: meetingMeta && meetingMeta.date ? meetingMeta.date : "",
            fileName: meetingMeta && meetingMeta.fileName ? meetingMeta.fileName : relativePath,
            switchToAssess: true,
          });
          self.setLibraryMsg("");
        } catch (e) {
          self.setLibraryMsg("Load failed: " + e.message);
          self.renderLibrary();
        }
      };
      xhr.onerror = function () {
        self.meetingLoadingPath = null;
        self.setLibraryMsg("Network error loading meeting.");
        self.renderLibrary();
      };
      xhr.send();
    },

    selectRace: function (raceId) {
      this.bump();
      this.gearPickerOpen = null;
      this.state.selectedRaceId = raceId;
      var race = this.getRace();
      if (race && race.runners && race.runners.length) {
        var visible = this.getVisibleRunners(race);
        if (visible.length) this.state.selectedRunnerNo = visible[0].no;
        else this.state.selectedRunnerNo = race.runners[0].no;
      }
      this.persist();
      this.render();
    },

    selectRunner: function (runnerNo) {
      this.bump();
      this.gearPickerOpen = null;
      this.state.selectedRunnerNo = Number(runnerNo);
      var race = this.getRace();
      if (race) this.markRunnerReviewed(this.makeKey(race.id, Number(runnerNo)));
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
      assessment.reviewed = true;
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
      var race = this.getRace();
      var runner = this.getRunner();
      if (race && runner) this.markRunnerReviewed(this.makeKey(race.id, runner.no));
      this.gearPickerOpen = this.gearPickerOpen === code ? null : code;
      this.persist();
      this.render();
    },

    toggleGearLoc: function (code, loc) {
      this.bump();
      var race = this.getRace();
      var runner = this.getRunner();
      if (!race || !runner) return;
      var assessment = this.ensureAssessment(this.makeKey(race.id, runner.no));
      assessment.reviewed = true;
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
      var race = this.getRace();
      var runner = this.getRunner();
      if (race && runner) this.markRunnerReviewed(this.makeKey(race.id, runner.no));
      this.gearPickerOpen = this.gearPickerOpen === "WET" ? null : "WET";
      this.persist();
      this.render();
    },

    setWetBody: function (value) {
      this.bump();
      var assessment = this.getCurrentAssessment();
      if (!assessment) return;
      if (!assessment.wet) assessment.wet = {};
      assessment.reviewed = true;
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
      assessment.reviewed = true;
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
      assessment.reviewed = true;
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
      var runners = race ? this.getVisibleRunners(race) : [];
      if (!runners.length) return;
      var idx = 0;
      for (var i = 0; i < runners.length; i++) {
        if (runners[i].no === this.state.selectedRunnerNo) {
          idx = i;
          break;
        }
      }
      var next = runners[(idx + 1) % runners.length];
      this.state.selectedRunnerNo = next.no;
      this.markRunnerReviewed(this.makeKey(race.id, next.no));
      this.persist();
      this.render();
    },

    prevRunner: function () {
      this.bump();
      this.gearPickerOpen = null;
      var race = this.getRace();
      var runners = race ? this.getVisibleRunners(race) : [];
      if (!runners.length) return;
      var idx = 0;
      for (var i = 0; i < runners.length; i++) {
        if (runners[i].no === this.state.selectedRunnerNo) {
          idx = i;
          break;
        }
      }
      var len = runners.length;
      var prev = runners[(idx - 1 + len) % len];
      this.state.selectedRunnerNo = prev.no;
      this.markRunnerReviewed(this.makeKey(race.id, prev.no));
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
        var rsDot = "";
        var rsStatus = this.getRaceResultsStatusLabel(race.id);
        if (rsStatus && rsStatus.code) {
          rsDot =
            '<span class="iy-race-rs-dot iy-race-rs-' +
            rsStatus.code +
            '" title="' +
            escapeAttr(rsStatus.label) +
            '"></span>';
        }
        var complete = this.getRaceCompleteness(race);
        var completeBadge = "";
        if (complete.total > 0) {
          completeBadge =
            '<span class="iy-race-complete" title="Assessed / active runners">' +
            complete.assessed +
            "/" +
            complete.total +
            "</span>";
        }
        html +=
          '<button type="button" class="iy-race-tab' +
          active +
          '" onclick="window.ipadYard.selectRace(\'' +
          escapeAttr(race.id) +
          "')\">" +
          escapeHtml(race.id) +
          completeBadge +
          rsDot +
          "</button>";
      }
      return html;
    },

    buildRunners: function () {
      var race = this.getRace();
      if (!race) return "";
      var html = "";
      var runners = this.getVisibleRunners(race);
      for (var i = 0; i < runners.length; i++) {
        var runner = runners[i];
        var rkey = this.makeKey(race.id, runner.no);
        var assessment = this.state.assessments[rkey];
        var meta = this.runnerTileMeta(assessment);
        var resultLine = "";
        if (window.ResultedSpDom && this.activeMeetingId && window.ResultedSpDom.getRunnerResult) {
          var result = window.ResultedSpDom.getRunnerResult(
            this.activeMeetingId,
            race.id.replace(/^R/i, ""),
            runner.no,
            runner.horse,
          );
          if (result && (result.finishPosition || result.sp)) {
            var parts = [];
            if (result.finishPosition) parts.push("Fin " + result.finishPosition);
            if (result.sp) parts.push("SP " + result.sp);
            if (result.margin) parts.push("Marg " + result.margin);
            resultLine = parts.join(" · ");
          }
        }
        var active = runner.no === this.state.selectedRunnerNo ? " iy-runner-active" : "";
        var scratchedCls = this.isRunnerScratched(runner) ? " iy-runner-scratched" : "";
        html +=
          '<button type="button" class="iy-runner-tile ' +
          meta.scoreClass +
          scratchedCls +
          active +
          '" onclick="window.ipadYard.selectRunner(' +
          runner.no +
          ')">';
        html +=
          '<span class="iy-runner-head">#' +
          runner.no +
          " " +
          escapeHtml(runner.horse) +
          "</span>";
        if (resultLine) {
          html += '<span class="iy-runner-netline">' + escapeHtml(resultLine) + "</span>";
        }
        if (meta.netLine) {
          html += '<span class="iy-runner-netline">' + escapeHtml(meta.netLine) + "</span>";
        }
        html +=
          '<span class="iy-runner-factors">' + escapeHtml(meta.factorLabel) + "</span></button>";
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
      this.updateMeetingMetaDisplay();
      this.updateMeetingHealthPanel();

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

    isIOS12: function () {
      var ua = navigator.userAgent || "";
      if (/OS 12[_\s]/.test(ua)) return true;
      if (/CPU OS 12[_\s]/.test(ua)) return true;
      if (/iPad/.test(ua) && /Version\/12[\.\s]/.test(ua)) return true;
      return false;
    },

    supportsFileDownload: function () {
      if (this.isIOS12()) return false;
      try {
        var a = document.createElement("a");
        return typeof a.download !== "undefined";
      } catch (e) {
        return false;
      }
    },

    buildCategoryFactorKeys: function (group) {
      if (!group) return { positives: [], negatives: [] };
      if (group.kind === "sweat") {
        return {
          positives: [cfg.sweatPosKey || "Clean+"],
          negatives: ["BH-", "K-", "N-", "BS-"],
        };
      }
      return {
        positives: group.positives ? group.positives.slice() : [],
        negatives: group.negatives ? group.negatives.slice() : [],
      };
    },

    buildCategoryFactorJson: function (assessment, group) {
      if (!assessment || !group) return "";
      var keys = this.buildCategoryFactorKeys(group);
      var pos = {};
      var neg = {};
      var has = false;
      var i;
      var k;
      var v;
      for (i = 0; i < keys.positives.length; i++) {
        k = keys.positives[i];
        v = assessment.positive && assessment.positive[k];
        if (v > 0) {
          pos[k] = v;
          has = true;
        }
      }
      for (i = 0; i < keys.negatives.length; i++) {
        k = keys.negatives[i];
        v = assessment.negative && assessment.negative[k];
        if (v < 0) {
          neg[k] = v;
          has = true;
        }
      }
      if (!has) return "";
      return JSON.stringify({ positive: pos, negative: neg });
    },

    buildCategoryJsonByName: function (assessment, title) {
      var target = String(title || "").toUpperCase();
      for (var g = 0; g < this.factorGroups.length; g++) {
        var group = this.factorGroups[g];
        if (group.kind === "sweat" && target === "SWEAT") {
          return this.buildCategoryFactorJson(assessment, group);
        }
        if (group.kind === "rows" && String(group.title || "").toUpperCase() === target) {
          return this.buildCategoryFactorJson(assessment, group);
        }
      }
      return "";
    },

    buildPhysicalCategoryJson: function (assessment) {
      if (!assessment) return "";
      var gear = assessment.gear || {};
      var wet = assessment.wet || {};
      var hasGear = false;
      var gearKeys = Object.keys(gear);
      for (var i = 0; i < gearKeys.length; i++) {
        if (gear[gearKeys[i]] && gear[gearKeys[i]].length) {
          hasGear = true;
          break;
        }
      }
      var hasWet = Boolean((wet.bodyType && String(wet.bodyType).trim()) || (wet.feet && String(wet.feet).trim()));
      if (!hasGear && !hasWet) return "";
      return JSON.stringify({ gear: gear, wet: wet });
    },

    buildGearOnlyJson: function (assessment) {
      if (!assessment || !assessment.gear) return "";
      var gear = assessment.gear;
      var keys = Object.keys(gear);
      var has = false;
      for (var i = 0; i < keys.length; i++) {
        if (gear[keys[i]] && gear[keys[i]].length) {
          has = true;
          break;
        }
      }
      if (!has) return "";
      return JSON.stringify(gear);
    },

    getRunnerResultForReviewExport: function (raceNo, runner) {
      var empty = { finishPosition: "", sp: "", margin: "" };
      if (!window.ResultedSpDom || !this.activeMeetingId || !window.ResultedSpDom.getRaceImportState) {
        return empty;
      }
      var st = window.ResultedSpDom.getRaceImportState(this.activeMeetingId, raceNo);
      if (!st || st.guardPassed !== true || st.resultImportStatus !== "imported") {
        return empty;
      }
      if (!window.ResultedSpDom.getRunnerResult) return empty;
      var result = window.ResultedSpDom.getRunnerResult(
        this.activeMeetingId,
        raceNo,
        runner.no,
        runner.horse,
      );
      if (!result) return empty;
      return {
        finishPosition:
          result.finishPosition === "" || result.finishPosition == null
            ? ""
            : String(result.finishPosition),
        sp: result.sp || "",
        margin: result.margin || "",
      };
    },

    buildRaceReviewCsvText: function () {
      var headers = [
        "meetingId",
        "date",
        "venue",
        "meeting_card_source",
        "tab_venue_code",
        "raceNo",
        "runnerNo",
        "runnerName",
        "scratched",
        "w_ir",
        "finish_position",
        "sp",
        "margin",
        "result_import_status",
        "resulted_sp_guard_passed",
        "total_positive",
        "total_negative",
        "net",
        "physical_json",
        "sweat_json",
        "coat_json",
        "muscle_json",
        "behaviour_json",
        "walk_json",
        "condition_json",
        "gear_json",
        "notes",
      ];
      var lines = [headers.join(",")];
      var self = this;
      var ctx = this.getMeetingExportContext();

      for (var r = 0; r < this.races.length; r++) {
        var race = this.races[r];
        var raceNo = this.normalizeRaceNoForExport(race.id);
        var resultDiag = this.getResultExportDiagnostics(raceNo);
        for (var u = 0; u < race.runners.length; u++) {
          var runner = race.runners[u];
          var key = this.makeKey(race.id, runner.no);
          var a = this.state.assessments[key] || null;
          var totals = a ? this.totals(a) : null;
          var results = this.getRunnerResultForReviewExport(raceNo, runner);
          lines.push(
            [
              ctx.meetingId,
              ctx.date,
              ctx.venue,
              ctx.meetingCardSource,
              ctx.tabVenueCode,
              raceNo,
              runner.no,
              runner.horse,
              runner.scratched ? "1" : "0",
              runner.w_ir != null && runner.w_ir !== "" ? runner.w_ir : "N/A",
              results.finishPosition,
              results.sp,
              results.margin,
              resultDiag.resultImportStatus,
              resultDiag.resultedSpGuardPassed,
              totals ? totals.pos : "",
              totals ? totals.neg : "",
              totals ? totals.net : "",
              self.buildPhysicalCategoryJson(a),
              self.buildCategoryJsonByName(a, "SWEAT"),
              self.buildCategoryJsonByName(a, "COAT"),
              self.buildCategoryJsonByName(a, "MUSCLE"),
              self.buildCategoryJsonByName(a, "BEHAVIOUR"),
              self.buildCategoryJsonByName(a, "WALK"),
              self.buildCategoryJsonByName(a, "CONDITION"),
              self.buildGearOnlyJson(a),
              a ? a.notes || "" : "",
            ]
              .map(function (v) {
                return self.csvEscape(v);
              })
              .join(","),
          );
        }
      }

      return lines.join("\n");
    },

    buildExportCsvText: function () {
      var headers = [
        "meetingId",
        "date",
        "venue",
        "meeting_card_source",
        "tab_venue_code",
        "raceNo",
        "race_id",
        "race_title",
        "runnerNo",
        "runner_no",
        "runnerName",
        "horse",
        "barrier",
        "w_ir",
        "scratched",
        "trainer",
        "jockey",
        "odds",
        "official_sp",
        "finish_position",
        "sp",
        "margin",
        "resulted_sp_guard_passed",
        "result_import_status",
        "result_imported_at",
        "result_runner_overlap_count",
        "result_yard_runner_count",
        "result_tab_runner_count",
        "positive_json",
        "negative_json",
        "gear_json",
        "wet_body_type",
        "wet_feet",
        "notes",
        "total_positive",
        "total_negative",
        "net",
        "updated_at",
        "assessment_key",
      ];
      var lines = [headers.join(",")];
      var self = this;
      var ctx = this.getMeetingExportContext();

      for (var r = 0; r < this.races.length; r++) {
        var race = this.races[r];
        var raceNo = this.normalizeRaceNoForExport(race.id);
        var guardPassed = this.getResultedSpGuardPassed(raceNo);
        var resultDiag = this.getResultExportDiagnostics(raceNo);
        for (var u = 0; u < race.runners.length; u++) {
          var runner = race.runners[u];
          var key = this.makeKey(race.id, runner.no);
          var a = this.state.assessments[key];
          var totals = this.totals(a);
          var officialSp = "";
          var finishPosition = "";
          var sp = "";
          var margin = "";
          if (window.ResultedSpDom && this.activeMeetingId) {
            if (window.ResultedSpDom.getRunnerResult) {
              var result = window.ResultedSpDom.getRunnerResult(
                this.activeMeetingId,
                raceNo,
                runner.no,
                runner.horse,
              );
              if (result) {
                officialSp = result.sp || "";
                sp = result.sp || "";
                finishPosition =
                  result.finishPosition === "" || result.finishPosition == null
                    ? ""
                    : String(result.finishPosition);
                margin = result.margin || "";
              }
            } else {
              officialSp = window.ResultedSpDom.getOfficialSp(
                this.activeMeetingId,
                raceNo,
                runner.no,
                runner.horse,
              );
              sp = officialSp;
            }
          }
          lines.push(
            [
              ctx.meetingId,
              ctx.date,
              ctx.venue,
              ctx.meetingCardSource,
              ctx.tabVenueCode,
              raceNo,
              race.id,
              race.title,
              runner.no,
              runner.no,
              runner.horse,
              runner.horse,
              runner.br,
              runner.w_ir != null && runner.w_ir !== "" ? runner.w_ir : "N/A",
              runner.scratched ? "1" : "0",
              runner.trainer,
              runner.jockey,
              runner.odds,
              officialSp,
              finishPosition,
              sp,
              margin,
              guardPassed,
              resultDiag.resultImportStatus,
              resultDiag.resultImportedAt,
              resultDiag.resultRunnerOverlapCount,
              resultDiag.resultYardRunnerCount,
              resultDiag.resultTabRunnerCount,
              a ? JSON.stringify(a.positive || {}) : "",
              a ? JSON.stringify(a.negative || {}) : "",
              a ? JSON.stringify(a.gear || {}) : "",
              a && a.wet && a.wet.bodyType ? self.wetBodyLabel(a.wet.bodyType) : "",
              a && a.wet && a.wet.feet ? self.wetFeetLabel(a.wet.feet) : "",
              a ? a.notes || "" : "",
              totals.pos,
              totals.neg,
              totals.net,
              a && a.updatedAt ? a.updatedAt : "",
              key,
            ]
              .map(function (v) {
                return self.csvEscape(v);
              })
              .join(","),
          );
        }
      }

      return lines.join("\n");
    },

    showExportPanel: function (csvText, filename) {
      this.exportCsvText = csvText;
      this.exportFilename = filename;
      var overlay = document.getElementById("iy-export-overlay");
      var textarea = document.getElementById("iy-export-text");
      var filenameEl = document.getElementById("iy-export-filename");
      var downloadBtn = document.getElementById("iy-export-download-btn");
      if (filenameEl) filenameEl.textContent = filename;
      if (textarea) textarea.value = csvText;
      if (overlay) overlay.classList.remove("iy-hidden");
      if (downloadBtn) {
        if (this.supportsFileDownload()) downloadBtn.classList.remove("iy-hidden");
        else downloadBtn.classList.add("iy-hidden");
      }
      this.setImportMsg("Export ready — copy CSV below.");
      this.persist();
    },

    closeExportPanel: function () {
      var overlay = document.getElementById("iy-export-overlay");
      if (overlay) overlay.classList.add("iy-hidden");
    },

    selectAllExport: function () {
      this.bump();
      var textarea = document.getElementById("iy-export-text");
      if (!textarea) return;
      textarea.focus();
      textarea.select();
      try {
        textarea.setSelectionRange(0, textarea.value.length);
      } catch (e) {
        /* ignore */
      }
    },

    copyExportCsv: function () {
      this.bump();
      var self = this;
      var textarea = document.getElementById("iy-export-text");
      if (!textarea) return;
      var text = textarea.value || this.exportCsvText || "";
      if (!text) {
        self.setImportMsg("Nothing to copy.");
        return;
      }
      var wasReadonly = textarea.hasAttribute("readonly");
      if (wasReadonly) textarea.removeAttribute("readonly");
      textarea.focus();
      textarea.select();
      try {
        textarea.setSelectionRange(0, text.length);
      } catch (e) {
        /* ignore */
      }
      function restoreReadonly() {
        if (wasReadonly) textarea.setAttribute("readonly", "readonly");
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(text)
          .then(function () {
            restoreReadonly();
            self.setImportMsg("CSV copied to clipboard.");
          })
          .catch(function () {
            self.copyExportCsvExecCommand(textarea, restoreReadonly);
          });
        return;
      }
      self.copyExportCsvExecCommand(textarea, restoreReadonly);
    },

    copyExportCsvExecCommand: function (textarea, restoreReadonly) {
      var self = this;
      try {
        var ok = document.execCommand("copy");
        restoreReadonly();
        self.setImportMsg(ok ? "CSV copied." : "Select All, then tap Copy in the menu.");
      } catch (e) {
        restoreReadonly();
        self.setImportMsg("Select All, then tap Copy in the menu.");
      }
    },

    downloadExportCsv: function () {
      if (!this.supportsFileDownload() || !this.exportCsvText) return;
      if (window.MeetingExportDelivery && window.MeetingExportDelivery.needsInPageExportFallback()) {
        this.setImportMsg("Use Select All or Copy on this device.");
        return;
      }
      this.bump();
      try {
        var blob = new Blob([this.exportCsvText], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = this.exportFilename || "ipad-yard-assessments.csv";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        this.setImportMsg("Download started.");
      } catch (e) {
        this.setImportMsg("Download failed — use Select All and copy.");
      }
    },

    saveToLaptop: function () {
      this.bump();
      var self = this;
      var delivery = window.MeetingExportDelivery;
      if (!self.races || !self.races.length) {
        self.setImportMsg("Load a meeting first.");
        return;
      }
      var manifest = self.syncMeetingManifest();
      if (!manifest && delivery) manifest = delivery.loadMeetingManifest();
      var folderPath =
        manifest && manifest.meetingFolderPath ? String(manifest.meetingFolderPath).trim() : "";
      if (!folderPath) {
        self.setImportMsg("Meeting folder unknown — reload from library and try again.");
        return;
      }
      if (!self.isOnline()) {
        self.setImportMsg("Offline — connect to the laptop Wi‑Fi and try again.");
        return;
      }
      var csvText = self.buildExportCsvText();
      var filename = delivery
        ? delivery.buildMeetingExportFilename("mounting-yard-assessments", manifest)
        : "mounting-yard-assessments.csv";

      function showCsvFallback(reason) {
        self.showExportPanel(csvText, filename);
        self.setImportMsg("Copy CSV below — " + (reason || "laptop save unavailable") + ".");
      }

      self.setImportMsg("Saving to laptop…");
      fetch("/api/meeting-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderPath: folderPath,
          filename: filename,
          content: csvText,
        }),
      })
        .then(function (res) {
          return res
            .json()
            .then(function (data) {
              return { res: res, data: data };
            })
            .catch(function () {
              return { res: res, data: null };
            });
        })
        .then(function (result) {
          if (result.res.ok && result.data && result.data.ok) {
            self.setImportMsg("Saved to:\n" + folderPath + "/");
            return;
          }
          var err =
            result.data && result.data.error
              ? String(result.data.error)
              : "laptop save unavailable";
          showCsvFallback(err);
        })
        .catch(function () {
          showCsvFallback("could not reach laptop");
        });
    },

    exportAllAssessments: function () {
      this.bump();
      var self = this;
      var delivery = window.MeetingExportDelivery;
      if (!delivery) {
        self.setImportMsg("Export module not loaded.");
        return;
      }
      if (!self.races || !self.races.length) {
        self.setImportMsg("Load a meeting first.");
        return;
      }
      var manifest = self.syncMeetingManifest();
      if (!manifest) {
        manifest = delivery.loadMeetingManifest();
      }
      if (!manifest) {
        self.setImportMsg("Meeting manifest missing — reload the meeting and try again.");
        return;
      }
      var csvText = self.buildExportCsvText();
      var filename = delivery.buildMeetingExportFilename("mounting-yard-assessments", manifest);

      if (delivery.needsInPageExportFallback()) {
        self.showExportPanel(csvText, filename);
        self.setImportMsg("Copy CSV below — folder export is not available on this device.");
        return;
      }

      function exportSucceeded(result) {
        return result && (result.method === "directory" || result.method === "api");
      }

      function showFolderExportSuccess() {
        self.setImportMsg("Exported successfully to meeting folder");
      }

      function showCsvFallbackPanel() {
        self.showExportPanel(csvText, filename);
        self.setImportMsg("Copy CSV below — could not write directly to meeting folder.");
      }

      function runFolderExport(activeManifest, handle) {
        return delivery.deliverMeetingExport("mounting-yard-assessments", csvText, {
          manifest: activeManifest,
          directoryHandle: handle || null,
          folderExportOnly: true,
        });
      }

      self.setImportMsg("Exporting…");
      runFolderExport(manifest, null)
        .then(function (result) {
          if (exportSucceeded(result)) {
            showFolderExportSuccess();
            return null;
          }
          if (!delivery.supportsDirectoryPicker()) {
            showCsvFallbackPanel();
            return null;
          }
          return delivery.prepareFolderForExport(manifest).then(function (prepared) {
            return runFolderExport(prepared.manifest, prepared.handle);
          });
        })
        .then(function (retryResult) {
          if (!retryResult) return;
          if (exportSucceeded(retryResult)) {
            showFolderExportSuccess();
            return;
          }
          showCsvFallbackPanel();
        })
        .catch(function (e) {
          if (e && e.name === "AbortError") {
            self.setImportMsg("Export cancelled.");
            return;
          }
          self.setImportMsg("Export failed: " + (e && e.message ? e.message : String(e)));
        });
    },

    exportRaceReviewCsv: function () {
      this.bump();
      var self = this;
      var delivery = window.MeetingExportDelivery;
      if (!delivery) {
        self.setImportMsg("Export module not loaded.");
        return;
      }
      if (!self.races || !self.races.length) {
        self.setImportMsg("Load a meeting first.");
        return;
      }
      var manifest = self.syncMeetingManifest();
      if (!manifest) {
        manifest = delivery.loadMeetingManifest();
      }
      if (!manifest) {
        self.setImportMsg("Meeting manifest missing — reload the meeting and try again.");
        return;
      }
      var csvText = self.buildRaceReviewCsvText();
      var filename = delivery.buildMeetingExportFilename("race-review", manifest);

      if (delivery.needsInPageExportFallback()) {
        self.showExportPanel(csvText, filename);
        self.setImportMsg("Race Review CSV ready — copy below.");
        return;
      }

      function exportSucceeded(result) {
        return result && (result.method === "directory" || result.method === "api");
      }

      function showFolderExportSuccess() {
        self.setImportMsg("Race Review CSV exported to meeting folder");
      }

      function showCsvFallbackPanel() {
        self.showExportPanel(csvText, filename);
        self.setImportMsg("Race Review CSV ready — copy below.");
      }

      function runFolderExport(activeManifest, handle) {
        return delivery.deliverMeetingExport("race-review", csvText, {
          manifest: activeManifest,
          directoryHandle: handle || null,
          folderExportOnly: true,
        });
      }

      self.setImportMsg("Exporting Race Review CSV…");
      runFolderExport(manifest, null)
        .then(function (result) {
          if (exportSucceeded(result)) {
            showFolderExportSuccess();
            return null;
          }
          if (!delivery.supportsDirectoryPicker()) {
            showCsvFallbackPanel();
            return null;
          }
          return delivery.prepareFolderForExport(manifest).then(function (prepared) {
            return runFolderExport(prepared.manifest, prepared.handle);
          });
        })
        .then(function (retryResult) {
          if (!retryResult) return;
          if (exportSucceeded(retryResult)) {
            showFolderExportSuccess();
            return;
          }
          showCsvFallbackPanel();
        })
        .catch(function (e) {
          if (e && e.name === "AbortError") {
            self.setImportMsg("Export cancelled.");
            return;
          }
          self.setImportMsg("Export failed: " + (e && e.message ? e.message : String(e)));
        });
    },

    isValidAssessmentSyncPackage: function (pkg) {
      if (!pkg || typeof pkg !== "object") return false;
      if (pkg.kind !== "mounting-yard-yard-package") return false;
      if (!Array.isArray(pkg.races) || !pkg.races.length) return false;
      if (!pkg.assessments || typeof pkg.assessments !== "object") return false;
      return true;
    },

    buildAssessmentSyncPackage: function () {
      var delivery = window.MeetingExportDelivery;
      var manifest = this.syncMeetingManifest();
      if (!manifest && delivery) manifest = delivery.loadMeetingManifest();
      var meetingId =
        this.activeMeetingId ||
        this.resolveMeetingId({ manifest: manifest, meetingPath: this.state.loadedMeetingPath });
      return {
        kind: "mounting-yard-yard-package",
        version: 1,
        exportedAt: new Date().toISOString(),
        meetingId: meetingId,
        manifest: manifest,
        meetingLabel: this.state.meetingLabel,
        loadedMeetingPath: this.state.loadedMeetingPath,
        races: this.races,
        assessments: this.state.assessments,
        state: {
          selectedRaceId: this.state.selectedRaceId,
          selectedRunnerNo: this.state.selectedRunnerNo,
        },
      };
    },

    applyAssessmentSyncPackage: function (pkg) {
      var delivery = window.MeetingExportDelivery;
      if (!this.isValidAssessmentSyncPackage(pkg)) {
        throw new Error("Invalid assessment package — export from Export Assessment Package");
      }
      this.races = pkg.races;
      this.state.meetingLabel =
        pkg.meetingLabel ||
        (pkg.manifest && pkg.manifest.meetingLabel) ||
        this.state.meetingLabel;
      this.state.loadedMeetingPath =
        pkg.loadedMeetingPath ||
        (pkg.manifest && pkg.manifest.meetingFolderPath) ||
        this.state.loadedMeetingPath;
      if (pkg.manifest && delivery) {
        delivery.saveMeetingManifest(pkg.manifest);
        var track = pkg.manifest.trackName || pkg.manifest.trackSlug || "";
        var date = pkg.manifest.date || "";
        if (track && date) this.state.meetingLabel = track + " · " + date;
      } else {
        this.syncMeetingManifest({
          meetingPath: this.state.loadedMeetingPath,
          meetingLabel: this.state.meetingLabel,
        });
      }
      var manifest = pkg.manifest || (delivery ? delivery.loadMeetingManifest() : null);
      var meetingId =
        pkg.meetingId ||
        this.resolveMeetingId({
          manifest: manifest,
          meetingPath: this.state.loadedMeetingPath,
        });
      var newMeetingKey = manifest ? this.meetingKeyFromManifest(manifest) : "";
      var store = this.readMeetingStore();
      var saved = meetingId && store.meetings[meetingId] ? store.meetings[meetingId] : null;
      var merged = {};
      var key;
      if (saved && newMeetingKey && saved.meetingKey === newMeetingKey && saved.assessments) {
        for (key in saved.assessments) {
          if (Object.prototype.hasOwnProperty.call(saved.assessments, key)) {
            merged[key] = saved.assessments[key];
          }
        }
      }
      var incoming = pkg.assessments || {};
      for (key in incoming) {
        if (Object.prototype.hasOwnProperty.call(incoming, key)) {
          merged[key] = incoming[key];
        }
      }
      var selectedRaceId =
        (pkg.state && pkg.state.selectedRaceId) || (this.races[0] && this.races[0].id) || null;
      var selectedRunnerNo =
        pkg.state && pkg.state.selectedRunnerNo != null
          ? pkg.state.selectedRunnerNo
          : this.races[0] && this.races[0].runners && this.races[0].runners[0]
            ? this.races[0].runners[0].no
            : null;
      if (manifest) {
        this.activateMeetingSession(manifest, {
          assessments: merged,
          keepRaces: true,
          keepMeetingMeta: true,
          selectedRaceId: selectedRaceId,
          selectedRunnerNo: selectedRunnerNo,
          meetingPath: this.state.loadedMeetingPath,
        });
      } else {
        this.resetSessionState();
        this.state.assessments = merged;
        this.state.selectedRaceId = selectedRaceId;
        this.state.selectedRunnerNo = selectedRunnerNo;
        this.normalizeSelection();
      }
      this.persistRaces();
      this.persist();
      this.showAssess();
      this.render();
    },

    showAssessmentPackageExportPanel: function (jsonText, filename) {
      this.assessmentPackageExportText = jsonText;
      this.assessmentPackageExportFilename = filename;
      var overlay = document.getElementById("iy-assessment-package-export-overlay");
      var textarea = document.getElementById("iy-assessment-package-export-text");
      var filenameEl = document.getElementById("iy-assessment-package-export-filename");
      var downloadBtn = document.getElementById("iy-assessment-package-download-btn");
      if (filenameEl) filenameEl.textContent = filename;
      if (textarea) textarea.value = jsonText;
      if (overlay) overlay.classList.remove("iy-hidden");
      if (downloadBtn) {
        if (this.supportsFileDownload()) downloadBtn.classList.remove("iy-hidden");
        else downloadBtn.classList.add("iy-hidden");
      }
    },

    closeAssessmentPackageExportPanel: function () {
      var overlay = document.getElementById("iy-assessment-package-export-overlay");
      if (overlay) overlay.classList.add("iy-hidden");
    },

    selectAllAssessmentPackageExport: function () {
      this.bump();
      var textarea = document.getElementById("iy-assessment-package-export-text");
      if (!textarea) return;
      textarea.focus();
      textarea.select();
      try {
        textarea.setSelectionRange(0, textarea.value.length);
      } catch (e) {
        /* ignore */
      }
    },

    downloadAssessmentPackageExport: function () {
      if (!this.supportsFileDownload() || !this.assessmentPackageExportText) return;
      this.bump();
      try {
        var blob = new Blob([this.assessmentPackageExportText], {
          type: "application/json;charset=utf-8",
        });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = this.assessmentPackageExportFilename || "yard-package.json";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        this.setImportMsg("Package download started.");
      } catch (e) {
        this.setImportMsg("Download failed — use Select All and copy.");
      }
    },

    exportAssessmentPackage: function () {
      this.bump();
      var self = this;
      var delivery = window.MeetingExportDelivery;
      if (!delivery) {
        self.setImportMsg("Export module not loaded.");
        return;
      }
      if (!self.races || !self.races.length) {
        self.setImportMsg("Load a meeting first.");
        return;
      }
      var manifest = self.syncMeetingManifest();
      if (!manifest) manifest = delivery.loadMeetingManifest();
      if (!manifest) {
        self.setImportMsg("Meeting manifest missing — reload the meeting and try again.");
        return;
      }
      var pkg = self.buildAssessmentSyncPackage();
      var jsonText = JSON.stringify(pkg, null, 2);
      var filename = delivery.buildYardPackageFilename(manifest);
      if (delivery.isIOSExportDevice()) {
        self.showAssessmentPackageExportPanel(jsonText, filename);
        self.setImportMsg("Copy package JSON below — paste on laptop with Import Assessment Package.");
        return;
      }
      self.setImportMsg("Exporting assessment package…");
      delivery
        .prepareFolderForExport(manifest)
        .then(function (prepared) {
          return delivery.deliverYardPackageExport(jsonText, {
            manifest: prepared.manifest,
            directoryHandle: prepared.handle,
          });
        })
        .then(function (result) {
          if (result.method === "directory" || result.method === "api") {
            self.setImportMsg("Assessment package saved:\n" + result.filename);
            return;
          }
          self.showAssessmentPackageExportPanel(jsonText, filename);
          self.setImportMsg("Package ready — copy JSON for another device or use Download.");
        })
        .catch(function (e) {
          if (e && e.name === "AbortError") {
            self.setImportMsg("Export cancelled.");
            return;
          }
          self.setImportMsg("Export failed: " + (e && e.message ? e.message : String(e)));
        });
    },

    showAssessmentPackageImportPanel: function () {
      this.bump();
      var overlay = document.getElementById("iy-assessment-package-import-overlay");
      var textarea = document.getElementById("iy-assessment-package-import-text");
      if (textarea) textarea.value = "";
      if (overlay) overlay.classList.remove("iy-hidden");
    },

    closeAssessmentPackageImportPanel: function () {
      var overlay = document.getElementById("iy-assessment-package-import-overlay");
      if (overlay) overlay.classList.add("iy-hidden");
    },

    importAssessmentPackageFromPanel: function () {
      this.bump();
      var textarea = document.getElementById("iy-assessment-package-import-text");
      if (!textarea || !textarea.value.trim()) {
        this.setImportMsg("Paste an assessment package first.");
        return;
      }
      try {
        var pkg = JSON.parse(textarea.value.replace(/^\uFEFF/, "").trim());
        this.applyAssessmentSyncPackage(pkg);
        this.closeAssessmentPackageImportPanel();
        this.setImportMsg("Assessment package imported — ready to export CSV.");
      } catch (e) {
        this.setImportMsg("Import failed: " + e.message);
      }
    },

    importAssessmentPackageFile: function (input) {
      var file = input && input.files && input.files[0];
      if (!file) return;
      var self = this;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var pkg = JSON.parse(String(reader.result || "").replace(/^\uFEFF/, "").trim());
          self.applyAssessmentSyncPackage(pkg);
          self.closeAssessmentPackageImportPanel();
          self.setImportMsg("Assessment package imported from " + file.name);
          input.value = "";
        } catch (e) {
          self.setImportMsg("Import failed: " + e.message);
          input.value = "";
        }
      };
      reader.onerror = function () {
        self.setImportMsg("Could not read package file.");
        input.value = "";
      };
      reader.readAsText(file);
    },

    importMeetingFolder: function () {
      this.bump();
      var self = this;
      var delivery = window.MeetingExportDelivery;
      if (!delivery || !delivery.supportsDirectoryPicker()) {
        self.setImportMsg("Folder picker not supported — use Import CSV.");
        return;
      }
      delivery
        .pickMeetingDirectory()
        .then(function (dir) {
          return delivery.readMeetingCsvFromDirectory(dir).then(function (result) {
            return { dir: dir, file: result.file, name: result.name };
          });
        })
        .then(function (payload) {
          return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
              resolve({
                dir: payload.dir,
                name: payload.name,
                text: String(reader.result || ""),
              });
            };
            reader.onerror = function () {
              reject(new Error("Could not read meeting CSV."));
            };
            reader.readAsText(payload.file);
          });
        })
        .then(function (payload) {
          var folderMeta = "meetings/" + payload.dir.name;
          self.applyMeetingCsv(payload.text, payload.name, {
            meetingPath: folderMeta,
            directoryHandle: payload.dir,
            directoryName: payload.dir.name,
            switchToAssess: true,
          });
          if (payload.dir && delivery.saveMeetingDirectoryHandle) {
            var manifest = delivery.loadMeetingManifest();
            if (manifest && manifest.meetingKey) {
              return delivery.saveMeetingDirectoryHandle(manifest.meetingKey, payload.dir);
            }
          }
        })
        .catch(function (e) {
          if (e && e.name === "AbortError") return;
          self.setImportMsg("Import failed: " + (e && e.message ? e.message : String(e)));
        });
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

    showTabMeetingPanel: function () {
      this.closeToolbarMenus();
      var overlay = document.getElementById("iy-tab-meeting-overlay");
      var input = document.getElementById("iy-tab-venue-input");
      var msg = document.getElementById("iy-tab-meeting-msg");
      if (msg) msg.textContent = "";
      if (input && !String(input.value || "").trim()) input.value = "RKE";
      if (overlay) overlay.classList.remove("iy-hidden");
    },

    closeTabMeetingPanel: function () {
      var overlay = document.getElementById("iy-tab-meeting-overlay");
      if (overlay) overlay.classList.add("iy-hidden");
    },

    loadTodayTabMeeting: function () {
      var self = this;
      var input = document.getElementById("iy-tab-venue-input");
      var msg = document.getElementById("iy-tab-meeting-msg");
      var btn = document.getElementById("iy-tab-meeting-load-btn");
      var code = input ? input.value : "RKE";
      if (!window.TabYardMeeting || !window.TabYardMeeting.loadTodayTabMeeting) {
        if (msg) msg.textContent = "TAB meeting loader is not available.";
        return;
      }
      if (!this.isOnline()) {
        if (msg) msg.textContent = "Offline — connect to load today's TAB meeting.";
        return;
      }
      if (msg) {
        msg.textContent = "Loading TAB meeting " + String(code).trim().toUpperCase() + "…";
      }
      if (btn) btn.disabled = true;
      window.TabYardMeeting.loadTodayTabMeeting(code, { jurisdiction: "NSW" })
        .then(function (payload) {
          self.closeTabMeetingPanel();
          self.applyTabMeeting(payload);
        })
        .catch(function (err) {
          if (msg) msg.textContent = err && err.message ? err.message : String(err);
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    },

    applyTabMeeting: function (payload) {
      if (!payload || !payload.races || !payload.races.length) {
        throw new Error("No races to load from TAB.");
      }
      var meta = payload.meta || {};
      this.races = payload.races;
      this.state.meetingLabel = meta.meetingLabel || "TAB meeting";
      this.state.loadedMeetingPath = meta.meetingFolderPath || "";
      this.setMeetingCardMeta({
        source: "tab",
        tabVenueCode: meta.venue || "",
        meetingDate: meta.date || "",
        meetingVenue: meta.trackName || "",
      });
      this.setHideScratchedDefaultForSource("tab");
      var syncedManifest = this.syncMeetingManifest({
        meetingPath: meta.meetingFolderPath || "",
        meetingLabel: meta.meetingLabel || "",
        trackName: meta.trackName || "",
        date: meta.date || "",
      });
      if (syncedManifest && syncedManifest.meetingLabel) {
        this.state.meetingLabel = syncedManifest.meetingLabel;
      }
      if (!syncedManifest) {
        throw new Error("Could not sync meeting manifest from TAB card.");
      }
      this.activateMeetingSession(syncedManifest, {
        keepRaces: true,
        keepMeetingMeta: true,
        meetingPath: meta.meetingFolderPath || "",
        date: meta.date || "",
        trackName: meta.trackName || "",
        selectedRaceId: payload.races[0].id,
        selectedRunnerNo: payload.races[0].runners[0] ? payload.races[0].runners[0].no : null,
      });
      var csvText =
        window.TabYardMeeting && window.TabYardMeeting.buildMeetingCsvFromTab
          ? window.TabYardMeeting.buildMeetingCsvFromTab(payload)
          : "";
      if (csvText) {
        this.cacheDesktopMeetingCsv(csvText, {
          fileName: (meta.meetingId || "tab-meeting") + "_master.csv",
          importPath: meta.meetingFolderPath || "",
          meetingFolderPath: meta.meetingFolderPath || "",
          trackName: meta.trackName || "",
          date: meta.date || "",
        });
      }
      this.persistRaces();
      this.persist();
      this.notifyDesktopMeetingImported();
      this.startCountdownTimer();
      this.showAssess();
      this.setImportMsg(
        "Loaded TAB " +
          (meta.venue || "") +
          " — " +
          payload.races.length +
          " races (" +
          (meta.date || "today") +
          ").",
      );
      this.updateMeetingToolbar();
      this.updateMeetingMetaDisplay();
      this.bump();
    },

    applyMeetingCsv: function (text, fileName, options) {
      options = options || {};
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
      this.state.meetingLabel = fileName || "Imported meeting";
      if (options.meetingPath) this.state.loadedMeetingPath = options.meetingPath;
      var syncedManifest = this.syncMeetingManifest({
        meetingPath: options.meetingPath || "",
        meetingLabel: options.meetingLabel || this.state.meetingLabel || fileName || "",
        trackName: options.trackName || "",
        date: options.date || "",
        fileName: options.fileName || fileName || "",
        directoryName: options.directoryName || "",
      });
      if (syncedManifest && syncedManifest.meetingLabel) {
        this.state.meetingLabel = syncedManifest.meetingLabel;
      }
      this.setMeetingCardMeta({
        source: options.meetingCardSource || (options.meetingPath ? "library" : "csv"),
        tabVenueCode: "",
        meetingDate: (syncedManifest && syncedManifest.date) || options.date || "",
        meetingVenue:
          (syncedManifest && syncedManifest.trackName) ||
          options.trackName ||
          "",
      });
      if (syncedManifest) {
        this.activateMeetingSession(syncedManifest, {
          keepRaces: true,
          keepMeetingMeta: true,
          meetingPath: options.meetingPath || this.state.loadedMeetingPath,
          date: options.date || "",
          trackName: options.trackName || "",
          selectedRaceId: races[0].id,
          selectedRunnerNo: races[0].runners[0] ? races[0].runners[0].no : null,
        });
      } else {
        if (this.activeMeetingId) this.saveActiveMeetingToStore();
        this.activeMeetingId = "";
        this.activeMeetingKey = "";
        this.resetSessionState();
        this.state.selectedRaceId = races[0].id;
        this.state.selectedRunnerNo = races[0].runners[0] ? races[0].runners[0].no : null;
        this.normalizeSelection();
      }
      if (options.directoryHandle && window.MeetingExportDelivery) {
        var manifest = window.MeetingExportDelivery.loadMeetingManifest();
        if (manifest && manifest.meetingKey) {
          window.MeetingExportDelivery.saveMeetingDirectoryHandle(
            manifest.meetingKey,
            options.directoryHandle,
          );
        }
      }
      this.persistRaces();
      this.persist();
      this.cacheDesktopMeetingCsv(text, {
        fileName: options.fileName || fileName || "",
        importPath: options.meetingPath || "",
        meetingFolderPath: options.meetingPath || "",
        directoryName: options.directoryName || "",
        trackName: options.trackName || "",
        date: options.date || "",
      });
      this.notifyDesktopMeetingImported();
      this.startCountdownTimer();
      if (options.switchToAssess) this.showAssess();
      else this.render();
      this.setImportMsg("Loaded " + races.length + " races (saved locally on iPad).");
      this.updateMeetingToolbar();
      this.updateMeetingMetaDisplay();
      this.bump();
    },

    init: function () {
      this.migrateLegacyStorage();
      this.loadPersisted();
      this.loadRaces();
      this.loadManifestLabel();
      if (!this.state.meetingCardSource && this.races && this.races.length) {
        if (this.state.tabVenueCode) {
          this.state.meetingCardSource = "tab";
        } else if (this.state.loadedMeetingPath) {
          this.state.meetingCardSource = "library";
        }
      }
      if (!this.state.selectedRaceId && this.races.length) {
        this.state.selectedRaceId = this.races[0].id;
        this.state.selectedRunnerNo = this.races[0].runners[0]
          ? this.races[0].runners[0].no
          : null;
      }
      this.initNetworkListeners();
      if (window.ResultedSpDom && window.ResultedSpDom.UPDATED_EVENT) {
        var self = this;
        window.addEventListener(window.ResultedSpDom.UPDATED_EVENT, function (ev) {
          self.bump();
          var detail = ev && ev.detail ? ev.detail : {};
          self.noteResultImportForBackupReminder(detail.meetingId || self.activeMeetingId);
        });
      }
      var downloaded = this.readDownloadedMeetingPackage();
      if (downloaded) {
        try {
          this.applyDownloadedMeetingPackage(downloaded, { silent: true });
        } catch (e) {
          this.setImportMsg("Could not auto-load downloaded meeting: " + e.message);
        }
        this.showAssess();
        if (!this.isOnline()) {
          this.setImportMsg("Offline — using downloaded meeting on this iPad.");
        }
      } else if (this.hasStoredRaces()) {
        this.showAssess();
        if (!this.isOnline()) {
          this.setImportMsg("Offline — using meeting and assessments stored on this iPad.");
        }
      } else if (this.isOnline()) {
        this.showLibrary();
      } else if (this.loadCachedLibrary()) {
        this.showLibrary();
        this.setLibraryMsg("Offline — cached meetings shown. Use Downloaded Meeting if needed.");
        this.renderLibrary();
      } else {
        this.showLibrary();
        this.setLibraryMsg("No meeting loaded. Use Downloaded Meeting or connect to laptop.");
      }
      this.updateDownloadedBadge();
      this.updateMeetingToolbar();
      this.updateMeetingMetaDisplay();
      this.startCountdownTimer();
    },
  };

  window.ipadYard.init();
})();
