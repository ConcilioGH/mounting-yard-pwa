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

export const positiveItems = [
  "Bright coat",
  "Good muscle tone",
  "Athletic walk",
  "Calm / professional",
  "On toes positively",
  "Fit / tightened",
  "Strong hindquarter",
  "Focused",
  "Improved parade",
  "Best parade type",
] as const;

export const negativeItems: { label: string; severity: string }[] = [
  { label: "Head up", severity: "minor" },
  { label: "Too much white in eyes", severity: "minor" },
  { label: "Double handlers", severity: "minor" },
  { label: "Ears flicking / side to back", severity: "minor" },
  { label: "Not healthy dumping", severity: "minor" },
  { label: "Sweat — not kidney", severity: "minor" },
  { label: "Pawing in stalls", severity: "minor" },
  { label: "Two hands from strapper", severity: "minor" },
  { label: "Negative relationship with strapper", severity: "medium" },
  { label: "No strapper at stalls", severity: "medium" },
  { label: "Neck twisted / arched / resenting bit", severity: "medium" },
  { label: "Sexual displays / tail / urinating", severity: "medium" },
  { label: "Sweat — kidney", severity: "medium" },
  { label: "Canon bandages", severity: "medium" },
  { label: "Stops walking / resists", severity: "medium" },
  { label: "Won't go to gates cleanly", severity: "medium/major" },
  { label: "Gaping", severity: "medium/major" },
  { label: "Fast gait", severity: "medium/major" },
  { label: "Major sweat / kidney", severity: "medium/major" },
  { label: "Kicking in stalls", severity: "medium/major" },
  { label: "Circling in yard", severity: "medium/major" },
  { label: "Bucking", severity: "medium/major" },
  { label: "Slow gait", severity: "major" },
  { label: "Weaving in stalls", severity: "major" },
  { label: "Late into yard", severity: "major" },
  { label: "Other bandages", severity: "major" },
];

export const gearItems: { code: string; label: string }[] = [
  { code: "1", label: "Near front" },
  { code: "2", label: "Off front" },
  { code: "3", label: "Near hind" },
  { code: "4", label: "Off hind" },
  { code: "FT", label: "Fetlock tape" },
  { code: "B", label: "Bandage" },
  { code: "CB", label: "Canon bandage" },
  { code: "TT", label: "Tongue tie" },
  { code: "EM", label: "Ear muffs" },
  { code: "BL", label: "Blinkers" },
];
