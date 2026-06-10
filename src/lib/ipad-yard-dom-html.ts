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
    meetingStoreKey: "ipad-yard-meeting-store-v2",
    racesKey: "ipad-yard-races-v1",
    downloadedMeetingKey: "ipad-yard-downloaded-meeting-v1",
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
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>Mounting Yard — iPad</title>
  <script>
    if ("serviceWorker" in navigator && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        for (var i = 0; i < regs.length; i++) regs[i].unregister();
      });
    }
  </script>
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      padding: 0;
      padding-bottom: 56px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #e2e8f0;
      color: #0f172a;
    }
    .iy-app-nav {
      position: sticky;
      top: 0;
      z-index: 200;
      border-bottom: 1px solid #1e293b;
      background: rgba(2, 6, 23, 0.95);
      padding: calc(0.5rem + env(safe-area-inset-top, 0px)) 12px 8px;
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
    }
    .iy-app-nav-inner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      max-width: 1600px;
      margin: 0 auto;
    }
    .iy-app-nav-brand {
      display: inline;
      margin-right: 4px;
      font-size: 14px;
      font-weight: 600;
      color: #94a3b8;
      text-decoration: none;
    }
    .iy-app-nav-brand:hover { color: #cbd5e1; }
    .iy-app-nav-links {
      display: flex;
      flex: 1;
      flex-wrap: wrap;
      gap: 8px;
    }
    .iy-app-nav-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      min-width: 4.5rem;
      padding: 0 16px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      background: #0f172a;
      color: #e2e8f0;
      box-shadow: inset 0 0 0 1px #334155;
      -webkit-tap-highlight-color: transparent;
    }
    .iy-app-nav-link.iy-app-nav-active {
      background: #0891b2;
      color: #fff;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    .iy-page { padding: 8px; }
    .iy-header { margin-bottom: 6px; }
    .iy-header-top {
      display: -webkit-box;
      display: flex;
      -webkit-box-pack: justify;
      justify-content: space-between;
      -webkit-box-align: start;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 8px;
    }
    .iy-header-title { -webkit-box-flex: 1; flex: 1; min-width: 0; }
    .iy-next-race-countdown {
      flex-shrink: 0;
      min-width: 9rem;
      padding: 8px 12px;
      border-radius: 12px;
      border: 1px solid #334155;
      background: #0f172a;
      color: #e2e8f0;
      text-align: center;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
    }
    .iy-next-race-countdown.iy-hidden { display: none !important; }
    .iy-countdown-label {
      margin: 0;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #94a3b8;
    }
    .iy-countdown-race {
      margin: 4px 0 0;
      font-size: 13px;
      font-weight: 600;
      color: #e2e8f0;
      line-height: 1.2;
    }
    .iy-countdown-time {
      margin: 2px 0 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 28px;
      font-weight: 700;
      line-height: 1.1;
    }
    .iy-countdown-normal { color: #f8fafc; }
    .iy-countdown-amber { color: #fbbf24; }
    .iy-countdown-red { color: #f87171; }
    .iy-countdown-complete {
      margin: 4px 0 0;
      font-size: 18px;
      font-weight: 700;
      color: #f8fafc;
      line-height: 1.2;
    }
    h1 { font-size: 18px; font-weight: 700; margin: 0 0 2px; }
    .iy-meta { margin: 0; font-size: 11px; color: #64748b; line-height: 1.3; }
    .iy-network-status {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 800;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .iy-network-online { color: #166534; background: #dcfce7; }
    .iy-network-offline { color: #9a3412; background: #ffedd5; }
    .iy-downloaded-badge {
      display: inline-block;
      margin-left: 4px;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 800;
      border-radius: 4px;
      color: #1e40af;
      background: #dbeafe;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .iy-downloaded-badge.iy-hidden { display: none !important; }
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
      border: 2px solid #e2e8f0;
      border-left-width: 6px;
      border-radius: 8px;
      background: #fff;
      text-align: left;
      cursor: pointer;
      line-height: 1.25;
    }
    .iy-runner-tile:active { opacity: 0.85; }
    .iy-runner-head {
      display: block;
      font-size: 13px;
      font-weight: 800;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #0f172a;
    }
    .iy-runner-netline { display: block; font-size: 12px; font-weight: 700; margin-top: 2px; }
    .iy-runner-factors { display: block; font-size: 10px; font-weight: 600; margin-top: 1px; color: #64748b; }
    .iy-runner-plain { background: #f8fafc; border-color: #e2e8f0; border-left-color: #cbd5e1; }
    .iy-runner-plain .iy-runner-factors { color: #94a3b8; }
    .iy-runner-zero { background: #e8eef4; border-color: #b8c5d4; border-left-color: #64748b; }
    .iy-runner-zero .iy-runner-netline { color: #475569; }
    .iy-score-p1 { background: #f0fdf4; border-color: #d1fae5; border-left-color: #86efac; }
    .iy-score-p1 .iy-runner-netline { color: #15803d; }
    .iy-score-p2 { background: #dcfce7; border-color: #bbf7d0; border-left-color: #4ade80; }
    .iy-score-p2 .iy-runner-netline { color: #166534; }
    .iy-score-p3 { background: #bbf7d0; border-color: #86efac; border-left-color: #22c55e; }
    .iy-score-p3 .iy-runner-netline { color: #14532d; }
    .iy-score-p4 { background: #6ee7b7; border-color: #34d399; border-left-color: #059669; }
    .iy-score-p4 .iy-runner-netline { color: #064e3b; }
    .iy-score-p5 { background: #22c55e; border-color: #16a34a; border-left-color: #14532d; }
    .iy-score-p5 .iy-runner-head { color: #f0fdf4; }
    .iy-score-p5 .iy-runner-netline { color: #ecfdf5; }
    .iy-score-p5 .iy-runner-factors { color: #d1fae5; }
    .iy-score-n1 { background: #fff7ed; border-color: #ffedd5; border-left-color: #fdba74; }
    .iy-score-n1 .iy-runner-netline { color: #c2410c; }
    .iy-score-n2 { background: #ffedd5; border-color: #fed7aa; border-left-color: #fb923c; }
    .iy-score-n2 .iy-runner-netline { color: #9a3412; }
    .iy-score-n3 { background: #fdba74; border-color: #fb923c; border-left-color: #ea580c; }
    .iy-score-n3 .iy-runner-netline { color: #7c2d12; }
    .iy-score-n4 { background: #f87171; border-color: #ef4444; border-left-color: #dc2626; }
    .iy-score-n4 .iy-runner-head { color: #fff7ed; }
    .iy-score-n4 .iy-runner-netline { color: #fff1f2; }
    .iy-score-n4 .iy-runner-factors { color: #ffe4e6; }
    .iy-score-n5 { background: #dc2626; border-color: #b91c1c; border-left-color: #7f1d1d; }
    .iy-score-n5 .iy-runner-head { color: #fff7ed; }
    .iy-score-n5 .iy-runner-netline { color: #fff1f2; }
    .iy-score-n5 .iy-runner-factors { color: #fecaca; }
    .iy-runner-active {
      border-top-color: #0f172a !important;
      border-right-color: #0f172a !important;
      border-bottom-color: #0f172a !important;
      box-shadow: inset 0 0 0 1px #0f172a;
    }
    .iy-runner-active .iy-runner-head { font-weight: 900; }
    .iy-runner-active.iy-runner-zero { border-left-color: #475569 !important; }
    .iy-runner-active.iy-score-p1 { border-left-color: #4ade80 !important; }
    .iy-runner-active.iy-score-p2 { border-left-color: #22c55e !important; }
    .iy-runner-active.iy-score-p3 { border-left-color: #16a34a !important; }
    .iy-runner-active.iy-score-p4 { border-left-color: #047857 !important; }
    .iy-runner-active.iy-score-p5 { border-left-color: #052e16 !important; }
    .iy-runner-active.iy-score-n1 { border-left-color: #fb923c !important; }
    .iy-runner-active.iy-score-n2 { border-left-color: #f97316 !important; }
    .iy-runner-active.iy-score-n3 { border-left-color: #ea580c !important; }
    .iy-runner-active.iy-score-n4 { border-left-color: #b91c1c !important; }
    .iy-runner-active.iy-score-n5 { border-left-color: #450a0a !important; }
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
    .iy-toolbar-btn-primary { background: #0f172a; color: #fff; border-color: #0f172a; }
    .iy-hidden { display: none !important; }
    .iy-library {
      padding: 4px 0 12px;
      max-height: calc(100vh - 88px);
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
    .iy-library-title { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
    .iy-library-sub { font-size: 12px; color: #64748b; margin: 0 0 10px; line-height: 1.35; }
    .iy-meeting-card {
      display: block;
      width: 100%;
      margin: 0 0 6px;
      padding: 12px 14px;
      border: 2px solid #cbd5e1;
      border-radius: 10px;
      background: #fff;
      text-align: left;
      cursor: pointer;
    }
    .iy-meeting-card:active { opacity: 0.9; }
    .iy-meeting-card-title { font-size: 16px; font-weight: 800; line-height: 1.2; }
    .iy-meeting-card-sub { font-size: 11px; color: #64748b; margin-top: 3px; }
    .iy-meeting-active { border-color: #0f172a; background: #f1f5f9; }
    .iy-meeting-loading { opacity: 0.6; pointer-events: none; }
    .iy-library-empty {
      padding: 16px;
      border: 1px dashed #94a3b8;
      border-radius: 10px;
      font-size: 13px;
      color: #64748b;
      line-height: 1.45;
    }
    .iy-export-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1000;
      background: rgba(15, 23, 42, 0.55);
      padding: 10px;
      padding-bottom: calc(10px + env(safe-area-inset-bottom));
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
    .iy-export-panel {
      max-width: 720px;
      margin: 0 auto;
      padding: 12px;
      border-radius: 12px;
      background: #fff;
      border: 2px solid #0f172a;
    }
    .iy-export-title { font-size: 18px; font-weight: 800; margin: 0 0 6px; }
    .iy-export-filename { font-size: 13px; font-weight: 700; margin: 0 0 8px; color: #334155; }
    .iy-export-hint { font-size: 12px; color: #64748b; margin: 0 0 10px; line-height: 1.4; }
    .iy-export-text {
      width: 100%;
      height: 42vh;
      min-height: 180px;
      margin: 0 0 10px;
      padding: 8px;
      font-family: Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      line-height: 1.35;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      resize: vertical;
      -webkit-user-select: text;
      user-select: text;
    }
    .iy-export-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .iy-export-actions .iy-toolbar-btn { flex: 1; min-width: 100px; }
  </style>
</head>
<body>
  <nav class="iy-app-nav" aria-label="Main">
    <div class="iy-app-nav-inner">
      <a href="/" class="iy-app-nav-brand">Mounting Yard</a>
      <div class="iy-app-nav-links">
        <a href="/ipad-yard-dom" class="iy-app-nav-link iy-app-nav-active">Yard</a>
        <a href="/speed-map" class="iy-app-nav-link">Speed Map</a>
        <a href="/bias" class="iy-app-nav-link">Bias</a>
      </div>
    </div>
  </nav>
  <div class="iy-page">
  <div class="iy-header">
    <div class="iy-header-top">
      <div class="iy-header-title">
        <h1>Mounting Yard</h1>
        <p class="iy-meta">iPad · Build ${escapeHtml(APP_BUILD_VERSION)} · <span id="iy-meeting-label"></span> · <span id="iy-network-status" class="iy-network-status iy-network-online">Online</span> · <span id="iy-downloaded-badge" class="iy-downloaded-badge iy-hidden">Downloaded meeting active</span></p>
      </div>
      <div id="iy-next-race-countdown" class="iy-next-race-countdown iy-hidden" aria-live="polite">
        <p class="iy-countdown-label">Next race</p>
        <p id="iy-countdown-race" class="iy-countdown-race"></p>
        <p id="iy-countdown-time" class="iy-countdown-time iy-countdown-normal"></p>
      </div>
    </div>
    <div class="iy-toolbar">
      <button type="button" id="iy-btn-meetings" class="iy-toolbar-btn iy-toolbar-btn-primary" onclick="window.ipadYard.showLibrary()">Meetings</button>
      <button type="button" id="iy-btn-download-meeting" class="iy-toolbar-btn" onclick="window.ipadYard.downloadMeetingToIpad()">Download Meeting to iPad</button>
      <button type="button" id="iy-btn-use-downloaded" class="iy-toolbar-btn" onclick="window.ipadYard.useDownloadedMeeting()">Use Downloaded Meeting</button>
      <button type="button" id="iy-btn-clear-downloaded" class="iy-toolbar-btn" onclick="window.ipadYard.clearDownloadedMeeting()">Clear Downloaded Meeting</button>
      <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.clearCurrentMeeting()">Clear Current Meeting</button>
      <button type="button" id="iy-btn-import-folder" class="iy-toolbar-btn iy-hidden" onclick="window.ipadYard.importMeetingFolder()">Import meeting folder</button>
      <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.exportAllAssessments()">Export all assessments</button>
      <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.exportAssessmentPackage()">Export Assessment Package</button>
      <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.showAssessmentPackageImportPanel()">Import Assessment Package</button>
      <button type="button" class="iy-toolbar-btn" onclick="document.getElementById('iy-csv-input').click()">Import CSV</button>
      <input id="iy-csv-input" type="file" accept=".csv,text/csv" style="display:none" onchange="window.ipadYard.importCsv(this)">
      <input id="iy-assessment-package-file" type="file" accept=".json,application/json" style="display:none" onchange="window.ipadYard.importAssessmentPackageFile(this)">
    </div>
    <p id="iy-import-msg" class="iy-msg"></p>
    <div id="iy-race-tabs" class="iy-race-bar"></div>
  </div>

  <div id="iy-library-view" class="iy-library iy-hidden">
    <div class="iy-library-title">Meeting Library</div>
    <p class="iy-library-sub">Master CSVs from the laptop <code>meetings/</code> folder. Tap a meeting to load — no file picker.</p>
    <div class="iy-toolbar" style="margin-bottom:8px;">
      <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.fetchLibrary()">Refresh</button>
      <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.showAssess()">Back to Yard</button>
    </div>
    <p id="iy-library-msg" class="iy-msg"></p>
    <div id="iy-meeting-list"></div>
  </div>

  <div id="iy-assess-view">
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

  </div>

  </div><!-- .iy-page -->

  <div id="iy-fixed-nav" class="iy-fixed-nav">
    <button type="button" class="iy-nav-btn" onclick="window.ipadYard.prevRunner()">← Prev</button>
    <button type="button" class="iy-nav-btn" onclick="window.ipadYard.nextRunner()">Next →</button>
  </div>

  <div id="iy-export-overlay" class="iy-export-overlay iy-hidden">
    <div class="iy-export-panel">
      <div class="iy-export-title">Export CSV</div>
      <div id="iy-export-filename" class="iy-export-filename"></div>
      <p class="iy-export-hint">Copy this CSV text and paste/save it on the laptop.</p>
      <textarea id="iy-export-text" class="iy-export-text" readonly></textarea>
      <div class="iy-export-actions">
        <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.selectAllExport()">Select All</button>
        <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.copyExportCsv()">Copy</button>
        <button type="button" id="iy-export-download-btn" class="iy-toolbar-btn iy-hidden" onclick="window.ipadYard.downloadExportCsv()">Download</button>
        <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.closeExportPanel()">Close</button>
      </div>
    </div>
  </div>

  <div id="iy-package-overlay" class="iy-export-overlay iy-hidden">
    <div class="iy-export-panel">
      <div class="iy-export-title">Import Meeting Package</div>
      <p class="iy-export-hint">Paste the meeting package copied from Download Meeting to iPad on the laptop server, then tap Import.</p>
      <textarea id="iy-package-text" class="iy-export-text" placeholder="Paste meeting JSON package here…"></textarea>
      <div class="iy-export-actions">
        <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.importMeetingPackage()">Import</button>
        <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.closePackagePanel()">Close</button>
      </div>
    </div>
  </div>

  <div id="iy-download-overlay" class="iy-export-overlay iy-hidden">
    <div class="iy-export-panel">
      <div class="iy-export-title">Meeting Downloaded</div>
      <p id="iy-download-msg" class="iy-export-hint">Meeting downloaded to iPad. You can now use this meeting offline.</p>
      <p class="iy-export-hint">To use on Vercel: copy this package, open the Vercel app, tap Use Downloaded Meeting, and paste.</p>
      <textarea id="iy-download-package-text" class="iy-export-text" readonly></textarea>
      <div class="iy-export-actions">
        <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.selectAllDownloadPackage()">Select All</button>
        <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.closeDownloadPanel()">Close</button>
      </div>
    </div>
  </div>

  <div id="iy-assessment-package-export-overlay" class="iy-export-overlay iy-hidden">
    <div class="iy-export-panel">
      <div class="iy-export-title">Assessment Package</div>
      <div id="iy-assessment-package-export-filename" class="iy-export-filename"></div>
      <p class="iy-export-hint">Copy this JSON and paste on your laptop with Import Assessment Package, or save to Files.</p>
      <textarea id="iy-assessment-package-export-text" class="iy-export-text" readonly></textarea>
      <div class="iy-export-actions">
        <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.selectAllAssessmentPackageExport()">Select All</button>
        <button type="button" id="iy-assessment-package-download-btn" class="iy-toolbar-btn iy-hidden" onclick="window.ipadYard.downloadAssessmentPackageExport()">Download</button>
        <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.closeAssessmentPackageExportPanel()">Close</button>
      </div>
    </div>
  </div>

  <div id="iy-assessment-package-import-overlay" class="iy-export-overlay iy-hidden">
    <div class="iy-export-panel">
      <div class="iy-export-title">Import Assessment Package</div>
      <p class="iy-export-hint">Paste the JSON from Export Assessment Package on iPad, or choose a <code>_yard-package.json</code> file.</p>
      <textarea id="iy-assessment-package-import-text" class="iy-export-text" placeholder="Paste assessment package JSON here…"></textarea>
      <div class="iy-export-actions">
        <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.importAssessmentPackageFromPanel()">Import</button>
        <button type="button" class="iy-toolbar-btn" onclick="document.getElementById('iy-assessment-package-file').click()">Choose file</button>
        <button type="button" class="iy-toolbar-btn" onclick="window.ipadYard.closeAssessmentPackageImportPanel()">Close</button>
      </div>
    </div>
  </div>

  <script>
    window.IPAD_YARD_DEFAULT_RACES = ${defaultRacesJson};
    window.IPAD_YARD_FACTOR_GROUPS = ${factorGroupsJson};
    window.IPAD_YARD_CONFIG = ${configJson};
  </script>
  <script src="/yard-race-countdown-dom.js?v=${escapeHtml(APP_BUILD_VERSION)}"></script>
  <script src="/meeting-export-delivery-dom.js?v=${escapeHtml(APP_BUILD_VERSION)}"></script>
  <script src="/ipad-yard-dom.js?v=${escapeHtml(APP_BUILD_VERSION)}"></script>
</body>
</html>`;
}
