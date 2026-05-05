import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "min-h-[52px] w-full rounded-xl border border-slate-200 bg-white px-4 text-lg outline-none ring-slate-900/10 focus:border-slate-900 focus:ring-2",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
