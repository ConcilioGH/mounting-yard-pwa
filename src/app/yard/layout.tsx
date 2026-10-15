import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";

/** Yard-only shell — keeps the lightweight route while sharing primary navigation. */
export const metadata: Metadata = {
  title: "Mounting Yard",
  description: "Trackside mounting yard assessments",
};

export default function YardRouteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-slate-100 text-slate-900 antialiased">
      <AppNav />
      {children}
    </div>
  );
}
