import type { Race } from "@/lib/types";
import {
  racedayCompactGroups,
  SWEAT_LEGEND,
  SWEAT_NEG_ROW,
  SWEAT_POS_KEY,
} from "@/lib/constants";
import { APP_BUILD_VERSION } from "@/lib/build-version";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

const BTN_STYLE =
  "display:block;width:100%;margin:12px 0;padding:16px 18px;font-size:18px;font-weight:700;border:2px solid #111;border-radius:12px;background:#fff;color:#111;cursor:pointer;";

const NAV_BTN_STYLE =
  "display:block;flex:1;margin:0;padding:16px 18px;font-size:18px;font-weight:700;border:2px solid #111;border-radius:12px;background:#fff;color:#111;cursor:pointer;";

function buildRaceButtons(races: Race[]): string {
  return races
    .map(
      (race) =>
        `<button type="button" id="ylg-race-${escapeAttr(race.id)}" onclick="window.yardLegacy.selectRace('${escapeAttr(race.id)}')" style="${BTN_STYLE}">${escapeHtml(race.id)}</button>`,
    )
    .join("");
}

function buildRunnerButtons(races: Race[]): string {
  return races
    .flatMap((race) =>
      race.runners.map(
        (runner) =>
          `<button type="button" class="ylg-runner-btn" id="ylg-runner-${escapeAttr(race.id)}-${runner.no}" data-race="${escapeAttr(race.id)}" data-runner="${runner.no}" onclick="window.yardLegacy.selectRunner(${runner.no})" style="display:none;${BTN_STYLE}">#${runner.no} ${escapeHtml(runner.horse)} · net <span id="ylg-runner-net-${escapeAttr(race.id)}-${runner.no}">0</span></button>`,
      ),
    )
    .join("");
}

function buildFactorButtons(): string {
  const parts: string[] = [];

  for (const group of racedayCompactGroups) {
    parts.push(
      `<div style="margin-bottom:16px;padding:12px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;"><div style="font-size:12px;font-weight:700;margin-bottom:8px;color:#64748b;">${escapeHtml(group.title)}</div>`,
    );

    if (group.kind === "sweat") {
      parts.push(
        `<button type="button" onclick="window.yardLegacy.tapFactor('${escapeAttr(SWEAT_POS_KEY)}')" style="${BTN_STYLE}">${escapeHtml(SWEAT_POS_KEY)} <span id="ylg-marks-pos-${escapeAttr(SWEAT_POS_KEY)}"></span></button>`,
      );
      parts.push('<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">');
      for (const key of SWEAT_NEG_ROW) {
        parts.push(
          `<button type="button" onclick="window.yardLegacy.tapFactor('${escapeAttr(key)}')" style="margin:0;padding:12px 6px;font-size:14px;font-weight:700;border:2px solid #111;border-radius:12px;background:#fff;cursor:pointer;">${escapeHtml(key)} <span id="ylg-marks-neg-${escapeAttr(key)}"></span></button>`,
        );
      }
      parts.push("</div>");
      parts.push(
        `<p style="font-size:11px;color:#64748b;margin:8px 0 0;">${escapeHtml(SWEAT_LEGEND)}</p>`,
      );
    } else {
      for (const key of group.positives) {
        parts.push(
          `<button type="button" onclick="window.yardLegacy.tapFactor('${escapeAttr(key)}')" style="${BTN_STYLE}">${escapeHtml(key)} <span id="ylg-marks-pos-${escapeAttr(key)}"></span></button>`,
        );
      }
      for (const key of group.negatives) {
        parts.push(
          `<button type="button" onclick="window.yardLegacy.tapFactor('${escapeAttr(key)}')" style="${BTN_STYLE}">${escapeHtml(key)} <span id="ylg-marks-neg-${escapeAttr(key)}"></span></button>`,
        );
      }
    }

    parts.push("</div>");
  }

  return parts.join("");
}

/** Raw HTML fragment for iOS 12 Yard — inline onclick only, no React events. */
export function buildYardLegacyMarkup(races: Race[]): string {
  const racesJson = escapeAttr(JSON.stringify(races));
  const firstRace = races[0];
  const firstRunner = firstRace?.runners[0];
  const raceCols = Math.min(Math.max(races.length, 2), 4);

  return `<div id="yard-legacy-root" data-races="${racesJson}" data-build="${escapeAttr(APP_BUILD_VERSION)}" style="min-height:100vh;padding:12px;padding-bottom:96px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f1f5f9;color:#0f172a;">
  <h1 style="font-size:24px;font-weight:700;margin:0 0 4px;">Mounting Yard</h1>
  <p style="margin:0 0 12px;font-size:14px;color:#475569;">iOS 12 legacy mode · inline handlers · Build ${escapeHtml(APP_BUILD_VERSION)}</p>
  <div style="margin-bottom:16px;padding:12px;border:2px solid #ef4444;border-radius:12px;background:#fef2f2;font-size:16px;line-height:1.5;">
    <div><strong>Tap count:</strong> <span id="ylg-tap-count">0</span></div>
    <div><strong>Selected race:</strong> <span id="ylg-selected-race">${escapeHtml(firstRace?.id ?? "—")}</span></div>
    <div><strong>Selected runner:</strong> <span id="ylg-selected-runner">${firstRunner ? `#${firstRunner.no} ${escapeHtml(firstRunner.horse)}` : "—"}</span></div>
    <div><strong>Score:</strong> <span id="ylg-score">0</span></div>
    <div><strong>Last factor:</strong> <span id="ylg-last-factor">—</span></div>
  </div>
  <div style="margin-bottom:16px;">
    <div style="font-size:14px;font-weight:700;margin-bottom:8px;">Races</div>
    <div style="display:grid;grid-template-columns:repeat(${raceCols},1fr);gap:8px;">
      ${buildRaceButtons(races)}
    </div>
  </div>
  <div style="margin-bottom:16px;">
    ${races
      .map(
        (race) =>
          `<h2 id="ylg-race-title-${escapeAttr(race.id)}" style="display:none;font-size:16px;font-weight:700;margin:0 0 8px;">${escapeHtml(race.title)}</h2>`,
      )
      .join("")}
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <button type="button" onclick="window.yardLegacy.prevRunner()" style="${NAV_BTN_STYLE}">← Previous</button>
      <button type="button" onclick="window.yardLegacy.nextRunner()" style="${NAV_BTN_STYLE}">Next →</button>
    </div>
    <div id="ylg-runners">${buildRunnerButtons(races)}</div>
  </div>
  <div style="margin-bottom:16px;">
    <h2 id="ylg-runner-heading" style="font-size:18px;font-weight:700;margin:0 0 12px;">${firstRunner ? `#${firstRunner.no} ${escapeHtml(firstRunner.horse)}` : ""}</h2>
    ${buildFactorButtons()}
  </div>
  <div style="position:fixed;bottom:0;left:0;right:0;padding:12px;padding-bottom:calc(12px + env(safe-area-inset-bottom));background:#fff;border-top:2px solid #cbd5e1;display:flex;gap:8px;">
    <button type="button" onclick="window.yardLegacy.prevRunner()" style="${NAV_BTN_STYLE}">← Previous</button>
    <button type="button" onclick="window.yardLegacy.nextRunner()" style="${NAV_BTN_STYLE}">Next →</button>
  </div>
</div>`;
}
