import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development" || process.env.DISABLE_PWA === "1",
  workboxOptions: {
    disableDevLogs: true,
  },
});

const MEETINGS_HEAVY_EXCLUDES = [
  "./meetings/**/*",
  "./**/*.pdf",
  "./**/speedproxy*.html",
];

/** Keep meeting-library bundle small: only *_master.csv from meetings/. */
const MEETING_LIBRARY_EXCLUDES = [
  "./**/*.pdf",
  "./**/speedproxy*.html",
  "./meetings/**/*.html",
  "./meetings/**/*.json",
  "./meetings/**/*.txt",
  "./meetings/**/_racenet_extracted.csv",
  "./meetings/**/*race-day-bias*.csv",
  "./meetings/**/*mounting-yard*.csv",
  "./meetings/**/yard_assessments.csv",
  "./meetings/**/*_yard-package.json",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/meeting-library": ["./meetings/**/*_master.csv"],
  },
  outputFileTracingExcludes: {
    "/api/meeting-library": MEETING_LIBRARY_EXCLUDES,
    "/api/meeting-export": MEETINGS_HEAVY_EXCLUDES,
    "/api/import-yard-assessments": MEETINGS_HEAVY_EXCLUDES,
    "/api/save-assessments": MEETINGS_HEAVY_EXCLUDES,
  },
};

export default withPWA(nextConfig);
