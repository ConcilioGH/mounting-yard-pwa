/**
 * iPad Yard DOM — plain JS for /ipad-yard-dom (inline onclick on generated buttons).
 */
(function () {
  if (window.ipadYard) return;

  var cfg = window.IPAD_YARD_CONFIG || {};
  var ASSESSMENTS_KEY = cfg.assessmentsKey || "ipad-yard-assessments";
  var RACES_KEY = cfg.racesKey || "ipad-yard-races-v1";
  var DOWNLOADED_MEETING_KEY = cfg.downloadedMeetingKey || "ipad-yard-downloaded-meeting-v1";
  var LIBRARY_CACHE_KEY = "ipad-yard-library-cache-v1";
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
    view: "assess",
    libraryMeetings: [],
    libraryLoading: false,
    meetingLoadingPath: null,
    downloadedMeetingActive: false,
    countdownTimerId: null,
    state: {
      tapCount: 0,
      selectedRaceId: null,
      selectedRunnerNo: null,
      assessments: {},
      meetingLabel: "",
      loadedMeetingPath: "",
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
            if (parsed.meetingLabel) this.state.meetingLabel = parsed.meetingLabel;
            if (parsed.loadedMeetingPath) this.state.loadedMeetingPath = parsed.loadedMeetingPath;
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
      var delivery = window.MeetingExportDelivery;
      if (!delivery) return;
      var manifest = delivery.loadMeetingManifest();
      if (!manifest) return;
      var track = manifest.trackName || manifest.trackSlug || "";
      var date = manifest.date || "";
      if (track && date) this.state.meetingLabel = track + " · " + date;
      else this.state.meetingLabel = track || date || this.state.meetingLabel;
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
      var parts = String(meetingPath).replace(/\\/g, "/").split("/");
      var folder = parts.length >= 2 ? parts[1] : "";
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

    updateMeetingToolbar: function () {
      var downloadBtn = document.getElementById("iy-btn-download-meeting");
      var importFolderBtn = document.getElementById("iy-btn-import-folder");
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
      this.updateCountdownDisplay();
    },

    buildDownloadedMeetingPackage: function () {
      var meta = this.parseMeetingPathMeta(this.state.loadedMeetingPath);
      return {
        version: 1,
        downloadedAt: new Date().toISOString(),
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
      var mergedAssessments = {};
      var pkgAssessments = (pkg.state && pkg.state.assessments) || {};
      var savedAssessments = this.state.assessments || {};
      var key;
      for (key in pkgAssessments) {
        if (Object.prototype.hasOwnProperty.call(pkgAssessments, key)) {
          mergedAssessments[key] = pkgAssessments[key];
        }
      }
      for (key in savedAssessments) {
        if (Object.prototype.hasOwnProperty.call(savedAssessments, key)) {
          mergedAssessments[key] = savedAssessments[key];
        }
      }
      this.races = pkg.races;
      this.state.meetingLabel = pkg.meetingName || (pkg.state && pkg.state.meetingLabel) || "";
      this.state.loadedMeetingPath = pkg.meetingPath || (pkg.state && pkg.state.loadedMeetingPath) || "";
      this.state.assessments = mergedAssessments;
      if (pkg.state && pkg.state.selectedRaceId) {
        this.state.selectedRaceId = pkg.state.selectedRaceId;
      } else if (pkg.races[0]) {
        this.state.selectedRaceId = pkg.races[0].id;
      }
      if (pkg.state && pkg.state.selectedRunnerNo != null) {
        this.state.selectedRunnerNo = pkg.state.selectedRunnerNo;
      } else if (pkg.races[0] && pkg.races[0].runners && pkg.races[0].runners[0]) {
        this.state.selectedRunnerNo = pkg.races[0].runners[0].no;
      }
      this.gearPickerOpen = null;
      this.downloadedMeetingActive = true;
      this.syncMeetingManifest({
        meetingPath: this.state.loadedMeetingPath,
        trackName: pkg.track || this.state.meetingLabel,
        date: pkg.date || "",
      });
      this.saveDownloadedMeetingPackage(pkg);
      if (!options.silent) this.showAssess();
      else this.render();
      this.updateDownloadedBadge();
      this.updateMeetingToolbar();
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
      try {
        localStorage.removeItem(DOWNLOADED_MEETING_KEY);
        localStorage.removeItem(RACES_KEY);
      } catch (e) {
        /* ignore */
      }
      this.races = [];
      this.gearPickerOpen = null;
      this.notesRunnerKey = null;
      this.meetingLoadingPath = null;
      this.downloadedMeetingActive = false;
      this.state.assessments = {};
      this.state.meetingLabel = "";
      this.state.loadedMeetingPath = "";
      this.state.selectedRaceId = null;
      this.state.selectedRunnerNo = null;
      this.persist();
      this.updateDownloadedBadge();
      this.updateMeetingToolbar();
      this.setText("iy-meeting-label", "");
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
        self.setImportMsg("Back online.");
        if (self.view === "library" && !self.libraryMeetings.length) {
          self.fetchLibrary();
        }
      });
      window.addEventListener("offline", function () {
        self.updateNetworkStatus();
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
      try {
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
      this.view = "library";
      this.updateViewVisibility();
      this.renderLibrary();
      if (!this.libraryMeetings.length) {
        if (this.isOnline()) this.fetchLibrary();
        else if (this.loadCachedLibrary()) {
          this.setLibraryMsg("Offline — showing cached meeting list.");
          this.renderLibrary();
        } else {
          this.setLibraryMsg("Offline — connect to laptop to load meetings.");
        }
      }
    },

    showAssess: function () {
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

    fetchLibrary: function () {
      var self = this;
      if (self.libraryLoading) return;
      if (!self.isOnline()) {
        if (self.loadCachedLibrary()) {
          self.setLibraryMsg("Offline — showing cached meeting list.");
          self.renderLibrary();
        } else {
          self.setLibraryMsg("Offline — connect to laptop to refresh meetings.");
          self.renderLibrary();
        }
        return;
      }
      self.libraryLoading = true;
      self.setLibraryMsg("Loading meetings…");
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "/api/meeting-library");
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
          self.libraryMeetings = data.meetings;
          self.cacheLibraryMeetings(data.meetings);
          self.setLibraryMsg(
            data.meetings.length
              ? data.meetings.length + " meetings available"
              : "No master CSVs found in meetings/",
          );
          self.renderLibrary();
        } catch (e) {
          self.libraryMeetings = [];
          self.setLibraryMsg("Could not load library: " + e.message);
          self.renderLibrary();
        }
      };
      xhr.onerror = function () {
        self.libraryLoading = false;
        if (self.loadCachedLibrary()) {
          self.setLibraryMsg("Could not reach laptop — showing cached meeting list.");
        } else {
          self.libraryMeetings = [];
          self.setLibraryMsg("Network error loading meetings.");
        }
        self.renderLibrary();
      };
      xhr.send();
    },

    buildMeetingList: function () {
      if (!this.libraryMeetings.length) {
        return (
          '<div class="iy-library-empty">' +
          "No meetings found. On the laptop run <strong>npm run build-meeting-csv</strong> " +
          "then keep <strong>npm run dev -- -H 0.0.0.0</strong> running so the iPad can reach this server." +
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
        this.state.selectedRunnerNo = race.runners[0].no;
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
      this.markRunnerReviewed(this.makeKey(race.id, next.no));
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
        var assessment = this.state.assessments[rkey];
        var meta = this.runnerTileMeta(assessment);
        var active = runner.no === this.state.selectedRunnerNo ? " iy-runner-active" : "";
        html +=
          '<button type="button" class="iy-runner-tile ' +
          meta.scoreClass +
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

    buildExportCsvText: function () {
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
        "wet_body_type",
        "wet_feet",
        "notes",
        "total_positive",
        "total_negative",
        "net",
        "updated_at",
      ];
      var lines = [headers.join(",")];
      var self = this;

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
              a && a.wet && a.wet.bodyType ? self.wetBodyLabel(a.wet.bodyType) : "",
              a && a.wet && a.wet.feet ? self.wetFeetLabel(a.wet.feet) : "",
              a ? a.notes || "" : "",
              totals.pos,
              totals.neg,
              totals.net,
              a && a.updatedAt ? a.updatedAt : "",
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
      return {
        kind: "mounting-yard-yard-package",
        version: 1,
        exportedAt: new Date().toISOString(),
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
      var merged = {};
      var key;
      for (key in this.state.assessments) {
        if (Object.prototype.hasOwnProperty.call(this.state.assessments, key)) {
          merged[key] = this.state.assessments[key];
        }
      }
      var incoming = pkg.assessments || {};
      for (key in incoming) {
        if (Object.prototype.hasOwnProperty.call(incoming, key)) {
          merged[key] = incoming[key];
        }
      }
      this.races = pkg.races;
      this.state.assessments = merged;
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
      if (pkg.state && pkg.state.selectedRaceId) {
        this.state.selectedRaceId = pkg.state.selectedRaceId;
      } else if (this.races[0]) {
        this.state.selectedRaceId = this.races[0].id;
      }
      if (pkg.state && pkg.state.selectedRunnerNo != null) {
        this.state.selectedRunnerNo = pkg.state.selectedRunnerNo;
      } else if (this.races[0] && this.races[0].runners && this.races[0].runners[0]) {
        this.state.selectedRunnerNo = this.races[0].runners[0].no;
      }
      this.gearPickerOpen = null;
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
      this.gearPickerOpen = null;
      this.state.selectedRaceId = races[0].id;
      this.state.selectedRunnerNo = races[0].runners[0].no;
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
      if (options.switchToAssess) this.showAssess();
      else this.render();
      this.setImportMsg("Loaded " + races.length + " races (saved locally on iPad).");
      this.updateMeetingToolbar();
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
      this.initNetworkListeners();
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
      } else if (this.isOnline() && this.isLaptopDevServer()) {
        this.showLibrary();
        this.fetchLibrary();
      } else if (this.isOnline()) {
        this.showLibrary();
        this.setLibraryMsg("Load a downloaded meeting with Use Downloaded Meeting.");
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
      this.startCountdownTimer();
    },
  };

  window.ipadYard.init();
})();
