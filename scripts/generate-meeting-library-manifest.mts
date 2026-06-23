import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listMeetingLibraryFromDisk } from "../src/lib/meeting-library-disk.ts";

const outDir = path.join(process.cwd(), "src", "data");
const outFile = path.join(outDir, "meeting-library-manifest.json");

const { meetings, scan } = await listMeetingLibraryFromDisk();

const payload = {
  generatedAt: new Date().toISOString(),
  meetings,
  scan: {
    ...scan,
    rootPath: "build-manifest",
  },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(
  `[meeting-library-manifest] wrote ${meetings.length} meetings to ${path.relative(process.cwd(), outFile)}`,
);
