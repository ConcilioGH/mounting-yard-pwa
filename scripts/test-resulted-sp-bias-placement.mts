import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [ipadHtml, ipadScript, biasApp, statusPanel, poller] = await Promise.all([
  readFile("src/lib/ipad-yard-dom-html.ts", "utf8"),
  readFile("public/ipad-yard-dom.js", "utf8"),
  readFile("src/components/race-day-bias/race-day-bias-app.tsx", "utf8"),
  readFile("src/components/resulted-sp-status-panel.tsx", "utf8"),
  readFile("src/lib/resulted-sp/poller.ts", "utf8"),
]);

assert.doesNotMatch(ipadHtml, /id="iy-resulted-sp-panel"/);
assert.doesNotMatch(ipadScript, /refreshResultedSpPoller\s*:/);
assert.doesNotMatch(ipadScript, /renderResultedSpPanel\s*:/);
assert.match(biasApp, /<ResultedSpStatusPanel/);
assert.match(biasApp, /appearance="dark"/);
assert.match(statusPanel, /startResultedSpPoller/);
assert.match(poller, /overwriteExistingSp:\s*false/);
assert.match(poller, /syncBiasFromImportedRace/);

console.log("Resulted SP Bias-page placement contract passed.");
