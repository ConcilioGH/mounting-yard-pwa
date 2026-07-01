/**
 * Unit checks for Resulted SP meeting-card guard rules (mirrors public/resulted-sp-dom.js).
 */
function normalizeHorseName(horse: string) {
  return String(horse || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function resolveMeetingDate(value: string) {
  const v = String(value ?? "").trim();
  if (!v || v === "today") return new Date().toISOString().slice(0, 10);
  return v;
}

function countNameOverlap(yardNames: string[], tabNames: string[]) {
  const tabSet = new Set(tabNames);
  return yardNames.filter((n) => tabSet.has(n)).length;
}

function requiredOverlapCount(yardRunnerCount: number) {
  if (yardRunnerCount <= 0) return 0;
  const pct = Math.ceil(yardRunnerCount * 0.6);
  if (yardRunnerCount <= 6) return pct;
  return Math.max(pct, 4);
}

function guardBlockedByDate(yardDate: string, tabDate: string) {
  return resolveMeetingDate(yardDate) !== resolveMeetingDate(tabDate);
}

const oldYardDate = "2026-06-10";
const todayTabDate = new Date().toISOString().slice(0, 10);
console.log("date guard old vs today:", guardBlockedByDate(oldYardDate, todayTabDate));

const yardNames = ["Royal Air Force", "Baltusrol", "Short Sea", "Zourrific", "Power Hungry"].map(
  normalizeHorseName,
);
const tabNames = ["CONSULATE", "CASTELBELLA", "SNITZELS GIRL", "WOODENBRIDGE"].map(normalizeHorseName);
const overlap = countNameOverlap(yardNames, tabNames);
const required = requiredOverlapCount(yardNames.length);
console.log("overlap old card vs today TAB R1:", { overlap, required, blocked: overlap < required });

const kensingtonTodayYard = [
  "Consulate",
  "Castelabella",
  "Snitzels Girl",
  "Woodenbridge",
  "Hellflight",
].map(normalizeHorseName);
const overlapToday = countNameOverlap(kensingtonTodayYard, tabNames);
console.log("overlap today card vs today TAB R1:", {
  overlap: overlapToday,
  required: requiredOverlapCount(kensingtonTodayYard.length),
  passes: overlapToday >= requiredOverlapCount(kensingtonTodayYard.length),
});
