/**
 * Yard Lite — iOS 12 trackside route. Pure HTML + inline onclick handlers only.
 * No React event wiring; mirrors the working /ios-test pattern.
 */
import {
  DEFAULT_RACES,
  racedayCompactGroups,
  SWEAT_LEGEND,
  SWEAT_NEG_ROW,
  SWEAT_POS_KEY,
} from "@/lib/constants";
import { APP_BUILD_VERSION } from "@/lib/build-version";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRaceButtons(): string {
  return DEFAULT_RACES.map(
    (race) =>
      `<button type="button" class="yl-btn yl-race-btn" id="yl-race-${escapeHtml(race.id)}" onclick="window.yardLite.selectRace('${escapeHtml(race.id)}')">${escapeHtml(race.id)}</button>`,
  ).join("\n");
}

function buildRunnerButtons(): string {
  return DEFAULT_RACES.flatMap((race) =>
    race.runners.map(
      (runner) =>
        `<button type="button" class="yl-btn yl-runner-btn" data-race="${escapeHtml(race.id)}" data-runner="${runner.no}" id="yl-runner-${escapeHtml(race.id)}-${runner.no}" onclick="window.yardLite.selectRunner(${runner.no})" style="display:none"><span class="yl-runner-label">#${runner.no} ${escapeHtml(runner.horse)}</span> · net <span class="yl-runner-net" id="yl-runner-net-${escapeHtml(race.id)}-${runner.no}">0</span></button>`,
    ),
  ).join("\n");
}

function buildRaceTitles(): string {
  return DEFAULT_RACES.map(
    (race) =>
      `<h2 class="yl-race-title" id="yl-race-title-${escapeHtml(race.id)}" style="display:none">${escapeHtml(race.title)}</h2>`,
  ).join("\n");
}

function buildFactorButtons(): string {
  const parts: string[] = [];

  for (const group of racedayCompactGroups) {
    parts.push(`<div class="yl-group"><h3 class="yl-group-title">${escapeHtml(group.title)}</h3>`);

    if (group.kind === "sweat") {
      parts.push(
        `<button type="button" class="yl-btn yl-factor-btn" id="yl-factor-${escapeHtml(SWEAT_POS_KEY)}" onclick="window.yardLite.tapFactor('${escapeHtml(SWEAT_POS_KEY)}')">${escapeHtml(SWEAT_POS_KEY)} <span class="yl-marks" id="yl-marks-pos-${escapeHtml(SWEAT_POS_KEY)}"></span></button>`,
      );
      parts.push('<div class="yl-sweat-row">');
      for (const key of SWEAT_NEG_ROW) {
        parts.push(
          `<button type="button" class="yl-btn yl-factor-btn" id="yl-factor-${escapeHtml(key)}" onclick="window.yardLite.tapFactor('${escapeHtml(key)}')">${escapeHtml(key)} <span class="yl-marks" id="yl-marks-neg-${escapeHtml(key)}"></span></button>`,
        );
      }
      parts.push("</div>");
      parts.push(`<p class="yl-legend">${escapeHtml(SWEAT_LEGEND)}</p>`);
    } else {
      for (const key of group.positives) {
        parts.push(
          `<button type="button" class="yl-btn yl-factor-btn" id="yl-factor-${escapeHtml(key)}" onclick="window.yardLite.tapFactor('${escapeHtml(key)}')">${escapeHtml(key)} <span class="yl-marks" id="yl-marks-pos-${escapeHtml(key)}"></span></button>`,
        );
      }
      for (const key of group.negatives) {
        parts.push(
          `<button type="button" class="yl-btn yl-factor-btn" id="yl-factor-${escapeHtml(key)}" onclick="window.yardLite.tapFactor('${escapeHtml(key)}')">${escapeHtml(key)} <span class="yl-marks" id="yl-marks-neg-${escapeHtml(key)}"></span></button>`,
        );
      }
    }

    parts.push("</div>");
  }

  return parts.join("\n");
}

function buildYardLiteHtml(): string {
  const racesJson = JSON.stringify(DEFAULT_RACES);
  const firstRace = DEFAULT_RACES[0];
  const firstRunner = firstRace?.runners[0];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <title>Yard Lite</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      padding-bottom: 80px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #fff;
      color: #0f172a;
    }
    h1 { font-size: 24px; font-weight: 700; margin: 0 0 8px; }
    .yl-meta { margin: 0 0 8px; font-size: 14px; color: #475569; }
    .yl-status {
      background: #fef2f2;
      border: 2px solid #ef4444;
      border-radius: 12px;
      padding: 12px;
      font-size: 16px;
      line-height: 1.5;
      margin-bottom: 16px;
    }
    .yl-section { margin-bottom: 16px; }
    .yl-section-title { font-size: 14px; font-weight: 700; margin: 0 0 8px; }
    .yl-race-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .yl-nav { display: flex; gap: 8px; margin-bottom: 12px; }
    .yl-nav button { flex: 1; }
    .yl-btn {
      min-height: 52px;
      border: 2px solid #94a3b8;
      border-radius: 12px;
      background: #fff;
      padding: 12px 16px;
      font-size: 18px;
      font-weight: 600;
      color: #0f172a;
      cursor: pointer;
      text-align: left;
    }
    .yl-btn-active {
      border-color: #0f172a;
      background: #0f172a;
      color: #fff;
    }
    .yl-factor-btn {
      display: block;
      width: 100%;
      min-height: 48px;
      margin-bottom: 8px;
      border-width: 1px;
      font-size: 16px;
    }
    .yl-sweat-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .yl-sweat-row .yl-factor-btn { margin-bottom: 0; font-size: 14px; padding: 10px 6px; }
    .yl-group { margin-bottom: 16px; }
    .yl-group-title { font-size: 12px; font-weight: 700; margin: 0 0 6px; color: #64748b; }
    .yl-legend { font-size: 11px; color: #64748b; margin: 4px 0 0; }
    .yl-runner-heading { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
  </style>
</head>
<body>
  <header>
    <h1>Mounting Yard Lite</h1>
    <p class="yl-meta">iOS 12 trackside mode · Build ${escapeHtml(APP_BUILD_VERSION)} · inline DOM handlers</p>
    <div class="yl-status">
      <div><strong>Tap count:</strong> <span id="lite-tap-count">0</span></div>
      <div><strong>Selected race:</strong> <span id="lite-selected-race">${escapeHtml(firstRace?.id ?? "—")}</span></div>
      <div><strong>Selected runner:</strong> <span id="lite-selected-runner">${firstRunner ? `#${firstRunner.no} ${escapeHtml(firstRunner.horse)}` : "—"}</span></div>
      <div><strong>Score:</strong> <span id="lite-score">0</span></div>
    </div>
  </header>

  <section class="yl-section">
    <h2 class="yl-section-title">Races</h2>
    <div class="yl-race-grid">
      ${buildRaceButtons()}
    </div>
  </section>

  <section class="yl-section">
    ${buildRaceTitles()}
    <div class="yl-nav">
      <button type="button" class="yl-btn" onclick="window.yardLite.prevRunner()">← Prev runner</button>
      <button type="button" class="yl-btn" onclick="window.yardLite.nextRunner()">Next runner →</button>
    </div>
    <div id="yl-runners">
      ${buildRunnerButtons()}
    </div>
  </section>

  <section class="yl-section">
    <h2 class="yl-runner-heading" id="lite-runner-heading">${firstRunner ? `#${firstRunner.no} ${escapeHtml(firstRunner.horse)}` : ""}</h2>
    ${buildFactorButtons()}
  </section>

  <script>
    window.YARD_LITE_RACES = ${racesJson};

    window.yardLiteState = {
      tapCount: 0,
      selectedRace: null,
      selectedRunner: null,
      assessments: {}
    };

    window.yardLite = {
      bump: function() {
        window.yardLiteState.tapCount += 1;
        var el = document.getElementById('lite-tap-count');
        if (el) el.textContent = String(window.yardLiteState.tapCount);
      },

      makeKey: function(raceId, runnerNo) {
        return raceId + '-' + runnerNo;
      },

      getRace: function() {
        var id = window.yardLiteState.selectedRace;
        var races = window.YARD_LITE_RACES || [];
        for (var i = 0; i < races.length; i++) {
          if (races[i].id === id) return races[i];
        }
        return races[0] || null;
      },

      getRunner: function() {
        var race = this.getRace();
        if (!race) return null;
        var no = window.yardLiteState.selectedRunner;
        for (var i = 0; i < race.runners.length; i++) {
          if (race.runners[i].no === no) return race.runners[i];
        }
        return race.runners[0] || null;
      },

      ensureAssessment: function(key) {
        if (!window.yardLiteState.assessments[key]) {
          window.yardLiteState.assessments[key] = { positive: {}, negative: {} };
        }
        return window.yardLiteState.assessments[key];
      },

      nextPositive: function(v) {
        var n = v || 0;
        return n >= 3 ? 0 : n + 1;
      },

      nextNegative: function(v) {
        var n = v || 0;
        return n <= -3 ? 0 : n - 1;
      },

      marks: function(v) {
        if (!v) return '';
        if (v > 0) {
          var s = '';
          for (var i = 0; i < v; i++) s += '\\u2713';
          return s;
        }
        var s2 = '';
        for (var j = 0; j < Math.abs(v); j++) s2 += '\\u2212';
        return s2;
      },

      totals: function(assessment) {
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

      formatNet: function(n) {
        return (n > 0 ? '+' : '') + n;
      },

      isPositiveFactor: function(factorKey) {
        if (factorKey === 'Clean+') return true;
        return factorKey.indexOf('+') === factorKey.length - 1;
      },

      selectRace: function(raceId) {
        this.bump();
        window.yardLiteState.selectedRace = raceId;
        var race = this.getRace();
        if (race && race.runners && race.runners.length) {
          window.yardLiteState.selectedRunner = race.runners[0].no;
        }
        this.render();
      },

      selectRunner: function(runnerNo) {
        this.bump();
        window.yardLiteState.selectedRunner = Number(runnerNo);
        this.render();
      },

      tapFactor: function(factorKey) {
        this.bump();
        var race = this.getRace();
        var runner = this.getRunner();
        if (!race || !runner) return;
        var key = this.makeKey(race.id, runner.no);
        var assessment = this.ensureAssessment(key);
        if (this.isPositiveFactor(factorKey)) {
          var pv = assessment.positive[factorKey];
          assessment.positive[factorKey] = this.nextPositive(pv);
        } else {
          var nv = assessment.negative[factorKey];
          assessment.negative[factorKey] = this.nextNegative(nv);
        }
        this.render();
      },

      nextRunner: function() {
        this.bump();
        var race = this.getRace();
        if (!race || !race.runners || !race.runners.length) return;
        var idx = 0;
        for (var i = 0; i < race.runners.length; i++) {
          if (race.runners[i].no === window.yardLiteState.selectedRunner) {
            idx = i;
            break;
          }
        }
        var next = race.runners[(idx + 1) % race.runners.length];
        window.yardLiteState.selectedRunner = next.no;
        this.render();
      },

      prevRunner: function() {
        this.bump();
        var race = this.getRace();
        if (!race || !race.runners || !race.runners.length) return;
        var idx = 0;
        for (var i = 0; i < race.runners.length; i++) {
          if (race.runners[i].no === window.yardLiteState.selectedRunner) {
            idx = i;
            break;
          }
        }
        var len = race.runners.length;
        var prev = race.runners[(idx - 1 + len) % len];
        window.yardLiteState.selectedRunner = prev.no;
        this.render();
      },

      render: function() {
        var state = window.yardLiteState;
        var race = this.getRace();
        var runner = this.getRunner();

        var tapEl = document.getElementById('lite-tap-count');
        if (tapEl) tapEl.textContent = String(state.tapCount);

        var raceEl = document.getElementById('lite-selected-race');
        if (raceEl) raceEl.textContent = state.selectedRace || '—';

        var runnerEl = document.getElementById('lite-selected-runner');
        if (runnerEl) {
          runnerEl.textContent = runner ? ('#' + runner.no + ' ' + runner.horse) : '—';
        }

        var headingEl = document.getElementById('lite-runner-heading');
        if (headingEl) {
          headingEl.textContent = runner ? ('#' + runner.no + ' ' + runner.horse) : '';
        }

        var scoreEl = document.getElementById('lite-score');
        if (scoreEl && race && runner) {
          var akey = this.makeKey(race.id, runner.no);
          var totals = this.totals(state.assessments[akey]);
          scoreEl.textContent = this.formatNet(totals.net);
        }

        var races = window.YARD_LITE_RACES || [];
        for (var r = 0; r < races.length; r++) {
          var rid = races[r].id;
          var raceBtn = document.getElementById('yl-race-' + rid);
          if (raceBtn) {
            if (rid === state.selectedRace) raceBtn.className = 'yl-btn yl-race-btn yl-btn-active';
            else raceBtn.className = 'yl-btn yl-race-btn';
          }
          var titleEl = document.getElementById('yl-race-title-' + rid);
          if (titleEl) titleEl.style.display = rid === state.selectedRace ? 'block' : 'none';
        }

        var runnerBtns = document.querySelectorAll('.yl-runner-btn');
        for (var b = 0; b < runnerBtns.length; b++) {
          var btn = runnerBtns[b];
          var btnRace = btn.getAttribute('data-race');
          var btnRunner = Number(btn.getAttribute('data-runner'));
          var visible = btnRace === state.selectedRace;
          btn.style.display = visible ? 'block' : 'none';
          if (visible && btnRunner === state.selectedRunner) btn.className = 'yl-btn yl-runner-btn yl-btn-active';
          else if (visible) btn.className = 'yl-btn yl-runner-btn';
        }

        for (var r2 = 0; r2 < races.length; r2++) {
          var race2 = races[r2];
          for (var u = 0; u < race2.runners.length; u++) {
            var rn = race2.runners[u];
            var netEl = document.getElementById('yl-runner-net-' + race2.id + '-' + rn.no);
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
          var posMarks = document.querySelectorAll('[id^="yl-marks-pos-"]');
          for (var p = 0; p < posMarks.length; p++) {
            var pel = posMarks[p];
            var pid = pel.id.replace('yl-marks-pos-', '');
            var pval = current && current.positive ? current.positive[pid] : 0;
            pel.textContent = this.marks(pval);
          }
          var negMarks = document.querySelectorAll('[id^="yl-marks-neg-"]');
          for (var n = 0; n < negMarks.length; n++) {
            var nel = negMarks[n];
            var nid = nel.id.replace('yl-marks-neg-', '');
            var nval = current && current.negative ? current.negative[nid] : 0;
            nel.textContent = this.marks(nval);
          }
        }
      },

      init: function() {
        var races = window.YARD_LITE_RACES || [];
        if (races.length) {
          window.yardLiteState.selectedRace = races[0].id;
          window.yardLiteState.selectedRunner = races[0].runners[0] ? races[0].runners[0].no : null;
        }
        this.render();
      }
    };

    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        regs.forEach(function(r) { r.unregister(); });
      });
    }
    document.getElementById('ios12-startup-failure') && document.getElementById('ios12-startup-failure').remove();
    window.yardLite.init();
  </script>
</body>
</html>`;
}

export function GET() {
  return new Response(buildYardLiteHtml(), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
