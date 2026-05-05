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

export type Assessment = {
  positive: Record<string, number>;
  negative: Record<string, number>;
  gear: Record<string, boolean>;
  notes: string;
  updatedAt: string;
};

export type AssessmentRow = Assessment & { key: string };
