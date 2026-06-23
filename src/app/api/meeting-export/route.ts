import { isLocalMeetingsFsEnabled } from "@/lib/local-meetings-fs";

type ExportBody = {
  folderPath?: string;
  filename?: string;
  content?: string;
};

function safeMeetingRelativePath(folderPath: string): string | null {
  const normalized = folderPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized.startsWith("meetings/")) return null;
  if (normalized.includes("..")) return null;
  return normalized;
}

function safeFileName(filename: string): string | null {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  if (!base || base !== filename.replace(/\\/g, "/").split("/").pop()) return null;
  if (!base.toLowerCase().endsWith(".csv")) return null;
  if (base.includes("..")) return null;
  return base;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Dev/local: write export CSV into repo `meetings/` folder. */
export async function POST(request: Request) {
  if (!isLocalMeetingsFsEnabled()) {
    return Response.json(
      { ok: false, writable: false, error: "Not available in production" },
      { status: 403, headers: CORS_HEADERS },
    );
  }

  let body: ExportBody;
  try {
    body = (await request.json()) as ExportBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const folderPath = safeMeetingRelativePath(String(body.folderPath ?? ""));
  const filename = safeFileName(String(body.filename ?? ""));
  const content = typeof body.content === "string" ? body.content : "";

  if (!folderPath || !filename) {
    return Response.json({ ok: false, error: "Invalid path or filename" }, { status: 400, headers: CORS_HEADERS });
  }

  const { mkdir, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");

  const destDir = path.join(process.cwd(), folderPath);
  const destFile = path.join(destDir, filename);

  await mkdir(destDir, { recursive: true });
  await writeFile(destFile, content, "utf8");

  const relative = path.join(folderPath, filename).replace(/\\/g, "/");
  return Response.json({ ok: true, path: relative }, { headers: CORS_HEADERS });
}
