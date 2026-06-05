"use client";

type KeyIdeaBoxProps = {
  value: string;
  readOnly?: boolean;
  onChange: (next: string) => void;
};

export function KeyIdeaBox({ value, readOnly = false, onChange }: KeyIdeaBoxProps) {
  return (
    <label className="block rounded-xl border border-slate-800 bg-slate-950/80 p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Key Idea</span>
      <textarea
        disabled={readOnly}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Presenter notes..."
        rows={4}
        className="mt-2 w-full resize-none rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
      />
    </label>
  );
}
