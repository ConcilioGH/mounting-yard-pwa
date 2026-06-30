import { sanitizeMeetingSlug } from "@/lib/meeting-export";
import type { MeetingManifest } from "@/lib/meeting-coordination";

/** TAB results page state segment (e.g. R = NSW). */
export type TabStateCode = "R" | "V" | "Q" | "S" | "W" | "T";

/** TAB API jurisdiction query parameter. */
export type TabJurisdiction = "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "ACT";

const VIC_TRACKS = new Set([
  "flemington",
  "caulfield",
  "moonee-valley",
  "sandown",
  "ballarat",
  "bendigo",
  "geelong",
  "warrnambool",
  "pakenham",
  "cranbourne",
]);

const QLD_TRACKS = new Set([
  "eagle-farm",
  "doomben",
  "gold-coast",
  "sunshine-coast",
  "ipswich",
  "toowoomba",
  "rockhampton",
  "townsville",
  "cairns",
  "mackay",
]);

const SA_TRACKS = new Set(["morphettville", "gawler", "murray-bridge", "oakbank"]);

const WA_TRACKS = new Set(["belmont", "ascot", "pinjarra", "bunbury"]);

const TAS_TRACKS = new Set(["hobart", "launceston", "devonport"]);

export function inferTabJurisdiction(manifest: Pick<MeetingManifest, "trackSlug" | "trackName">): TabJurisdiction {
  const slug = sanitizeMeetingSlug(manifest.trackSlug || manifest.trackName || "");
  if (VIC_TRACKS.has(slug)) return "VIC";
  if (QLD_TRACKS.has(slug)) return "QLD";
  if (SA_TRACKS.has(slug)) return "SA";
  if (WA_TRACKS.has(slug)) return "WA";
  if (TAS_TRACKS.has(slug)) return "TAS";
  return "NSW";
}

export function tabStateCodeForJurisdiction(jurisdiction: TabJurisdiction): TabStateCode {
  switch (jurisdiction) {
    case "VIC":
      return "V";
    case "QLD":
      return "Q";
    case "SA":
      return "S";
    case "WA":
      return "W";
    case "TAS":
      return "T";
    default:
      return "R";
  }
}
