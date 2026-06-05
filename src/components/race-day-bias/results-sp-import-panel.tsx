"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  applyResultsSpToBiasEntries,
  type ApplyResultsSpReport,
} from "@/lib/race-day-bias/apply-results-sp";
import type { RaceBiasEntry } from "@/lib/race-day-bias/types";
import {
  fetchResultsHtmlFromUrl,
  parseResultsSpFromHtmlWithMeta,
} from "@/lib/results-sp-parser";
import { cn } from "@/lib/utils";

const biasModalCancelButtonClass = cn(
  "border border-[rgba(148,163,184,0.35)] bg-[rgba(15,23,42,0.95)] text-[rgba(226,232,240,0.85)]",
  "shadow-[0_2px_8px_rgba(0,0,0,0.25)]",
  "hover:border-[rgba(125,211,252,0.45)] hover:bg-slate-800 hover:text-white",
  "active:bg-slate-900",
);

const biasExportButtonClass = cn(
  "rounded-xl border px-4 text-sm font-semibold tracking-wide",
  "bg-gradient-to-b from-[#16233f] to-[#0b1730] text-[#f5f7ff]",
  "border-[rgba(120,180,255,0.25)]",
  "shadow-[0_2px_10px_rgba(0,0,0,0.35)]",
  "transition-all duration-200 ease-out",
  "hover:-translate-y-px hover:border-cyan-400/40",
  "hover:from-[#1c2d4f] hover:to-[#0f1c38]",
  "hover:shadow-[0_0_18px_rgba(56,189,248,0.22),0_4px_14px_rgba(0,0,0,0.4)]",
  "active:translate-y-0 active:scale-[0.99]",
);

type ImportTab = "url" | "file" | "paste";

type ResultsSpImportPanelProps = {
  open: boolean;
  biasRaces: RaceBiasEntry[];
  onClose: () => void;
  onApplied: (entries: RaceBiasEntry[], report: ApplyResultsSpReport) => void;
};

export function ResultsSpImportPanel({
  open,
  biasRaces,
  onClose,
  onApplied,
}: ResultsSpImportPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<ImportTab>("paste");
  const [url, setUrl] = useState("");
  const [htmlPaste, setHtmlPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ApplyResultsSpReport | null>(null);
  const [overwriteExistingSp, setOverwriteExistingSp] = useState(true);

  if (!open) return null;

  const resetMessages = () => {
    setError(null);
    setReport(null);
  };

  const runImport = async (html: string) => {
    resetMessages();
    if (!html.trim()) {
      setError("No HTML content to parse.");
      return;
    }
    const meta = parseResultsSpFromHtmlWithMeta(html);
    if (meta.races.length === 0) {
      setError(
        "No race results found. Try saving the full results page (not just the address bar) and upload or paste HTML.",
      );
      return;
    }
    const { entries, report: applyReport } = applyResultsSpToBiasEntries(meta.races, biasRaces, {
      overwriteExistingSp,
      parserUsed: meta.parserId,
    });
    const fullReport = { ...applyReport, parserUsed: meta.parserId };
    setReport(fullReport);
    onApplied(entries, fullReport);
  };

  const handleFetchUrl = async () => {
    setBusy(true);
    resetMessages();
    try {
      const html = await fetchResultsHtmlFromUrl(url);
      await runImport(html);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch URL.");
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    resetMessages();
    try {
      const html = await file.text();
      await runImport(html);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read file.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handlePasteImport = async () => {
    setBusy(true);
    try {
      await runImport(htmlPaste);
    } finally {
      setBusy(false);
    }
  };

  const tabClass = (id: ImportTab) =>
    cn(
      "min-h-[2.5rem] flex-1 rounded-lg px-2 text-sm font-semibold transition-colors",
      tab === id
        ? "bg-slate-800 text-cyan-200"
        : "text-slate-500 hover:bg-slate-800/60 hover:text-slate-300",
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="results-sp-import-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-800 p-4">
          <h2 id="results-sp-import-title" className="text-lg font-bold text-slate-50">
            Import Results / SP
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Populates SP only. Position codes are not changed. Supports Racenet, Racing NSW, TAB, and generic
            results HTML.
          </p>
        </div>

        <div className="flex gap-1 border-b border-slate-800 px-3 py-2">
          <button type="button" className={tabClass("url")} onClick={() => setTab("url")}>
            URL
          </button>
          <button type="button" className={tabClass("file")} onClick={() => setTab("file")}>
            HTML file
          </button>
          <button type="button" className={tabClass("paste")} onClick={() => setTab("paste")}>
            Paste HTML
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <label className="mb-3 flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={overwriteExistingSp}
              onChange={(e) => setOverwriteExistingSp(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600"
            />
            Replace existing SP values
          </label>

          {tab === "url" && (
            <div className="space-y-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.racenet.com.au/..."
                className="min-h-[3rem] w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
              />
              <p className="text-xs text-slate-500">
                Many sites block direct fetch (CORS). If fetch fails, save the page as HTML and use file or paste.
              </p>
              <Button
                type="button"
                disabled={busy || !url.trim()}
                className={cn("min-h-[3rem] w-full", biasExportButtonClass)}
                onClick={() => void handleFetchUrl()}
              >
                {busy ? "Fetching…" : "Fetch & import SP"}
              </Button>
            </div>
          )}

          {tab === "file" && (
            <div className="space-y-3">
              <input
                ref={fileRef}
                type="file"
                accept=".html,.htm,text/html"
                className="w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200"
                onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-slate-500">Save the results page in your browser (Save as → Webpage, HTML).</p>
            </div>
          )}

          {tab === "paste" && (
            <div className="space-y-3">
              <textarea
                value={htmlPaste}
                onChange={(e) => setHtmlPaste(e.target.value)}
                placeholder="Paste full page HTML source here…"
                rows={8}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200"
              />
              <Button
                type="button"
                disabled={busy || !htmlPaste.trim()}
                className={cn("min-h-[3rem] w-full", biasExportButtonClass)}
                onClick={() => void handlePasteImport()}
              >
                {busy ? "Parsing…" : "Parse & import SP"}
              </Button>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          {report && (
            <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-3 text-sm text-slate-300">
              <p className="font-semibold text-emerald-400/90">Import complete</p>
              <ul className="mt-2 space-y-1 text-xs">
                <li>Parser: {report.parserUsed}</li>
                <li>Races found in HTML: {report.racesFound}</li>
                <li>SPs populated: {report.spPopulated}</li>
                <li>
                  Unmatched races:{" "}
                  {report.unmatchedRaces.length ? report.unmatchedRaces.map((r) => `R${r}`).join(", ") : "none"}
                </li>
                <li>
                  Missing SPs: {report.missingSps.length ? report.missingSps.join(", ") : "none"}
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 p-4">
          <Button
            type="button"
            variant="default"
            className={cn("min-h-[3rem] w-full", biasModalCancelButtonClass)}
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
