/**
 * iOS 12 Yard legacy controls — plain global API for inline onclick handlers.
 * Loaded as external script because innerHTML does not execute embedded script tags.
 */
(function () {
  if (window.yardLegacy) return;

  window.yardLegacyState = {
    tapCount: 0,
    selectedRace: null,
    selectedRunner: null,
    assessments: {},
    lastFactor: null,
  };

  function normalizeRaceId(raceNo) {
    if (!raceNo) return null;
    var s = String(raceNo);
    if (s.indexOf("R") === 0) return s;
    return "R" + s;
  }

  window.yardLegacy = {
    bump: function () {
      window.yardLegacyState.tapCount += 1;
      var el = document.getElementById("ylg-tap-count");
      if (el) el.textContent = String(window.yardLegacyState.tapCount);
    },

    makeKey: function (raceId, runnerNo) {
      return raceId + "-" + runnerNo;
    },

    getRaces: function () {
      return window.YARD_LEGACY_RACES || [];
    },

    getRace: function () {
      var id = window.yardLegacyState.selectedRace;
      var races = this.getRaces();
      for (var i = 0; i < races.length; i++) {
        if (races[i].id === id) return races[i];
      }
      return races[0] || null;
    },

    getRunner: function () {
      var race = this.getRace();
      if (!race) return null;
      var no = window.yardLegacyState.selectedRunner;
      for (var i = 0; i < race.runners.length; i++) {
        if (race.runners[i].no === no) return race.runners[i];
      }
      return race.runners[0] || null;
    },

    ensureAssessment: function (key) {
      if (!window.yardLegacyState.assessments[key]) {
        window.yardLegacyState.assessments[key] = { positive: {}, negative: {} };
      }
      return window.yardLegacyState.assessments[key];
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

    selectRace: function (raceNo) {
      this.bump();
      window.yardLegacyState.selectedRace = normalizeRaceId(raceNo);
      var race = this.getRace();
      if (race && race.runners && race.runners.length) {
        window.yardLegacyState.selectedRunner = race.runners[0].no;
      }
      this.render();
    },

    selectRunner: function (runnerId) {
      this.bump();
      window.yardLegacyState.selectedRunner = Number(runnerId);
      this.render();
    },

    tapFactor: function (factorCode) {
      this.bump();
      window.yardLegacyState.lastFactor = factorCode;
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
      this.render();
    },

    nextRunner: function () {
      this.bump();
      var race = this.getRace();
      if (!race || !race.runners || !race.runners.length) return;
      var idx = 0;
      for (var i = 0; i < race.runners.length; i++) {
        if (race.runners[i].no === window.yardLegacyState.selectedRunner) {
          idx = i;
          break;
        }
      }
      var next = race.runners[(idx + 1) % race.runners.length];
      window.yardLegacyState.selectedRunner = next.no;
      this.render();
    },

    prevRunner: function () {
      this.bump();
      var race = this.getRace();
      if (!race || !race.runners || !race.runners.length) return;
      var idx = 0;
      for (var i = 0; i < race.runners.length; i++) {
        if (race.runners[i].no === window.yardLegacyState.selectedRunner) {
          idx = i;
          break;
        }
      }
      var len = race.runners.length;
      var prev = race.runners[(idx - 1 + len) % len];
      window.yardLegacyState.selectedRunner = prev.no;
      this.render();
    },

    render: function () {
      var state = window.yardLegacyState;
      var race = this.getRace();
      var runner = this.getRunner();
      var races = this.getRaces();

      var tapEl = document.getElementById("ylg-tap-count");
      if (tapEl) tapEl.textContent = String(state.tapCount);

      var raceEl = document.getElementById("ylg-selected-race");
      if (raceEl) raceEl.textContent = state.selectedRace || "—";

      var runnerEl = document.getElementById("ylg-selected-runner");
      if (runnerEl) {
        runnerEl.textContent = runner ? "#" + runner.no + " " + runner.horse : "—";
      }

      var headingEl = document.getElementById("ylg-runner-heading");
      if (headingEl) {
        headingEl.textContent = runner ? "#" + runner.no + " " + runner.horse : "";
      }

      var scoreEl = document.getElementById("ylg-score");
      if (scoreEl && race && runner) {
        var akey = this.makeKey(race.id, runner.no);
        var totals = this.totals(state.assessments[akey]);
        scoreEl.textContent = this.formatNet(totals.net);
      }

      var factorEl = document.getElementById("ylg-last-factor");
      if (factorEl) factorEl.textContent = state.lastFactor || "—";

      for (var r = 0; r < races.length; r++) {
        var rid = races[r].id;
        var raceBtn = document.getElementById("ylg-race-" + rid);
        if (raceBtn) {
          raceBtn.style.cssText =
            rid === state.selectedRace
              ? "display:block;width:100%;margin:12px 0;padding:16px 18px;font-size:18px;font-weight:700;border:2px solid #111;border-radius:12px;background:#0f172a;color:#fff;cursor:pointer;"
              : "display:block;width:100%;margin:12px 0;padding:16px 18px;font-size:18px;font-weight:700;border:2px solid #111;border-radius:12px;background:#fff;color:#111;cursor:pointer;";
        }
        var titleEl = document.getElementById("ylg-race-title-" + rid);
        if (titleEl) titleEl.style.display = rid === state.selectedRace ? "block" : "none";
      }

      var runnerBtns = document.querySelectorAll(".ylg-runner-btn");
      for (var b = 0; b < runnerBtns.length; b++) {
        var btn = runnerBtns[b];
        var btnRace = btn.getAttribute("data-race");
        var btnRunner = Number(btn.getAttribute("data-runner"));
        var visible = btnRace === state.selectedRace;
        btn.style.display = visible ? "block" : "none";
        if (visible && btnRunner === state.selectedRunner) {
          btn.style.cssText =
            "display:block;width:100%;margin:12px 0;padding:16px 18px;font-size:18px;font-weight:700;border:2px solid #111;border-radius:12px;background:#0f172a;color:#fff;cursor:pointer;";
        } else if (visible) {
          btn.style.cssText =
            "display:block;width:100%;margin:12px 0;padding:16px 18px;font-size:18px;font-weight:700;border:2px solid #111;border-radius:12px;background:#fff;color:#111;cursor:pointer;";
        }
      }

      for (var r2 = 0; r2 < races.length; r2++) {
        var race2 = races[r2];
        for (var u = 0; u < race2.runners.length; u++) {
          var rn = race2.runners[u];
          var netEl = document.getElementById("ylg-runner-net-" + race2.id + "-" + rn.no);
          if (netEl) {
            var rkey = this.makeKey(race2.id, rn.no);
            var rt = this.totals(state.assessments[rkey]);
            netEl.textContent = this.formatNet(rt.net);
          }
        }
      }

      if (race && runner) {
        var currentKey = this.makeKey(race.id, runner.no);
        var current = state.assessments[currentKey];
        var posMarks = document.querySelectorAll('[id^="ylg-marks-pos-"]');
        for (var p = 0; p < posMarks.length; p++) {
          var pel = posMarks[p];
          var pid = pel.id.replace("ylg-marks-pos-", "");
          var pval = current && current.positive ? current.positive[pid] : 0;
          pel.textContent = this.marks(pval);
        }
        var negMarks = document.querySelectorAll('[id^="ylg-marks-neg-"]');
        for (var n = 0; n < negMarks.length; n++) {
          var nel = negMarks[n];
          var nid = nel.id.replace("ylg-marks-neg-", "");
          var nval = current && current.negative ? current.negative[nid] : 0;
          nel.textContent = this.marks(nval);
        }
      }
    },

    init: function () {
      var races = this.getRaces();
      if (races.length) {
        window.yardLegacyState.selectedRace = races[0].id;
        window.yardLegacyState.selectedRunner = races[0].runners[0]
          ? races[0].runners[0].no
          : null;
      }
      this.render();
    },
  };

  window.yardLegacyInit = function () {
    var root = document.getElementById("yard-legacy-root");
    if (!root) return;
    var raw = root.getAttribute("data-races");
    if (raw) {
      try {
        window.YARD_LEGACY_RACES = JSON.parse(raw);
      } catch (e) {
        window.YARD_LEGACY_RACES = [];
      }
    }
    var overlay = document.getElementById("ios12-startup-failure");
    if (overlay) overlay.remove();
    window.yardLegacy.init();
  };
})();
