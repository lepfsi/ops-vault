import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export function NavItem({
  active,
  icon,
  label,
  count,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  icon?: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition",
        active
          ? "bg-cyan-500/15 text-cyan-200 shadow-sm shadow-cyan-950/20"
          : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200",
        className
      )}
      {...rest}
    >
      {icon && (
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs",
            active ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-500"
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            "tabular-nums text-[11px]",
            active ? "text-cyan-400/80" : "text-slate-600"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
