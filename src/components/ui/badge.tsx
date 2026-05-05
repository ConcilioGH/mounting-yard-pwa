import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "secondary" }) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        variant === "secondary" && "bg-slate-100 text-slate-800",
        variant === "default" && "bg-slate-900 text-white",
        className,
      )}
      {...props}
    />
  );
}
