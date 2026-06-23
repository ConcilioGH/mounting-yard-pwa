export type MeetingLibraryEntry = {
  id: string;
  label: string;
  date: string;
  track: string;
  trackLabel: string;
  relativePath: string;
  fileName: string;
  modifiedAt: string;
};

export type MeetingLibraryScan = {
  rootPath: string;
  foldersScanned: string[];
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
