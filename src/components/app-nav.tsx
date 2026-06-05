"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/yard", label: "Yard" },
  { href: "/speed-map", label: "Speed Map" },
  { href: "/bias", label: "Bias" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-0 z-[200] border-b border-slate-800 bg-slate-950/95 px-3 py-2 backdrop-blur-md pt-[calc(0.5rem+env(safe-area-inset-top))]"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-[1600px] items-center gap-2">
        <span className="mr-2 hidden text-sm font-semibold text-slate-400 sm:inline">Mounting Yard</span>
        <div className="flex flex-1 flex-wrap gap-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex min-h-[44px] min-w-[4.5rem] items-center justify-center rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98]",
                  active
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "bg-slate-900 text-slate-200 ring-1 ring-slate-700 hover:bg-slate-800",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
