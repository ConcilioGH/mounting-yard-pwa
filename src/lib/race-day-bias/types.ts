/** Lane group used for bias analytics (extensible meeting metadata lives on state root). */

export type LaneGroup = "rail" | "runningLine" | "threeWide" | "fourWidePlus";

export type PositionGroup =
  | "leaderFrontPair"
  | "onPace"
  | "midfield"
  | "backmarker"
  | "wideForward"
  | "wideMidfield"
  | "wideBack";



export type FinisherSlot = {

  positionCode: string;

  sp: string;

};



export type PositionField = "first" | "second" | "third" | "fourth";



/** Per-race finishing slots (1st–4th) with lane code + SP. */

export type RaceBiasEntry = {

  raceNo: string;

  first: FinisherSlot;

  second: FinisherSlot;

  third: FinisherSlot;

  fourth: FinisherSlot;

};



/** Future optional meeting fields — add without breaking stored JSON. */

export type RaceDayBiasMeetingExtras = {

  sectionalBias?: string;

  laneInStraight?: string;

  trackPatternNotes?: string;

  weather?: string;

  railMovement?: string;

  paceProfile?: string;

};



export type RaceDayBiasState = {

  meetingLabel: string;

  races: RaceBiasEntry[];

  updatedAt: string;

} & RaceDayBiasMeetingExtras;



export function emptyFinisherSlot(): FinisherSlot {

  return { positionCode: "", sp: "" };

}



/** Top-4 weighted share model per lane group (shares and bias as 0–1 fractions). */

export type LaneGroupSpStats = {

  group: LaneGroup;

  label: string;

  rawWins: number;

  rawPlaces: number;

  avgSp: number | null;

  /** Share of weighted top-4 result mass in this lane. */

  actualShare: number;

  /** Share of implied probability mass in this lane. */

  expectedShare: number;

  /** actualShare − expectedShare (e.g. 0.12 = +12 pp). */

  biasScore: number;

  /** Finishers with lane code + SP in this lane. */

  finisherCount: number;

};


/** Top-4 weighted share model per positional group (field-size relative). */

export type PositionGroupSpStats = {

  group: PositionGroup;

  label: string;

  rawWins: number;

  rawPlaces: number;

  avgSp: number | null;

  actualShare: number;

  expectedShare: number;

  biasScore: number;

  finisherCount: number;

};



export type RaceDayBiasAnalytics = {

  spAdjusted: {

    groups: LaneGroupSpStats[];

    signal: string;

    hasSpData: boolean;

    /** Races with at least one code + SP finisher. */

    racesWithSpSample: number;

  };

  positional: {

    groups: PositionGroupSpStats[];

    signal: string;

    hasSpData: boolean;

    racesWithSpSample: number;

    /** Races with field size available for classification. */

    racesWithFieldSize: number;

  };

  composite: import("@/lib/race-day-bias/composite").CompositeMatrixResult;

  conclusion: import("@/lib/race-day-bias/composite").BiasConclusion;

};

