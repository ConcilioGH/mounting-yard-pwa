"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type TabsCtx = { value: string; onValueChange: (v: string) => void };

const TabsContext = React.createContext<TabsCtx | null>(null);

export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn(className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div role="tablist" className={cn("flex flex-wrap gap-2", className)} style={style}>
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("TabsTrigger outside Tabs");
  const selected = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={cn(
        "min-h-[52px] min-w-[52px] rounded-xl px-4 text-lg font-semibold transition active:scale-[0.98]",
        selected ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50",
        className,
      )}
      onClick={() => ctx.onValueChange(value)}
    >
      {children}
    </button>
  );
}
