"use client";

import { useEffect, useState } from "react";
import { isLegacySafari } from "@/lib/legacy-safari";

export function CompatibilityFallbackBanner() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isLegacySafari());
  }, []);

  if (!active) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-500/60 bg-amber-950 px-3 py-2 text-center text-sm font-medium text-amber-100"
    >
      Compatibility fallback active
    </div>
  );
}
