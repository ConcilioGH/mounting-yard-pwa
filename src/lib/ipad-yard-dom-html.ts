/**
 * Builds the /ipad-yard-dom HTML shell. Interaction logic lives in public/ipad-yard-dom.js.
 */
import {
  DEFAULT_RACES,
  racedayCompactGroups,
  SWEAT_LEGEND,
  SWEAT_POS_KEY,
  gearTiles,
  wetTile,
  WET_BODY_TYPES,
  WET_FEET,
  gearLocations,
} from "@/lib/constants";
import { APP_BUILD_VERSION } from "@/lib/build-version";
import { MEETING_MANIFEST_STORAGE_KEY } from "@/lib/meeting-coordination";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildIpadYardDomHtml(): string {
  const defaultRacesJson = JSON.stringify(DEFAULT_RACES);
  const factorGroupsJson = JSON.stringify(racedayCompactGroups);
  const configJson = JSON.stringify({
    build: APP_BUILD_VERSION,
    sweatLegend: SWEAT_LEGEND,
    sweatPosKey: SWEAT_POS_KEY,
    assessmentsKey: "ipad-yard-assessments",
    racesKey: "ipad-yard-races-v1",
    manifestKey: MEETING_MANIFEST_STORAGE_KEY,
    gearTiles,
    wetTile,
    wetBodyTypes: WET_BODY_TYPES,
    wetFeet: WET_FEET,
    gearLocations,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <title>Mounting Yard — iPad</title>
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      padding: 8px;
      padding-bottom: 56px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #e2e8f0;
      color: #0f172a;
    }
    .iy-header { margin-bottom: 6px; }
    h1 { font-size: 18px; font-weight: 700; margin: 0 0 2px; }
    .iy-meta { margin: 0; font-size: 11px; color: #64748b; line-height: 1.3; }
    .iy-toolbar { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 4px; }
    .iy-toolbar-btn {
      flex: 1;
      min-width: 88px;
      margin: 0;
      padding: 8px 6px;
      font-size: 12px;
      font-weight: 700;
      border: 1px solid #94a3b8;
      border-radius: 8px;
      background: #fff;
      color: #0f172a;
      cursor: pointer;
      text-align: center;
    }
    .iy-race-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 6px;
    }
    .iy-race-tab {
      flex: 1;
      min-width: 48px;
      margin: 0;
      padding: 8px 4px;
      font-size: 13px;
      font-weight: 700;
      border: 2px solid #64748b;
      border-radius: 8px;
      background: #fff;
      cursor: pointer;
      text-align: center;
    }
    .iy-race-active { background: #0f172a; color: #fff; border-color: #0f172a; }
    .iy-main {
      display: -webkit-box;
      display: flex;
      -webkit-box-orient: horizontal;
      flex-direction: row;
      align-items: stretch;
      gap: 6px;
      min-height: calc(100vh - 108px);
    }
    .iy-runners-col {
      -webkit-box-flex: 0;
      flex: 0 0 34%;
      width: 34%;
      max-width: 36%;
      position: -webkit-sticky;
      position: sticky;
      top: 4px;
      align-self: flex-start;
      max-height: calc(100vh - 64px);
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 6px;
    }
    .iy-assess-col {
      -webkit-box-flex: 1;
      flex: 1;
      min-width: 0;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 6px;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      max-height: calc(100vh - 64px);
    }
    .iy-col-title {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      margin: 0 0 4px;
      text-transform: uppercase;
    }
    .iy-race-title { font-size: 12px; font-weight: 700; margin: 0 0 4px; line-height: 1.2; }
    .iy-runner-tile {
      display: block;
      width: 100%;
      margin: 0 0 3px;
      padding: 6px 8px;
      border: 2px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      text-align: left;
      cursor: pointer;
      line-height: 1.25;
    }
    .iy-runner-tile:active { opacity: 0.85; }
    .iy-runner-row { display: -webkit-box; display: flex; -webkit-box-pack: justify; justify-content: space-between; align-items: baseline; gap: 4px; }
    .iy-runner-no { font-size: 13px; font-weight: 800; }
    .iy-runner-net { font-size: 12px; font-weight: 700; white-space: nowrap; }
    .iy-runner-name { display: block; font-size: 12px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .iy-runner-active { border-color: #0f172a; background: #0f172a; color: #fff; }
    .iy-runner-active .iy-runner-net { color: #86efac; }
    .iy-runner-header {
      margin-bottom: 6px;
      padding: 6px 8px;
      border-radius: 8px;
      background: #fff;
      border: 1px solid #e2e8f0;
      font-size: 12px;
      line-height: 1.35;
    }
    .iy-runner-header strong { font-size: 14px; }
    .iy-net-line { font-size: 13px; font-weight: 700; margin-top: 2px; }
    .iy-group {
      margin-bottom: 5px;
      padding: 5px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fff;
    }
    .iy-group-title {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      margin: 0 0 3px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .iy-factor-grid { display: grid; gap: 3px; }
    .iy-cols-2 { grid-template-columns: repeat(2, 1fr); }
    .iy-cols-3 { grid-template-columns: repeat(3, 1fr); }
    .iy-cols-4 { grid-template-columns: repeat(4, 1fr); }
    .iy-cols-5 { grid-template-columns: repeat(5, 1fr); }
    .iy-factor {
      margin: 0;
      padding: 7px 3px;
      font-size: 11px;
      font-weight: 700;
      border: 2px solid #cbd5e1;
      border-radius: 7px;
      background: #fff;
      text-align: center;
      cursor: pointer;
      line-height: 1.15;
      min-height: 36px;
    }
    .iy-factor .iy-marks { display: block; font-size: 12px; margin-top: 1px; min-height: 14px; }
    .iy-factor-pos-active { border-color: #059669; background: #ecfdf5; }
    .iy-factor-neg-active { border-color: #dc2626; background: #fef2f2; }
    .iy-factor-gear-active { border-color: #2563eb; background: #eff6ff; }
    .iy-factor-picker-open { border-color: #0f172a; box-shadow: inset 0 0 0 1px #0f172a; }
    .iy-factor-sub { font-size: 9px; font-weight: 600; color: #64748b; display: block; margin-top: 1px; }
    .iy-picker-row { margin-top: 3px; }
    .iy-loc-btn { padding: 6px 2px; font-size: 10px; min-height: 32px; }
    .iy-loc-active { border-color: #2563eb; background: #dbeafe; }
    .iy-wet-label { font-size: 9px; font-weight: 700; color: #64748b; margin: 4px 0 2px; }
    .iy-notes {
      width: 100%;
      margin: 0;
      padding: 6px 8px;
      font-size: 13px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      resize: vertical;
      min-height: 44px;
      font-family: inherit;
    }
    .iy-legend { font-size: 9px; color: #94a3b8; margin: 2px 0 0; line-height: 1.2; }
    .iy-msg { font-size: 11px; color: #64748b; margin: 2px 0 4px; }
    .iy-fixed-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 6px 8px;
      padding-bottom: calc(6px + env(safe-area-inset-bottom));
      background: #fff;
      border-top: 1px solid #cbd5e1;
      display: -webkit-box;
      display: flex;
      gap: 6px;
    }
    .iy-nav-btn {
      -webkit-box-flex: 1;
      flex: 1;
      margin: 0;
      padding: 10px 8px;
      font-size: 14px;
      font-weight: 700;
      border: 2px solid #0f172a;
      border-radius: 8px;
      background: #fff;
      cursor: pointer;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="iy-header">
    <h1>Mounting Yard</h1>
    <p class="iy-meta">iPad · Build ${escapeHtml(APP_BUILD_VERSION)} · <span id="iy-meeting-label"></span></p>
    <div class="iy-toolbar">
      <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.exportCsv()">Export</button>
      <button type="button" class="iy-toolbar-btn" onclick="document.getElementById('iy-csv-input').click()">Import</button>
      <input id="iy-csv-input" type="file" accept=".csv,text/csv" style="display:none" onchange="window.ipadYard.importCsv(this)">
    </div>
    <p id="iy-import-msg" class="iy-msg"></p>
    <div id="iy-race-tabs" class="iy-race-bar"></div>
  </div>

  <div class="iy-main">
    <div class="iy-runners-col">
      <div class="iy-col-title">Runners</div>
      <div id="iy-race-title" class="iy-race-title"></div>
      <div id="iy-runners"></div>
    </div>
    <div class="iy-assess-col">
      <div id="iy-runner-header" class="iy-runner-header"></div>
      <div id="iy-factors"></div>
      <div class="iy-group">
        <div class="iy-group-title">Notes</div>
        <textarea id="iy-notes" class="iy-notes" rows="2" placeholder="Notes for this horse…" oninput="window.ipadYard.setNotes(this.value)"></textarea>
      </div>
    </div>
  </div>

  <div class="iy-fixed-nav">
    <button type="button" class="iy-nav-btn" onclick="window.ipadYard.prevRunner()">← Prev</button>
    <button type="button" class="iy-nav-btn" onclick="window.ipadYard.nextRunner()">Next →</button>
  </div>

  <script>
    window.IPAD_YARD_DEFAULT_RACES = ${defaultRacesJson};
    window.IPAD_YARD_FACTOR_GROUPS = ${factorGroupsJson};
    window.IPAD_YARD_CONFIG = ${configJson};
  </script>
  <script src="/ipad-yard-dom.js?v=${escapeHtml(APP_BUILD_VERSION)}"></script>
</body>
</html>`;
}
