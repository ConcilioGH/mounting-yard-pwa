"use client";

import { useEffect, useState } from "react";
import { APP_BUILD_VERSION } from "@/lib/build-version";
import { isIOS12 } from "@/lib/legacy-safari";

export function CompatibilityFallbackBanner() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(isIOS12());
  }, []);

  if (!active) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-500/60 bg-amber-950 px-3 py-2 text-center text-sm font-medium text-amber-100"
    >
      iOS 12 fallback mode active · Build: {APP_BUILD_VERSION}
    </div>
  );
}
