import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Yard-only shell — no AppProviders, Speed Map, Bias, or main app nav. */
export const metadata: Metadata = {
  title: "Mounting Yard",
  description: "Trackside mounting yard assessments",
};

export default function YardRouteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-slate-100 text-slate-900 antialiased">{children}</div>
  );
}
