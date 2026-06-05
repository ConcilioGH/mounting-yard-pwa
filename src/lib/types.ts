export type Runner = {
  no: number;
  horse: string;
  br: number;
  trainer: string;
  jockey: string;
  odds: string;
};

export type Race = {
  id: string;
  title: string;
  runners: Runner[];
};

export type GearState = {
  FT?: number[];
  B?: number[];
  /** Legacy canon bandage locations; migrated from older assessments. */
  CB?: number[];
  INJ?: number[];
};

export type WetBodyType = "light" | "medium" | "strong" | "heavy";
export type WetFeet = "small" | "average" | "big" | "soft_ground";

export type WetState = {
  bodyType?: WetBodyType;
  feet?: WetFeet;
};

export type Assessment = {
  positive: Record<string, number>;
  negative: Record<string, number>;
  gear: GearState;
  wet?: WetState;
  notes: string;
  updatedAt: string;
};

export type AssessmentRow = Assessment & { key: string };
