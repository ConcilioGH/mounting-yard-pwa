"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function LegacyHomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/yard");
  }, [router]);

  return null;
}
