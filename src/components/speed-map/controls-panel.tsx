"use client";

import { Button } from "@/components/ui/button";

type ControlsPanelProps = {
  recordingMode: boolean;
  focusMode: boolean;
  pressureOverlay: boolean;
  importError: string | null;
  saveStatus: string | null;
  onToggleRecording: () => void;
  onToggleFocusMode: () => void;
  onTogglePressureOverlay: () => void;
  onReset: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExportPng: () => void;
  onHardStorageReset: () => void;
};

export function ControlsPanel({
  recordingMode,
  focusMode,
  pressureOverlay,
  importError,
  saveStatus,
  onToggleRecording,
  onToggleFocusMode,
  onTogglePressureOverlay,
  onReset,
  onSave,
  onLoad,
  onExportPng,
  onHardStorageReset,
}: ControlsPanelProps) {
  const controlButtonClass =
    "h-8 w-full border border-slate-500/30 bg-gradient-to-b from-slate-900/95 to-slate-900/70 px-2 text-[11px] font-semibold text-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.2)] hover:shadow-[0_0_0_1px_rgba(125,211,252,0.2),0_4px_10px_rgba(0,0,0,0.25)] active:shadow-[0_0_0_1px_rgba(125,211,252,0.18)] disabled:border-slate-600/30 disabled:bg-slate-800/55 disabled:text-slate-400/80 disabled:opacity-70";

  return (
    <div className="space-y-1.5 rounded-xl border border-slate-700/35 bg-slate-950/50 p-2">
      <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-8">
        <Button size="sm" variant="default" className={controlButtonClass} onClick={onExportPng}>
          ⤒ Export
        </Button>
        <Button size="sm" variant="default" className={controlButtonClass} onClick={onReset}>
          ↺ Reset
        </Button>
        <Button size="sm" variant="default" className={controlButtonClass} onClick={onSave}>
          💾 Save
        </Button>
        <Button size="sm" variant="default" className={controlButtonClass} onClick={onLoad}>
          ⟲ Load
        </Button>
        <Button size="sm" variant="default" className={controlButtonClass} onClick={onToggleRecording}>
          ● Rec
        </Button>
        <Button size="sm" variant="default" className={controlButtonClass} onClick={onToggleFocusMode}>
          ◉ Focus
        </Button>
        <Button size="sm" variant="default" className={controlButtonClass} onClick={onTogglePressureOverlay}>
          ≋ Pressure
        </Button>
        <Button
          size="sm"
          variant="default"
          className={`${controlButtonClass} border-rose-500/40 text-rose-200`}
          onClick={onHardStorageReset}
        >
          ⚠ Clear storage
        </Button>
      </div>
      {saveStatus && <p className="text-xs text-slate-300">{saveStatus}</p>}
      {importError && <p className="text-xs text-rose-300">{importError}</p>}
    </div>
  );
}
