"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";

type CsvImporterProps = {
  onImport: (file: File | null) => void;
  disabled?: boolean;
  buttonClassName?: string;
  buttonLabel?: string;
};

export function CsvImporter({ onImport, disabled = false, buttonClassName, buttonLabel = "Import CSV" }: CsvImporterProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="block">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        disabled={disabled}
        className="hidden"
        onChange={(event) => {
          onImport(event.target.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
      <Button
        type="button"
        variant="default"
        size="sm"
        className={buttonClassName ?? "w-full"}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}
