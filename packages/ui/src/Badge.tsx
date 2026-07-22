import type { ReactNode } from "react";
import { cn } from "./cn.js";

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-cyan-400/90",
        className
      )}
    >
      {children}
    </span>
  );
}
