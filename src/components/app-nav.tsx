"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isOldIOS } from "@/lib/legacy-safari";
import { resetAppData } from "@/lib/reset-local-data";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/ipad-yard-dom", label: "Yard" },
  { href: "/speed-map", label: "Speed Map" },
  { href: "/bias", label: "Bias" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const [oldIOS, setOldIOS] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setOldIOS(isOldIOS());
  }, []);

  const handleResetAppData = () => {
    setResetting(true);
    void resetAppData().catch((error) => {
      console.error(error);
      setResetting(false);
    });
  };

  return (
    <nav
      className="sticky top-0 z-[200] border-b border-slate-800 bg-slate-950/95 px-3 py-2 backdrop-blur-md pt-[calc(0.5rem+env(safe-area-inset-top))]"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2">
        <Link href="/" className="mr-1 hidden text-sm font-semibold text-slate-400 sm:inline hover:text-slate-300">
          Mounting Yard
        </Link>
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
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          {oldIOS ? (
            <button
              type="button"
              onClick={handleResetAppData}
              disabled={resetting}
              className="inline-flex min-h-[36px] items-center rounded-lg bg-red-700 px-3 text-xs font-semibold text-white disabled:opacity-60"
            >
              {resetting ? "Resetting…" : "Reset App Data"}
            </button>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
