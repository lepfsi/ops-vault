import type { ReactNode } from "react";
import { cn } from "./cn.js";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  badge?: string | number;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex flex-wrap gap-1 border-b border-slate-800 pb-px",
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative rounded-t-lg px-3.5 py-2 text-sm font-medium transition",
              active
                ? "text-cyan-300"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            )}
          >
            <span className="inline-flex items-center gap-2">
              {item.label}
              {item.badge !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    active
                      ? "bg-cyan-500/20 text-cyan-300"
                      : "bg-slate-800 text-slate-500"
                  )}
                >
                  {item.badge}
                </span>
              )}
            </span>
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-cyan-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("pt-5", className)}>{children}</div>;
}
