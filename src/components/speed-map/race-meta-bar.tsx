"use client";

import { Input } from "@/components/ui/input";
import { formatRaceMetaField, type RaceMeta } from "@/lib/speed-map";

type RaceMetaBarProps = {
  meta: RaceMeta;
  readOnly?: boolean;
  onChange: (patch: Partial<RaceMeta>) => void;
};

export function RaceMetaBar({ meta, readOnly = false, onChange }: RaceMetaBarProps) {
  const fields: Array<keyof RaceMeta> = ["track", "race", "distance", "grade", "going", "rail"];

  const valueForField = (field: keyof RaceMeta): string => {
    if (field === "distance" || field === "going" || field === "rail") {
      const raw = meta[field] ?? "";
      if (readOnly && !raw.trim()) return formatRaceMetaField("", true);
      return raw;
    }
    return formatRaceMetaField(meta[field], readOnly || field === "race");
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3 shadow-lg">
      <div className="grid gap-2 md:grid-cols-6">
        {fields.map((field) => (
          <label key={field} className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
            {field}
            <Input
              disabled={readOnly || field === "race"}
              value={valueForField(field)}
              onChange={(e) => onChange({ [field]: e.target.value })}
              className="mt-1 min-h-9 rounded-lg border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-cyan-400"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
