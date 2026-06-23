import { isLocalMeetingsFsEnabled } from "@/lib/local-meetings-fs";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

function localOnlyResponse() {
  return Response.json(
    {
      ok: false,
      localOnly: true,
      error: "Meeting library filesystem access is only available on localhost/dev",
      meetings: [],
      scan: {
        foldersScanned: [],
        masterCsvFiles: [],
        meetingsReturned: 0,
        foldersExcluded: [],
      },
    },
    { status: 403, headers: NO_STORE_HEADERS },
  );
}

/** List or fetch meeting master CSVs from repo `meetings/` (dev / local network only). */
export async function GET(request: Request) {
  if (!isLocalMeetingsFsEnabled()) {
    return localOnlyResponse();
  }

  const {
    listMeetingLibrary,
    readMeetingLibraryCsv,
    safeMeetingCsvRelativePath,
  } = await import("@/lib/meeting-library-server");

  const url = new URL(request.url);
  const relativePath = url.searchParams.get("path")?.trim() ?? "";

  if (relativePath) {
    const safe = safeMeetingCsvRelativePath(relativePath);
    if (!safe) {
      return Response.json({ ok: false, error: "Invalid path" }, { status: 400 });
    }
    try {
      const content = await readMeetingLibraryCsv(safe);
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return Response.json({ ok: false, error: "Meeting file not found" }, { status: 404 });
    }
  }

  try {
    const { meetings, scan } = await listMeetingLibrary();
    return Response.json({ ok: true, meetings, scan }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list meetings";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
