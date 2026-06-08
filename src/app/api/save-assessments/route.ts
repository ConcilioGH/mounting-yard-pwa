import {
  saveYardAssessmentsToMeetingFolder,
  type YardAssessmentRow,
} from "@/lib/yard-assessments-save";

export const dynamic = "force-dynamic";

type SaveAssessmentsBody = {
  meetingPath?: string;
  assessments?: YardAssessmentRow[];
};

function isAssessmentRow(value: unknown): value is YardAssessmentRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.race === "string" &&
    typeof row.runnerNo === "number" &&
    typeof row.horse === "string" &&
    typeof row.score === "number" &&
    typeof row.notes === "string"
  );
}

/** Dev/local: save iPad yard assessments into repo `meetings/{folder}/yard_assessments.csv`. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ ok: false, error: "Not available in production" }, { status: 403 });
  }

  let body: SaveAssessmentsBody;
  try {
    body = (await request.json()) as SaveAssessmentsBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const meetingPath = String(body.meetingPath ?? "").trim();
  const assessments = body.assessments;

  if (!meetingPath) {
    return Response.json({ ok: false, error: "meetingPath is required" }, { status: 400 });
  }
  if (!Array.isArray(assessments)) {
    return Response.json({ ok: false, error: "assessments must be an array" }, { status: 400 });
  }

  const rows: YardAssessmentRow[] = [];
  for (const item of assessments) {
    if (!isAssessmentRow(item)) {
      return Response.json({ ok: false, error: "Invalid assessment row" }, { status: 400 });
    }
    rows.push({
      race: item.race,
      runnerNo: item.runnerNo,
      horse: item.horse,
      score: item.score,
      factors: item.factors ?? {},
      physical: item.physical ?? {},
      notes: item.notes ?? "",
    });
  }

  try {
    const savedTo = await saveYardAssessmentsToMeetingFolder(meetingPath, rows);
    return Response.json({ ok: true, savedTo });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save assessments";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
