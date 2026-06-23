import path from "node:path";

const MEETINGS_ROOT = "meetings";

export function safeMeetingCsvRelativePath(relativePath: string): string | null {
  const normalized = String(relativePath ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!normalized.startsWith(`${MEETINGS_ROOT}/`)) return null;
  if (normalized.includes("..")) return null;
  const fileName = path.basename(normalized);
  if (!fileName.toLowerCase().endsWith(".csv")) return null;
  if (fileName !== normalized.split("/").pop()) return null;
  return normalized;
}
