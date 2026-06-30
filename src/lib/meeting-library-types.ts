export type MeetingLibraryEntry = {
  id: string;
  label: string;
  date: string;
  track: string;
  trackLabel: string;
  relativePath: string;
  fileName: string;
  modifiedAt: string;
  meetingId: string;
};

export type MeetingLibraryFolderReport = {
  folder: string;
  folderName: string;
  masterCsvFound: boolean;
  masterCsvCount: number;
  masterCsvFilenames: string[];
  parsedDate: string;
  parsedTrack: string;
  meetingId: string;
  includedInLibrary: boolean;
  exclusionReason: string | null;
  parseErrors: string[];
};

export type MeetingLibraryScan = {
  source: "disk" | "build-manifest";
  generatedAt?: string;
  rootPath: string;
  foldersScanned: string[];
  folderReports: MeetingLibraryFolderReport[];
  masterCsvFiles: string[];
  meetingsReturned: number;
  foldersExcluded: Array<{ folder: string; reason: string }>;
};

export type MeetingLibraryResult = {
  meetings: MeetingLibraryEntry[];
  scan: MeetingLibraryScan;
};

export type MeetingLibraryManifestFile = {
  generatedAt: string;
  meetings: MeetingLibraryEntry[];
  scan: MeetingLibraryScan;
};
