"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isLegacySafari } from "@/lib/legacy-safari";

export function LegacyHomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(isLegacySafari() ? "/yard" : "/speed-map");
  }, [router]);

  return null;
}
