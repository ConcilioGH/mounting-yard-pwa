import type { Race } from "./types";

export const DEFAULT_RACES: Race[] = [
  {
    id: "R1",
    title: "Race 1 — 1:00 Newcastle 900m",
    runners: [
      { no: 2, horse: "Pieripper", br: 7, trainer: "Gregory Hickman", jockey: "Andrew Adkins", odds: "$51" },
      { no: 4, horse: "Found The Gold", br: 3, trainer: "Ron Quinton", jockey: "Louise Day", odds: "$4.20" },
      { no: 5, horse: "Handloom", br: 1, trainer: "Gary Portelli", jockey: "Reece Jones", odds: "$17" },
      { no: 8, horse: "Mystical", br: 9, trainer: "Michael Freedman", jockey: "Keagan Latham", odds: "$3.40" },
      { no: 9, horse: "Spice Trail", br: 2, trainer: "Kris Lees", jockey: "Jason Collett", odds: "$3.25" },
      { no: 10, horse: "Ti Amo", br: 4, trainer: "Bjorn Baker", jockey: "Rachel King", odds: "$3.80" },
      { no: 11, horse: "Wild Courage", br: 11, trainer: "Ciaron Maher", jockey: "Kerrin McEvoy", odds: "$12" },
    ],
  },
  {
    id: "R2",
    title: "Race 2 — 1:35 Newcastle 900m",
    runners: [
      { no: 2, horse: "Reign 'Em In", br: 4, trainer: "Annabel & Rob Archibald", jockey: "Mollie Fitzgerald", odds: "$3.10" },
      { no: 3, horse: "Artemex", br: 3, trainer: "Ciaron Maher", jockey: "Regan Bayliss", odds: "$1.80" },
      { no: 4, horse: "Foxwedge Arrow", br: 1, trainer: "Larry Fairhall", jockey: "Deon Le Roux", odds: "$41" },
      { no: 5, horse: "Silk Lace", br: 5, trainer: "Blake Ryan", jockey: "Emma Ly", odds: "$9" },
      { no: 6, horse: "Go Russian", br: 6, trainer: "Rodney Ollerton", jockey: "Christian Reith", odds: "$13" },
      { no: 9, horse: "The Way Ahead", br: 9, trainer: "Matthew Smith", jockey: "Kerrin McEvoy", odds: "$6.50" },
    ],
  },
];

export const SWEAT_POS_ROW = ["BH+", "K+", "N+", "BS+"] as const;
export const SWEAT_NEG_ROW = ["BH-", "K-", "N-", "BS-"] as const;

export const SWEAT_LEGEND = "BH = Behind · K = Kidney · N = Neck · BS = Body/Saddlecloth";

/** Compact raceday scan layout: short keys = JSON keys in positive/negative. */
export type RacedayCompactGroup =
  | { kind: "sweat"; title: "SWEAT" }
  | { kind: "rows"; title: string; positives: readonly string[]; negatives: readonly string[] };

export const racedayCompactGroups: RacedayCompactGroup[] = [
  { kind: "sweat", title: "SWEAT" },
  {
    kind: "rows",
    title: "COAT",
    positives: ["Dapple+", "Healthy+"],
    negatives: ["Dull-", "Dry-"],
  },
  {
    kind: "rows",
    title: "MUSCLE",
    positives: ["Defined+", "Tight+"],
    negatives: ["Light-", "Poor-"],
  },
  {
    kind: "rows",
    title: "BEHAVIOUR",
    positives: ["Calm+", "Alert+"],
    negatives: ["Aggressive-", "Flat-"],
  },
  {
    kind: "rows",
    title: "WALK",
    positives: ["Fluent+"],
    negatives: ["Short-", "Stiff-", "Injured-"],
  },
  {
    kind: "rows",
    title: "CONDITION",
    positives: ["Forward+", "Peak+"],
    negatives: ["Heavy/Fat-", "Tucked up-"],
  },
];

export const gearTiles: { code: "FT" | "B" | "CB" | "INJ"; label: string }[] = [
  { code: "FT", label: "Fetlock Tape" },
  { code: "B", label: "Bandage" },
  { code: "CB", label: "Canon Bandage" },
  { code: "INJ", label: "Injury" },
];

export const gearLocations: { num: number; label: string }[] = [
  { num: 1, label: "Near front" },
  { num: 2, label: "Off front" },
  { num: 3, label: "Off hind" },
  { num: 4, label: "Near hind" },
  { num: 5, label: "Body" },
];
