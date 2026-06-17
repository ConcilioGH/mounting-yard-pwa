import { importYardAssessmentsToMeetingFolder } from "@/lib/import-yard-assessments-server";

export const dynamic = "force-dynamic";

type ImportYardAssessmentsBody = {
  meetingKey?: string;
  csv?: string;
  meetingFolderPath?: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Dev/local: write iPad yard assessments CSV into repo `meetings/{folder}/`. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json(
      { ok: false, writable: false, error: "Not available in production" },
      { status: 403, headers: CORS_HEADERS },
    );
  }

  let body: ImportYardAssessmentsBody;
  try {
    body = (await request.json()) as ImportYardAssessmentsBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const meetingKey = String(body.meetingKey ?? "").trim();
  const csv = body.csv;
  const meetingFolderPath = String(body.meetingFolderPath ?? "").trim();

  if (!meetingKey) {
    return Response.json({ ok: false, error: "meetingKey is required" }, { status: 400, headers: CORS_HEADERS });
  }
  if (typeof csv !== "string" || !csv.trim()) {
    return Response.json({ ok: false, error: "csv is required" }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const result = await importYardAssessmentsToMeetingFolder({
      meetingKey,
      csv,
      meetingFolderPath: meetingFolderPath || undefined,
    });
    return Response.json(
      {
        ok: true,
        savedTo: result.savedTo,
        folderPath: result.folderPath,
        filename: result.filename,
      },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save assessments";
    return Response.json({ ok: false, error: message }, { status: 500, headers: CORS_HEADERS });
  }
}
