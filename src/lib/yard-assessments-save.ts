import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeMeetingCsvRelativePath } from "@/lib/meeting-library-paths";

export type YardAssessmentRow = {
  race: string;
  runnerNo: number;
  horse: string;
  score: number;
  factors: {
    positive?: Record<string, number>;
    negative?: Record<string, number>;
  };
  physical: {
    gear?: Record<string, number[]>;
    wet?: Record<string, string>;
  };
  notes: string;
};

function csvEscape(value: string): string {
  const s = value ?? "";
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildYardAssessmentsCsv(rows: YardAssessmentRow[]): string {
  const headers = ["Race", "Runner Number", "Horse", "Score", "Factors", "Physical", "Notes"];
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.race),
        String(row.runnerNo),
        csvEscape(row.horse),
        String(row.score),
        csvEscape(JSON.stringify(row.factors ?? {})),
        csvEscape(JSON.stringify(row.physical ?? {})),
        csvEscape(row.notes ?? ""),
      ].join(","),
    );
  }

  return lines.join("\n");
}

/** Write `yard_assessments.csv` into the meeting folder for a master CSV path. */
export async function saveYardAssessmentsToMeetingFolder(
  meetingPath: string,
  assessments: YardAssessmentRow[],
): Promise<string> {
  const safe = safeMeetingCsvRelativePath(meetingPath);
  if (!safe) throw new Error("Invalid meeting path");

  const folder = path.dirname(safe).replace(/\\/g, "/");
  const savedTo = `${folder}/yard_assessments.csv`;
  const absolute = path.join(process.cwd(), savedTo);
  const content = buildYardAssessmentsCsv(assessments);

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");

  return savedTo;
}
